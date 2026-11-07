package com.eunoia.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Map;

/**
 * 「对方实时回复」的后台通知投递（原生层）。
 *
 * 为什么必须在原生层做：
 *   Capacitor 的 BridgeActivity.onPause() 会先暂停 WebView / 插件，而 appStateChange(false)
 *   要到 onStop() 才发出；切后台那一刻 JS 已被冻结，任何依赖 JS setTimeout / isAppActive()
 *   的判断都会失效 → 消息不弹、回前台才补生成。
 *   此外 Capacitor LocalNotifications 对「几秒后」的预约：
 *     - 若用户关闭「闹钟和提醒」或 ROM 拦截，会降级成非精确闹钟（Doze 下可延迟数分钟）；
 *     - 若 bridge 稍有延迟使 at 早于当前时间，插件会静默 return 丢弃（JS 侧仍显示预约成功）。
 *   这两点让纯 JS 方案在真机上无法保证弹窗。
 *
 * 本插件的解法（两条路径、都不依赖 JS 存活）：
 *   1) Handler(Looper.getMainLooper()).postDelayed —— 跑在原生主线程，WebView JS 冻结也照常触发；
 *      到点用 MainActivity.sForeground（Activity 生命周期里维护，系统级可靠）判断是否前台：
 *      前台 → 交给应用内横条，不弹系统悬浮窗；后台 → 直接 NotificationManager.notify 弹出。
 *   2) AlarmManager.setAlarmClock —— 进程被清 / 被杀时 Handler 消失，由系统闹钟唤醒
 *      ReplyAlarmReceiver 弹窗。setAlarmClock 不受精确闹钟权限限制，Doze 下准时。
 *   Handler 触发时会主动取消对应的 setAlarmClock，避免重复；两条路径共用同一通知 id，
 *   即使极端竞态下同时触发也只是覆盖同一条通知。
 */
@CapacitorPlugin(name = "ReplyNotif")
public class ReplyNotifPlugin extends Plugin {

    public static final int NOTIF_ID_BASE = 400000;
    // 独立的高重要性渠道：安卓渠道的重要性一旦创建便不可再改，且用户可在系统设置里
    // 单独把旧「消息」渠道调成「无声 / 仅通知栏」。用新渠道承载「对方回复」，
    // 确保悬浮弹出不受旧渠道被降级的影响。
    public static final String CHANNEL_ID = "messages_reply";
    public static final String EXTRA_ID = "eunoia.replyNotif.id";
    public static final String EXTRA_TITLE = "eunoia.replyNotif.title";
    public static final String EXTRA_BODY = "eunoia.replyNotif.body";
    public static final String EXTRA_ROUTE = "eunoia.replyRoute";
    private static final String ACTION_POST = "com.eunoia.app.POST_REPLY_NOTIF";
    private static final int SHOW_REQUEST_OFFSET = 500000;
    private static final String TAG = "ReplyNotif";

    /** 用户点击系统通知后待前端消费的会话路由（singleTask 会从 onNewIntent 写入） */
    private static volatile String pendingRoute = null;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<Integer, Runnable> tasks = new HashMap<>();

    public static void setPendingRoute(String route) {
        pendingRoute = route;
    }

    /** 调度一条回复通知：delayMs 后由原生层决定是否弹出（前台交给应用内，后台弹系统通知）。 */
    @PluginMethod
    public void postDelayed(PluginCall call) {
        try {
            final int id = call.getInt("id", NOTIF_ID_BASE);
            long delayMs = Math.max(300L, call.getInt("delayMs", 1500).longValue());
            final String title = call.getString("title", "新消息");
            final String body = call.getString("body", "给你发来了一条消息");
            final String route = call.getString("route", "");

            Runnable prev = tasks.get(id);
            if (prev != null) handler.removeCallbacks(prev);
            final Runnable task = new Runnable() {
                @Override
                public void run() {
                    tasks.remove(id);
                    // 进程存活时 Handler 抢先触发：撤销系统闹钟兜底，避免两条路径重复
                    cancelAlarmClock(id);
                    // 前台不弹系统悬浮窗（应用内横条已由 JS 显示）；后台/锁屏才弹
                    if (!MainActivity.sForeground) {
                        postNotification(getContext(), id, title, body, route);
                    }
                }
            };
            tasks.put(id, task);
            handler.postDelayed(task, delayMs);

            scheduleAlarmClock(id, System.currentTimeMillis() + delayMs, title, body, route);
            call.resolve();
        } catch (Exception e) {
            Log.w(TAG, "postDelayed failed: " + e.getMessage());
            call.reject("postDelayed failed: " + e.getMessage());
        }
    }

