// 本地数据库门面：sql.js（WASM SQLite 跑在浏览器里）+ IndexedDB 持久化。
// 对外 API 与 better-sqlite3 保持一致：exec / prepare().run|get|all / transaction，
// 因此 server/src 的 repositories 与 services 可以原样搬到前端运行。
//
// 启动流程：main.js 先 await initDb() 再挂载 Vue 应用；
// 之后所有仓库/服务同步取用 default 导出的 db 对象。
// 持久化策略：写操作标记 dirty，400ms 防抖后把整个 sqlite 文件快照写入 IndexedDB；
// 页面隐藏/关闭时也会尽力落盘。整库快照成本高（含全部 base64 图片/语音），
// 因此落盘的连续多轮之间会主动让出主线程；App 私有文件镜像改为分块低内存写入，
// 避免连续 export 把 WebView 主线程钉死（ANR 卡退）或 btoa 峰值内存叠加（OOM 闪退）。

import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import schemaSql from './schema.sql?raw'
import { migrate } from './migrate'
import runSeed from './seed.js'

const IDB_NAME = 'eunoia-db'
const IDB_STORE = 'kv'
const IDB_KEY = 'app-db'

/* ── IndexedDB 极简封装 ──
 * 旧实现每次读写都 indexedDB.open() 一个新连接且从不关闭，也不设任何超时。
 * 导入 / 云端恢复后会 location.reload()：旧文档残留的连接与 pagehide 里
 * 临时发起的「整库 export + 大 blob readwrite 事务」会占住同一个 object store，
 * 新文档的 open / get 在 Android WebView 上可能永久 pending —— 表现就是
 * 「刷新后一直卡在启动界面，必须清后台重进」。
 * 现在：全模块复用一条连接、打开与事务都带超时、主动刷新前显式关闭连接。 */

const IDB_TIMEOUT = 8000         // 打开连接
const IDB_READ_TIMEOUT = 12000   // 读快照（大库结构化克隆可能较慢）
const IDB_WRITE_TIMEOUT = 30000  // 写快照（含 base64 音乐/图片时可能很大，别误判超时）
let sharedIdb = null
/* 主动刷新前置位：见 prepareReload() 与下方 visibilitychange / pagehide */
let reloading = false

function idbOpen() {
  if (sharedIdb) return Promise.resolve(sharedIdb)
  return new Promise((resolve, reject) => {
    let req
    try {
      req = indexedDB.open(IDB_NAME, 1)
    } catch (e) {
      reject(e)
      return
    }
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error('本地数据库打开超时'))
    }, IDB_TIMEOUT)
    req.onupgradeneeded = () => {
      const idb = req.result
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE)
    }
    /* 被别的连接阻塞时不要静默挂死：交给上面的超时兜底 */
    req.onblocked = () => console.warn('[db] indexedDB.open 被其他连接阻塞')
    req.onsuccess = () => {
      const idb = req.result
      if (done) {
        try { idb.close() } catch (e) { /* ignore */ }
        return
      }
      done = true
      clearTimeout(timer)
      /* 另一页面升级数据库版本时主动让出连接，避免把对方卡死 */
      idb.onversionchange = () => {
        try { idb.close() } catch (e) { /* ignore */ }
        if (sharedIdb === idb) sharedIdb = null
      }
      sharedIdb = idb
      resolve(idb)
    }
    req.onerror = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(req.error || new Error('本地数据库打开失败'))
    }
  })
}

async function idbGet(key) {
  const idb = await idbOpen()
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error('本地数据库读取超时'))
    }, IDB_READ_TIMEOUT)
    const tx = idb.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(key)
    req.onsuccess = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve(req.result)
    }
    req.onerror = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(req.error || new Error('本地数据库读取失败'))
    }
  })
}

async function idbPut(key, value) {
  const idb = await idbOpen()
  return new Promise((resolve, reject) => {
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      done = true
      reject(new Error('本地数据库写入超时'))
    }, IDB_WRITE_TIMEOUT)
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(value, key)
    tx.oncomplete = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    tx.onerror = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(tx.error || new Error('本地数据库写入失败'))
    }
    tx.onabort = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      reject(tx.error || new Error('本地数据库写入被中止'))
    }
  })
}

/**
 * 主动刷新页面（导入 / 恢复 / 重置 / 更新）前调用。
 * 1) 置位 reloading，让 pagehide / visibilitychange 不再发起整库 export；
 * 2) 等在途落盘真正结束（最多 4s，不把刷新卡死）；
 * 3) 主动关闭 IndexedDB 连接，避免旧文档残留连接占住新文档的 open。
 * 数据在此之前的 flushNow() 已落盘齐全，跳过 pagehide 的重复落盘不会丢数据。
 */
