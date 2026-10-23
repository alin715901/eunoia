// 本地数据库门面：sql.js（WASM SQLite 跑在浏览器里）+ IndexedDB 持久化。
// 对外 API 与 better-sqlite3 保持一致：exec / prepare().run|get|all / transaction，
// 因此 server/src 的 repositories 与 services 可以原样搬到前端运行。
//
// 启动流程：main.js 先 await initDb() 再挂载 Vue 应用；
// 之后所有仓库/服务同步取用 default 导出的 db 对象。
// 持久化策略：写操作标记 dirty，400ms 防抖后把整个 sqlite 文件快照写入 IndexedDB；
// 页面隐藏/关闭时也会尽力落盘。

import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import schemaSql from './schema.sql?raw'
import { migrate } from './migrate'
import runSeed from './seed.js'

const IDB_NAME = 'eunoia-db'
const IDB_STORE = 'kv'
const IDB_KEY = 'app-db'

/* ── IndexedDB 极简封装 ── */

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const idb = req.result
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key) {
  const idb = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key, value) {
  const idb = await idbOpen()
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/* ── 参数规整：sql.js 的 bind 只接受 number / string / null / Uint8Array ── */

function toBindable(v) {
  if (v === undefined || v === null) return null
  const t = typeof v
  if (t === 'number' || t === 'string') return v
  if (t === 'boolean') return v ? 1 : 0
  if (t === 'bigint') return Number(v)
  if (v instanceof Uint8Array) return v
  try {
    return JSON.stringify(v)
  } catch (_) {
    return String(v)
  }
}

const state = { raw: null, dirty: false, flushing: false, timer: null, lastBytes: 0 }
/* 按 SQL 文本缓存预编译语句：
   1. 业务代码（如 seed 的事务、repository 的循环插入）会复用同一个 prepare 结果多次 run，
      与 better-sqlite3 语义一致；
   2. 避免每次查询都重新编译，WASM 内存不增长（SQL 文本集合有界）。 */
const stmtCache = new Map()

function getStmt(sql) {
  let stmt = stmtCache.get(sql)
  if (!stmt) {
    stmt = state.raw.prepare(sql)
    stmtCache.set(sql, stmt)
  }
  return stmt
}

function markDirty() {
  state.dirty = true
  if (state.timer) return
  state.timer = setTimeout(() => {
    state.timer = null
    flush()
  }, 400)
}

async function flush() {
  if (!state.dirty || !state.raw || state.flushing) return
  state.flushing = true
  try {
    const bytes = state.raw.export()
    /* 关键：sql.js 的 export() 会 finalize 所有已编译语句并重开库句柄，
       缓存里的 Statement 全部失效，必须清掉，下次 prepare 时重新编译 */
    stmtCache.clear()
    await idbPut(IDB_KEY, bytes)
    state.lastBytes = bytes.byteLength
    state.dirty = false
  } catch (e) {
    console.error('[db] 持久化失败', e)
  } finally {
    state.flushing = false
  }
}

if (typeof window !== 'undefined') {
  // 切到后台/关闭页面前尽力落盘（debounce 之外的保险）
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', () => flush())
}

/* ── better-sqlite3 风格门面 ── */

const db = {
  get ready() {
    return !!state.raw
  },

  // 最近一次落盘的数据库字节数（设置页「内存数据」展示用）
  get size() {
    return state.lastBytes
  },

  exec(sql) {
    state.raw.exec(sql)
    markDirty()
  },

  prepare(sql) {
    const stmt = getStmt(sql)
    const bind = (args) => stmt.bind(args.map(toBindable))
    return {
      run(...args) {
        bind(args)
        stmt.step()
        const r = {
          lastInsertRowid: Number(state.raw.exec('SELECT last_insert_rowid()')[0].values[0][0]),
          changes: state.raw.getRowsModified(),
        }
        stmt.reset()
        markDirty()
        return r
      },
      get(...args) {
        bind(args)
        let row
        if (stmt.step()) row = stmt.getAsObject()
        stmt.reset()
        return row
      },
      all(...args) {
        bind(args)
        const out = []
        while (stmt.step()) out.push(stmt.getAsObject())
        stmt.reset()
        return out
      },
    }
  },

  // 与 better-sqlite3 一致：db.transaction(fn) 返回可调用函数，包裹 BEGIN/COMMIT/ROLLBACK
  transaction(fn) {
    return (...args) => {
      state.raw.run('BEGIN')
      try {
        const r = fn(...args)
        state.raw.run('COMMIT')
        markDirty()
        return r
      } catch (e) {
        try {
          state.raw.run('ROLLBACK')
        } catch (_) {
          /* 忽略 */
        }
        throw e
      }
    }
  },
}

/* ── 初始化 / 重置 ── */

/* 加载 sql.js 的 WASM。
   方案演进（都踩过坑，按时间序）：
   1. 直接 fetch .wasm 文件：GitHub Pages CDN 对该响应体会卡流
      （instantiateStreaming 的 promise 永远 pending，sql.js 回退只捕获
      reject 不捕获 hang；实测连 HEAD 请求都无响应）；
   2. 构建期 base64 内联进主 bundle：零请求可靠了，但首屏 JS 膨胀
      857KB（gzip 394KB），慢链路下白屏 50s+；
   3. base64 拆独立 JS chunk 动态 import（现方案）：与主 bundle 并行
      下载（index.html 有 modulepreload），.js 响应 CDN 不卡流，
      主 JS 回到 ~242KB gzip。加载失败时重试，仍失败则抛错由
      App.vue 错误页提供「重新加载」。 */
async function loadWasmDataUrl() {
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const mod = await import('./wasm-data.js')
      if (mod && typeof mod.default === 'string' && mod.default.length > 1024) return mod.default
      throw new Error('wasm 数据模块内容异常')
    } catch (e) {
      lastErr = e
      console.warn('[db] wasm 数据 chunk 第', attempt, '次加载失败:', e && e.message)
      if (attempt < 3) await new Promise((r) => setTimeout(r, 600))
    }
  }
  throw lastErr || new Error('wasm 数据 chunk 加载失败')
}

