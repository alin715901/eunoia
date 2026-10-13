import { defineStore } from 'pinia'
import {
  getMusicSongs, favMusicSong, deleteMusicSong, batchDeleteMusicSongs,
  clearUnplayableSongs, getMusicSettings, saveMusicSettings, streamUrl,
  importMusic, addMusicManual, updateMusicSong, uploadMusicFile, getMusicLyric,
  refreshSongAudio, updateSongDuration, enqueueMusicCache, backfillMusicCache, getMusicCacheStats,
  setMusicCacheUpdateListener, getFavIds
} from '@/api/music'
import {
  sendListenInvite, respondListenInvite, cancelListenInvite, endListen, getListenInvites,
  getListenMinutes, addListenMinutes, setListenMinutes
} from '@/api/listen'
import { useNotificationsStore } from '@/stores/notifications'

/* 全局唯一 audio 元素（不进响应式，避免被 Proxy 拖慢） */
const audio = new Audio()
audio.preload = 'metadata'

const LS_KEY = 'zika_music_last'
const LS_MIN = 'zika_listen_minutes'

/* 一起听累计分钟数：先读本地缓存，刷新瞬间也不会显示 0 */
function cachedListenMinutes() {
  try { return Number(localStorage.getItem(LS_MIN)) || 0 } catch (e) { return 0 }
}
function saveListenMinutesCache(v) {
  try { localStorage.setItem(LS_MIN, String(Math.max(0, Number(v) || 0))) } catch (e) { /* ignore */ }
}

/* 缓存队列抓完封面/歌词写库后，同步回内存里的歌曲行（UI 即时用上本地数据） */
setMusicCacheUpdateListener((songId, patch) => {
  const store = useMusicStore()
  const row = store.songs.find((s) => s.id === songId)
  if (row) Object.assign(row, patch)
  if (store.current && store.current.id === songId) {
    store.current = { ...store.current, ...patch }
  }
})

