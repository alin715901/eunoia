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
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * 应用内自更新：下载 APK（带进度回调）+ 拉起系统安装器。
 * 不跳转浏览器，下载进度通过 "progress" 事件回传 JS 层显示。
 * 安装步骤由 Android 系统安装器接管（侧载 APK 的标准做法，不可静默替换）。
 *
 * 中国用户注意：GitHub 的 release 资产 CDN 在大陆常被墙，直连会长时间连不上。
 * 故支持 proxy 参数：传入一个「通用 URL 代理」（如本项目已有的 Cloudflare Worker
 * 音乐代理，形如 https://worker.xxx.workers.dev/?url=），插件会优先用
 *   proxy + encodeURIComponent(真实地址)
 * 让服务端代拉 GitHub，从而在国内也能正常下载。
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    // 超时与上限（毫秒）：避免「连不上却空转十几分钟、进度永远 0%」。
    private static final int CONNECT_TIMEOUT = 15000;   // 建立连接
    private static final int FIRST_BYTE_TIMEOUT = 20000; // 首字节（连接成功但迟迟不下发）
    private static final int READ_TIMEOUT = 30000;       // 后续每批读取
    private static final int GLOBAL_CAP = 90000;         // 整体操作硬上限（约 90s 后直接报错）

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
        // 可选代理：通用 URL 代理基址（结尾是否带 ? 都兼容）。国内直连 GitHub 失败时的兜底下载源。
        String proxy = call.getString("proxy");
        if (proxy != null) {
            proxy = proxy.trim();
            if (!proxy.isEmpty() && !proxy.endsWith("?") && !proxy.endsWith("&")
                    && !proxy.contains("url=")) {
                proxy = proxy + (proxy.contains("?") ? "&" : "?") + "url=";
            }
        }
        // 候选主地址列表：主地址 + 镜像
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
        final String finalProxy = (proxy != null && !proxy.isEmpty()) ? proxy : null;
        final long opStart = System.currentTimeMillis();
        new Thread(new Runnable() {
            @Override
            public void run() {
                Exception lastErr = null;
                for (String u : finalUrls) {
                    if (System.currentTimeMillis() - opStart > GLOBAL_CAP) {
                        call.reject("下载超时：始终无法连接更新服务器。请检查网络后重试，或点「前往手动更新」在浏览器中下载安装");
                        return;
                    }
                    // 候选顺序：先走代理（国内可达），再直连
                    String[] candidates = (finalProxy != null)
                            ? new String[]{ finalProxy + encode(u), u }
                            : new String[]{ u };
                    for (String c : candidates) {
                        if (System.currentTimeMillis() - opStart > GLOBAL_CAP) {
                            call.reject("下载超时：始终无法连接更新服务器。请检查网络后重试，或点「前往手动更新」在浏览器中下载安装");
                            return;
                        }
                        try {
                            boolean viaProxy = finalProxy != null && c.startsWith(finalProxy);
                            notifyStage(viaProxy ? "正在通过代理下载更新包…" : "正在连接更新服务器…");
                            download(c, target);
                            install(target);
                            JSObject ret = new JSObject();
                            ret.put("status", "installed");
                            call.resolve(ret);
                            return;
                        } catch (final Exception e) {
                            lastErr = e;
                            // 该候选失败，继续尝试下一个
                        }
                    }
                }
                String detail = (lastErr != null && lastErr.getMessage() != null) ? lastErr.getMessage() : "未知错误";
                call.reject("下载失败：" + detail + "。若网络受限，请点「前往手动更新」在浏览器中下载安装");
            }
        }).start();
    }

    private static String encode(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
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
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(FIRST_BYTE_TIMEOUT); // 首字节超时短，连上却不下发就快速失败
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
        boolean first = true;
        while ((len = in.read(buf)) > 0) {
            if (first) {
                first = false;
                // 首字节已到：放宽后续读取超时，避免大文件正常传输被掐断
                try { conn.setReadTimeout(READ_TIMEOUT); } catch (Exception ignore) { /* ignore */ }
            }
            out.write(buf, 0, len);
            downloaded += len;
            if (total > 0) {
                int pct = (int) (downloaded * 100 / total);
                if (pct > 100) pct = 100;
                notifyProgress(pct, downloaded, total, null);
            } else {
                // 未知总大小：仍按已下载字节回传，便于界面显示进度（无百分比条）
                notifyProgress(-1, downloaded, -1, null);
            }
        }
        in.close();
        out.close();
        conn.disconnect();
        notifyProgress(100, downloaded, total > 0 ? total : downloaded, null);
    }

    /* 进度回报：percent=-1 表示未知百分比（仅显示已下载字节）；stage 为阶段文案（可空）。 */
    private void notifyProgress(int pct, long downloaded, long total, String stage) {
        JSObject p = new JSObject();
        p.put("percent", pct);
        p.put("downloaded", downloaded);
        p.put("total", total);
        if (stage != null) p.put("stage", stage);
        notifyListeners("progress", p);
    }

    /* 仅回报阶段文案（如「正在连接更新服务器…」），让界面在等待时也有反馈，不像卡死。 */
    private void notifyStage(String stage) {
        notifyProgress(-1, 0, -1, stage);
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