export async function prepareReload() {
  reloading = true
  /* 若因异常没能真正刷新，5 秒后恢复正常的自动落盘，避免长期跳过 pagehide 落盘 */
  setTimeout(() => { reloading = false }, 5000)
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  if (flushPromise) {
    try {
      await Promise.race([
        flushPromise,
        new Promise((r) => setTimeout(r, 4000))
      ])
    } catch (e) { /* 在途落盘失败也照常刷新，错误会在下次启动体现 */ }
  }
  try {
    if (sharedIdb) {
      sharedIdb.close()
      sharedIdb = null
    }
  } catch (e) { /* ignore */ }
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
/* 文件镜像节流：日常写入 60 秒一次；关键节点（切后台 / 导入完成 / 启动）5 秒一次。
   镜像已改为「1MB 分块 base64 + appendFile 写临时文件后原子替换」，单次峰值内存
   约 1.4MB、与库体积无关，因此大库（本地音乐/图片 dataURL）也能安全镜像。
   不能因为库大就干脆不镜像：那样文件会永久停留在旧版本，一旦 WebView 的
   IndexedDB 被系统/ROM 清空，启动就回退到很旧的数据（表现为歌曲、聊天凭空消失）。 */
const FILE_THROTTLE = 60000
const FORCE_MIRROR_THROTTLE = 5000
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
/* 分块解码：一次 atob(整个大库 base64) 会构造与库同量级的临时字符串，
   启动兜底恢复大库时容易 OOM。按 4 字符对齐分块，峰值内存降到一个块大小。
   padding 只出现在最后一块，逐块独立解码后拼接即原始字节序列。 */
function b64ToU8(b64) {
  const len = b64.length
  const out = new Uint8Array(Math.floor((len * 3) / 4))
  const CH = 0x100000 // 必须是 4 的倍数
  let p = 0
  for (let i = 0; i < len; i += CH) {
    const part = atob(b64.slice(i, Math.min(len, i + CH)))
    for (let j = 0; j < part.length; j++) out[p++] = part.charCodeAt(j)
  }
  return out.subarray(0, p)
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
  const F = fs.Filesystem
  const D = fs.Directory.Data
  const TMP = DB_FILE_NAME + '.tmp'
  try {
    /* 分块写入：每块 1MB 原始字节（base64 后约 1.33MB），逐块 append 到临时文件。
       旧实现一次性 u8ToB64(整库) + btoa 会构造约 2.3 倍库体积的临时字符串，
       是「库存音频/图片后切后台 OOM 闪退」的主因，也曾迫使大库直接放弃镜像。
       写完临时文件再 rename 原子替换（插件会先删目标），避免中途失败留下
       半截文件让下次启动解析失败、误判为「数据损坏」。 */
    const CHUNK = 0x100000
    let first = true
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const part = u8ToB64(bytes.subarray(i, i + CHUNK))
      if (first) {
        await F.writeFile({ path: TMP, data: part, directory: D, recursive: true })
        first = false
      } else {
        await F.appendFile({ path: TMP, data: part, directory: D })
      }
    }
    if (first) await F.writeFile({ path: TMP, data: '', directory: D, recursive: true })
    await F.rename({ from: TMP, to: DB_FILE_NAME, directory: D, toDirectory: D })
    return true
  } catch (e) {
    /* 镜像失败只影响兜底副本，主存储 IndexedDB 不受影响，下次节流窗口后重试 */
    return false
  }
}

/* 把当前库快照镜像到 App 私有文件（节流；force=true 用于切后台/启动/导入后的保底）。
   注意 export() 会重建底层连接、令已编译语句失效，故导出后清缓存并恢复外键约束。
   镜像只是「兜底恢复来源」，不参与关键落盘路径，用 setTimeout 延迟、非阻塞执行。
   分块写入后单次峰值内存与库体积无关，不再需要「大库就干脆不镜像」——
   那样会让文件永久停在旧版本，WebView IndexedDB 一旦被清空就回退到旧数据。 */
