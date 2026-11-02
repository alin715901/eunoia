# Eunoia 转安卓 APK 实施指南（Capacitor + 本地通知）

> 目标：打包成安卓 APK，拥有**稳定的系统通知栏弹窗**，不依赖 PWA、不依赖 FCM 云端推送。
> 本仓库已完成的改动都在 `web/` 与 `android/` 下，你只需按本文第 5 节在本地用 Android Studio 编译出 APK。

---

## 0. 已经替你做好的部分（已提交，无需你改代码）

| 项目 | 文件 | 说明 |
|------|------|------|
| Capacitor 配置 | `web/capacitor.config.json` | `appId=com.eunoia.app`、`webDir=dist`、`androidScheme=https` |
| 安卓原生工程 | `web/android/` | 已用 `cap add android` 生成，含 Gradle 包装器 |
| 本地通知封装 | `web/src/composables/useLocalNotification.js` | 预约式通知 + 即时弹窗 + 权限请求 + 点击跳转，**Web 端自动 no-op** |
| 接入主动消息 | `web/src/local/services/chat.service.js` | 算出"下次可发时间"即向系统闹钟**预约**；后台实时生成时**立即弹** |
| 首启授权 + 点击打开会话 | `web/src/App.vue` | `boot()` 里申请通知权限、初始化监听，点击通知直达对应聊天 |
| 安卓权限 | `web/android/.../AndroidManifest.xml` | 已加 `SCHEDULE_EXACT_ALARM` / `WAKE_LOCK` / `RECEIVE_BOOT_COMPLETED` 等 |
| 构建脚本 | `web/package.json` | 新增 `build:apk`（以相对路径 `./` 构建，供 Capacitor 打包） |

---

## 1. 项目配置（Capacitor 安卓工程）—— 已完成

仓库里已是标准 Capacitor 工程。若你在新机器拉取代码后 `android/` 缺失，执行：

```bash
cd web
npm install
npx cap add android        # 生成 android/ 原生工程（会自动把 dist 拷进安卓资源）
```

> 注意：本环境用 `./node_modules/.bin/cap` 直接调用（npx 未能解析）。

---

## 2. 通知插件 —— 已完成

已接入 `@capacitor/local-notifications@6`，并在 `capacitor.config.json` 同步后由 `npx cap sync` 自动写入安卓原生依赖。核心封装见 `useLocalNotification.js`：

- `scheduleProactiveNotification(...)`：**预约未来某刻**的系统通知（写入 Android `AlarmManager`）。
  即使 App 进程被杀（被划掉 / 系统回收内存），闹钟仍由系统层准时弹出——这是"稳定弹窗"的根基。
- `fireImmediateNotification(...)`：App 正处于后台（未被划掉）且主动消息此刻生成 → **立即弹**系统通知；前台时不弹，交给应用内 UI。
- `initLocalNotifications(...)`：前台收到底层通知立即按 id 取消（避免重复弹窗）；点击通知打开对应会话。
- `ensureLocalNotificationPermission()`：**Android 13+ 首启弹系统授权框**；12 及以下安装即授权。

---

## 3. 弹窗逻辑 —— 已完成

**触发条件（完全按你的要求）**：只要 App 在后台运行（没被划掉），当某联系人满足"主动消息"触发条件时，由插件直接弹安卓系统通知栏弹窗。

**两条互补链路**：

1. **预约式（最稳，覆盖"被杀也能弹"）**：`proactiveTick` 每次算出 `proactive_next_at`（下次可发时间），就 `scheduleProactiveNotification` 向系统闹钟预约一条未来通知（固定 id `100000+contactId`，重复预约幂等）。
2. **即时式（覆盖"后台活着、到点正好生成"）**：`proactiveTick` 实际生成消息的瞬间，若 `document.visibilityState === 'hidden'`（后台），`fireImmediateNotification` 立刻弹。

**前台不重复**：`localNotificationReceived` 监听里，若 App 在前台（`visible`）收到底层通知，立即 `cancel` 掉，只走应用内 UI。

**权限引导**：App 首次启动（`boot()`）会自动请求通知权限；若用户拒绝，可在系统设置 → 应用 → 通知 中手动开启。

> ⚠️ 要让后台/被杀后仍能弹，**必须**在手机系统设置里对该 App **关闭电池优化**（或设为"不受限制"），否则安卓会推迟/丢弃精确闹钟。代码已声明 `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` 权限，可配合引导。

---

## 4. 数据同步（重要：请先看这段再决定要不要 Supabase）

你的真实诉求是"**打包后数据不丢失**"。先把事实讲清楚，再给你两条路：

### 事实：APK 的数据本来就不会因打包而丢失

Capacitor 把网页跑在安卓 WebView 里，数据存在 App 自己的沙盒（`IndexedDB` + `localStorage`），**与网站是隔离的两份**。打包只是把网页资源打进 APK，**不会清空任何东西**。所谓"数据丢失"只发生在两种场景：

1. **换设备 / 重装 App**（沙盒被清）；
2. **想把网站里现有的数据搬进新 APK**。

