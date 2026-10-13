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

/* 加载 sql.js 的 WASM（独立 .wasm 文件，fetch + wasmBinary）。
   历史演进：
   - 最初直接 fetch：GitHub Pages CDN 对该 .wasm 响应体在部分网络路径下
     会卡流（instantiateStreaming 的 promise 永远 pending，sql.js 回退
     只捕获 reject 不捕获 hang）；
   - 曾改为构建期 base64 内联（?inline）规避：但 base64 使首屏 JS bundle
     膨胀 857KB（gzip 394KB），链路慢时首屏白屏 50s+，得不偿失；
   - 现方案：独立文件（gzip 仅 315KB，index.html 有 preload 可与 JS
     并行下载），fetch + wasmBinary（不走 streaming，避开卡流坑），
     带超时与缓存穿透重试。 */
async function loadSqlJs() {
  let lastErr = null
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const sep = wasmUrl.includes('?') ? '&' : '?'
      const url = `${wasmUrl}${sep}v=${attempt}`
      const buf = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('wasm 加载超时')), 20000)
        fetch(url, { cache: attempt === 1 ? 'force-cache' : 'no-store' })
          .then((r) => {
            if (!r.ok) throw new Error('wasm HTTP ' + r.status)
            return r.arrayBuffer()
          })
          .then(resolve, reject)
          .finally(() => clearTimeout(timer))
      })
      if (buf && buf.byteLength > 1024) {
        const SQL = await initSqlJs({ wasmBinary: buf })
        console.log('[db] wasm 独立文件加载成功', buf.byteLength, 'bytes')
        return SQL
      }
      throw new Error('wasm 数据异常: ' + (buf ? buf.byteLength : 0))
    } catch (e) {
      lastErr = e
      console.warn('[db] wasm 第', attempt, '次加载失败:', e.message)
      await new Promise((r) => setTimeout(r, 600))
    }
  }
  throw lastErr || new Error('wasm 加载失败')
}

export async function initDb() {
  const SQL = await loadSqlJs()
  const saved = await idbGet(IDB_KEY)
  const fresh = !saved || !saved.byteLength
  state.raw = fresh ? new SQL.Database() : new SQL.Database(new Uint8Array(saved))
  state.raw.exec('PRAGMA foreign_keys = ON')
  if (fresh) {
    // 首次打开：建表
    state.raw.exec(schemaSql)
  }
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
  return db
}

// 清空本地数据并重建（供以后做「重置账号」用）
export async function resetDb() {
  state.raw = null
  stmtCache.clear()
  await idbPut(IDB_KEY, new Uint8Array())
  return initDb()
}

/* 数据库就绪 Promise：module 加载即开始初始化（与 Vue 挂载并行）。
   main.js 不再 await 它——先渲染应用外壳/骨架屏，就绪后由 App.vue
   的 dbReady.then(...) 触发各 store 加载，白屏时间从「下载+init」总和
   缩短为「下载」一项（init 在后台与用户看骨架屏的时间重叠）。 */
export const dbReady = initDb()

export default db
