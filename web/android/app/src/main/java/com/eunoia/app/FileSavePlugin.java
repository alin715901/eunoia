package com.eunoia.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 把文本（备份 JSON）保存到系统「下载」目录，用户可在文件管理器 / 下载应用中找到。
 *
 * 背景：Android 的 WebView（非 Chrome）不支持 <a download> 把文件写进用户可见的下载目录，
 * 必须由原生落盘。
 *   - Android 10+（API 29+）：用 MediaStore，无需存储权限，最稳。
 *   - Android 9-（API < 29）：用传统文件 API 写入 Download 目录（需 WRITE_EXTERNAL_STORAGE，
 *     已在 AndroidManifest 以 maxSdkVersion=32 声明）。
 *
 * 为避免「一次性把几十 MB 的备份字符串塞进原生桥」导致 WebView 主线程被占住数秒触发 ANR 卡退，
 * 改为流式：beginFile 直接打开「下载目录」的输出流（不再落临时文件）→ appendFile 分块写入
 * （每块由 JS 控制在 1MB 内、且块间让出主线程）→ finishFile 关流并让文件可见。
 *
 * 关键性能优化（相比早期实现）：早期实现先写临时文件、finishFile 时再把整份备份流拷贝进
 * MediaStore，末尾多了一次几十 MB 的 IO 复制，是「点完导出要等一会」的真实额外耗时；现在直接
 * 写目标流，省掉整份复制，导出结束即落盘可见。
 *
 * 注：Capacitor 6.2.3 的 @PluginMethod 无 thread 属性（ThreadType 已移除），方法运行在默认线程；
 * 因写入已分块（每块由 JS 控制在 1MB 内），单次 IO 很短，不阻塞 UI。
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    private OutputStream currentOut = null;
    private String currentFilename = null; // API29+ 为文件名；API<29 为绝对路径
    private Uri currentUri = null;         // API29+ MediaStore 条目 URI（用于结束可见 / 失败清理）

    private static String msg(Exception e) {
        return e != null && e.getMessage() != null ? e.getMessage() : String.valueOf(e);
    }

    private static String sanitize(String name) {
        return name == null ? "backup.json" : name.replaceAll("[^\\w.\\-]", "_");
    }

    /* 清理可能残留的、尚未 finalize 的 MediaStore 条目（如 beginFile 被重复调用、
       或上次导出在 finishFile 之前失败）。避免留下 IS_PENDING=1 的不可见幽灵文件。 */
    private void cleanupPending() {
        if (currentUri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                getContext().getContentResolver().delete(currentUri, null, null);
            } catch (Exception ignored) { /* 删不掉也不影响新导出 */ }
        }
        currentUri = null;
        currentFilename = null;
        if (currentOut != null) {
            try { currentOut.close(); } catch (Exception ignored) {}
            currentOut = null;
        }
    }

    private synchronized void ensureOpen(PluginCall call) {
        if (currentOut == null) {
            call.reject("未开始写入，请先调用 beginFile");
        }
    }

    @PluginMethod
    public synchronized void beginFile(final PluginCall call) {
        final String filename = call.getString("filename");
        if (filename == null || filename.isEmpty()) {
            call.reject("缺少文件名");
            return;
        }
        try {
            cleanupPending(); // 清掉上一次可能残留的 pending 条目，干净起步
            final String safe = sanitize(filename);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Android 10+：MediaStore，免权限；先插入 IS_PENDING=1 的条目，再拿输出流直写
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
                values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (itemUri == null) throw new Exception("无法在下载目录创建文件");
                currentUri = itemUri;
                currentFilename = safe;
                currentOut = resolver.openOutputStream(itemUri);
            } else {
                // Android 9-：传统文件 API（需 WRITE_EXTERNAL_STORAGE，manifest 已声明 maxSdk=32）
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (dir != null) dir.mkdirs();
                File f = new File(dir, safe);
                currentFilename = f.getAbsolutePath();
                currentUri = null;
                currentOut = new FileOutputStream(f);
            }
            if (currentOut == null) throw new Exception("无法打开输出流");
            JSObject r = new JSObject();
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            cleanupPending();
            call.reject("创建文件失败：" + msg(e));
        }
    }

    @PluginMethod
    public synchronized void appendFile(final PluginCall call) {
        ensureOpen(call);
        if (currentOut == null) return; // ensureOpen 已 reject
        final String chunk = call.getString("chunk");
        try {
            if (chunk != null && !chunk.isEmpty()) {
                currentOut.write(chunk.getBytes(StandardCharsets.UTF_8));
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("写入失败：" + msg(e));
        }
    }

    @PluginMethod
    public synchronized void finishFile(final PluginCall call) {
        if (currentOut == null) {
            call.reject("未开始写入，请先调用 beginFile");
            return;
        }
        try {
            currentOut.flush();
            currentOut.close();
            currentOut = null;
            String savedName = currentFilename; // 先捕获，下方清理前保留
            String location;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && currentUri != null) {
                // 让 MediaStore 条目可见
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(currentUri, values, null, null);
                location = "下载/" + savedName;
                currentUri = null;
            } else if (currentUri == null && savedName != null) {
                // 传统文件：扫描进媒体库，便于文件管理器立即看到
                MediaScannerConnection.scanFile(getContext(), new String[]{ savedName },
                        new String[]{ "application/json" }, null);
                location = savedName;
            } else {
                location = "下载/" + savedName;
            }
            currentFilename = null;
            JSObject r = new JSObject();
            r.put("saved", true);
            r.put("location", location);
            call.resolve(r);
        } catch (Exception e) {
            cleanupPending();
            call.reject("保存失败：" + msg(e));
        }
    }
}