export const useMusicStore = defineStore('music', {
  state: () => ({
    songs: [],
    favIds: [],        // 当前联系人的收藏（「TA的收藏」tab 用）
    myFavIds: [],      // 我自己的收藏（心形按钮 + 「我的收藏」tab 用；contact_id = 0）
    contactId: null,
    /* 播放状态 */
    current: null,
    playing: false,
    queue: [],
    queueLabel: '',
    mode: 'list',
    floating: true,
    vinyl: '',
    playlists: [],       // 自定义歌单名（含空歌单）
    musicBg: '',         // 音乐卡背景图
    musicBgOpacity: 100, // 音乐卡背景透明度（100 = 最清晰）
    loading: false,
    loaded: false,
    /* 播放进度（秒） */
    currentTime: 0,
    duration: 0,
    /* 歌词页 */
    showLyrics: false,
    lyric: '',
    lyricSongId: null,
    lyricLoading: false,     // 抓取中：切歌后先显示「加载中」，别误显示「暂无歌词」
    /* 一起听歌 */
    listenSession: null,   // 进行中：{inviteId, contactId, contactName, contactAvatar, myAvatar, songTitle, songArtist, songCover}
    pendingListen: null,   // 我发出的、等待对方接受：{id, contactId, contactName, songTitle, songArtist, songCover}
    incomingListen: null,  // TA 发来的、待我处理：{id, contactId, contactName, contactAvatar, myAvatar, songTitle, songArtist, songCover}
    /* 一起听计时（用于累计到首页「一起听已经 X 分钟」） */
    listenStartAt: 0,
    listenAccMin: 0,
    listenMinutes: cachedListenMinutes(),   // 全局累计的一起听分钟数（切换联系人/结束会话/刷新都不清零）
    listenSeconds: 0,                       // 不足 1 分钟的零头（内存里累计，满 60 秒即入库）
  }),
  getters: {
    favSet: (s) => new Set(s.favIds),
    favSongs: (s) => s.songs.filter((x) => s.favIds.includes(x.id)),
    /* 我的收藏：与各联系人的收藏完全隔离（联系人自动收藏的歌只进 TA 的收藏） */
    myFavSet: (s) => new Set(s.myFavIds),
    myFavSongs: (s) => s.songs.filter((x) => s.myFavIds.includes(x.id)),
    playlistSongs: (s) => s.queue,
    ungroupedSongs: (s) => s.songs.filter((x) => !x.plist),
    /* 解析 LRC 为按时间排序的歌词行 [{t, text}] */
    lyricLines: (s) => {
      const raw = s.lyric || ''
      if (!raw) return []
      const out = []
      const re = /\[\s*(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\s*\]/g
      raw.split(/\r?\n/).forEach((line) => {
        const stamps = []
        let m
        re.lastIndex = 0
        while ((m = re.exec(line)) !== null) {
          const ms = Number((m[3] || '0').padEnd(3, '0')) / 1000
          stamps.push(Number(m[1]) * 60 + Number(m[2]) + ms)
        }
        const text = line.replace(/\[\s*\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\s*\]/g, '').trim()
        if (stamps.length && text) stamps.forEach((t) => out.push({ t, text }))
      })
      out.sort((a, b) => a.t - b.t)
      return out
    }
  },
  actions: {
    /* ─── 载入曲库 + 设置 ─── */
    async init(contactId) {
      if (!contactId) return
      this.contactId = Number(contactId)
      this.loading = true
      try {
        const [lib, settings, myFav] = await Promise.all([
          getMusicSongs(this.contactId),
          getMusicSettings(this.contactId).catch(() => null),
          getFavIds(0).catch(() => null)
        ])
        this.songs = lib.songs || []
        this.favIds = lib.favIds || []
        this.myFavIds = (myFav && myFav.favIds) || []
        /* 封面懒缓存：远程封面链接的歌入后台队列，抓到就地换成本地 dataURL */
        for (const s of this.songs) enqueueMusicCache(s)
        if (settings) {
          this.mode = settings.play_mode || 'list'
          this.vinyl = settings.vinyl || ''
          this.floating = !!settings.floating
          this.playlists = Array.isArray(settings.playlists) ? settings.playlists : []
          this.musicBg = settings.musicBg || ''
          this.musicBgOpacity = settings.musicBgOpacity != null ? Number(settings.musicBgOpacity) : 100
        }
        this.loaded = true
        this.loadListenMinutes()
        /* 恢复上次播放的歌（不自动播放） */
        if (!this.current) {
          try {
            const lastId = Number(JSON.parse(localStorage.getItem(LS_KEY) || '0'))
            if (lastId) this.current = this.songs.find((s) => s.id === lastId) || null
          } catch (e) { /* ignore */ }
        }
      } finally {
        this.loading = false
      }
    },
    async saveSettings(patch) {
      await saveMusicSettings({ contactId: this.contactId, ...patch })
      if (patch.play_mode !== undefined) this.mode = patch.play_mode
      if (patch.vinyl !== undefined) this.vinyl = patch.vinyl
      if (patch.floating !== undefined) this.floating = !!patch.floating
      if (patch.playlists !== undefined) this.playlists = patch.playlists
      if (patch.musicBg !== undefined) this.musicBg = patch.musicBg
      if (patch.musicBgOpacity !== undefined) this.musicBgOpacity = Number(patch.musicBgOpacity)
    },
    /* 新建歌单（可以是空的），返回是否真的新增了 */
    async addPlaylist(name) {
      const n = String(name || '').trim()
      if (!n) return false
      if (this.playlists.includes(n)) return false
      const next = [...this.playlists, n]
      await this.saveSettings({ playlists: next })
      return true
    },

    /* ─── 播放控制 ─── */
    playSong(song, queue = null, label = '') {
      if (!song) return
      this.current = song
      if (queue && queue.length) {
        this.queue = queue
        this.queueLabel = label
      } else if (!this.queue.find((s) => s.id === song.id)) {
        /* 不在队列里时，以整库为队列 */
        this.queue = this.songs.slice()
        this.queueLabel = '全部音乐'
      }
      this._loadAndPlay()
    },
    toggle() {
      if (!this.current) {
        const first = this.songs.find((s) => !s.vip) || this.songs[0]
        if (first) this.playSong(first, this.songs.slice(), '全部音乐')
        return
      }
      if (this.playing) {
        audio.pause()
        this.playing = false
        notifyMediaState(this.current, false)
      } else {
        if (!audio.src) this._loadAndPlay()
        else audio.play().catch(() => {})
        this.playing = true
        notifyMediaState(this.current, true)
      }
    },
    next(auto = false) {
      /* 自动播放切下一首且处于单曲循环：重播本曲 */
      if (auto && this.mode === 'one') {
        if (this.current) this._loadAndPlay()
        return
      }
      if (this.mode === 'random') {
        this._jump(this._randExcept(this._curIdx()), true)
        return
      }
      this._jump(this._curIdx() + 1, true)
    },
    prev() {
      this._jump(this._curIdx() - 1, false)
    },
    /* 队列为空/只有一首时（比如刷新后只恢复了上次播放的歌），用整个曲库兜底 */
    _ensureQueue() {
      if (this.queue && this.queue.length > 1) return this.queue
      const lib = this.songs ? this.songs.slice() : []
      if (!lib.length) return this.queue || []
      if (this.current && !lib.find((s) => s.id === this.current.id)) lib.unshift(this.current)
      this.queue = lib
      if (!this.queueLabel) this.queueLabel = '全部音乐'
      return this.queue
    },
    _curIdx() {
      const pool = this._ensureQueue()
      if (!pool.length) return -1
      const i = pool.findIndex((s) => s.id === this.current?.id)
      return i < 0 ? 0 : i
    },
    /* 跳到第 idx 首（超出范围自动绕回），并跳过不可播的歌。
       注意：会员歌不跳过——能试听 30 秒，播放失败还会自动重解析地址；
       只跳过云端歌里彻底没音源的（死链/付费无试听）。本地和直链歌都能播。 */
    _jump(idx, forward = true) {
      const pool = this._ensureQueue()
      if (!pool.length) return
      const len = pool.length
      let n = ((idx % len) + len) % len
      for (let i = 0; i < len; i++) {
        const cand = pool[n]
        if (cand && (cand.audio || cand.source === 'local' || cand.source === 'link')) break
        n = (((n + (forward ? 1 : -1)) % len) + len) % len
      }
      this.current = pool[n]
      this._loadAndPlay()
    },
    /* 加到下一首播放：插入到当前歌曲之后（自动去重） */
    playNext(song) {
      if (!song) return
      if (!this.queue.find((s) => s.id === this.current?.id)) {
        this.queue = this.songs.slice()
        if (this.current && !this.queue.find((s) => s.id === this.current.id)) {
          this.queue.unshift(this.current)
        }
      }
      const idx = this.queue.findIndex((s) => s.id === this.current?.id)
      const rest = this.queue.filter((s) => s.id !== song.id)
      rest.splice(idx + 1, 0, song)
      this.queue = rest
      const toast = useNotificationsStore()
      toast.pushToast({ title: `已添加到下一首播放：${song.title}` })
    },
    cycleMode() {
      const order = ['list', 'random', 'one']
      const next = order[(order.indexOf(this.mode) + 1) % order.length]
      this.saveSettings({ play_mode: next }).catch(() => {})
      this.mode = next
    },
    _randExcept(idx) {
      let n = idx
      while (n === idx) n = Math.floor(Math.random() * this.queue.length)
      return n
    },
    _loadAndPlay() {
      if (!this.current) return
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.current.id)) } catch (e) { /* ignore */ }
      this.currentTime = 0
      this.lyricSongId = null // 切歌后歌词失效，下次打开歌词页重新抓取
      this._recoverTried = null // 新的一首：允许一次「重解析地址」恢复
      audio.src = streamUrl(this.current.id)
      notifyMediaState(this.current, true)
      audio.play().catch((e) => {
        /* 自动播放策略拒绝（页面还没被用户交互过）：不是链接问题，安静退回即可，别误报「加载失败」 */
        if (e && e.name === 'NotAllowedError') {
          this.playing = false
          notifyMediaState(this.current, false)
          return
        }
        /* play() 被拒且 src 本身加载失败（audio.error 非空）→ 直链很可能过期了，重解析再试
           （会员歌也试——网易云会员常能拿到 30 秒试听地址） */
        if (audio.error) {
          this._recoverAudio()
          return
        }
        const toast = useNotificationsStore()
        toast.pushToast({ title: '播放失败', text: this.current?.vip ? '版权歌曲暂无音频链接，可在设置里补链接' : '音频加载失败' })
        this.playing = false
        notifyMediaState(this.current, false)
      })
      this.playing = true
    },
    /* 播放失败恢复：网易云/酷狗直链有时效，过期后重新解析地址再播一次（每首只试一次）。
       注意：error 事件和 play() 被拒可能先后触发两次恢复，_recoverRunning 保证并发安全——
       第二次调用静默等结果，只有「已试过且失败了」才报错放弃。 */
    async _recoverAudio() {
      const song = this.current
      if (!song) return
      const giveUp = (text) => {
        const toast = useNotificationsStore()
        toast.pushToast({ title: '播放失败', text })
        this.playing = false
        notifyMediaState(song, false)
      }
      if (this._recoverRunning) return // 正在恢复中，等上一条的结果
      if (this._recoverTried === song.id) {
        giveUp('音频链接已失效，可在设置里重新导入')
        return
      }
      this._recoverRunning = true
      this._recoverTried = song.id
      try {
        const r = await refreshSongAudio(song.id)
        if (!r.audio || r.audio === song.audio) {
          giveUp('音频链接已失效，可在设置里重新导入')
          return
        }
        song.audio = r.audio
        audio.src = r.audio
        audio.play().catch(() => giveUp('音频加载失败'))
        this.playing = true
      } catch (e) {
        giveUp('重试失败：' + (e.message || '未知错误'))
      } finally {
        this._recoverRunning = false
      }
    },

    /* ─── 收藏 / 删除 / 导入 ─── */
    /* 心形收藏 = 我自己的收藏（contact_id 0）；联系人各自的收藏互不占用 */
    async toggleFav(song) {
      const r = await favMusicSong(song.id, 0)
      if (r.fav) {
        if (!this.myFavIds.includes(song.id)) this.myFavIds.push(song.id)
      } else {
        this.myFavIds = this.myFavIds.filter((id) => id !== song.id)
      }
      return r.fav
    },
    async removeSong(id) {
      await deleteMusicSong(id)
      this.songs = this.songs.filter((s) => s.id !== id)
      this.favIds = this.favIds.filter((x) => x !== id)
      this.myFavIds = this.myFavIds.filter((x) => x !== id)
      this.queue = this.queue.filter((s) => s.id !== id)
      if (this.current?.id === id) {
        audio.pause()
        this.playing = false
        this.current = null
      }
    },
    async batchRemove(ids) {
      await batchDeleteMusicSongs(ids)
      const set = new Set(ids)
      this.songs = this.songs.filter((s) => !set.has(s.id))
      this.favIds = this.favIds.filter((x) => !set.has(x))
      this.myFavIds = this.myFavIds.filter((x) => !set.has(x))
      this.queue = this.queue.filter((s) => !set.has(s.id))
      if (this.current && set.has(this.current.id)) {
        audio.pause()
        this.playing = false
        this.current = null
      }
    },
    async clearUnplayable() {
      const r = await clearUnplayableSongs('unplayable')
      await this.reload()
      return r.deleted
    },
    async removeVipSongs() {
      const r = await clearUnplayableSongs('vip')
      await this.reload()
      return r.deleted
    },
    async reload() {
      if (!this.contactId) return
      const [lib, myFav] = await Promise.all([
        getMusicSongs(this.contactId),
        getFavIds(0).catch(() => null)
      ])
      this.songs = lib.songs || []
      this.favIds = lib.favIds || []
      this.myFavIds = (myFav && myFav.favIds) || []
      /* 封面懒缓存：init 之外，导入/收藏等操作后的 reload 也补入队
         （幂等，已缓存的会跳过）——会话内新导入的歌不必等刷新页面 */
      for (const s of this.songs) enqueueMusicCache(s)
      if (this.current) {
        this.current = this.songs.find((s) => s.id === this.current.id) || this.current
      }
    },
    async importLink(url, note = '') {
      const r = await importMusic(url, note)
      await this.reload()
      return r
    },
    async addManual(payload) {
      const r = await addMusicManual(payload)
      await this.reload()
      return r
    },
    async patchSong(id, payload) {
      await updateMusicSong(id, payload)
      await this.reload()
    },
    async uploadAudio(file) {
      const fd = new FormData()
      fd.append('file', file)
      return uploadMusicFile(fd)
    },
    /* 拖拽进度条：跳转到指定比例 0~1 */
    seek(frac) {
      if (!this.duration) return
      const t = Math.max(0, Math.min(1, frac)) * this.duration
      audio.currentTime = t
      this.currentTime = t
    },
    /* 当前歌歌词：优先读本地缓存，没有才按源抓取并入库（网易云/酷狗之外的数据源返回空） */
    async fetchLyric(force = false) {
      const id = this.current?.id
      if (!id) { this.lyric = ''; this.lyricSongId = null; this.lyricLoading = false; return }
      if (!force && this.lyricSongId === id) return
      this.lyricSongId = id
      this.lyric = ''
      this.lyricLoading = true
      try {
        const r = await getMusicLyric(id)
        this.lyric = (r && r.lyric) || ''
      } catch (e) {
        this.lyric = ''
      } finally {
        this.lyricLoading = false
      }
    },

    /* ─── 一起听歌 ─── */
    async inviteListen(contact) {
      if (!contact || !this.current) return
      const song = { id: this.current.id, title: this.current.title, artist: this.current.artist, cover: this.current.cover }
      const r = await sendListenInvite(contact.id, song)
      this.pendingListen = {
        id: r.id,
        contactId: contact.id,
        contactName: contact.name || '对方',
        songTitle: song.title, songArtist: song.artist, songCover: song.cover
      }
      return r
    },
    async cancelListen() {
      const p = this.pendingListen
      if (!p) return
      try { await cancelListenInvite(p.id) } catch (e) { /* 后端兜底过期 */ }
      this.pendingListen = null
    },
    /* 我接受/拒绝 TA 的邀请（聊天卡片、歌词页共用） */
    async respondListen(accept) {
      const inv = this.incomingListen
      if (!inv) return
      const id = inv.id
      try {
        await respondListenInvite(id, accept)
      } catch (e) { /* ignore */ }
        if (accept) {
          this.listenSession = {
            inviteId: id,
            contactId: inv.contactId,
            contactName: inv.contactName,
            contactAvatar: inv.contactAvatar,
            myAvatar: inv.myAvatar,
            songTitle: inv.songTitle, songArtist: inv.songArtist, songCover: inv.songCover
          }
          this._startListenClock()
        }
      this.incomingListen = null
    },
    async endListenSession() {
      const s = this.listenSession
      if (!s) return
      try { await endListen(s.inviteId) } catch (e) { /* ignore */ }
      this._stopListenClock()
      this.listenSession = null
    },
    /* ─── 一起听计时：把一起听的分钟数累计到首页「一起听已经 X 分钟」 ─── */
    _startListenClock(startAt) {
      try { if (this._listenTimer) clearInterval(this._listenTimer) } catch (e) { /* ignore */ }
      this.listenStartAt = Date.now()
      this.listenAccMin = 0
      this._listenTimer = setInterval(() => this._syncListenMinutes(), 30000)
    },
    _stopListenClock() {
      this._syncListenMinutes()
      try { if (this._listenTimer) clearInterval(this._listenTimer) } catch (e) { /* ignore */ }
      this._listenTimer = null
      this.listenStartAt = 0
      this.listenAccMin = 0
    },
    _syncListenMinutes() {
      const s = this.listenSession
      if (!s || !this.listenStartAt) return
      let elapsed = Math.floor((Date.now() - this.listenStartAt) / 60000)
      if (elapsed < 0) elapsed = 0
      if (elapsed > 360) elapsed = 360
      const add = elapsed - (this.listenAccMin || 0)
      if (add <= 0) return
      this.listenAccMin = elapsed
      this._addListenMinutes(add)
    },
    async _addListenMinutes(minutes) {
      if (!minutes) return
      try {
        const r = await addListenMinutes(minutes)
        if (r && r.minutes != null) {
          this.listenMinutes = Number(r.minutes) || 0
          saveListenMinutesCache(this.listenMinutes)
        }
      } catch (e) { /* ignore */ }
    },
    /* 播放时自动识别时长并回写：补齐导入时缺失的时长（Meting 歌单/手动导入不带时长）。
       只补空缺不覆盖——会员试听只有 30 秒，不代表歌曲真实长度 */
    _persistDuration() {
      const song = this.current
      if (!song || !song.id) return
      const d = Math.round(audio.duration || 0)
      if (!d || d <= 0) return
      if (song.duration && song.duration > 0) return
      if (this._durPersisted === song.id) return
      this._durPersisted = song.id
      song.duration = d
      updateSongDuration(song.id, d).catch(() => { /* ignore */ })
    },
    /* 累计收听秒表：按音频真实播放进度计秒（不受后台定时器节流影响），
       每满 1 分钟立即入库并刷新首页「已经收听」显示（实时同步） */
    _tickListenSeconds() {
      if (!this.playing) { this._lastAudioTime = -1; return }
      const cur = audio.currentTime
      if (this._lastAudioTime >= 0 && cur > this._lastAudioTime) {
        const step = cur - this._lastAudioTime
        if (step <= 30) this.listenSeconds = (this.listenSeconds || 0) + step /* 拖动跳变不计 */
      }
      this._lastAudioTime = cur
      if (this.listenSeconds >= 60) {
        const add = Math.floor(this.listenSeconds / 60)
        this.listenSeconds -= add * 60
        this._addListenMinutes(add)
      }
    },
    async setListenMinutes(value) {
      const r = await setListenMinutes(Math.max(0, Number(value) || 0))
      if (r && r.minutes != null) {
        this.listenMinutes = Number(r.minutes) || 0
        saveListenMinutesCache(this.listenMinutes)
      }
      return this.listenMinutes
    },
    async loadListenMinutes() {
      try {
        const r = await getListenMinutes()
        if (r && r.minutes != null) {
          this.listenMinutes = Number(r.minutes) || 0
          saveListenMinutesCache(this.listenMinutes)
        }
      } catch (e) { /* ignore */ }
      return this.listenMinutes
    },
    /* SSE 事件（useSSE 里分发过来） */
    onListenSSE(data) {
      const toast = useNotificationsStore()
      const inv = data.invite || {}
      if (data.type === 'incoming') {
        this.incomingListen = {
          id: inv.id,
          contactId: inv.contact_id ?? inv.contactId,
          contactName: inv.contact_name || '对方',
          contactAvatar: inv.contact_avatar || '',
          myAvatar: inv.my_avatar || '',
          songTitle: inv.song_title || '', songArtist: inv.song_artist || '', songCover: inv.song_cover || ''
        }
        toast.pushToast({
          title: `${inv.contact_name || '对方'}邀请你一起听歌`,
          text: inv.song_title ? `《${inv.song_title}》` : '',
          avatar: inv.contact_avatar || '',
          type: 'message',
          duration: 5000
        })
      } else if (data.type === 'accepted') {
        // 我发出的邀请被接受 / 我接受了 TA 的邀请（统一进入进行中）
        if (this.pendingListen && Number(this.pendingListen.id) === Number(inv.id)) {
          const p = this.pendingListen
          this.pendingListen = null
          this.listenSession = {
            inviteId: p.id,
            contactId: p.contactId,
            contactName: p.contactName,
            contactAvatar: inv.contact_avatar || '',
            myAvatar: inv.my_avatar || '',
            songTitle: p.songTitle, songArtist: p.songArtist, songCover: p.songCover
          }
          this._startListenClock()
          toast.pushToast({ title: '邀请已接受', text: `和 ${p.contactName} 一起听歌吧` })
        } else if (this.incomingListen && Number(this.incomingListen.id) === Number(inv.id)) {
          const c = this.incomingListen
          this.incomingListen = null
          this.listenSession = {
            inviteId: c.id,
            contactId: c.contactId,
            contactName: c.contactName,
            contactAvatar: c.contactAvatar,
            myAvatar: c.myAvatar,
            songTitle: c.songTitle, songArtist: c.songArtist, songCover: c.songCover
          }
          this._startListenClock()
        }
      } else if (data.type === 'rejected') {
        if (this.pendingListen && Number(this.pendingListen.id) === Number(inv.id)) {
          this.pendingListen = null
          toast.pushToast({ title: '邀请被拒绝', text: `${inv.contact_name || 'TA'} 这次婉拒了` })
        }
      } else if (data.type === 'cancelled' || data.type === 'expired') {
        if (this.incomingListen && Number(this.incomingListen.id) === Number(inv.id)) {
          this.incomingListen = null
        } else if (this.pendingListen && Number(this.pendingListen.id) === Number(inv.id)) {
          this.pendingListen = null
        }
      } else if (data.type === 'ended') {
        if (this.listenSession && Number(this.listenSession.inviteId) === Number(inv.id)) {
          this._stopListenClock()
          this.listenSession = null
          toast.pushToast({ title: '一起听结束', text: `${inv.contact_name || '对方'} 离开了` })
        }
      }
    },
    /* 初始化：与服务端对齐未处理/进行中的一起听 */
    async initListen() {
      this.loadListenMinutes()
      try {
        const arr = await getListenInvites(50)
        const list = Array.isArray(arr) ? arr : (arr?.data || [])
        const mine = list.find((i) => i.from_side === 'me' && i.status === 'pending')
        if (mine && !this.pendingListen) {
          this.pendingListen = {
            id: mine.id, contactId: mine.contact_id, contactName: mine.contact_name || '对方',
            songTitle: mine.song_title, songArtist: mine.song_artist, songCover: mine.song_cover
          }
        }
        const theirs = list.find((i) => i.from_side === 'contact' && i.status === 'pending')
        if (theirs && !this.incomingListen) {
          this.incomingListen = {
            id: theirs.id, contactId: theirs.contact_id, contactName: theirs.contact_name || '对方',
            contactAvatar: theirs.contact_avatar || '', myAvatar: theirs.my_avatar || '',
            songTitle: theirs.song_title, songArtist: theirs.song_artist, songCover: theirs.song_cover
          }
        }
        const active = list.find((i) => i.status === 'accepted')
        if (active && !this.listenSession) {
          this.listenSession = {
            inviteId: active.id, contactId: active.contact_id, contactName: active.contact_name || '对方',
            contactAvatar: active.contact_avatar || '', myAvatar: active.my_avatar || '',
            songTitle: active.song_title, songArtist: active.song_artist, songCover: active.song_cover
          }
          /* 刷新页面恢复会话时，只从本次打开开始计时（不补算离线时长） */
          this._startListenClock()
        }
      } catch (e) { /* ignore */ }
    }
  }
})

