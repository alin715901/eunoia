<template>
  <div class="cv-page">
    <AppHeader title="影院" back />

    <div class="cv-body">
      <!-- 顶部观看统计（保留） -->
      <div class="cv-summary">
        <span class="cv-sum-ic"><AppIcon name="film" :size="26" color="var(--accent)" /></span>
        <span class="cv-sum-main">
          <span class="cv-sum-title">站点 {{ allSites.length }} 个 · 片单 {{ linkList.length }} 条</span>
          <span class="cv-sum-sub">一起看过的，和想一起看的</span>
        </span>
      </div>

      <!-- 站点 / 影片 切换 -->
      <div class="cv-tabs">
        <button class="cv-tab" :class="{ on: tab === 'sites' }" @click="tab = 'sites'">站点</button>
        <button class="cv-tab" :class="{ on: tab === 'films' }" @click="tab = 'films'">影片</button>
      </div>

      <!-- 站点 -->
      <section v-if="tab === 'sites'" class="cv-sec">
        <div class="cv-sec-head">
          <span class="cv-sec-title">站点 {{ allSites.length }} 个</span>
          <button class="cv-add" @click="openAddSite"><AppIcon name="plus" :size="18" /> 添加</button>
        </div>
        <p class="cv-sec-tip">点站点在浏览器里打开观看（视频网站大多禁止在应用内嵌播放）。</p>
        <button
          v-for="s in allSites"
          :key="s.id"
          class="cv-card"
          @click="openUrl(s.url)"
        >
          <span class="cv-card-ic"><AppIcon name="film" :size="18" color="var(--accent)" /></span>
          <span class="cv-card-main">
            <span class="cv-card-title">{{ s.name }}</span>
            <span class="cv-card-sub">{{ s.desc || hostOf(s.url) }}</span>
          </span>
          <span class="cv-card-ops" @click.stop v-if="s.custom">
            <button class="cv-op" @click="removeSite(s)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" v-else />
        </button>
        <p v-if="!allSites.length" class="cv-empty">还没有站点，点右上角「添加」。</p>
      </section>

      <!-- 影片（片单） -->
      <section v-else class="cv-sec">
        <div class="cv-sec-head">
          <span class="cv-sec-title">片单 {{ linkList.length }} 条</span>
          <button class="cv-add" @click="openAddLink"><AppIcon name="plus" :size="18" /> 导入</button>
        </div>
        <p class="cv-sec-tip">支持 B 站 / 腾讯视频链接和 mp4 直链，导入后点卡片直接播放；其他平台点卡片在浏览器里打开。</p>
        <button
          v-for="l in linkList"
          :key="l.id"
          class="cv-card"
          @click="playLink(l)"
        >
          <span class="cv-card-ic"><AppIcon name="link" :size="18" color="var(--accent)" /></span>
          <span class="cv-card-main">
            <span class="cv-card-title">{{ l.title }}</span>
            <span class="cv-card-sub">{{ l.body }}</span>
          </span>
          <span class="cv-card-ops" @click.stop>
            <button class="cv-op" @click="removeLink(l)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </span>
        </button>
        <p v-if="!linkList.length" class="cv-empty">片单还是空的，点右上角「导入」添加一部。</p>
      </section>
    </div>

    <!-- 添加站点弹窗 -->
    <div v-if="siteSheet.show" class="cv-mask" @click.self="closeSiteSheet">
      <div class="cv-sheet">
        <h3 class="cv-sheet-title">添加观影站点</h3>
        <div class="cv-fld">
          <span class="cv-fld-label">名称</span>
          <input v-model="siteSheet.name" class="cv-input" placeholder="例如：某某影视" maxlength="20" />
        </div>
        <div class="cv-fld">
          <span class="cv-fld-label">网址</span>
          <input v-model="siteSheet.url" class="cv-input" placeholder="https://..." />
        </div>
        <div class="cv-actions">
          <button class="cv-btn ghost" @click="closeSiteSheet">取消</button>
          <button class="cv-btn primary" @click="saveSite">保存</button>
        </div>
      </div>
    </div>

    <!-- 导入影片弹窗 -->
    <div v-if="linkSheet.show" class="cv-mask" @click.self="closeLinkSheet">
      <div class="cv-sheet">
        <h3 class="cv-sheet-title">导入影片</h3>
        <div class="cv-fld">
          <span class="cv-fld-label">影片名称</span>
          <input v-model="linkSheet.name" class="cv-input" placeholder="例如：你的名字" maxlength="40" />
        </div>
        <div class="cv-fld">
          <span class="cv-fld-label">视频链接</span>
          <input v-model="linkSheet.url" class="cv-input" placeholder="B站/腾讯视频链接，或 mp4 直链" />
        </div>
        <p class="cv-sheet-tip">B 站（BV/av）、腾讯视频链接可在应用内直接播放；mp4 直链走原生播放器；爱奇艺 / CCTV 等平台禁止内嵌，点卡片会在浏览器打开。</p>
        <div class="cv-actions">
          <button class="cv-btn ghost" @click="closeLinkSheet">取消</button>
          <button class="cv-btn primary" @click="saveLink">保存</button>
        </div>
      </div>
    </div>

    <!-- 应用内播放器（iframe / video + 陪看聊天 + 邀请） -->
    <div v-if="player.show" ref="playerWrap" class="cv-player">
      <div class="cv-bar">
        <button class="cv-bar-btn" @click="closePlayer" aria-label="关闭"><AppIcon name="close" :size="20" /></button>
        <span class="cv-bar-title">{{ player.title }}</span>
        <button v-if="watchChip" class="cv-bar-chip" :class="{ live: !!watching }" @click="watching && endWatching()">
          {{ watchChip }}
        </button>
        <button class="cv-bar-btn" @click="doInvite" aria-label="邀请一起看"><AppIcon name="users" :size="18" /></button>
        <button class="cv-bar-btn" @click="toggleFullscreen" aria-label="全屏"><AppIcon name="expand" :size="18" /></button>
        <button class="cv-bar-open" @click="openUrl(player.raw)">浏览器打开</button>
      </div>

      <!-- 一起观影状态条：TA 接受邀请后显示 -->
      <div v-if="watching" class="cv-with">
        <span class="cv-with-ava">
          <AppAvatar :name="watching.contactName || '对方'" :avatar="watching.contactAvatar" :size="22" />
          <AppAvatar :name="'我'" :avatar="watching.myAvatar" :size="22" class="cv-with-me" />
        </span>
        <span class="cv-with-txt">{{ watching.contactName || 'TA' }} 正在陪你观影 · {{ watchClock }}</span>
        <button class="cv-with-end" @click="endWatching">结束</button>
      </div>

      <div class="cv-stage">
        <iframe
          v-if="player.type === 'iframe'"
          class="cv-frame"
          :src="player.src"
          scrolling="no"
          frameborder="0"
          allowfullscreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        ></iframe>
        <video
          v-else-if="player.type === 'video'"
          class="cv-frame"
          controls
          autoplay
          playsinline
          webkit-playsinline
          :src="player.src"
        ></video>
      </div>

      <!-- 陪看聊天：和选中的联系人一边看一边聊 -->
      <div class="cv-chat" :class="{ fold: !chatOpen }">
        <div class="cv-chat-hd">
          <button class="cv-chat-who" @click="pickerShow = true">
            <AppAvatar :name="chatTarget.name" :avatar="chatTarget.avatar" :size="22" />
            <span>和 {{ chatTarget.name }} 聊</span>
            <AppIcon name="next" :size="12" color="var(--text-soft)" />
          </button>
          <button class="cv-chat-fold" @click="chatOpen = !chatOpen">{{ chatOpen ? '收起' : '展开' }}</button>
        </div>
        <div v-if="chatOpen" class="cv-chat-msgs" ref="chatListEl">
          <div v-if="!chatMsgs.length" class="cv-chat-empty">边看边聊，说点什么吧～</div>
          <div
            v-for="m in chatMsgs"
            :key="m.id"
            class="cv-msg"
            :class="m.sender === 'me' ? 'me' : 'ta'"
          >
            <span class="cv-msg-bubble">{{ m.recalled ? '对方撤回了一条消息' : msgText(m) }}</span>
          </div>
        </div>
        <div v-if="chatOpen" class="cv-chat-input">
          <input v-model="chatDraft" placeholder="说点什么…" maxlength="500" @keyup.enter="sendChat" />
          <button @click="sendChat" aria-label="发送"><AppIcon name="send" :size="16" /></button>
        </div>
      </div>
      <p class="cv-player-tip">播放卡住或黑屏？点右上角「浏览器打开」。</p>

      <!-- 切换聊天对象（放在播放器内部：全屏时也能正常显示） -->
      <div v-if="pickerShow" class="cv-mask cv-mask-inplayer" @click.self="pickerShow = false">
        <div class="cv-sheet">
          <h3 class="cv-sheet-title">选择和谁一起看</h3>
          <div class="cv-pick-list">
            <button
              v-for="c in contactList"
              :key="c.id"
              class="cv-pick"
              :class="{ on: chatTarget.id === c.id }"
              @click="pickChatTarget(c)"
            >
              <AppAvatar :name="c.name" :avatar="c.avatar" :size="30" />
              <span class="cv-pick-name">{{ c.name }}</span>
              <AppIcon v-if="chatTarget.id === c.id" name="check" :size="16" color="var(--accent)" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import { useChatStore } from '@/stores/chat'
