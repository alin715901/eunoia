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

/* ── App 私有文件镜像（耐久存储兜底）──
 * 主存储仍是 WebView 的 IndexedDB；但系统 / WebView 升级、ROM 清理、部分机型的
 * 「释放存储空间」会把 WebView 数据目录清空，导致 IndexedDB 读不到 → 旧数据丢失
 * （这正是「更新后数据全没了」的根因：APK 是原地升级、文件目录本应保留，
 * 偏偏 WebView 自己的 IndexedDB 被清空，db.js 误判为「首次」建了空库并覆盖回去）。
 * 因此额外把 sql.js 全量快照镜像到 App 私有文件目录
 * （/data/data/com.eunoia.app/files/，与应用共存、随 APK 原地升级保留，
 * 且不受 WebView 数据清空影响）。
 * 启动恢复顺序：IndexedDB → 文件 → 都为空才是真·首次。
 * 全部读写包在 try/catch 与动态 import 里，即便插件缺失也回落为「仅 IndexedDB」，不回归。 */

const NATIVE = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
const DB_FILE_NAME = 'eunoia-db.sqlite'
const FILE_THROTTLE = 15000
let lastFileMirror = 0
let fsMod = null

async function ensureFS() {
  if (fsMod !== null) return fsMod
  try {
    fsMod = await import('@capacitor/filesystem')
  } catch (e) {
    fsMod = false
  }
  return fsMod
}

