/* 音乐缓存队列：封面/歌词的本地化抓取。
   懒加载策略：导入后 & 曲库载入后把缺封面的歌入队；歌词在导入/打开歌词页时抓取。
   所有任务幂等（已缓存的跳过）、去重（同歌同类型不重复入队）、并发受控（CONCURRENCY）。
   抓取失败的静默保留原状（封面继续用 CDN 链接，歌词页继续现抓），不影响使用。 */
import db from '../db'
import * as musicService from './music.service'

const CONCURRENCY = 3

const pending = []          // { key, fn }
const inflight = new Set()  // key 集合
let running = 0
let doneCount = 0           // 已完成任务数（含后台自动缓存的，供进度展示）
let updateListener = null   // (songId, patch) => void，供 store 同步内存行

export function setCacheUpdateListener(fn) {
  updateListener = fn
}

function stats() {
  return { queued: pending.length + inflight.size, running, done: doneCount }
}

function pump() {
  while (running < CONCURRENCY && pending.length) {
    const task = pending.shift()
    if (inflight.has(task.key)) continue
    inflight.add(task.key)
    running++
    task
      .fn()
      .catch((e) => { console.warn('[musicCache]', task.key, e.message) })
      .finally(() => {
        inflight.delete(task.key)
        running--
        doneCount++
        pump()
      })
  }
}

function enqueue(key, fn) {
  if (inflight.has(key) || pending.some((t) => t.key === key)) return false
  pending.push({ key, fn })
  pump()
  return true
}

function patchRow(id, patch) {
  if (updateListener) updateListener(id, patch)
}

/* ─── 封面：远程链接 → dataURL 入库 ─── */
export function enqueueCover(song) {
  if (!song || !song.id) return false
  const cover = String(song.cover || '')
  if (!cover || cover.startsWith('data:')) return false // 无封面或已缓存
  return enqueue('cover:' + song.id, async () => {
    const dataUrl = await musicService.fetchCoverDataUrl(cover)
    if (!dataUrl) return
    db.prepare('UPDATE songs SET cover = ? WHERE id = ?').run(dataUrl, song.id)
    patchRow(song.id, { cover: dataUrl })
  })
}

/* ─── 歌词：按源抓取 LRC 入库（netease/kugou 之外的数据源没有歌词可抓） ─── */
export function enqueueLyric(song) {
  if (!song || !song.id) return false
  if (song.lyric && song.lyric.trim()) return false
  if (song.source !== 'netease' && song.source !== 'kugou') return false
  return enqueue('lyric:' + song.id, async () => {
    const lrc =
      song.source === 'netease'
        ? await musicService.neGetLyric(song.source_id)
        : await musicService.kugouGetLyric(song.source_id)
    if (!lrc || !lrc.trim()) return
    db.prepare('UPDATE songs SET lyric = ? WHERE id = ?').run(lrc, song.id)
    patchRow(song.id, { lyric: lrc })
  })
}

export function enqueueSong(song) {
  enqueueCover(song)
  enqueueLyric(song)
}

/* 全量补抓：封面未缓存 或（网易云/酷狗源且歌词为空）的歌。
   返回 { songs, tasks }：待处理歌曲数与实际入队的任务数。 */
export function backfillAll() {
  const songs = db
    .prepare(
      `SELECT * FROM songs
       WHERE (cover != '' AND cover NOT LIKE 'data:%')
          OR (source IN ('netease','kugou') AND (lyric IS NULL OR lyric = ''))`
    )
    .all()
  let tasks = 0
  for (const s of songs) {
    if (enqueueCover(s)) tasks++
    if (enqueueLyric(s)) tasks++
  }
  return { songs: songs.length, tasks }
}

export function cacheStats() {
  return stats()
}