/* 全局事件绑定（模块加载一次） */
let bound = false
export function bindAudioEvents() {
  if (bound) return
  bound = true
  setupMediaKeepAlive() /* 后台保活三件套随播放器一次性挂载 */
  audio.addEventListener('ended', () => {
    const store = useMusicStore()
    store.next(true)
  })
  audio.addEventListener('error', () => {
    const store = useMusicStore()
    if (store.playing) {
      store.playing = false
      setMediaPlaybackState(false)
    }
    /* src 加载失败（直链过期/为空）：尝试重解析地址恢复，每首只试一次
       （会员歌也试——网易云会员常能拿到 30 秒试听地址） */
    if (store.current && store._recoverTried !== store.current.id) {
      store._recoverAudio()
    }
  })
  audio.addEventListener('play', () => { setMediaPlaybackState(true); const s = useMusicStore(); s._lastAudioTime = audio.currentTime })
  audio.addEventListener('pause', () => { setMediaPlaybackState(false); useMusicStore()._lastAudioTime = -1 })
  audio.addEventListener('timeupdate', () => {
    const store = useMusicStore()
    store.currentTime = audio.currentTime
    setMediaPosition(store.duration, store.currentTime)
    store._tickListenSeconds()
  })
  audio.addEventListener('loadedmetadata', () => {
    const store = useMusicStore()
    store.duration = audio.duration || 0
    store._persistDuration()
  })
  audio.addEventListener('seeked', () => {
    const store = useMusicStore()
    store.currentTime = audio.currentTime
    store._lastAudioTime = audio.currentTime
  })
  audio.addEventListener('durationchange', () => {
    const store = useMusicStore()
    store.duration = audio.duration || 0
    store._persistDuration()
  })
}