import { useContactsStore } from '@/stores/contacts'
import { useHomeStore } from '@/stores/home'
import { useCinemaStore } from '@/stores/cinema'
import { sendCinemaInvite } from '@/api/cinema'
import { confirmDialog } from '@/utils/dialog'

const toast = useNotificationsStore()
const sites = useItems('cinema_sites')
const links = useItems('cinema_links')

/* 内置几个正版免费平台，用户也能自行添加更多 */
const BUILTIN = [
  { id: 'bili', name: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '番剧 / 影视 / 纪录片' },
  { id: 'm1905', name: '1905 电影网', url: 'https://www.1905.com', desc: '官方正版免费电影' },
  { id: 'xigua', name: '西瓜视频', url: 'https://www.ixigua.com', desc: '免费影视综艺' },
  { id: 'cctv', name: 'CCTV 节目官网', url: 'https://tv.cctv.com', desc: '央视免费节目' }
]

const tab = ref('sites')

const allSites = computed(() =>
  [...BUILTIN, ...sites.items.value.map((it) => ({ id: it.id, name: it.title, url: it.body, desc: '自定义站点', custom: true }))]
)
/* 过滤出有效链接，避免空数据渲染出空卡片 */
const linkList = computed(() =>
  (Array.isArray(links.items.value) ? links.items.value : []).filter((x) => x && x.body)
)

