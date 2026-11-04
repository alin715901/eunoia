package com.eunoia.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 应用内自更新插件（下载 APK + 拉起系统安装器）。
        // 注意：BridgeActivity.registerPlugin() 只把插件追加进 bridgeBuilder 的列表，
        // 而 super.onCreate() 已经 create() 并跑过 registerAllPlugins()，
        // 之后再调 registerPlugin() 不会进到运行中的 bridge，导致 JS 报
        // "Updater plugin is not implemented on android"。
        // 因此必须在 bridge 创建后直接注册到 live bridge 上：
        if (getBridge() != null) {
            getBridge().registerPlugin(UpdaterPlugin.class);
        }
    }
}
