# Eunoia · 部署指南（GitHub Pages，纯静态）

本地化改造后，Eunoia 是一个**纯静态网站**：没有服务端、没有数据库文件，所有数据存在
每个访客自己的浏览器里（IndexedDB）。部署只需把 `web/dist` 挂到任意静态托管上。

---

## 一、自动部署（GitHub Actions，推荐）

仓库已带 `.github/workflows/deploy.yml`：**推送到 `main` 分支即自动构建并部署**。

1. 把本仓库推到 GitHub（仓库名决定访问路径，如 `alin715901/eunoia` →
   网址为 `https://alin715901.github.io/eunoia/`）。
2. 仓库页面 → **Settings → Pages → Source 选 “GitHub Actions”**（只需第一次）。
3. 推送后到仓库 **Actions** 标签页查看进度，完成后访问上面的网址即可。

> 每次推送 `main` 都会自动重新构建部署；也可在 Actions 页手动
> “Run workflow” 触发。版本更新机制（`version.json`）会让已打开的页面自动刷新到新版本。

### 推送方式（二选一）

**A. 在自己机器上推送**：本地克隆后 `git push origin main` 即可。
如果本地没有克隆，可用交付包 `eunoia-deploy.bundle`：

```bash
git clone eunoia-deploy.bundle eunoia && cd eunoia
git remote set-url origin https://github.com/alin715901/eunoia.git
git push origin main
```

**B. 部署密钥（deploy key）**：在仓库 Settings → Deploy keys → Add deploy key
添加一把 SSH 公钥并勾选 **Allow write access**，持有对应私钥的一方即可通过
`git@github.com:<用户>/<仓库>.git` 推送（CI/沙箱环境常用，可随时吊销）。

### 自定义域名（可选）

Settings → Pages → Custom domain 填你的域名，并在域名 DNS 加一条 CNAME 到
`<用户名>.github.io`。若用了自定义域名，把 workflow 里「计算 base 路径」一步
改为输出 `BASE_PATH=/`（根路径），否则资源会按 `/eunoia/` 前缀加载。

---

## 二、音乐链接导入（可选，需要 Cloudflare Worker）

网易云/酷狗的元数据接口不允许浏览器直连（CORS），链接导入需要一个中转。
Cloudflare Worker 免费额度 **10 万请求/天**，个人自用远够。部署方法：

```bash
npm install -g wrangler
wrangler login
npx wrangler deploy -c workers/wrangler.toml
```

得到 `https://eunoia-music.<你的子域>.workers.dev` 后，二选一接入：

**A. 构建变量（推荐）**：仓库 Settings → Secrets and variables → Actions →
Variables → 新建 `VITE_MUSIC_PROXY` = worker 地址。下次推送自动生效。

**B. 运行时配置**：编辑网站上的 `config.js`（源码在 `web/public/config.js`），
把 `musicProxy` 改成 worker 地址，重新推送。B 优先于 A。

不配置中转时，除音乐链接导入外的所有功能（聊天/信件/朋友圈/陪伴/本地音乐文件等）均正常。

---

## 三、本地预览生产构建

```bash
cd web
BASE_PATH=/eunoia/ npm run build   # 本地预览用 / 即可：npm run build
BASE_PATH=/eunoia/ npx vite preview --port 4173
# 打开 http://localhost:4173/eunoia/
```

---

## 四、关于 server/ 目录

`server/` 是早期的自托管版本（Express + node:sqlite + SSE），主线已迁移为纯静态架构，
部署流程不再需要它，代码保留仅供查阅。