/* 点击站点卡片：跳到系统浏览器打开 */
function openUrl(url) {
  if (url) window.open(url, '_blank', 'noopener')
}

/* 解析视频链接的播放方式：
 *  - iframe   ：B站 / 腾讯视频官方嵌入播放器（这两家明确允许内嵌）
 *  - video    ：mp4 等直链，走原生 video
 *  - external ：爱奇艺 / CCTV 等禁嵌平台，只能浏览器打开
 * 原理：大平台的普通观看页带 X-Frame-Options / 版权校验禁嵌，
 * 但官方 iframe 嵌入播放器（player.bilibili.com / v.qq.com/txp/iframe）是放开的。 */
function resolveVideo(url) {
  const bv = /BV[0-9A-Za-z]{10}/.exec(url)
  if (bv) return { type: 'iframe', src: `https://player.bilibili.com/player.html?bvid=${bv[0]}&page=1&high_quality=1&danmaku=0` }
  const av = /av(\d+)/i.exec(url)
  if (av) return { type: 'iframe', src: `https://player.bilibili.com/player.html?aid=${av[1]}&page=1&high_quality=1&danmaku=0` }
  const qq = /v\.qq\.com\/x\/(?:cover\/[^/]+\/|page\/)?([0-9a-z]+)\.html/i.exec(url)
  if (qq) return { type: 'iframe', src: `https://v.qq.com/txp/iframe/player.html?vid=${qq[1]}` }
  if (/\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i.test(url)) return { type: 'video', src: url }
  return { type: 'external', src: url }
}

const player = reactive({ show: false, type: '', src: '', raw: '', title: '' })
const playerWrap = ref(null)
function playLink(l) {
  const r = resolveVideo(l.body)
  if (r.type === 'external') {
    openUrl(l.body)
    return
  }
  player.type = r.type
  player.src = r.src
  player.raw = l.body
  player.title = l.title || ''
  player.show = true
}
function closePlayer() {
  player.show = false
  player.src = ''
  player.raw = ''
  chatOpen.value = true
}