    /** 撤销一条尚未弹出的回复通知（定时器 + 系统闹钟 + 已显示的通知）。 */
    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            int id = call.getInt("id", 0);
            Runnable r = tasks.remove(id);
            if (r != null) handler.removeCallbacks(r);
            cancelAlarmClock(id);
            NotificationManager nm =
                (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id);
            call.resolve();
        } catch (Exception e) {
            call.reject("cancel failed: " + e.getMessage());
        }
    }

    /** 取出并清空「点击通知」带来的跳转路由，供 App 启动 / 回前台时消费。 */
    @PluginMethod
    public void consumeRoute(PluginCall call) {
        JSObject ret = new JSObject();
        String route = pendingRoute;
        pendingRoute = null;
        if (route != null && !route.isEmpty()) ret.put("route", route);
        call.resolve(ret);
    }

    /* ── 系统闹钟兜底 ── */

    private void scheduleAlarmClock(int id, long atMs, String title, String body, String route) {
        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = buildAlarmIntent(title, body, route);
            intent.putExtra(EXTRA_ID, id);
            int flags = pendingIntentFlags();
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), id, intent, flags);
            // AlarmClockInfo 的 showIntent 必须是「打开 App」的 Activity（用户点状态栏闹钟图标时）
            PendingIntent showPi = PendingIntent.getActivity(
                getContext(), id + SHOW_REQUEST_OFFSET, buildShowIntent(), flags);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(atMs, showPi), pi);
        } catch (Throwable t) {
            Log.w(TAG, "scheduleAlarmClock failed: " + t.getMessage());
        }
    }

    private void cancelAlarmClock(int id) {
        try {
            AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(getContext(), ReplyAlarmReceiver.class);
            intent.setAction(ACTION_POST);
            int flags = pendingIntentFlags();
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), id, intent, flags);
            am.cancel(pi);
            PendingIntent showPi = PendingIntent.getActivity(
                getContext(), id + SHOW_REQUEST_OFFSET, buildShowIntent(), flags);
            am.cancel(showPi);
        } catch (Throwable t) {
            /* ignore */
        }
    }

    private Intent buildAlarmIntent(String title, String body, String route) {
        Intent i = new Intent(getContext(), ReplyAlarmReceiver.class);
        i.setAction(ACTION_POST);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        i.putExtra(EXTRA_ROUTE, route);
        return i;
    }

    private Intent buildShowIntent() {
        Intent i = new Intent(getContext(), MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return i;
    }

    private static int pendingIntentFlags() {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return flags;
    }

    /* ── 实际发通知（供 Handler 与 Receiver 共用） ── */

    static void postNotification(Context ctx, int id, String title, String body, String route) {
        try {
            NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            ensureChannel(nm);

            Intent open = new Intent(ctx, MainActivity.class);
            if (route != null && !route.isEmpty()) open.putExtra(EXTRA_ROUTE, route);
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, id, open, pendingIntentFlags());

            // 与启动图标一致（兔子），原生层可直接引用 application icon，无需 drawable 兜底
            int icon = ctx.getApplicationInfo().icon;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_email)
                .setContentTitle(title == null || title.isEmpty() ? "新消息" : title)
                .setContentText(body == null ? "" : body)
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setWhen(System.currentTimeMillis());
            nm.notify(id, b.build());
        } catch (Throwable t) {
            Log.w(TAG, "postNotification failed: " + t.getMessage());
        }
    }

    /** 渠道可能由 JS 侧 ensureNotificationChannel 先建好；这里兜底自建，避免 8.0+ 静默丢弃。 */
    private static void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = nm.getNotificationChannel(CHANNEL_ID);
        if (ch != null) return;
        NotificationChannel c = new NotificationChannel(
            CHANNEL_ID, "消息（对方回复）", NotificationManager.IMPORTANCE_HIGH);
        c.setDescription("对方回复 / 接话 / 提问回答的后台弹窗提醒");
        c.enableVibration(true);
        nm.createNotificationChannel(c);
    }
}
