package com.eunoia.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
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
        super.onCreate(savedInstanceState);

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
}