/* ── 陪看聊天 ── */
const chatStore = useChatStore()
const contactsStore = useContactsStore()
const homeStore = useHomeStore()
const cinemaStore = useCinemaStore()

const chatOpen = ref(true)
const chatDraft = ref('')
const chatListEl = ref(null)
const pickerShow = ref(false)
const chatTarget = ref({ id: 0, name: '对方', avatar: '' })

const contactList = computed(() => contactsStore.list || [])
const chatMsgs = computed(() => {
  const list = chatStore.messages(chatTarget.value.id) || []
  return list.filter((m) => !m.recalled || m.sender !== 'me')
})

/* 消息文本摘要：文字直接显示，其他类型显示占位 */
function msgText(m) {
  const t = m.content_type
  if (m.recalled) return '对方撤回了一条消息'
  if (t === 'image') return '[图片]'
  if (t === 'sticker') return '[表情包]'
  if (t === 'voice') return '[语音]'
  if (t === 'redpacket') return '[红包]'
  if (t === 'card') return '[字卡]'
  if (t === 'listen_invite') return '[一起听歌邀请]'
  if (t === 'cinema_invite') return '[一起观影邀请]'
  return m.text || ''
}

function pickChatTarget(c) {
  chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
  pickerShow.value = false
  chatStore.load(c.id)
}

async function sendChat() {
  const text = chatDraft.value.trim()
  if (!text || !chatTarget.value.id) return
  chatDraft.value = ''
  try {
    await chatStore.send(chatTarget.value.id, text)
    scrollChatBottom()
  } catch (e) { /* 忽略 */ }
}

function scrollChatBottom() {
  nextTick(() => {
    const el = chatListEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}
watch(chatMsgs, scrollChatBottom)

/* ── 一起观影 ── */
const watching = computed(() => cinemaStore.watching)
const watchChip = computed(() => {
  if (watching.value) return '陪看中'
  if (cinemaStore.pendingOut) return '等待接受'
  return ''
})
const watchClock = ref('00:00')
let watchTimer = null

function fmtClock(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}
function startWatchTimer() {
  stopWatchTimer()
  const startedAt = Date.now()
  watchTimer = setInterval(() => {
    watchClock.value = fmtClock(Math.floor((Date.now() - startedAt) / 1000))
  }, 1000)
}
function stopWatchTimer() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null }
}
watch(watching, (v) => {
  if (v) { watchClock.value = '00:00'; startWatchTimer() }
  else stopWatchTimer()
})

/* 邀请当前聊天对象一起看这部片 */
async function doInvite() {
  if (!chatTarget.value.id) { toast.pushToast({ title: '先选一个聊天对象' }); return }
  if (cinemaStore.pendingOut) { toast.pushToast({ title: '邀请已发出，等 TA 接受' }); return }
  if (watching.value) { toast.pushToast({ title: '已经在一起看了' }); return }
  try {
    const r = await sendCinemaInvite(chatTarget.value.id, {
      title: player.title || '影片',
      url: player.raw,
      playSrc: player.src,
      playKind: player.type
    })
    cinemaStore.onInviteSent(r.id, chatTarget.value.id, player.title)
    toast.pushToast({ title: `已邀请${chatTarget.value.name}一起看` })
  } catch (e) {
    toast.pushToast({ title: '邀请发送失败' })
  }
}

async function endWatching() {
  if (!watching.value) return
  try { await cinemaStore.end(watching.value.inviteId) } catch (e) { /* 忽略 */ }
  toast.pushToast({ title: '已结束一起观影' })
}

/* 我在聊天卡片点了「一起看」→ store.active 带上影片，自动打开播放器 */
watch(() => cinemaStore.active, (a) => {
  if (!a || !a.film || !a.film.url) return
  cinemaStore.consumeActive()
  const c = contactsStore.getById(a.contactId)
  if (c) chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
  const r = resolveVideo(a.film.playSrc || a.film.url)
  if (r.type === 'external') { openUrl(a.film.url); return }
  player.type = r.type
  player.src = r.src
  player.raw = a.film.url
  player.title = a.film.title || ''
  player.show = true
})

