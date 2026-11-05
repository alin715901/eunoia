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
 * 背景：Android 的 WebView（非 Chrome）不支持 <a download> 把 blob/文件写进用户可见的
 * 下载目录，点击要么无效、要么落进 WebView 私有缓存（用户找不到、也无系统通知）。
 * 因此导出必须由原生落盘。
 *   - Android 10+（API 29+）：用 MediaStore，无需存储权限，最稳。
 *   - Android 9-（API < 29）：用传统文件 API 写入 Download 目录（需 WRITE_EXTERNAL_STORAGE，
 *     已在 AndroidManifest 以 maxSdkVersion=32 声明）。
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    @PluginMethod()
    public void saveToDownloads(final PluginCall call) {
        final String filename = call.getString("filename");
        final String content = call.getString("content");
        if (filename == null || filename.isEmpty()) {
            call.reject("missing filename");
            return;
        }
        if (content == null) {
            call.reject("missing content");
            return;
        }
        try {
            final String location = writeToDownloads(filename, content);
            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("location", location != null ? location : ("下载/" + filename));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("保存失败：" + (e != null && e.getMessage() != null ? e.getMessage() : e));
        }
    }

    private String writeToDownloads(String filename, String content) throws Exception {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
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
            try (OutputStream os = resolver.openOutputStream(itemUri)) {
                os.write(bytes);
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
            try (FileOutputStream os = new FileOutputStream(f)) {
                os.write(bytes);
            }
            MediaScannerConnection.scanFile(getContext(), new String[]{ f.getAbsolutePath() },
                    new String[]{ "application/json" }, null);
            return f.getAbsolutePath();
        }
    }
}
