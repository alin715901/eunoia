# Eunoia · 私人部署指南

Eunoia 是一个**纯静态网站**：没有服务端、没有账号、没有数据库文件，所有数据存在
每个访客自己的浏览器里（IndexedDB）。部署只需把 `web/dist` 挂到任意静态托管上。

> 只是想让别人「用」这个应用？其实不用部署：把你的站点网址或 Release 里的 APK
> 发给对方即可，对方打开就是一份全新空白、与你完全隔离的数据。

开源协议：[MIT](LICENSE)。

---

## 一、Fork 到自己名下（推荐，先读这节）

1. 在 GitHub 点 **Fork**，得到 `<你的用户名>/<仓库名>`。
2. → **Settings → Pages → Source 选 “GitHub Actions”**（只需第一次）。
3. 推送任意提交（或在 Actions 页手动 “Run workflow”），
   完成后访问 `https://<你的用户名>.github.io/<仓库名>/`。

`deploy.yml` 会自动按仓库名计算 base 路径，`build.yml` 会自动把你自己的
`<你的用户名>/<仓库名>` 注入为应用内「检查更新」的目标，**不会拉到原作者的 APK**。

### 唯一的配置文件：`web/public/config.js`

源码其它地方不写死任何账号或域名。配置分两类，行为不同：

| 配置项 | 作用 | Fork 到自己的域名后 |
|---|---|---|
| `releaseRepo` | 应用内检查 APK 更新所用的 GitHub 仓库 | **自动失效**（关闭更新检测） |
| `musicProxy` | 网易云/酷狗链接导入的解析中转 | **自动失效**（关闭链接导入） |
| `apkProxy` | APK 下载代理 | 自动失效，回退到 `musicProxy` |
| `traceUrl` | 「心迹 · 工作台」嵌入的独立网站 | **默认照常加载**，可改成自己的或关闭 |

前三项在 `OWNER_CONFIG` 里，只在 `OWNER_HOST`（原作者域名）与本地 / 原生环境生效。
**部署到自己的域名后自动失效**——因为「检查更新」若不隔离会拉原作者的 APK 盖掉
你自己的版本，音乐中转不隔离会蹭原作者的 Worker 额度。Fork 后一行不改也不会连到
原作者的 Releases 或 Worker。

`traceUrl` 不参与这套隔离：工作台只是一个公开可用的展示页面，不读写主应用数据，
所以**所有部署默认都能打开工作台**。

#### 改工作台地址（三种方式，任选）

1. **改文件（最直观）**：编辑 `web/public/config.js` 里的 `DEFAULT_TRACE_URL`，
   换成自己的站点；改完刷新即生效，无需重新构建。
2. **预写覆盖**：在加载 `config.js` 之前写
   `window.__EUNOIA_CONFIG__ = { traceUrl: 'https://你的站点/' }`，优先级最高。
3. **构建变量（适合 CI）**：仓库 Settings → Secrets and variables → Actions →
   Variables 里新建 `VITE_TRACE_URL`。`deploy.yml` 与 `build.yml` 已接入。

**彻底关闭工作台**：把 `traceUrl` 显式设为空字符串 `''`（例如方式 2 里写
`{ traceUrl: '' }`），页面会显示「工作台已关闭」而不再加载任何外部站点。

> 工作台是**另一个独立网站**，源码不在本仓库里，数据也不与本应用互通（请单独导出 /
> 导入）。若日后把它的源码一并开源，把 `DEFAULT_TRACE_URL` 改成站内相对路径
> （如 `./heart-trace/`）即可完全自带、不再依赖任何外部域名。

#### 启用前三项 / 构建自己的 APK

- **改文件**：编辑 `web/public/config.js`，把 `OWNER_HOST` 改成自己的域名，
  并把 `OWNER_CONFIG` 里各项换成自己的地址；改完刷新即生效。
- **用构建变量**：Variables 里新建 `VITE_RELEASE_REPO` / `VITE_MUSIC_PROXY` /
  `VITE_APK_PROXY`。`VITE_RELEASE_REPO` 会自动取 `github.repository`，一般无需手动填。