/* 全屏放大：对整个播放器容器请求全屏（iframe 随之铺满，等效「放大回原来的」） */
function toggleFullscreen() {
  const el = playerWrap.value
  if (!el) return
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {})
  } else if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => toast.pushToast({ title: '当前浏览器不支持全屏' }))
  } else {
    toast.pushToast({ title: '当前浏览器不支持全屏' })
  }
}

function hostOf(u) {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return u
  }
}

/* 添加站点 */
const siteSheet = reactive({ show: false, name: '', url: '' })
function openAddSite() {
  Object.assign(siteSheet, { show: true, name: '', url: '' })
}
function closeSiteSheet() {
  siteSheet.show = false
}
async function saveSite() {
  const url = siteSheet.url.trim()
  const name = siteSheet.name.trim()
  if (!/^https?:\/\//i.test(url)) {
    toast.pushToast({ title: '网址要以 http(s):// 开头' })
    return
  }
  if (!name) {
    toast.pushToast({ title: '填一下站点名称' })
    return
  }
  closeSiteSheet()
  await sites.add({ title: name, body: url, extra: {} })
  toast.pushToast({ title: '已添加站点' })
}
async function removeSite(it) {
  if (!(await confirmDialog({ title: '删除该站点？', danger: true }))) return
  await sites.remove(it.id)
}

/* 导入影片（片单） */
const linkSheet = reactive({ show: false, name: '', url: '' })
function openAddLink() {
  Object.assign(linkSheet, { show: true, name: '', url: '' })
}
function closeLinkSheet() {
  linkSheet.show = false
}
async function saveLink() {
  const url = linkSheet.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    toast.pushToast({ title: '请输入 http(s) 开头的链接' })
    return
  }
  const name = linkSheet.name.trim() || hostOf(url)
  closeLinkSheet()
  await links.add({ title: name, body: url, extra: {} })
  toast.pushToast({ title: '已加入片单' })
}
async function removeLink(it) {
  if (!(await confirmDialog({ title: '删除该影片？', danger: true }))) return
  await links.remove(it.id)
}

onMounted(async () => {
  await Promise.all([sites.load(), links.load()])
  /* 陪看聊天对象：默认取首页当前选中的联系人，没有则取第一个 */
  try {
    await contactsStore.load()
    const id = homeStore.selectedId
    const c = (id && contactsStore.getById(id)) || (contactList.value[0])
    if (c) {
      chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
      chatStore.load(c.id)
    }
  } catch (e) { /* 忽略 */ }
})

onBeforeUnmount(stopWatchTimer)
</script>

<style scoped>
.cv-page { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-body); }
.cv-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 14px; }

.cv-summary { display: flex; align-items: center; gap: 12px; padding: 14px 12px; background: var(--bg-screen); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); }
.cv-sum-ic { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 12px; background: var(--bg-soft); display: flex; align-items: center; justify-content: center; }
.cv-sum-main { display: flex; flex-direction: column; gap: 2px; }
.cv-sum-title { font-size: 15px; font-weight: 600; color: var(--text); }
.cv-sum-sub { font-size: 12px; color: var(--text-soft); }

.cv-tabs { display: flex; gap: 8px; }
.cv-tab { flex: 1; padding: 10px 0; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-screen); color: var(--text-soft); font-size: 14px; font-weight: 600; }
.cv-tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }

.cv-sec { background: var(--bg-screen); border: 1px solid var(--border); border-radius: 16px; padding: 12px; box-shadow: var(--shadow); }
.cv-sec-head { display: flex; align-items: center; justify-content: space-between; }
.cv-sec-title { font-size: 14px; font-weight: 600; color: var(--text); }
.cv-add { display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent; color: var(--accent); font-size: 13px; font-weight: 600; padding: 4px 6px; }
.cv-sec-tip { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 6px 0 10px; }