/* ═══ 后台播放保活 ═══
 * 1. Media Session：向系统注册「媒体播放」身份——锁屏/通知栏显示歌曲信息与控制按钮，
 *    Chrome 等浏览器不会回收正在播放音频的标签页，切后台继续播放的优先级更高
 * 2. Wake Lock：页面在前台播放时保持屏幕常亮（页面切后台/锁屏时系统会自动释放，不费电）
 * 3. 自动续播兜底：页面从后台回来时，若系统把播放停了但状态仍显示在播，自动恢复播放
 */

/* 锁屏/通知栏媒体信息 */
function updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !song) return
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title || '未知歌曲',
      artist: song.artist || '未知歌手',
      album: 'Eunoia',
      artwork: song.cover ? [{ src: song.cover, sizes: '512x512', type: 'image/jpeg' }] : []
    })
  } catch (e) { /* ignore */ }
}

function setMediaPlaybackState(playing) {
  if (!('mediaSession' in navigator)) return
  try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused' } catch (e) { /* ignore */ }
}

/* 锁屏进度条（部分浏览器 duration 为 0 时会抛错，try 兜底） */
function setMediaPosition(duration, position) {
  if (!('setPositionState' in navigator.mediaSession) || !duration) return
  try {
    navigator.mediaSession.setPositionState({
      duration: Math.max(0, duration),
      playbackRate: 1,
      position: Math.max(0, Math.min(position, duration))
    })
  } catch (e) { /* ignore */ }
}