> 若要构建**自己的 APK**，请把 `OWNER_CONFIG` 清空或改成自己的地址——原生壳以
> `localhost` / `file://` 加载，走的是「本地 / 原生环境」分支，不会按域名自动隔离。
> 工作台不受这条影响，APK 里也照常显示。

### 推送方式

**A. 自己机器上推送**

```bash
git clone https://github.com/<你的用户名>/<仓库名>.git
cd <仓库名>
git remote set-url origin https://github.com/<你的用户名>/<仓库名>.git
git push origin main
```

**B. 部署密钥（deploy key）**：仓库 Settings → Deploy keys → Add deploy key
添加 SSH 公钥并勾选 **Allow write access**，持有私钥的一方可通过
`git@github.com:<你的用户名>/<仓库名>.git` 推送（CI/沙箱常用，可随时吊销）。

### 自定义域名（可选）

Settings → Pages → Custom domain 填你的域名，DNS 加一条 CNAME 到
`<你的用户名>.github.io`。用自定义域名时，把 `deploy.yml` 里「计算 base 路径」一步
改为输出 `BASE_PATH=/`（根路径），否则资源会按 `/<仓库名>/` 前缀加载。
若还想让检查更新 / 音乐中转生效，把 `config.js` 的 `OWNER_HOST` 改成这个域名
（工作台不受影响，任意域名都照常显示）。

---

## 二、音乐链接导入（可选，需要自己的 Cloudflare Worker）

网易云/酷狗的元数据接口不允许浏览器直连（CORS），链接导入需要一个中转。
Cloudflare Worker 免费额度 **10 万请求/天**，个人自用远够：

```bash
npm install -g wrangler
wrangler login
npx wrangler deploy -c workers/wrangler.toml
```

得到 `https://<你的 worker>.<子域>.workers.dev` 后，按上一节填入 `musicProxy`
（或在 Variables 里配 `VITE_MUSIC_PROXY`）。也可以在应用内
「设置 → 音乐 → 解析服务」手填，该项优先级最高、只存本机。

不配置中转时，除音乐链接导入外的所有功能（聊天 / 信件 / 朋友圈 / 陪伴 /
本地音乐文件等）均正常。

---

## 三、APK 签名密钥（打包安卓包时才需要）

`web/android/app/eunoia.keystore` 是随仓库附带的**公开演示密钥**，口令也是公开的。
它的唯一作用是保证每次 CI 构建签名一致、可以「原地覆盖升级」；**不是机密，
请勿用于正式上架或对外分发**。

想换成自己的密钥：

1. 生成自己的 keystore（或用 Android Studio 生成）。
2. 把它的 base64 存为仓库 Secret `EUNOIA_KEYSTORE_BASE64`：
   `base64 -w0 your.keystore` → 粘贴到 Settings → Secrets → Actions。
   如需自定义口令 / 别名，再配 `EUNOIA_STORE_PASSWORD` / `EUNOIA_KEY_PASSWORD` /
   `EUNOIA_KEY_ALIAS`。`build.yml` 会在构建前解码写入，Gradle 从环境变量读取。
3. 确认 CI 正常出包后，可把仓库里的演示 keystore 从版本库移除
   （`git rm --cached web/android/app/eunoia.keystore`），`.gitignore` 已排除 `*.keystore`。

> **重要**：换密钥后签名与旧版不同，安卓会拒绝覆盖安装，必须先卸载旧版。
> 卸载会清掉 App 内的本地数据，请先到「设置 → 存储」导出备份，装好新版后用
> **合并导入**恢复，不要选覆盖导入。仅移除仓库里的密钥文件、但仍用同一把密钥签名，
> 则不影响已有数据。

---

## 四、本地预览生产构建

```bash
cd web
BASE_PATH=/<仓库名>/ npm run build   # 本地预览用根路径即可：npm run build
BASE_PATH=/<仓库名>/ npx vite preview --port 4173
# 打开 http://localhost:4173/<仓库名>/
```

---

## 五、关于 server/ 目录

`server/` 是早期的自托管版本（Express + node:sqlite + SSE），主线已迁移为纯静态架构，
部署流程不再需要它，代码保留仅供查阅。其中的 `server/data/`（真实数据库与上传文件）
已被 `.gitignore` 排除，不会随仓库分发。