.cv-card { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 4px; background: transparent; border: none; border-bottom: 1px solid var(--border); text-align: left; }
.cv-card:last-of-type { border-bottom: none; }
.cv-card-ic { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 10px; background: var(--bg-soft); display: flex; align-items: center; justify-content: center; }
.cv-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cv-card-title { font-size: 14px; color: var(--text); }
.cv-card-sub { font-size: 12px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-card-ops { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }
.cv-op { border: none; background: transparent; padding: 4px; }

.cv-empty { font-size: 12px; color: var(--text-soft); padding: 10px 4px; }

.cv-mask { position: fixed; inset: 0; background: rgba(60, 50, 56, 0.5); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50; }
.cv-mask-inplayer { position: absolute; z-index: 10; }
.cv-sheet { width: 100%; max-width: 340px; background: var(--bg-screen); border: 1px solid var(--border); border-radius: 20px; padding: 18px 16px; box-shadow: var(--shadow); animation: cv-pop 0.18s ease; }
@keyframes cv-pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.cv-sheet-title { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 14px; text-align: center; }
.cv-fld { margin-bottom: 12px; }
.cv-fld-label { display: block; font-size: 12px; color: var(--text-soft); margin-bottom: 6px; }
.cv-input { width: 100%; padding: 11px 12px; font-size: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-soft); color: var(--text); }
.cv-sheet-tip { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: -4px 0 12px; }
.cv-actions { display: flex; gap: 10px; margin-top: 6px; }
.cv-btn { flex: 1; padding: 12px 0; border-radius: 12px; font-size: 15px; border: none; font-weight: 600; }
.cv-btn.ghost { background: var(--bg-soft); color: var(--text); }
.cv-btn.primary { background: var(--accent); color: #fff; }

.cv-player { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; z-index: 60; }
.cv-player:fullscreen { width: 100%; height: 100%; }
.cv-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(0, 0, 0, 0.85); color: #fff; }
.cv-bar-btn { border: none; background: transparent; color: #fff; padding: 4px; display: inline-flex; }
.cv-bar-title { flex: 1 1 auto; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-bar-open { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 13px; padding: 6px 12px; border-radius: 999px; }
.cv-bar-chip { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 12px; padding: 5px 10px; border-radius: 999px; }
.cv-bar-chip.live { background: var(--accent); }

/* 一起观影状态条 */
.cv-with { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 12px; }
.cv-with-ava { position: relative; display: inline-flex; }
.cv-with-ava .cv-with-me { margin-left: -8px; }
.cv-with-txt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-with-end { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 999px; }

.cv-stage { flex: 1 1 auto; min-height: 0; display: flex; }
.cv-frame { flex: 1 1 auto; width: 100%; border: none; background: #000; }

/* 陪看聊天面板 */
.cv-chat { flex: 0 0 auto; display: flex; flex-direction: column; background: #141418; border-top: 1px solid rgba(255, 255, 255, 0.1); max-height: 46%; }
.cv-chat-hd { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
.cv-chat-who { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; color: #fff; font-size: 13px; padding: 0; }
.cv-chat-fold { border: none; background: transparent; color: rgba(255, 255, 255, 0.6); font-size: 12px; padding: 2px 4px; }
.cv-chat-msgs { flex: 1 1 auto; min-height: 90px; overflow-y: auto; padding: 4px 12px; display: flex; flex-direction: column; gap: 6px; }
.cv-chat-empty { font-size: 12px; color: rgba(255, 255, 255, 0.45); text-align: center; padding: 14px 0; }
.cv-msg { display: flex; }
.cv-msg.me { justify-content: flex-end; }
.cv-msg-bubble { max-width: 76%; font-size: 13px; line-height: 1.5; padding: 7px 11px; border-radius: 14px; background: rgba(255, 255, 255, 0.12); color: #fff; word-break: break-word; }
.cv-msg.me .cv-msg-bubble { background: var(--accent); }
.cv-chat-input { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }
.cv-chat-input input { flex: 1 1 auto; min-width: 0; border: none; background: rgba(255, 255, 255, 0.1); color: #fff; font-size: 13px; padding: 9px 12px; border-radius: 999px; }
.cv-chat-input input::placeholder { color: rgba(255, 255, 255, 0.4); }
.cv-chat-input button { flex: 0 0 auto; border: none; background: var(--accent); color: #fff; width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }

/* 联系人选择 */
.cv-pick-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.cv-pick { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border: none; background: transparent; border-radius: 12px; text-align: left; }
.cv-pick.on { background: var(--bg-soft); }
.cv-pick-name { flex: 1 1 auto; font-size: 14px; color: var(--text); }

.cv-player-tip { flex: 0 0 auto; margin: 0; font-size: 11px; color: rgba(255, 255, 255, 0.7); text-align: center; padding: 8px 12px; background: rgba(0, 0, 0, 0.85); }
</style>
