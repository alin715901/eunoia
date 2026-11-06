package com.eunoia.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import android.text.TextUtils;

/**
 * 通话前台保活服务：通话进行期间以「前台服务」运行，并常驻一条通知。
 *
 * 前台服务会把进程优先级抬到「前台级」，系统几乎不会在通话期间回收该进程，
 * 从而避免 WebView 被销毁 → 返回前台“自动刷新”导致通话与计时丢失。
 *
 * Android 14（API 34，本项目 targetSdk）起，startForeground 必须携带前台服务类型，
 * 且 manifest 需声明对应类型与权限。本通话为模拟通话（无真实电话音频），
 * 使用中性且不受限的 dataSync 类型（FOREGROUND_SERVICE_DATA_SYNC 为 normal 权限）。
 */
public class CallKeepService extends Service {
    private static final int NOTIF_ID = 90217;
    private static final String CHANNEL_ID = "eunoia_call_keep";
    private static final String ACTION_STOP = "STOP";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 收到 STOP 指令：撤销通知并停止自身
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        // 启动 / 保持前台：显示“通话进行中”常驻通知（点通知回应用）
        String name = intent != null ? intent.getStringExtra("name") : null;
        startCallForeground(name);
        // START_NOT_STICKY：进程被系统/用户杀掉（例如清掉后台）后不再自动重建前台服务，
        // 通话即随之结束；而未杀进程、仅退到后台时服务照常运行、通话保持。
        // （冷启动恢复通话的逻辑已移除，故不再需要 STICKY 重建。）
        return START_NOT_STICKY;
    }

    private void startCallForeground(String name) {
        createChannel();
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = null;
        if (launch != null) {
            pi = PendingIntent.getActivity(
                    this, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }
        String text = TextUtils.isEmpty(name)
                ? "返回应用可继续通话"
                : ("与 " + name + " 的通话进行中");
        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("通话进行中")
                .setContentText(text)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentIntent(pi)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setShowWhen(false)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+：必须携带前台服务类型
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID, "通话保活", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("通话进行中保持应用不被系统回收");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