async function loadSqlJs() {
  const dataUrl = await loadWasmDataUrl()
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const SQL = await initSqlJs({ wasmBinary: bytes })
  console.log('[db] wasm 数据 chunk 加载成功', bytes.byteLength, 'bytes')
  return SQL
}

/* ── 初始化进度（供 App.vue 开屏进度条使用）──
   initDb 各阶段上报 0-100；dbReady 在 module 加载时即开始执行，
   App.vue 挂载后订阅会立即收到当前进度，后续更新通过订阅推送 */
let dbProgress = 0
const dbProgressSubs = new Set()
export function onDbProgress(fn) {
  dbProgressSubs.add(fn)
  fn(dbProgress)
  return () => dbProgressSubs.delete(fn)
}
function setDbProgress(p) {
  if (p <= dbProgress) return
  dbProgress = p
  dbProgressSubs.forEach((f) => f(p))
}

export async function initDb() {
  setDbProgress(8)
  const SQL = await loadSqlJs()
  setDbProgress(45)
  const saved = await idbGet(IDB_KEY)
  setDbProgress(65)
  const fresh = !saved || !saved.byteLength
  state.raw = fresh ? new SQL.Database() : new SQL.Database(new Uint8Array(saved))
  state.raw.exec('PRAGMA foreign_keys = ON')
  if (fresh) {
    // 首次打开：建表
    state.raw.exec(schemaSql)
  }
  setDbProgress(82)
  // 与服务器一致：每次启动都跑 migrate（幂等，补齐新表新列）
  migrate()
  if (fresh) {
    // 首次打开：种子数据（默认联系人 TA、字卡分组、塔罗牌库、全局设置）
    runSeed()
    markDirty()
    await flush()
    console.log('[db] 首次初始化：建表 + migrate + 种子数据完成')
  } else {
    console.log('[db] 已从 IndexedDB 恢复本地数据')
  }
  setDbProgress(100)
  return db
}

// 清空本地数据并重建（供以后做「重置账号」用）
export async function resetDb() {
  state.raw = null
  stmtCache.clear()
  await idbPut(IDB_KEY, new Uint8Array())
  return initDb()
}

/* 导出整个数据库字节（云端备份用）。注意 export() 会使语句缓存全部失效 */
export function exportDbBytes() {
  if (!state.raw) throw new Error('数据库尚未初始化')
  const bytes = state.raw.export()
  stmtCache.clear()
  return new Uint8Array(bytes)
}

/* 用备份字节整体替换当前数据库（云端恢复用）：替换 → migrate（幂等）→ 落盘。
   返回后调用方需整页刷新，让全部 store/服务基于新库重新初始化 */
export async function restoreDbBytes(bytes) {
  const SQL = await loadSqlJs()
  const fresh = new SQL.Database(new Uint8Array(bytes))
  try {
    fresh.exec('SELECT count(*) FROM sqlite_master')
  } catch (e) {
    throw new Error('备份文件不是有效的应用数据库')
  }
  state.raw = fresh
  stmtCache.clear()
  state.raw.exec('PRAGMA foreign_keys = ON')
  migrate()
  state.dirty = true
  await flush()
}

/* 数据库就绪 Promise：module 加载即开始初始化（与 Vue 挂载并行）。
   main.js 不再 await 它——先渲染应用外壳/骨架屏，就绪后由 App.vue
   的 dbReady.then(...) 触发各 store 加载，白屏时间从「下载+init」总和
   缩短为「下载」一项（init 在后台与用户看骨架屏的时间重叠）。 */
export const dbReady = initDb()

export default db