function tryMirrorToFile(force, bytes) {
  if (!NATIVE || !state.raw) return
  const now = Date.now()
  const gap = force ? FORCE_MIRROR_THROTTLE : FILE_THROTTLE
  if (now - lastFileMirror < gap) return
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
  /* 落盘风暴缓解（不改变收敛语义）：do-while 会一直收敛到没有新写入，
     批量写入时可能连着多轮「整库 export」。原实现这些轮次全挤在同一个
     微任务链里，主线程长时间不释放 → ANR 卡退、多份整库快照叠加 → OOM 闪退。
     这里只在轮与轮之间让出一次主线程（setTimeout 0）：让 UI 能响应、GC 能回收，
     收敛逻辑与数据一致性保证完全不变。 */
  const work = async () => {
    let rounds = 0
    do {
      if (rounds++ > 0) await new Promise((r) => setTimeout(r, 0))
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
  /* 落盘期间又产生了新写入（pendingFlush/dirty 被再次置位）→ 再来一轮，确保收敛。
     保留原有的「返回即已落盘」强保证，仅在本轮之前让出一次主线程，避免与
     work() 连续多轮 export 挤在同一事件循环里造成 ANR。 */
  if (state.pendingFlush || state.dirty) {
    await new Promise((r) => setTimeout(r, 0))
    await flush()
  }
}

/* 立即落盘并等待完成（导入 / 导出 / 页面跳转等关键节点用）。
   返回 true 表示当前内存状态已确实写入 IndexedDB。 */
export async function flushNow() {
  if (!state.raw) return false
  try {
    await flush()
    /* flush 期间又来了新写入 → 再来一次，确保收敛（上限放宽，等待真正进行中的落盘完成）。
       每轮之间让出主线程，避免连续整库 export 长时间阻塞 UI（导入大备份后尤其明显）。 */
    let guard = 0
    while ((state.dirty || state.pendingFlush || state.deferredFlush) && guard++ < 50) {
      await new Promise((r) => setTimeout(r, 0))
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
  /* 切到后台/关闭页面前尽力落盘（debounce 之外的保险），并把快照保底镜像到 App 私有文件。
     主动刷新（prepareReload 已置位）时一律跳过：这时数据已 flushNow 落盘齐全，
     再同步发起一次「整库 export + 大 blob 写入」只会与 reload 后新文档的
     IndexedDB 打开互相抢锁，正是「导入后重进卡在启动页」的根因。 */
  const beforeLeave = () => {
    if (reloading) return
    flush()
    if (state.raw && state.inTx === 0) tryMirrorToFile(true)
  }
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beforeLeave()
  })
  window.addEventListener('pagehide', beforeLeave)
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
/* 带超时的 Promise：动态 import 在慢链路 / SW 缓存错位时可能永远 pending
   （历史上 GitHub Pages 对 .wasm 卡流就让 initDb 永久停在第一步），
   必须给每一步设上限，否则用户只能「清后台重进」才能恢复。 */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + '超时')), ms))
  ])
}

async function loadWasmDataUrl() {
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const mod = await withTimeout(import('./wasm-data.js'), 8000, 'wasm 数据 chunk 加载')
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
  const SQL = await withTimeout(initSqlJs({ wasmBinary: bytes }), 12000, 'SQLite 引擎初始化')
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
  /* schema.sql 只含初始表，songs / song_favs 等后续新增表由 migrate() 补齐
     （migrate 本身就是设计成「全新库也完整跑一遍」）。以前首次建库漏了这一步，
     全局音乐组件在 db 就绪后查歌曲会直接报 "no such table: songs"。 */
  migrate()
  runSeed()
  markDirty()
  await flushNow() // 落 IndexedDB + 镜像到文件
  tryMirrorToFile(true) // 延迟镜像，不阻塞启动
  console.log('[db] 已重建空白库（建表 + migrate + 种子数据完成）')
}

/* 从损坏（malformed）但尚可打开的库中尽量抢救可读数据：
   逐表抽取表结构 + 全部行，写入一个全新的干净库；迁移/读取失败的单表会被跳过，
   不阻断其它表的抢救。返回 { db, rowCount }；若连表清单都读不出则返回 null。 */