function u8ToB64(bytes) {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}
function b64ToU8(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function readDbFile() {
  if (!NATIVE) return null
  const fs = await ensureFS()
  if (!fs || !fs.Filesystem) return null
  try {
    const r = await fs.Filesystem.readFile({ path: DB_FILE_NAME, directory: fs.Directory.Data })
    if (r && r.data) return b64ToU8(r.data)
  } catch (e) { /* 文件不存在 = 尚未镜像，忽略 */ }
  return null
}

async function writeDbFile(bytes) {
  if (!NATIVE) return false
  const fs = await ensureFS()
  if (!fs || !fs.Filesystem) return false
  try {
    await fs.Filesystem.writeFile({ path: DB_FILE_NAME, data: u8ToB64(bytes), directory: fs.Directory.Data, recursive: true })
    return true
  } catch (e) { return false }
}

/* 把当前库快照镜像到 App 私有文件（节流；force=true 无视节流，用于切后台/关闭前保底）。
   注意 export() 会重建底层连接、令已编译语句失效，故导出后清缓存并恢复外键约束。
   关键：镜像只是「兜底恢复来源」，不参与关键落盘路径，改为 setTimeout 延迟、非阻塞执行——
   大库（图片/音频 dataURL 全在库里）的 b64 转换 + 写文件很重，若在 flush / 启动关键路径同步做，
   会长时间阻塞主线程 → Android WebView ANR 杀进程（即「导入卡退 / 启动进不去」）。 */
function tryMirrorToFile(force, bytes) {
  if (!NATIVE || !state.raw) return
  const now = Date.now()
  if (!force && now - lastFileMirror < FILE_THROTTLE) return
  lastFileMirror = now
  setTimeout(() => {
    if (!NATIVE || !state.raw) return
    /* 事务 / 导入进行中绝不导出快照：export() 会静默结束未提交事务 → 数据丢失 */
    if (state.inTx > 0 || state.importing) return
    try {
      const b = bytes || state.raw.export()
      if (!bytes) {
        stmtCache.clear()
        try { state.raw.exec('PRAGMA foreign_keys = ON') } catch (e) {}
      }
      writeDbFile(b).catch(() => { /* 镜像失败不影响主流程 */ })
    } catch (e) { /* 镜像失败不影响主流程 */ }
  }, 0)
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

const state = { raw: null, dirty: false, flushing: false, timer: null, lastBytes: 0, inTx: 0, importing: false, pendingFlush: false, deferredFlush: false, lastFlushError: null }
/* 当前正在进行的落盘 Promise：flush / flushNow 用它串联，避免并发 export()（会静默结束事务）与竞态判断。 */
let flushPromise = null
/* sql.js 构造器：loadSqlJs 成功后缓存，供 reloadFromStorage 重建库用 */
let SQL_CTOR = null
/* 写入版本号：每次写操作 ++dirtySeq，落盘成功后记 savedSeq。
   用于判断「导出快照之后是否又发生了新写入」——
   早先的实现用布尔 dirty 标记，await idbPut() 期间的新写入会被
   无条件 state.dirty = false 吞掉，导致这部分数据永远不落盘。 */
let dirtySeq = 0
let savedSeq = 0
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
  dirtySeq++
  /* 导入进行中：不排 debounce 落盘。导入会把整库撑大，自动 flush 会导出整个
     巨大库、长时间阻塞主线程 → 触发 ANR 卡退。落盘推迟到 importBackup 结束
     后的 flushNow 一次性完成。 */
  if (state.importing) return
  if (state.timer) return
  state.timer = setTimeout(() => {
    state.timer = null
    flush()
  }, 400)
}

/* 把当前数据库快照写入 IndexedDB。
   关键点：idbPut 是异步的，其间可能又发生新写入。
   所以快照的版本号必须在 export() 之前取，落盘成功后只有当
   dirtySeq 没有变化才允许清 dirty 标记；否则要再落一次盘。
   早先的实现在 await 之后无条件 state.dirty = false，
   会把 await 期间产生的新写入永久吞掉（数据丢失）。 */
async function flush() {
  if (!state.raw) return
  /* 事务进行中绝不导出快照：sql.js 的 export() 会重建底层连接，
     在未提交事务中调用会静默结束该事务 → 未提交数据全部丢失。
     （导入备份动辄上万行写入，事务可能持续数百毫秒，必须挡住。） */
  if (state.inTx > 0 || state.importing) {
    state.pendingFlush = true
    if (!state.timer) {
      state.timer = setTimeout(() => { state.timer = null; flush() }, 400)
    }
    return
  }
  /* 正在落盘：等它结束后由本次 flush 的末尾继续（见下方 while），
     而不是像旧实现那样直接 return 又把一次写入无声吞掉。 */
  if (state.flushing) {
    state.pendingFlush = true
    if (flushPromise) { try { await flushPromise } catch (e) { /* ignore */ } }
    return
  }
  if (!state.dirty && !state.pendingFlush && !state.deferredFlush) return
  state.flushing = true
  state.deferredFlush = false
  const work = async () => {
    do {
      state.pendingFlush = false
      const ver = dirtySeq
      const bytes = state.raw.export()
      /* 关键：sql.js 的 export() 会 finalize 所有已编译语句并重开库句柄，
         缓存里的 Statement 全部失效，必须清掉，下次 prepare 时重新编译 */
      stmtCache.clear()
      /* export() 重建了底层连接，PRAGMA foreign_keys 会回到默认的 0（外键约束失效）。
         实测确认（dbg_sqljs.mjs）：export 后 PRAGMA foreign_keys = 0。
         这里显式恢复，保证导出不会悄悄削弱数据完整性约束。 */
      try { state.raw.exec('PRAGMA foreign_keys = ON') } catch (e) { /* ignore */ }
      /* IndexedDB 写入偶发失败（瞬时异常 / 存储抖动）：重试几次，避免误报「写入失败」。
         只有连续失败才判定为真正的持久化失败（多半是存储配额耗尽）。 */
      let written = false
      for (let attempt = 0; attempt < 3 && !written; attempt++) {
        try {
          await idbPut(IDB_KEY, bytes)
          written = true
        } catch (e) {
          console.warn('[db] 落盘失败，第', attempt + 1, '次重试：', e && e.message)
          if (attempt < 2) await new Promise((r) => setTimeout(r, 250))
        }
      }
      if (!written) {
        state.lastFlushError = 'idb'
        throw new Error('idb-write-failed')
      }
      state.lastFlushError = null
      // 额外镜像一份到 App 私有文件（扛 WebView/系统升级清掉 IndexedDB 的情况）——延迟非阻塞，不计入关键路径
      tryMirrorToFile(false, bytes)
      state.lastBytes = bytes.byteLength
      savedSeq = ver
      state.dirty = dirtySeq !== savedSeq
    } while (state.pendingFlush || state.dirty)
  }
  flushPromise = work()
  try {
    await flushPromise
  } catch (e) {
    console.error('[db] 持久化失败', e)
  } finally {
    state.flushing = false
    flushPromise = null
  }
  /* 落盘期间又产生了新写入（pendingFlush/dirty 被再次置位）→ 再来一轮，确保收敛 */
  if (state.pendingFlush || state.dirty) await flush()
}

/* 立即落盘并等待完成（导入 / 导出 / 页面跳转等关键节点用）。
   返回 true 表示当前内存状态已确实写入 IndexedDB。 */
export async function flushNow() {
  if (!state.raw) return false
  try {
    await flush()
    /* flush 期间又来了新写入 → 再来一次，确保收敛（上限放宽，等待真正进行中的落盘完成） */
    let guard = 0
    while ((state.dirty || state.pendingFlush || state.deferredFlush) && guard++ < 50) {
      await flush()
    }
    return !state.dirty && !state.deferredFlush
  } catch (e) {
    console.error('[db] 立即落盘失败', e)
    return false
  }
}

/* 导入开关：导入期间抑制自动落盘（见 markDirty / flush 的 importing 分支）。
   reset 时若仍有待落盘，登记一次延迟落盘（异步触发，由 flushNow 真正 await 完成，
   避免旧实现里「同步调 flush 又不被 await」导致的竞态误报）。 */
export function setImporting(v) {
  state.importing = !!v
  if (!v && (state.dirty || state.pendingFlush)) {
    state.deferredFlush = true
    flush().catch(() => {})
  }
}

if (typeof window !== 'undefined') {
  // 切到后台/关闭页面前尽力落盘（debounce 之外的保险），并把快照保底镜像到 App 私有文件
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flush()
      if (state.raw && state.inTx === 0) tryMirrorToFile(true)
    }
  })
  window.addEventListener('pagehide', () => {
    flush()
    if (state.raw && state.inTx === 0) tryMirrorToFile(true)
  })
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
      /* inTx 计数：事务期间禁止导出快照（export 会静默结束事务） */
      state.inTx++
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
      } finally {
        state.inTx--
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
  SQL_CTOR = SQL
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

/* 启动期间的非致命告警（如「本地数据损坏已重建空白库」），由 App.vue 在 dbReady
   之后读取并提示用户，避免被「数据初始化失败」掩盖真实原因。null 表示一切正常。 */
let lastInitWarning = null
export function getInitWarning() { return lastInitWarning }

/* 建一个全新的空库（建表 + 种子 + 落盘 + 镜像），供「真·首次」与「损坏兜底重建」复用。 */
async function buildFreshDb(SQL) {
  state.raw = new SQL.Database()
  state.raw.exec('PRAGMA foreign_keys = ON')
  state.raw.exec(schemaSql)
  runSeed()
  markDirty()
  await flushNow() // 落 IndexedDB + 镜像到文件
  tryMirrorToFile(true) // 延迟镜像，不阻塞启动
  console.log('[db] 已重建空白库（建表 + migrate + 种子数据完成）')
}

export async function initDb() {
  lastInitWarning = null
  setDbProgress(8)
  const SQL = await loadSqlJs()
  setDbProgress(45)
  /* 优先 IndexedDB，其次 App 私有文件；两者任取其一即可启动。
     读取出错（瞬时）一律当作「本来源无可用数据」，往下走另一来源；
     只有真正拿到字节却解析失败才算「损坏」。 */
  let bytes = null
  let fromFile = false
  let hadData = false
  try {
    const saved = await idbGet(IDB_KEY)
    if (saved && saved.byteLength) { bytes = saved; hadData = true }
  } catch (e) { /* IndexedDB 读取异常不致命，往下走文件来源 */ }
  if (!bytes) {
    try {
      const fb = await readDbFile()
      if (fb && fb.byteLength) { bytes = fb; fromFile = true; hadData = true }
    } catch (e) { /* 文件读取异常不致命 */ }
  }

  /* 尝试打开拿到的字节；主来源坏则尝试备用来源兜底，避免「进不去应用」死循环。
     注意：只把「拿到字节但解析失败」判为损坏，瞬时不读不算（避免误删好数据）。 */
  let loadedRaw = null
  if (bytes) {
    try {
      const t = new SQL.Database(new Uint8Array(bytes))
      t.exec('PRAGMA foreign_keys = ON')
      loadedRaw = t
    } catch (e) {
      console.error('[db] 主来源解析失败，尝试备用来源', e)
      const alt = fromFile ? await idbGet(IDB_KEY) : await readDbFileSafe()
      if (alt && alt.byteLength) {
        try {
          const t = new SQL.Database(new Uint8Array(alt))
          t.exec('PRAGMA foreign_keys = ON')
          loadedRaw = t
          fromFile = !fromFile // 已切换到另一来源
        } catch (e2) {
          console.error('[db] 备用来源也解析失败', e2)
        }
      }
    }
  }

  if (loadedRaw) {
    state.raw = loadedRaw
    setDbProgress(82)
    /* 跑 migrate（幂等，补齐新表新列）。即便 migrate 抛错也尽量保留已加载的本地数据，
       仅在告警里提示，不让结构迁移异常把用户挡在门外。 */
    try {
      migrate()
    } catch (e) {
      console.error('[db] migrate 出错（已尽量保留本地数据）', e)
      lastInitWarning = '本地数据已加载，但结构升级时出错：' + (e && e.message ? e.message : e) + '。若部分功能异常，建议从「云端备份」恢复。'
    }
    // 同步双来源（延迟非阻塞），保证二者一致
    if (fromFile) {
      const b = state.raw.export()
      try { stmtCache.clear(); state.raw.exec('PRAGMA foreign_keys = ON') } catch (e) {}
      try { await idbPut(IDB_KEY, b) } catch (e) {}
      tryMirrorToFile(true, b)
    } else {
      tryMirrorToFile(true)
    }
    console.log('[db] 已从' + (fromFile ? '本地文件' : 'IndexedDB') + '恢复本地数据')
    setDbProgress(100)
    return db
  }

  /* ── 两份来源都拿不到 / 都损坏：绝不把用户永久关在门外 ──
     若存在过数据（hadData）但都坏了，先把损坏字节存到侧车文件留作人工恢复，
     再重建空白库，并给出明确告警（用户可从云端备份恢复）；
     若本就无任何数据（真·首次），直接建空库、不告警。 */
  console.error('[db] 本地数据不可用，重建空白库（hadData=' + hadData + '）')
  if (hadData) {
    try {
      const bad = fromFile ? await idbGet(IDB_KEY) : await readDbFileSafe()
      if (bad && bad.byteLength && NATIVE) {
        const fs = await ensureFS()
        if (fs && fs.Filesystem) {
          try {
            await fs.Filesystem.writeFile({ path: 'eunoia-db.corrupt', data: u8ToB64(bad), directory: fs.Directory.Data, recursive: true })
          } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
    lastInitWarning = '本地数据文件已损坏且无法恢复，已为你重建一个空白账户。此前的数据无法自动找回——请尽快从「设置 → 云端备份 → 从云端恢复」恢复。'
  }
  await buildFreshDb(SQL)
  setDbProgress(100)
  return db
}

/* 读取文件镜像、忽略异常（兜底路径用，异常一律当作「无可用数据」） */
async function readDbFileSafe() {
  try { return await readDbFile() } catch (e) { return null }
}

/* 从持久化来源（IndexedDB → 文件镜像）重新读入并重建内存库，用于「导入失败回滚」：
   把被部分导入 / 误删空的内存库恢复到最后一次成功落盘的状态，
   从而 importBackup 抛错时不会把半成品 / 空库持久化到磁盘，避免数据丢失与「进不去」。
   返回 true 表示成功回滚；若两个来源都拿不到数据则返回 false（极罕见）。 */
export async function reloadFromStorage() {
  if (!SQL_CTOR) return false
  let bytes = null
  try {
    const saved = await idbGet(IDB_KEY)
    if (saved && saved.byteLength) bytes = saved
  } catch (e) { /* ignore */ }
  if (!bytes) {
    const fb = await readDbFile()
    if (fb && fb.byteLength) bytes = fb
  }
  if (!bytes) return false
  try {
    const next = new SQL_CTOR.Database(new Uint8Array(bytes))
    next.exec('PRAGMA foreign_keys = ON')
    state.raw = next
    stmtCache.clear()
    /* 回滚后内存与磁盘一致，标记干净，避免随后任何 flush 把「旧数据」又当成新写入覆盖回去 */
    state.dirty = false
    state.pendingFlush = false
    state.deferredFlush = false
    state.inTx = 0
    state.importing = false
    state.lastBytes = bytes.byteLength
    return true
  } catch (e) {
    return false
  }
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
