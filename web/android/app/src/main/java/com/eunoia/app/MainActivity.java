package com.eunoia.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 应用内自更新插件（下载 APK + 拉起系统安装器）
        registerPlugin(UpdaterPlugin.class);
    }
}