/* 锁屏/通知栏/耳机线控的播放控制 */
function setupMediaSessionControls() {
  if (!('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.setActionHandler('play', () => {
      const store = useMusicStore()
      if (!store.playing) store.toggle()
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      const store = useMusicStore()
      if (store.playing) store.toggle()
    })
    navigator.mediaSession.setActionHandler('previoustrack', () => useMusicStore().prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => useMusicStore().next())
  } catch (e) { /* ignore */ }
}

/* 屏幕常亮锁：播放中且页面在前台时持有；切后台/锁屏时系统自动释放 */
let wakeLock = null
async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || document.hidden) return
  if (wakeLock) return
  try {
    wakeLock = await navigator.wakeLock.request('screen')
    wakeLock.addEventListener('release', () => { wakeLock = null })
  } catch (e) { /* ignore */ }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {})
    wakeLock = null
  }
}

/* 页面可见性变化：切回前台时自动续播 + 补挂 wake lock */
let visibilityBound = false
function setupVisibilityResume() {
  if (visibilityBound) return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      releaseWakeLock()
      return
    }
    const store = useMusicStore()
    /* 兜底：系统/浏览器在后台停了播放，但状态还显示在播 → 恢复 */
    if (store.playing && audio.paused) {
      if (audio.src) audio.play().catch(() => {})
      else store._loadAndPlay()
    }
    if (store.playing) acquireWakeLock()
  })
}

/* 播放器初始化：保活三件套一次性挂载 */
let keepAliveBound = false
export function setupMediaKeepAlive() {
  if (keepAliveBound) return
  keepAliveBound = true
  setupMediaSessionControls()
  setupVisibilityResume()
}

/* 切歌/播放状态变化时调用（由 store 内部触发） */
export function notifyMediaState(song, playing) {
  updateMediaSession(song)
  setMediaPlaybackState(playing)
  if (playing) acquireWakeLock()
  else releaseWakeLock()
}
