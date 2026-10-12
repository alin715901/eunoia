# Eunoia

> 属于两个人的小世界 —— 纯前端、本地优先（local-first）的伴侣陪伴 Web 应用。

Eunoia 把日常陪伴装进一个私密空间：灵魂链接桌面、微信式聊天、朋友圈、字卡抽取、信件信箱、
纪念日、占卜塔罗、陪伴邀请，以及带歌词和一起听的音乐播放器。

**每个人打开都是全新空白的数据**：没有服务器、没有账号，所有数据只存在你自己的浏览器里
（IndexedDB），清缓存即重置。

## 功能一览

| 模块 | 说明 |
|---|---|
| 首页桌面 | 灵魂链接爱心、纪念日倒数、应用宫格、音乐卡胶片 |
| 聊天 | 气泡 / 引用 / 撤回 / 收藏 / 已读回执 / 群聊 / 红包 / 通话 |
| 朋友圈 | 按联系人隔离的动态流、点赞评论 |
| 字卡库 | 通用库 + 各联系人专属库，支持头像/背景/裁剪 |
| 信件 | 信箱枢纽 + 各人独立信箱 |
| 纪念日 | 类型化管理、桌面倒数 |
| 占卜 | 全套 78 张塔罗 + 记录（单删/清空） |
| 陪伴邀请 | 实时邀请、接受/拒绝/取消、时长累计 |
| 主动陪伴 | 对方按间隔主动发字卡/寄信/发朋友圈/来电/发红包（到点即触发，关页期间到期的事件重开页面立即补发） |
| 音乐 | 网易云/酷狗链接导入（批量）、歌词、进度拖动、一起听、后台保活 |

## 技术栈

- **前端**：Vue 3 + Vite + Pinia + Vue Router（hash 路由）
- **数据库**：sql.js（WASM SQLite 完整跑在浏览器里），快照持久化到 IndexedDB
- **部署**：GitHub Pages（纯静态，零服务端成本）
- **音乐解析中转**：Cloudflare Worker（免费 10 万请求/天，见 `workers/`）

### 目录结构

```
web/                  纯前端应用（本地版全部逻辑都在这里）
  src/local/          db.js（sql.js+IndexedDB 门面）、api.js（路由整体移植）、
                      services/ repositories/（从 server 原样搬入）、ticks.js（前端调度器）、seed.js、migrate.js
  public/config.js    运行时配置（音乐中转地址，改完即生效无需重新构建）
workers/              音乐解析 Cloudflare Worker（music-proxy.js + wrangler.toml）
.github/workflows/    GitHub Pages 自动部署
server/               旧的自托管服务端版本（已不再维护，仅作历史保留）
```

## 本地运行

```bash
cd web && npm install && npm run dev
```

## 部署

推送到 GitHub `main` 分支即自动构建并部署到 GitHub Pages，详见
[README-deploy.md](README-deploy.md)（含音乐导入中转的可选配置）。

## 说明

- 联系人均为代码生成的虚构角色，主动消息/来信/来电等全部由本地定时器按概率与时间戳驱动。
- 音乐链接导入需要配置 Cloudflare Worker 中转（网易云/酷狗接口有 CORS 限制）；
  不配置也不影响其它任何功能。
- `server/` 目录是早期的自托管版本，本仓库主线已迁移为纯静态架构，不再随部署流程运行。
