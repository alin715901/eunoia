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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
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
 * 改为流式：beginFile 建临时文件 → appendFile 分块追加（每块由 JS 控制在 1MB 内、且块间让出主线程）
 * → finishFile 把临时文件搬进下载目录并删除临时文件。
 * 注：Capacitor 6.2.3 的 @PluginMethod 无 thread 属性（ThreadType 已移除），故方法运行在默认线程；
 * 因写入已分块（每块由 JS 控制在 1MB 内）、且 finishFile 用流拷贝一次性搬文件，单次 IO 很短，不阻塞 UI。
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    private File currentFile = null;
    private FileOutputStream currentOut = null;
    private String currentFilename = null;

    private static String msg(Exception e) {
        return e != null && e.getMessage() != null ? e.getMessage() : String.valueOf(e);
    }

    private static String sanitize(String name) {
        return name == null ? "backup.json" : name.replaceAll("[^\\w.\\-]", "_");
    }

    private synchronized void ensureOpen(PluginCall call) {
        if (currentOut == null || currentFile == null) {
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
            File dir = new File(getContext().getCacheDir(), "export_tmp");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            currentFile = new File(dir, System.currentTimeMillis() + "_" + sanitize(filename));
            currentFilename = filename;
            currentOut = new FileOutputStream(currentFile, false); // 截断新建
            JSObject r = new JSObject();
            r.put("started", true);
            call.resolve(r);
        } catch (Exception e) {
            currentFile = null;
            currentOut = null;
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
        if (currentOut == null || currentFile == null) {
            call.reject("未开始写入，请先调用 beginFile");
            return;
        }
        try {
            currentOut.flush();
            currentOut.close();
            currentOut = null;
            String savedName = currentFilename; // 先捕获，避免下方置空后丢失文件名
            String location = writeToDownloads(savedName, currentFile);
            //noinspection ResultOfMethodCallIgnored
            currentFile.delete();
            currentFile = null;
            currentFilename = null;
            JSObject r = new JSObject();
            r.put("saved", true);
            r.put("location", location != null ? location : ("下载/" + savedName));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("保存失败：" + msg(e));
        }
    }

    /* 把临时文件流式搬进系统「下载」目录（用流拷贝，避免把整份备份再读进内存翻倍）。 */
    private String writeToDownloads(String filename, File src) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+：MediaStore，免权限
            ContentResolver resolver = getContext().getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri coll = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            Uri itemUri = resolver.insert(coll, values);
            if (itemUri == null) throw new Exception("无法在下载目录创建文件");
            try (InputStream is = new FileInputStream(src);
                 OutputStream os = resolver.openOutputStream(itemUri)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }
            values.clear();
            values.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(itemUri, values, null, null);
            return "下载/" + filename;
        } else {
            // Android 9-：传统文件 API（需 WRITE_EXTERNAL_STORAGE，manifest 已声明 maxSdk=32）
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (dir != null) dir.mkdirs();
            File f = new File(dir, filename);
            try (InputStream is = new FileInputStream(src);
                 FileOutputStream os = new FileOutputStream(f)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }
            MediaScannerConnection.scanFile(getContext(), new String[]{ f.getAbsolutePath() },
                    new String[]{ "application/json" }, null);
            return f.getAbsolutePath();
        }
    }
}
