# Eunoia 音乐解析中转（Cloudflare Worker）

本地版网站没有服务端，浏览器直连网易云/酷狗的元数据接口会被 CORS 拦截，
且 `fetch()` 禁设 `User-Agent` / `Referer`（浏览器静默丢弃）。这个 Worker 负责
代设这些头并转发请求，免费额度 **10 万请求/天**，个人自用远够。

> 只代理「元数据/歌词」等小请求；歌曲音频由 `<audio>` 元素直连 CDN 播放，不走中转。

## 部署（一次性，约 2 分钟）

```bash
# 1. 安装 wrangler（Cloudflare 官方 CLI）
npm install -g wrangler

# 2. 登录（会打开浏览器授权，免费账号即可）
wrangler login

# 3. 部署（在仓库根目录执行）
npx wrangler deploy -c workers/wrangler.toml
```

部署成功后输出：

```
https://eunoia-music.<你的子域>.workers.dev
```

## 接到网站里（二选一）

**A. 构建时注入（推荐，GitHub Actions 自动构建时用）**

仓库 Settings → Secrets and variables → Actions → New variable：

- Name: `VITE_MUSIC_PROXY`
- Value: `https://eunoia-music.<你的子域>.workers.dev`

下次推送自动构建即生效。

**B. 运行时改配置（不用重新构建）**

部署后的网站里编辑 `config.js`（在 `dist/config.js`，或改仓库
`web/public/config.js` 后重新部署）：

```js
window.__EUNOIA_CONFIG__ = { musicProxy: 'https://eunoia-music.<你的子域>.workers.dev' }
```

B 优先于 A。留空则全部走直连（音乐链接导入会因 CORS 失败，其它功能不受影响）。

## 本地调试

```bash
npx wrangler dev -c workers/wrangler.toml   # 起在 http://localhost:8787
curl "http://localhost:8787/?url=https%3A%2F%2Flyrics.kugou.com%2Fsearch%3Fver%3D1%26man%3Dyes%26client%3Dpc%26hash%3Dc41e80a18d1448fa47086372999c7f43"
```

然后把 `config.js` 的 `musicProxy` 临时设为 `http://localhost:8787` 即可联调。

## 请求格式

```
GET /?url=<encodeURIComponent(目标URL)>
```

- 响应体流式透传；带 `X-Final-Url` 头（上游跟随重定向后的最终地址，163 短链展开依赖）
- `OPTIONS` 预检直接放行；只允许 `GET`

## 修改后重新部署

```bash
npx wrangler deploy -c workers/wrangler.toml
```
