# Eunoia · 一键部署（固定域名）

本项目是**前后端一体**的单进程 Node 应用：后端（Express）同时托管前端构建产物和 API，无需额外 Nginx。

数据库默认用 Node 22 内置的 `node:sqlite`，**无需编译任何原生模块**，部署极简单。

---

## 方案 A：Render（推荐，免费，拿固定域名）

1. 把整个项目（含 `server/`、`web/`、`Dockerfile`、`render.yaml`）推到你的 GitHub 仓库。
2. 打开 [render.com](https://render.com) → 注册/登录 → **New → Blueprint**，授权 GitHub 并选该仓库。
3. Render 会读取 `render.yaml` 自动创建 Web 服务（免费套餐）+ 1GB 持久磁盘 `/data`（存数据库和上传文件）。
4. 部署完成后，Render 给你一个**固定域名**，例如 `https://eunoia-app.onrender.com`，永久可用。

> 免费套餐实例空闲后会休眠，首次访问需冷启动（约 10–30 秒），之后正常。

### 环境变量（已内置于 render.yaml，无需手配）
- `PORT`：Render 自动注入（默认 3000）
- `DATA_DIR=/data`：数据库与上传目录，指向持久磁盘
- `NODE_ENV=production`

---

## 方案 B：任意支持 Docker 的平台（Railway / Fly.io / 自己的服务器）

只要能跑 Docker 即可：

```bash
# 1. 构建镜像
docker build -t zika-app .

# 2. 运行（数据挂到宿主机目录，避免重启丢失）
docker run -d \
  -p 3000:3000 \
  -e PORT=3000 \
  -e DATA_DIR=/data \
  -v $(pwd)/zika-data:/data \
  --name zika-app \
  zika-app
```

然后在浏览器打开 `http://你的服务器:3000`。

---

## 本地运行（开发/演示）

```bash
# 后端（默认端口 3001）
cd server && npm install && npm start

# 前端（另开终端，开发热更新）
cd web && npm install && npm run dev
```

前端 `npm run build` 的产物 `web/dist` 会被后端自动托管，因此生产环境只需启动后端即可。

---

## 目录结构
```
server/      后端（Express + node:sqlite），同时托管 web/dist
web/         Vue3 前端，build 后产物在 web/dist
Dockerfile   多阶段构建：先 build 前端，再跑后端
render.yaml  Render Blueprint 配置
```

## 常见问题
- **数据库/上传文件丢了吗？** 部署时务必挂载持久磁盘（方案 A 的 `disk` 已配置，方案 B 的 `-v` 已配置）。否则容器重建会重置数据。
- **页面空白 / API 报错？** 确认 `web/dist` 已构建（`web/dist/index.html` 存在），后端才能托管前端。
- **node:sqlite 报错？** 需要 Node ≥ 22.5。`Dockerfile` 已用 `node:22` 并在 `CMD` 加了 `--experimental-sqlite`。
