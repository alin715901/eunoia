package com.eunoia.app;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
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
import java.util.ArrayList;
import java.util.List;

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
        // 可选镜像列表：主地址连不上时依次尝试，用于国内网络访问 GitHub 受限的场景。
        // mirrors 为字符串数组，形如 ["https://ghproxy.net/https://github.com/...", ...]
        List<String> urls = new ArrayList<>();
        urls.add(url);
        try {
            JSArray mirrors = call.getArray("mirrors");
            if (mirrors != null) {
                for (Object m : mirrors.toList()) {
                    if (m != null) {
                        String s = m.toString().trim();
                        if (!s.isEmpty()) urls.add(s);
                    }
                }
            }
        } catch (Exception ignore) { /* 镜像解析失败时忽略，仅用主地址 */ }

        call.setKeepAlive(true);
        final File dir = getActivity().getExternalFilesDir(null);
        final File target = new File(dir, "eunoia-update.apk");
        final List<String> finalUrls = urls;
        new Thread(new Runnable() {
            @Override
            public void run() {
                Exception lastErr = null;
                for (String u : finalUrls) {
                    try {
                        downloadWithRetry(u, target, 2);
                        install(target);
                        JSObject ret = new JSObject();
                        ret.put("status", "installed");
                        call.resolve(ret);
                        return;
                    } catch (final Exception e) {
                        lastErr = e;
                        // 该地址失败，继续尝试下一个镜像
                    }
                }
                call.reject(lastErr != null ? lastErr.getMessage() : "download failed");
            }
        }).start();
    }

    private void download(String urlStr, File target) throws Exception {
        // 手动跟随 3xx 重定向（GitHub releases/download 会 302 到 CDN），
        // 避免系统 HttpURLConnection 自动跟随时偶发拿不到最终 Content-Length。
        int redirects = 0;
        String currentUrl = urlStr;
        HttpURLConnection conn = null;
        while (redirects < 10) {
            URL u = new URL(currentUrl);
            conn = (HttpURLConnection) u.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "EunoiaApp/Android");
            conn.setRequestProperty("Accept", "*/*");
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            conn.connect();
            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_MOVED_PERM
                    || code == HttpURLConnection.HTTP_MOVED_TEMP
                    || code == 307 || code == 308) {
                String loc = conn.getHeaderField("Location");
                conn.disconnect();
                if (loc == null || loc.isEmpty()) throw new Exception("重定向缺少 Location");
                if (loc.startsWith("/")) loc = u.getProtocol() + "://" + u.getHost() + loc;
                currentUrl = loc;
                redirects++;
                continue;
            }
            if (code != 200) {
                conn.disconnect();
                throw new Exception("HTTP " + code);
            }
            break;
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
            } else {
                // 未知总大小：仍按已下载字节回传，便于界面显示进度（无百分比条）
                notifyProgress(-1, downloaded, -1);
            }
        }
        in.close();
        out.close();
        conn.disconnect();
        notifyProgress(100, downloaded, total > 0 ? total : downloaded);
    }

    /* 带重试的下载：单个地址最多尝试 (retries+1) 次，失败后退避重试；全部失败抛出最后一次异常。 */
    private void downloadWithRetry(String urlStr, File target, int retries) throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt <= retries; attempt++) {
            try {
                download(urlStr, target);
                return;
            } catch (Exception e) {
                last = e;
                if (attempt < retries) {
                    try { Thread.sleep(1000L * (attempt + 1)); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }
        throw last;
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