这两种都用**你已经有的阿里云 OSS 同步模块**就能解决（设置 → 云端同步：网站上"上传本机数据到云端"，APK 里"从云端恢复"；或导出文件再导入）。OSS 配置项**已经在设置里**，无需新建。

### 关于 Supabase 邮箱登录 —— 我的诚实建议：**暂不需要**

Supabase 是一套**托管后端**（Postgres 数据库 + 认证 + 存储）。为它加"邮箱登录模块"意味着把当前的**纯本地架构**改造成**账号体系 + 云端数据库**，是一次性价比很低的重架构，且和现有 OSS 同步**功能重复**。对两个人自用的本地 App，它没有带来新能力，反而引入一个你必须长期维护的云端服务。

**所以**：仓库里**没有**实现 Supabase。如果你坚持要（比如想做多账号/网页与 App 用同一账号体系），见文末附录步骤，或让我帮你落地——但请先确认你真的需要它，而不是被"数据不丢失"四个字带偏（那件事 OSS 已经做到了）。

---

## 5. 编译步骤（不依赖 GitHub Actions，Android Studio 本地出包）

### 5.1 一次性环境准备（你自己的电脑）
1. 装 [Android Studio](https://developer.android.com/studio)（含 SDK Manager）。
2. 打开 SDK Manager → 装 **Android SDK Platform 34**（Capacitor 6 要求 `compileSdk 34`）+ **Android SDK Build-Tools 34** + **Android SDK Platform-Tools**（含 `adb`）。
3. 配置 `ANDROID_HOME` 环境变量指向 SDK 目录（Android Studio 默认已配）。

### 5.2 每次改完前端代码后，同步到安卓工程
```bash
cd web
npm run build:apk          # 以相对路径构建，产物在 web/dist
./node_modules/.bin/cap sync android   # 把最新 web 资源 + 插件同步进 android/
#   （首次或插件变动用 add；之后都用 sync / copy）
```

### 5.3 用 Android Studio 打包 APK
1. Android Studio → **Open** → 选择仓库里的 `web/android/` 文件夹。
2. 等待 **Sync Project with Gradle Files** 完成（首次会下载 Gradle 与依赖，较慢）。
3. 菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
4. 完成后右下角提示，点 **locate**：APK 在
   `web/android/app/build/outputs/apk/debug/app-debug.apk`
5. 把这个 `app-debug.apk` 传到手机，允许"安装未知应用"后点开安装即可。

### 5.4 正式发布（可选，非必须）
- 想要**签名正式包**：Build → Generate Signed Bundle / APK → 新建/选用 `keystore`（**务必备份 keystore 和密码，丢了自己也救不回**），选 APK → release。
- 不上架 Google Play 就**免费**：直接发 release APK 给自己/伴侣装（侧载）。无需那笔 $25 开发者费。

### 5.5 日常更新
- 网页功能/界面改动：推到 GitHub Pages 即生效（APK 里加载的就是线上站点，自动更新）。
- **只有改了 `android/` 原生部分**（如通知逻辑、权限）才需要重走 5.2–5.3 重新出 APK 安装。

---

## 附录 A（可选）：若你坚持要 Supabase 邮箱登录

> ⚠️ 这会引入托管后端，与现有 OSS 同步并存/二选一，工作量较大。仅在你确认需要账号体系时做。

1. 在 [supabase.com](https://supabase.com) 建项目，开启 **Email Auth**。
2. `npm i @supacitor-community/supabase` 或在 web 端用 `@supabase/supabase-js`。
3. 新增 `web/src/composables/useSupabaseAuth.js`：封装 `signInWithPassword` / `signUp` / `signOut`，并提供一个**登录页/弹窗**（设置页加"邮箱登录"入口）。
4. 登录态用 `localStorage` 持久化；登出清空。
5. 决定同步策略：是用 Supabase 的 Postgres 替代 OSS 做云端备份，还是仅用其做"账号身份"、数据仍走 OSS——二者只能择一为主，否则会出现之前修过的"跨设备互相覆盖"问题。

需要我落地这部分时告诉我，我会先把它和现有 OSS 模块的关系设计清楚再动手。

---

## 附录 B：为什么这套方案"稳定"且"不要 FCM"

- 主动消息 100% 在本地计算，无需服务器判断"何时发"。
- 用 `LocalNotifications.schedule({ at })` 把"下次发"写进 Android `AlarmManager`（系统级闹钟），**进程被杀也能弹**——这正是 FCM 之外、纯本地能做到的最稳方案。
- FCM 只有在"服务器主动推"时才必要；你这里服务器不参与，接 FCM 反而要额外搭后端，得不偿失（前面讨论已确认）。
- 唯一无法突破的物理限制：若用户**手动划掉 App 且系统已回收**，到点前的那次"预约"仍会弹（闹钟在系统层）；但若划掉后再也没打开、且闹钟因电池优化被推迟，则可能在你下次打开时才补发——这点和 FCM 也一致，无法绕过。