function salvageFromCorrupt(SQL, badDb) {
  let tbls
  try {
    const r = badDb.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    if (!r || !r.length) return null
    tbls = r[0].values
  } catch (e) {
    console.warn('[db] salvage: 读取表清单失败', e && e.message)
    return null
  }
  const clean = new SQL.Database()
  clean.exec('PRAGMA foreign_keys = OFF')
  let rowCount = 0
  for (const t of tbls) {
    const tname = t[0]
    const tsql = t[1]
    try {
      if (tsql) clean.exec(tsql)
      const d = badDb.exec('SELECT * FROM "' + tname + '"')
      if (d && d.length && d[0].values.length) {
        const cols = d[0].columns
        const ph = cols.map(() => '?').join(',')
        const stmt = clean.prepare('INSERT OR IGNORE INTO "' + tname + '" VALUES (' + ph + ')')
        for (const row of d[0].values) {
          try { stmt.run(row); rowCount++ } catch (e2) { /* 单行损坏则跳过 */ }
        }
        stmt.free()
      }
    } catch (e) {
      console.warn('[db] salvage: 表 ' + tname + ' 不可读，跳过', e && e.message)
    }
  }
  return { db: clean, rowCount }
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
  let idbFailed = false
  /* 主来源读取：只有「确认拿到空值」才算真·首次。读取异常 / 超时必须重试，
     重试仍失败时直接抛错交给启动错误页（可点「重新加载」），绝不继续往下
     「重建空白库」——那样会用空库覆盖 IndexedDB，把整库数据不可逆地清掉。 */
  let saved = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      saved = await idbGet(IDB_KEY)
      idbFailed = false
      break
    } catch (e) {
      idbFailed = true
      console.warn('[db] IndexedDB 读取失败，第 ' + (attempt + 1) + ' 次重试', e && e.message)
      if (attempt < 1) await new Promise((r) => setTimeout(r, 350))
    }
  }
  if (saved && saved.byteLength) { bytes = saved; hadData = true }
  if (!bytes) {
    try {
      const fb = await readDbFile()
      if (fb && fb.byteLength) { bytes = fb; fromFile = true; hadData = true }
    } catch (e) { /* 文件读取异常不致命 */ }
  }
  if (!bytes && idbFailed) {
    throw new Error('本地数据暂时无法读取（数据库被占用或响应超时）。请点下方「重新加载」重试；若反复出现，请重启应用。')
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
      let alt = null
      try {
        alt = fromFile ? await idbGet(IDB_KEY) : await readDbFileSafe()
      } catch (e2) {
        console.warn('[db] 备用来源读取失败', e2 && e2.message)
      }
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
      console.error('[db] migrate 出错，尝试从损坏库抢救可读数据', e)
      /* 先把原始损坏字节留底（App 私有文件侧车），便于极端情况下人工恢复，
         避免后续落盘把损坏文件覆盖得无法挽回。 */
      try {
        if (bytes && bytes.byteLength && NATIVE) {
          const fs = await ensureFS()
          if (fs && fs.Filesystem) {
            await fs.Filesystem.writeFile({ path: 'eunoia-db.corrupt', data: u8ToB64(bytes), directory: fs.Directory.Data, recursive: true })
          }
        }
      } catch (e2) { /* ignore */ }
      const salvaged = salvageFromCorrupt(SQL, state.raw)
      if (salvaged && salvaged.rowCount > 0) {
        /* 用干净库替换损坏库，并补齐新表/字段，数据重新可读 */
        try { state.raw.close() } catch (e3) { /* ignore */ }
        state.raw = salvaged.db
        stmtCache.clear()
        try { migrate() } catch (e4) { console.warn('[db] 干净库 migrate 失败', e4 && e4.message) }
        markDirty()
        lastInitWarning = '本地数据库文件部分损坏，已自动抢救出 ' + salvaged.rowCount + ' 条可读数据。仍有部分损坏数据可能无法恢复，建议尽快从「云端备份」恢复以确保完整。'
      } else {
        lastInitWarning = '本地数据已加载，但结构升级时出错：' + (e && e.message ? e.message : e) + '。若部分功能异常，建议从「云端备份」恢复。'
      }
    }
    // 同步双来源（延迟非阻塞），保证二者一致
    /* 主来源读取失败时不要再往 IndexedDB 写回：此时连接状态不明，
       写回既可能失败拖慢启动，也可能把较旧的文件镜像盖到主存储上。 */
    if (fromFile && !idbFailed) {
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

/* 判断内存库自上次成功落盘后是否还有未同步的改动。
   用于云端自动备份：数据没变时跳过整库全量导出 + 上传，
   避免长期开前台时每 30 分钟稳定复现一次整库快照的大块内存分配（OOM 闪退隐患）。
   返回 true = 仍有改动（需要备份）；false = 已落盘干净（可跳过）。 */
export function dbHasUnsyncedChanges() {
  return !!(state.dirty || state.pendingFlush || state.deferredFlush || dirtySeq !== savedSeq)
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
