package com.eunoia.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    /** 系统级前后台标记：由 Activity 自身生命周期维护，不依赖 WebView / JS 事件。
        切后台时 WebView 的 JS 已被冻结，只有这个标记能可靠判断「App 是否在前台」。 */
    public static volatile boolean sForeground = false;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // 必须在 super.onCreate() 之前注册自定义原生插件 Updater。
        // BridgeActivity.registerPlugin() 只把插件追加进 bridgeBuilder；而 super.onCreate()
        // 内的 load() 会消费 bridgeBuilder、create() 出 bridge，并在初始化 WebView 时把
        // "已注册插件清单"同步给 JS。若在这之后（包括 getBridge().registerPlugin()）才注册，
        // 插件进不了初始化流程，JS 侧永远拿不到 "Updater"，调用即报
        // "Updater plugin is not implemented on android"（且无进度条）。
        registerPlugin(UpdaterPlugin.class);
        registerPlugin(FileSavePlugin.class);
        registerPlugin(CallKeepPlugin.class);
        registerPlugin(ReplyNotifPlugin.class);
        super.onCreate(savedInstanceState);
        // 冷启动时若是由「点击回复通知」拉起，带上待跳转的会话路由
        String launchRoute = getIntent() != null
                ? getIntent().getStringExtra(ReplyNotifPlugin.EXTRA_ROUTE) : null;
        if (launchRoute != null) ReplyNotifPlugin.setPendingRoute(launchRoute);

        // 保护 WebView 渲染进程：声明为「重要」且后台不豁免，降低系统在后台 /
        // 内存紧张时回收渲染进程的概率。渲染进程一旦被杀，页面 JS 全部冻结，
        // 表现为「切后台再回来白屏 / 卡退 / 闪退」以及后台定时器失效。
        // API 26+ 才支持，失败静默忽略，绝不影响启动。
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                    && getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setRendererPriorityPolicy(
                        android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, false);
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "设置渲染进程优先级失败: " + e.getMessage());
        }
    }

    @Override
    public void onResume() {
        // 先标记前台再走 super（super 内会向 JS 广播 appStateChange(true)），
        // 避免恢复瞬间原生定时器误判为后台而多弹一次系统窗
        sForeground = true;
        super.onResume();
    }

    @Override
    public void onPause() {
        // 先标记后台：切后台瞬间 JS 即将被冻结，通知到点必须按「后台」处理
        sForeground = false;
        super.onPause();
    }

    /** singleTask：点击系统通知把已存在的 Activity 带到前台时，从这里接收跳转路由。 */
    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String route = intent != null
                ? intent.getStringExtra(ReplyNotifPlugin.EXTRA_ROUTE) : null;
        if (route != null) ReplyNotifPlugin.setPendingRoute(route);
    }
}
