package com.eunoia.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 「进程被清 / 被系统回收」后的兜底弹窗接收器。
 *
 * ReplyNotifPlugin 在调度回复时同时登记两条路径：
 *   1) 原生主线程 Handler 定时器 —— 进程存活时（含切后台、WebView JS 被冻结）由它准时弹窗；
 *   2) AlarmManager.setAlarmClock —— 进程被杀后 Handler 消失，由系统闹钟唤醒本接收器弹窗。
 *
 * setAlarmClock 属于「闹钟」语义，不受 Android 12+ 精确闹钟权限
 * (SCHEDULE_EXACT_ALARM) 限制，Doze / 国产 ROM 省电策略下也拥有最高唤醒优先级。
 * 本接收器只负责把通知交回插件统一发送（同一 id，NotificationManager.notify 天然幂等，
 * 与 Handler 路径即使同时触发也会复用同一条通知，不会重复堆叠）。
 */
public class ReplyAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        // 进程存活且 App 正处前台（Handler 因主线程繁忙被延迟，系统闹钟先到）：
        // 消息已由应用内显示，跳过系统弹窗，避免重复打扰
        if (MainActivity.sForeground) return;
        int id = intent.getIntExtra(ReplyNotifPlugin.EXTRA_ID, ReplyNotifPlugin.NOTIF_ID_BASE);
        String title = intent.getStringExtra(ReplyNotifPlugin.EXTRA_TITLE);
        String body = intent.getStringExtra(ReplyNotifPlugin.EXTRA_BODY);
        String route = intent.getStringExtra(ReplyNotifPlugin.EXTRA_ROUTE);
        ReplyNotifPlugin.postNotification(context, id, title, body, route);
    }
}
