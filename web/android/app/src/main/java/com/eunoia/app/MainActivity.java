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
    }
}
