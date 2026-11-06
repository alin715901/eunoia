package com.eunoia.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 通话前台保活桥：JS 侧调用 start/stop，由原生拉起 / 停止 CallKeepService。
 * 仅 Android 注册；Web / iOS 上插件不存在，JS 侧 isAndroid() 已提前拦截、不会调用。
 */
@CapacitorPlugin(name = "CallKeep")
public class CallKeepPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            String name = call.getString("name", "");
            Intent i = new Intent(getContext(), CallKeepService.class);
            i.setAction("START");
            i.putExtra("name", name);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(i);
            } else {
                getContext().startService(i);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject(e != null ? e.getMessage() : "CallKeep start failed");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            Intent i = new Intent(getContext(), CallKeepService.class);
            i.setAction("STOP");
            getContext().stopService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(e != null ? e.getMessage() : "CallKeep stop failed");
        }
    }
}
