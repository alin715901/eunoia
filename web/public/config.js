// 运行时配置（可选覆盖）。
// 默认全部留空即可正常使用；只有启用「音乐链接导入」时才需要填。
//
// musicProxy：音乐元数据解析中转地址（Cloudflare Worker）。
//   部署方法见仓库 workers/README.md，形如 https://eunoia-music.你的子域.workers.dev
//   填这里改完即生效，不需要重新构建；构建时环境变量 VITE_MUSIC_PROXY 的值会作为默认值。
window.__EUNOIA_CONFIG__ = {
  musicProxy: ''
}
