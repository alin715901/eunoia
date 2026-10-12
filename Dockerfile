# ── 阶段 1：构建前端静态资源 ──
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ── 阶段 2：运行后端（自带前端静态托管）──
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data

# 跳过 optional（better-sqlite3 编译），改用 Node 22 内置的 node:sqlite
COPY server/package.json ./
RUN npm install --omit=optional

COPY server/ ./
COPY --from=web /app/web/dist ./web/dist

RUN mkdir -p /data/uploads/images /data/uploads/stickers /data/uploads/voices

EXPOSE 3000
# node:sqlite 在 Node 22 需启用实验特性
CMD ["node", "--experimental-sqlite", "src/index.js"]
