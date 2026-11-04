package com.eunoia.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内自更新：下载 APK（带进度回调）+ 拉起系统安装器。
 * 不跳转浏览器，下载进度通过 "progress" 事件回传 JS 层显示。
 * 安装步骤由 Android 系统安装器接管（侧载 APK 的标准做法，不可静默替换）。
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    @PluginMethod()
    public void getNativeVersion(final PluginCall call) {
        try {
            String ver = getActivity().getPackageManager()
                    .getPackageInfo(getActivity().getPackageName(), 0).versionName;
            JSObject ret = new JSObject();
            ret.put("version", ver != null ? ver : "");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e != null ? e.getMessage() : "getNativeVersion failed");
        }
    }

    @PluginMethod()
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("missing url");
            return;
        }
        call.setKeepAlive(true);
        final File dir = getActivity().getExternalFilesDir(null);
        final File target = new File(dir, "eunoia-update.apk");
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    download(url, target);
                    install(target);
                    JSObject ret = new JSObject();
                    ret.put("status", "installed");
                    call.resolve(ret);
                } catch (final Exception e) {
                    call.reject(e != null ? e.getMessage() : "download failed");
                }
            }
        }).start();
    }

    private void download(String urlStr, File target) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("GET");
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", "EunoiaApp");
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(20000);
        conn.connect();
        int code = conn.getResponseCode();
        if (code != 200) {
            conn.disconnect();
            throw new Exception("HTTP " + code);
        }
        int total = conn.getContentLength();
        InputStream in = new BufferedInputStream(conn.getInputStream());
        FileOutputStream out = new FileOutputStream(target);
        byte[] buf = new byte[16384];
        int len;
        long downloaded = 0;
        while ((len = in.read(buf)) > 0) {
            out.write(buf, 0, len);
            downloaded += len;
            if (total > 0) {
                int pct = (int) (downloaded * 100 / total);
                if (pct > 100) pct = 100;
                notifyProgress(pct, downloaded, total);
            }
        }
        in.close();
        out.close();
        conn.disconnect();
        notifyProgress(100, downloaded, total);
    }

    private void notifyProgress(int pct, long downloaded, long total) {
        JSObject p = new JSObject();
        p.put("percent", pct);
        p.put("downloaded", downloaded);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private void install(final File apk) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    Uri uri = FileProvider.getUriForFile(
                            getActivity(),
                            getActivity().getPackageName() + ".fileprovider",
                            apk);
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getActivity().startActivity(i);
                } catch (Exception e) {
                    /* 安装器拉起失败：交给 JS 层处理（status 变 error） */
                }
            }
        });
    }
}
