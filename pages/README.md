# Cloudflare Pages 版音乐中转（免买域名）

`workers.dev` 这个域名在部分地区会被 DNS 污染（解析到错误的 IP，浏览器报 `ERR_CONNECTION_TIMED_OUT`）。
同样的 Cloudflare 账号改用 **Pages** 部署，会免费给你一个 `*.pages.dev` 域名，通常可以正常访问。

本目录已经准备好全部文件：

| 文件 | 作用 |
|------|------|
| `index.html` | 站点首页（仅占位，无需改动） |
| `functions/[[path]].js` | 中转逻辑，与 `workers/music-proxy.js` 完全一致 |

## 在 Cloudflare 后台创建（只点几下，不用上传文件、不用买域名）

1. 打开 Cloudflare 控制台 → 左侧「Workers 和 Pages」
2. 点「创建」→ 选「Pages」标签页 → 点「连接到 Git」
3. 选择 GitHub 仓库 **`alin715901/eunoia`**（如未授权，按提示授权一次）
4. 开始配置，**注意这两项**：
   - **构建预设**：选「无」（None）
   - **构建命令**：留空
   - **输出目录**：填 `pages`
   - **框架预设**：选「无」
5. 点「保存并部署」，等待 1–2 分钟

## 部署完成后

会得到一个地址，形如：

```
https://eunoia.pages.dev
```

在浏览器打开下面这个链接确认是否生效：

```
https://eunoia.pages.dev/?url=https%3A//music.163.com/api/song/detail%3Fids%3D%5B33894316%5D
```

若返回一串含 `"songs"` 的英文 JSON，说明中转已通。把这个地址告诉助手，即可接入 Eunoia。
