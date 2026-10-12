# Eunoia

> 属于两个人的小世界 —— 一个自托管的伴侣陪伴 Web 应用。

Eunoia 把日常陪伴装进一个私密空间：灵魂链接桌面、微信式聊天、朋友圈、字卡抽取、信件信箱、
纪念日、占卜塔罗、陪伴邀请，以及带歌词和一起听的音乐播放器。数据全部存在自己的服务器，
只属于你们两个人。

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
| 陪伴邀请 | SSE 实时邀请、接受/拒绝/取消、时长累计 |
| 音乐 | 网易云/酷狗链接导入（批量）、歌词、进度拖动、一起听、后台保活 |

## 技术栈

- **前端**：Vue 3 + Vite + Pinia + Vue Router
- **后端**：Node 22 + Express + `node:sqlite`（零原生依赖，免编译）
- **部署**：Docker 多阶段构建 / Render Blueprint（免费套餐即可）
- **隐私**：单进程部署，数据落盘在服务器本地，无任何第三方服务

## 本地运行

```bash
# 1. 后端（默认端口 3001）
cd server && npm install && npm start

# 2. 前端（另开终端，开发热更新）
cd web && npm install && npm run dev
```

生产模式：`cd web && npm run build` 后，后端会自动托管 `web/dist`，单进程即可运行。

## 部署

完整一键部署指南见 [README-deploy.md](./README-deploy.md)：

- **Render**（推荐）：推送本仓库到 GitHub → Render New → Blueprint，自动获得固定域名，免费套餐含 1GB 持久磁盘
- **任意 Docker 平台**：`docker build -t eunoia . && docker run -p 3000:3000 -v eunoia-data:/data eunoia`

> ⚠️ 部署务必挂载持久磁盘（`DATA_DIR`），否则容器重建会清空数据库。

## 目录结构

```
server/    Express 后端（API + SSE + 定时任务 + 静态托管）
web/       Vue3 前端源码
web/public/ PWA 资源（manifest + 图标）
Dockerfile     多阶段构建（先 build 前端再跑后端）
render.yaml    Render Blueprint 配置
README-deploy.md 详细部署指南
```

## 隐私说明

`server/data/`（SQLite 数据库与上传文件）已被 `.gitignore` 排除，**不会**进入仓库。
如需备份，直接拷贝该目录即可。

## License

私人项目，未授权任何人使用。
