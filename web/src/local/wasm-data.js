/* sql.js WASM 的 base64 data URL 载体模块。
   为什么绕这一圈：
   1. 不能内联进主 bundle——base64 使首屏 JS 膨胀 857KB（gzip 394KB）；
   2. 不能直接 fetch .wasm 文件——GitHub Pages CDN 对 .wasm 响应体会
      卡流（历史坑：不报错不结束，重试也救不回；实测 HEAD 都无响应）；
   3. 本模块经 Rollup 拆成独立 .js chunk，与主 bundle 并行下载：
      CDN 对 .js 响应正常（主 JS 236KB 实测 10s 下完），
      base64 只膨胀 33%，且浏览器/HTTP 缓存友好。
   db.js 以动态 import() 加载本模块（见 loadSqlJs）。 */
import wasmDataUrl from 'sql.js/dist/sql-wasm.wasm?inline'

export default wasmDataUrl
