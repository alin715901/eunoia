<template>
  <div class="cv-page">
    <AppHeader title="影院" back />

    <div class="cv-body">
      <!-- 顶部观看统计（保留） -->
      <div class="cv-summary">
        <span class="cv-sum-ic"><AppIcon name="film" :size="26" color="var(--accent)" /></span>
        <span class="cv-sum-main">
          <span class="cv-sum-title">观影时长 {{ watchTotalText }}</span>
          <span class="cv-sum-sub">一起看过的，和想一起看的。</span>
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
        <p class="cv-sec-tip">点击跳转浏览器里打开观看（视频网站大多禁止在应用内嵌播放）</p>
        <p class="cv-warn">⚠ 严禁添加任何非法、色情和暴力网站。</p>
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
        <p class="cv-sec-tip">支持b站/腾讯视频链接和 mp4 直链，导入后直接播放；其他平台链接跳转浏览器里打开。（b站的分享链接需要在浏览器打开后，再复制链接才可以导入）</p>
        <p class="cv-warn">⚠ 严禁添加任何非法、色情和暴力视频。</p>
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
        <p class="cv-sheet-tip">b站、腾讯视频、mp4/m3u8 直链可在应用内直接播放（b站的分享链接需要在浏览器打开后，再复制链接才可以导入）</p>
        <p v-if="linkPreview" class="cv-link-preview" :class="linkPreview.ok ? 'ok' : 'ext'">{{ linkPreview.text }}</p>
        <div class="cv-actions">
          <button class="cv-btn ghost" @click="closeLinkSheet">取消</button>
          <button class="cv-btn primary" @click="saveLink">保存</button>
        </div>
      </div>
    </div>

    <!-- 应用内播放器：16:9 视频在上，视频下方是陪看聊天室 -->
    <div v-if="player.show" ref="playerRoot" class="cv-player" :class="{ 'is-fs': fsActive, 'force-rotate': forceRotate }">
      <div class="cv-bar">
        <button class="cv-bar-btn" @click="closePlayer" aria-label="关闭"><AppIcon name="close" :size="20" /></button>
        <span class="cv-bar-title">{{ player.title }}</span>
        <button class="cv-bar-open" @click="openUrl(player.raw)">浏览器打开</button>
      </div>

      <div class="cv-main" :class="{ 'chat-collapsed': chatCollapsed }">
      <!-- 视频区：竖屏固定 16:9；聊天室收起 / 横屏时撑满剩余空间 -->
      <div ref="stageEl" class="cv-stage">
        <iframe
          v-if="player.type === 'iframe'"
          class="cv-frame"
          :src="player.src"
          scrolling="no"
          frameborder="0"
          allowfullscreen
          webkitallowfullscreen
          mozallowfullscreen
          allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *"
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
        <button
          class="cv-stage-fs"
          :class="{ active: fsActive }"
          @click="toggleFs"
          :aria-label="fsActive ? '退出全屏' : '全屏'"
        >
          <AppIcon :name="fsActive ? 'close' : 'expand'" :size="18" />
        </button>
      </div>

      <!-- 视频下方：陪看状态 + 邀请操作 -->
      <div class="cv-with">
        <span v-if="watching" class="cv-with-ava">
          <template v-if="watching.isGroup">
            <AppAvatar
              v-for="m in (watching.groupMembers || []).slice(0, 3)"
              :key="m.id"
              :name="m.name"
              :avatar="m.avatar"
              :size="22"
              class="cv-with-me"
            />
          </template>
          <template v-else>
            <AppAvatar :name="watching.contactName || '对方'" :avatar="watching.contactAvatar" :size="22" />
            <AppAvatar :name="'我'" :avatar="watching.myAvatar || myAvatar" :size="22" class="cv-with-me" />
          </template>
        </span>
        <span class="cv-with-txt">
          <template v-if="watching">
            {{ watching.isGroup ? `${watching.contactName || '群'}的成员` : (watching.contactName || 'TA') }} 观影中 · {{ watchClock }}
          </template>
          <template v-else-if="cinemaStore.rejected">
            {{ cinemaStore.rejected.contactName || '对方' }} 拒绝观影
          </template>
          <template v-else-if="cinemaStore.pendingOut">等待对方接受邀请…</template>
          <template v-else>邀请联系人，边看边聊</template>
        </span>
        <button v-if="watching" class="cv-with-end" @click="endWatching">结束</button>
        <span class="cv-with-actions">
          <button class="cv-with-btn" @click="onInviteClick" aria-label="邀请一起看"><AppIcon name="users" :size="17" /></button>
        </span>
      </div>

      <!-- 聊天室：占满视频下方剩余区域，输入框沉底 -->
      <div class="cv-chat" :class="{ collapsed: chatCollapsed }">
        <div class="cv-chat-hd">
          <span class="cv-chat-hd-title">聊天室</span>
          <button
            class="cv-chat-fold"
            @click="chatCollapsed = !chatCollapsed"
            :aria-label="chatCollapsed ? '展开聊天室' : '收起聊天室'"
          >
            <AppIcon name="chevron-down" :size="16" :style="{ transform: chatCollapsed ? 'rotate(180deg)' : 'none' }" />
          </button>
        </div>
        <div ref="chatListEl" class="cv-chat-msgs">
          <div v-for="m in chatMsgs" :key="m.id" class="cv-msg" :class="{ me: m.sender === 'me' }">
            <AppAvatar v-if="m.sender !== 'me'" class="cv-msg-ava" :name="senderName(m)" :avatar="memberAvatar(m)" :size="26" />
            <div class="cv-msg-main">
              <span v-if="m.sender !== 'me' && memberOf(m)" class="cv-msg-name">{{ senderName(m) }}</span>
              <div class="cv-msg-bubble">{{ msgText(m) }}</div>
            </div>
            <AppAvatar v-if="m.sender === 'me'" class="cv-msg-ava" :name="'我'" :avatar="myAvatar" :size="26" />
          </div>
          <p v-if="!chatMsgs.length" class="cv-chat-empty">还没有消息，邀请一起看后开始聊吧</p>
        </div>
        <div class="cv-chat-input">
          <input
            v-model="chatDraft"
            :placeholder="chatReady ? '说点什么…' : '邀请一起看后即可聊天'"
            :disabled="!chatReady"
            maxlength="100"
            @keyup.enter="sendChat"
          />
          <button @click="sendChat" aria-label="发送" :disabled="!chatReady"><AppIcon name="send" :size="16" /></button>
        </div>
      </div>
      </div>

      <!-- 选择邀请对象（放在播放器内部：全屏时也能正常显示） -->
      <div v-if="pickerShow" class="cv-mask cv-mask-inplayer" @click.self="pickerShow = false">
        <div class="cv-sheet">
          <h3 class="cv-sheet-title">邀请谁一起看</h3>
          <div class="cv-pick-list">
            <button
              v-for="c in contactList"
              :key="c.id"
              class="cv-pick"
              :class="{ on: chatTarget.id === c.id }"
              @click="pickChatTarget(c)"
            >
              <AppAvatar :name="c.name" :avatar="c.avatar" :size="30" />
              <span class="cv-pick-name">{{ c.name }}{{ c.kind === 'group' ? '（群）' : '' }}</span>
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
import { sendCinemaInvite, getWatchSeconds, addWatchSeconds } from '@/api/cinema'
import { getContactMembers, getContactSettings, getDesktop } from '@/api/contacts'
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
 *  - video    ：mp4 / m3u8 等直链，走原生播放器
 *  - external ：爱奇艺 / 芒果 / 人人等禁嵌平台，只能浏览器打开
 * 识别尽量覆盖常见写法：路径里的 BV/av、分享链接里的 ?bvid=/?aid=/?vid= 参数、
 * 以及腾讯 cover/page 路径里的 vid（含大写字母）。 */
function resolveVideo(raw) {
  const url = (raw || '').trim()
  if (!url) return { type: 'external', src: '' }
  // 腾讯视频：分享 / 嵌入链接常带 ?vid= 参数（最稳）
  const qqVid = /[?&]vid=([0-9A-Za-z]+)/i.exec(url)
  if (qqVid) return { type: 'iframe', src: `https://v.qq.com/txp/iframe/player.html?vid=${qqVid[1]}` }
  // 腾讯视频：路径 /x/cover/{cid}/{vid}.html
  const qqCover = /v\.qq\.com\/(?:x\/)?cover\/[^/?#]+\/([0-9A-Za-z]+)/i.exec(url)
  if (qqCover) return { type: 'iframe', src: `https://v.qq.com/txp/iframe/player.html?vid=${qqCover[1]}` }
  // 腾讯视频：路径 /x/page/{vid}.html
  const qqPage = /v\.qq\.com\/(?:x\/)?page\/([0-9A-Za-z]+)/i.exec(url)
  if (qqPage) return { type: 'iframe', src: `https://v.qq.com/txp/iframe/player.html?vid=${qqPage[1]}` }
  // B站：分享链接里的 ?bvid= 参数
  const bvParam = /[?&]bvid=(BV[0-9A-Za-z]{10})/i.exec(url)
  if (bvParam) return { type: 'iframe', src: `https://player.bilibili.com/player.html?bvid=${bvParam[1]}&page=1&high_quality=1&danmaku=0` }
  // B站：路径 / 正文里的 BV 号
  const bv = /BV[0-9A-Za-z]{10}/.exec(url)
  if (bv) return { type: 'iframe', src: `https://player.bilibili.com/player.html?bvid=${bv[0]}&page=1&high_quality=1&danmaku=0` }
  // B站：?aid= 参数或路径里的 av 号
  const avParam = /[?&]aid=(\d+)/i.exec(url)
  if (avParam) return { type: 'iframe', src: `https://player.bilibili.com/player.html?aid=${avParam[1]}&page=1&high_quality=1&danmaku=0` }
  const av = /av(\d+)/i.exec(url)
  if (av) return { type: 'iframe', src: `https://player.bilibili.com/player.html?aid=${av[1]}&page=1&high_quality=1&danmaku=0` }
  // 直链
  if (/\.(mp4|webm|ogg|mov|m4v|m3u8)(\?.*)?$/i.test(url)) return { type: 'video', src: url }
  return { type: 'external', src: url }
}

/* 导入弹窗实时识别：粘贴链接即提示将如何播放（站内内嵌 / 跳转原站） */
const linkPreview = computed(() => {
  const url = (linkSheet.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  const r = resolveVideo(url)
  if (r.type === 'iframe') {
    const isBili = /bilibili/i.test(r.src)
    return { ok: true, text: isBili ? '✓ 可在应用内播放（哔哩哔哩）' : '✓ 可在应用内播放（腾讯视频）' }
  }
  if (r.type === 'video') return { ok: true, text: '✓ 可在应用内播放（直链）' }
  return { ok: false, text: '↗ 该平台禁止内嵌，点开将在浏览器跳转原站观看' }
})

const player = reactive({ show: false, type: '', src: '', raw: '', title: '' })
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
}

/* ── 陪看聊天 ── */
const chatStore = useChatStore()
const contactsStore = useContactsStore()
const homeStore = useHomeStore()
const cinemaStore = useCinemaStore()

const chatDraft = ref('')
const pickerShow = ref(false)
/* 选择器只用于「邀请谁一起看」：选中即切换聊天对象并发出邀请 */
const chatTarget = ref({ id: 0, name: '对方', avatar: '' })
/* 群成员的 id → {name, avatar}（聊天室发言人前缀 / 头像用） */
const memberMap = ref({})
const chatListEl = ref(null)
/* 「我」的头像（跟随当前聊天对象）：显示在消息气泡右侧 / 状态条 */
const myAvatar = ref('')
/* 聊天室收起：只留顶部细条，视频区撑满 */
const chatCollapsed = ref(false)

/* 应用级全屏：隐藏所有 chrome，让视频区填满视口；原生视频优先调用系统全屏以真正横屏 */
const playerRoot = ref(null)
const stageEl = ref(null)
const fsActive = ref(false)
/* 真全屏失败时的兜底标记：竖屏下用 CSS 把视频区旋转 90° 强制横屏 */
const forceRotate = ref(false)

function toggleFs() {
  if (fsActive.value) exitFs()
  else enterFs()
}
async function enterFs() {
  fsActive.value = true
  await nextTick()
  const v = stageEl.value && stageEl.value.querySelector('video')
  if (v && v.webkitEnterFullscreen) {
    try {
      v.addEventListener('webkitendfullscreen', () => { fsActive.value = false }, { once: true })
      v.webkitEnterFullscreen()
      return
    } catch (e) { /* 忽略 */ }
  }
  /* 优先让视频区本身成为全屏元素（B 站播放器随之铺满，我们的 × 按钮也随行显示）；
     失败再退回整个播放器容器；都不行则走应用级全屏（is-fs 撑满视口） */
  let real = false
  for (const el of [stageEl.value, playerRoot.value]) {
    if (!el || real) continue
    if (el.requestFullscreen) {
      try { await el.requestFullscreen(); real = true } catch (e) { /* 忽略 */ }
    }
    if (!real && el.webkitRequestFullscreen) {
      try { el.webkitRequestFullscreen(); real = true } catch (e) { /* 忽略 */ }
    }
  }
  /* 真全屏失败 → 应用级兜底并标记 force-rotate：
     竖屏下 CSS 旋转 90° 强制横屏（若锁横屏成功，媒体查询自动失效、不旋转） */
  forceRotate.value = !real
  /* 进入系统全屏后（Android / 桌面）尝试锁定横屏；
   * 部分浏览器要求已处于全屏态，故在 fullscreenchange 里再补一次 */
  lockLandscape()
}
function lockLandscape() {
  if (screen.orientation && screen.orientation.lock) {
    try { screen.orientation.lock('landscape').catch(() => {}) } catch (e) { /* 忽略 */ }
  }
}
function exitFs() {
  fsActive.value = false
  forceRotate.value = false
  const doc = document
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    try {
      if (doc.exitFullscreen) doc.exitFullscreen()
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen()
    } catch (e) { /* 忽略 */ }
  }
}
function onFsChange() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    // 真·进入系统全屏（含 B 站自带按钮在 iframe 内触发的全屏）：锁横屏
    lockLandscape()
  } else {
    fsActive.value = false
    forceRotate.value = false
  }
}

const contactList = computed(() => contactsStore.list || [])

/* 当前陪看关系（影院 store 派生）：聊天室门控 / 状态条 / 计时器都依赖它。
 * 必须声明在 watch(chatMsgs) 之前 —— watch 创建时会立即求值 computed，
 * 而 chatMsgs → chatReady → watching 是一条链，晚声明会撞 TDZ */
const watching = computed(() => cinemaStore.watching)

/* 只有建立了陪看关系（我邀的被接受 / 我接受了 TA 的邀请）才能聊 */
const chatReady = computed(() => !!watching.value || !!cinemaStore.myAccepted)

/* 聊天室消息：没有邀请人时为空（不显示任何历史对话），
 * 邀请成功后才显示当前陪看对象的聊天记录 */
const chatMsgs = computed(() => {
  if (!chatReady.value) return []
  const list = chatStore.messages(chatTarget.value.id) || []
  return list.filter((m) => !m.recalled || m.sender !== 'me')
})

/* 去掉 HTML 标签取纯文本（字卡消息的 text 是富文本，聊天室里要显示真实内容） */
function stripHtml(html) {
  if (!html) return ''
  return String(html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/* 消息文本摘要：文字直接显示，字卡显示卡片正文，通话/提问解析 JSON，其他类型显示占位 */
function msgText(m) {
  const t = m.content_type
  if (m.recalled) return '对方撤回了一条消息'
  if (t === 'card') return stripHtml(m.text) || '[图片字卡]'
  if (t === 'call') return callRecordText(m)
  if (t === 'question') return questionText(m)
  if (t === 'image') return '[图片]'
  if (t === 'sticker') return '[表情包]'
  if (t === 'voice') return '[语音]'
  if (t === 'redpacket') return '[红包]'
  if (t === 'listen_invite') return '[一起听歌邀请]'
  if (t === 'cinema_invite') return '[一起观影邀请]'
  if (t === 'game_invite') return '[游戏邀请]'
  return m.text || ''
}

/* 通话记录：text 存的是 JSON {duration, result}，解析成人类文案
 * （与主聊天气泡 callText 保持一致，否则聊天室里会露出原始 JSON） */
function callRecordText(m) {
  let meta = {}
  try { meta = JSON.parse(m.text || '{}') } catch (e) { /* 忽略 */ }
  const r = meta.result
  if (r === 'rejected') return '对方拒绝通话'
  if (r === 'declined') return '已拒绝通话'
  if (r === 'missed') return '未接听'
  if (r === 'cancelled') return '通话已取消'
  return '通话时长 ' + fmtDur(Number(meta.duration) || 0)
}
function fmtDur(sec) {
  const mm = String(Math.floor((Number(sec) || 0) / 60)).padStart(2, '0')
  const ss = String((Number(sec) || 0) % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/* 提问记录：text 存的是 JSON {type, question, options}，显示问题正文 */
function questionText(m) {
  try {
    const meta = JSON.parse(m.text || '{}')
    return meta.question || '[提问]'
  } catch (e) { return '[提问]' }
}

/* 聊天室发送者名：我 / 群成员名 / 对方名 */
function senderName(m) {
  if (m.sender === 'me') return '我'
  const mem = m.author_member_id && memberMap.value[m.author_member_id]
  if (mem) return mem.name || '成员'
  return chatTarget.value.name || 'TA'
}
/* 群成员发言时取成员头像，否则取对方头像 */
function memberAvatar(m) {
  const mem = m.author_member_id && memberMap.value[m.author_member_id]
  if (mem) return mem.avatar || ''
  return chatTarget.value.avatar || ''
}
/* 是否是群成员发言（决定聊天室里是否显示发言人昵称） */
function memberOf(m) {
  return !!(m.author_member_id && memberMap.value[m.author_member_id])
}

/* 加载「我」的头像（跟随当前聊天对象，每个联系人可设自己的）：
 * 与一起听歌保持同一套逻辑——开启「同步人物卡头像到聊天」时优先桌面 my_avatar，
 * 否则用设置里的 my_avatar，最后桌面 my_avatar 兜底 */
async function loadMyAvatar(contactId) {
  if (!contactId) return
  try {
    const [settings, desk] = await Promise.all([
      getContactSettings(contactId).catch(() => null),
      getDesktop(contactId).catch(() => null)
    ])
    const deskMy = (desk && desk.my_avatar) || ''
    const setMy = (settings && settings.my_avatar) || ''
    myAvatar.value = (desk && desk.sync_chat_avatar && deskMy) ? deskMy : (setMy || deskMy)
  } catch (e) { /* 忽略 */ }
}

/* 邀请按钮：先弹选择器选人（不再提供「和谁聊」的切换入口） */
function openPicker() {
  pickerShow.value = true
}

async function pickChatTarget(c) {
  chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
  pickerShow.value = false
  /* 我的头像跟随聊天对象 */
  loadMyAvatar(c.id)
/* 群聊：加载成员名映射，聊天室前缀显示发言人 */
  memberMap.value = {}
  if (c.kind === 'group') {
    try {
      const members = await getContactMembers(c.id)
      const map = {}
      for (const m of members || []) map[m.id] = { name: m.name || '成员', avatar: m.avatar || '' }
      memberMap.value = map
    } catch (e) { /* 忽略 */ }
  }
  try { await chatStore.load(c.id) } catch (e) { /* 忽略 */ }
  /* 选中即向 TA 发出邀请 */
  await doInvite()
}

async function sendChat() {
  const text = chatDraft.value.trim()
  if (!text || !chatTarget.value.id) return
  if (!chatReady.value) {
    toast.pushToast({ title: '先邀请一起看，才能开始聊' })
    return
  }
  chatDraft.value = ''
  try {
    await chatStore.send(chatTarget.value.id, text)
  } catch (e) { /* 忽略 */ }
}

/* ── 聊天室消息列表：有新消息就滚到底部 ── */
watch(chatMsgs, async () => {
  await nextTick()
  const el = chatListEl.value
  if (el) el.scrollTop = el.scrollHeight
})
/* 打开播放器 / 切换对象后也滚到底部 */
watch(() => player.show, async (v) => {
  if (!v) return
  await nextTick()
  await nextTick()
  const el = chatListEl.value
  if (el) el.scrollTop = el.scrollHeight
})

/* ── 一起观影 ── */
const watchClock = ref('00:00')
let watchTimer = null

function fmtClock(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0')
  const s = String(sec % 60).padStart(2, '0')
  return `${m}:${s}`
}

/* 观影时长：全局持久化（一起看的每秒都计入），影院页统计行以「时长」展示 */
const watchTotal = ref(0)
let watchPending = 0
let flushTimer = null
async function loadWatchTotal() {
  try {
    const r = await getWatchSeconds()
    watchTotal.value = Number(r && r.seconds) || 0
  } catch (e) { /* 忽略 */ }
}
async function flushWatch() {
  if (watchPending <= 0) return
  const add = watchPending
  watchPending = 0
  try {
    const r = await addWatchSeconds(add)
    watchTotal.value = Number(r && r.seconds) || (watchTotal.value + add)
  } catch (e) {
    watchTotal.value += add
  }
}
/* 「X 小时 Y 分 / X 分钟 / X 秒」：影院页统计行展示 */
const watchTotalText = computed(() => {
  const s = Math.max(0, Math.floor(watchTotal.value || 0))
  if (s < 60) return `${s} 秒`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分钟`
})
function startWatchTimer() {
  stopWatchTimer()
  const startedAt = Date.now()
  watchTimer = setInterval(() => {
    watchClock.value = fmtClock(Math.floor((Date.now() - startedAt) / 1000))
    /* 陪看的每一秒都计入累计观影时长 */
    watchPending += 1
    if (watchPending >= 5) flushWatch()
  }, 1000)
  /* 每 5 秒落盘一次，避免频繁写库 */
  flushTimer = setInterval(() => flushWatch(), 5000)
}
function stopWatchTimer() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null }
  if (flushTimer) { clearInterval(flushTimer); flushTimer = null }
  flushWatch()
}
watch(watching, (v) => {
  if (v) { watchClock.value = '00:00'; startWatchTimer() }
  else stopWatchTimer()
})

/* 邀请按钮：先弹选择器选人，选中即发出邀请（不再直接邀当前聊天对象） */
function onInviteClick() {
  if (cinemaStore.pendingOut) { toast.pushToast({ title: '邀请已发出，等 TA 接受' }); return }
  if (watching.value) { toast.pushToast({ title: '已经在一起看了' }); return }
  if (!contactList.value.length) { toast.pushToast({ title: '还没有可邀请的联系人' }); return }
  openPicker()
}

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
    /* 不再弹「已邀请…一起看」：浅色弹条会盖住视频顶部，
       状态条已实时显示「等待对方接受邀请…」 */
  } catch (e) {
    toast.pushToast({ title: '邀请发送失败' })
  }
}

async function endWatching() {
  if (!watching.value) return
  try { await cinemaStore.end(watching.value.inviteId) } catch (e) { /* 忽略 */ }
  toast.pushToast({ title: '已结束一起观影' })
}

/* 我在聊天卡片点了「一起看」→ store.active 带上影片，自动打开播放器。
 * immediate：accept 时先写 active 再跳路由，CinemaView 挂载时值已存在，必须立即处理一次 */
watch(() => cinemaStore.active, async (a) => {
  if (!a || !a.film || !a.film.url) return
  cinemaStore.consumeActive()
  const c = contactsStore.getById(a.contactId)
  if (c) {
    chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
    loadMyAvatar(c.id)
  }
  const r = resolveVideo(a.film.playSrc || a.film.url)
  if (r.type === 'external') { openUrl(a.film.url); return }
  player.type = r.type
  player.src = r.src
  player.raw = a.film.url
  player.title = a.film.title || ''
  player.show = true
  /* 先加载消息再进播放器：聊天室直接显示 */
  try { await chatStore.load(a.contactId) } catch (e) { /* 忽略 */ }
  /* 群邀请：加载成员名映射，聊天室前缀显示发言人 */
  memberMap.value = {}
  if (a.isGroup) {
    try {
      const members = await getContactMembers(a.contactId)
      const map = {}
      for (const m of members || []) map[m.id] = { name: m.name || '成员', avatar: m.avatar || '' }
      memberMap.value = map
    } catch (e) { /* 忽略 */ }
  }
}, { immediate: true })

/* 播放器打开状态同步给全局（SSE 消息弹窗在播放器打开时不再弹顶部白条） */
watch(() => player.show, (v) => cinemaStore.setPlayerOpen(v), { immediate: true })

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
  const r = resolveVideo(url)
  const name = linkSheet.name.trim() || hostOf(url)
  closeLinkSheet()
  await links.add({ title: name, body: url, extra: {} })
  if (r.type === 'external') toast.pushToast({ title: '已加入片单（将跳转原站观看）' })
  else toast.pushToast({ title: '已加入片单（应用内可播放）' })
}
async function removeLink(it) {
  if (!(await confirmDialog({ title: '删除该影片？', danger: true }))) return
  await links.remove(it.id)
}

onMounted(async () => {
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('webkitfullscreenchange', onFsChange)
  await Promise.all([sites.load(), links.load()])
  loadWatchTotal()
  /* 陪看聊天对象：默认取首页当前选中的联系人，没有则取第一个。
   * 若 immediate 的 active 监听已设定对象（接受邀请自动进播放器），不覆盖 */
  if (chatTarget.value.id) return
  try {
    await contactsStore.load()
    const id = homeStore.selectedId
    const c = (id && contactsStore.getById(id)) || (contactList.value[0])
    if (c) {
      chatTarget.value = { id: c.id, name: c.name || '对方', avatar: c.avatar || '' }
      loadMyAvatar(c.id)
      chatStore.load(c.id)
    }
  } catch (e) { /* 忽略 */ }
})

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', onFsChange)
  document.removeEventListener('webkitfullscreenchange', onFsChange)
  stopWatchTimer()
  cinemaStore.setPlayerOpen(false)
})
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
/* 警告说明：红色，提醒勿添加非法 / 色情 / 暴力内容 */
.cv-warn { font-size: 12px; color: #e5484d; line-height: 1.6; margin: 0 0 10px; font-weight: 600; }

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
.cv-sheet-tip { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: -4px 0 8px; }
.cv-link-preview { font-size: 12px; line-height: 1.5; margin: 0 0 12px; padding: 8px 10px; border-radius: 10px; font-weight: 600; }
.cv-link-preview.ok { color: #1a7f37; background: rgba(26, 127, 55, 0.1); }
.cv-link-preview.ext { color: #b06a00; background: rgba(176, 106, 0, 0.1); }
.cv-actions { display: flex; gap: 10px; margin-top: 6px; }
.cv-btn { flex: 1; padding: 12px 0; border-radius: 12px; font-size: 15px; border: none; font-weight: 600; }
.cv-btn.ghost { background: var(--bg-soft); color: var(--text); }
.cv-btn.primary { background: var(--accent); color: #fff; }

.cv-player { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; z-index: 60; }
.cv-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(0, 0, 0, 0.85); color: #fff; }
.cv-bar-btn { border: none; background: transparent; color: #fff; padding: 4px; display: inline-flex; }
.cv-bar-title { flex: 1 1 auto; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-bar-open { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 13px; padding: 6px 12px; border-radius: 999px; }

/* 视频下方状态条：陪看状态 + 邀请操作 */
.cv-with { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(255, 255, 255, 0.08); color: #fff; font-size: 12px; }
.cv-with-ava { position: relative; display: inline-flex; }
.cv-with-ava .cv-with-me { margin-left: -8px; }
.cv-with-txt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-with-end { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.16); color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 999px; }
.cv-with-actions { margin-left: auto; display: inline-flex; gap: 6px; flex: 0 0 auto; }
.cv-with-btn { border: none; background: rgba(255, 255, 255, 0.14); color: #fff; width: 32px; height: 32px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }

/* 视频区：竖屏固定 16:9 置顶（flex 0 0 不收缩：消息再多也压不扁）；
   横屏 / 聊天室收起时撑满剩余空间（iframe 内部自行黑边适配） */
.cv-stage { position: relative; flex: 0 0 auto; width: 100%; aspect-ratio: 16 / 9; max-height: 100%; min-height: 0; background: #000; overflow: hidden; }
.cv-frame { position: absolute; inset: 0; width: 100%; height: 100%; border: none; background: #000; }

/* 全屏按钮：浮在视频右上角，保证在黑色画面上清晰可见 */
.cv-stage-fs {
  position: absolute; top: 8px; right: 8px; z-index: 5;
  width: 36px; height: 36px; border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.35); background: rgba(20, 20, 20, 0.65); color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  pointer-events: auto;
}
.cv-stage-fs.active { background: rgba(0, 0, 0, 0.8); }

/* 应用级全屏：隐藏所有 chrome，视频区撑满整个视口 */
.cv-player.is-fs .cv-bar,
.cv-player.is-fs .cv-with,
.cv-player.is-fs .cv-chat { display: none; }
.cv-player.is-fs .cv-main { flex: 1 1 auto; min-height: 0; }
.cv-player.is-fs .cv-stage { flex: 1 1 auto; aspect-ratio: auto; width: 100%; height: 100%; }

/* 真·系统全屏：铺满由 UA 处理。注意 UA 对全屏元素本身强制 transform:none，
   因此竖屏旋转要加在内部视频帧（.cv-frame）上，而不是全屏元素上 */
@media (orientation: portrait) {
  /* 视频区成为全屏元素（我们的按钮）：旋转其内部 iframe/video */
  .cv-stage:fullscreen .cv-frame,
  .cv-stage:-webkit-full-screen .cv-frame {
    width: 100vh; height: 100vw;
    transform: rotate(90deg) translateY(-100vw);
    transform-origin: top left;
  }
  /* 旋转后横屏视角的右上角 = 物理右下角，把 × 挪过去（× 图标四向对称，不用转） */
  .cv-stage:fullscreen .cv-stage-fs,
  .cv-stage:-webkit-full-screen .cv-stage-fs { top: auto; bottom: 8px; }
  /* 应用级兜底（真全屏失败）：stage 不是全屏元素，可直接旋转 */
  .cv-player.is-fs.force-rotate .cv-stage {
    position: fixed; top: 0; left: 0;
    width: 100vh; height: 100vw;
    transform: rotate(90deg) translateY(-100vw);
    transform-origin: top left;
  }
}

/* 视频下方整体：状态条 + 聊天室，聊天室占满剩余区域 */
.cv-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
/* 陪看聊天室：占满视频下方剩余区域，输入框沉底 */
.cv-chat { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: #141418; border-top: 1px solid rgba(255, 255, 255, 0.1); }
/* 收起：只留顶部细条，视频区撑满剩余空间 */
.cv-chat.collapsed { flex: 0 0 auto; }
.cv-chat.collapsed .cv-chat-msgs,
.cv-chat.collapsed .cv-chat-input { display: none; }
.cv-main.chat-collapsed .cv-stage { flex: 1 1 auto; aspect-ratio: auto; }
.cv-chat-hd { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; }
.cv-chat-hd-title { font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.65); }
/* 聊天室收起 / 展开 */
.cv-chat-fold { border: none; background: transparent; color: rgba(255, 255, 255, 0.7); padding: 4px; display: inline-flex; align-items: center; }
.cv-chat-msgs { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 12px; display: flex; flex-direction: column; gap: 8px; }
.cv-chat-empty { font-size: 12px; color: rgba(255, 255, 255, 0.45); text-align: center; padding: 18px 0; }
.cv-msg { display: flex; align-items: flex-start; gap: 8px; }
/* 我的消息：整组靠右，气泡在左、头像在最右（DOM 顺序 [气泡][头像]） */
.cv-msg.me { flex-direction: row; justify-content: flex-end; }
.cv-msg-ava { flex: 0 0 auto; }
.cv-msg-main { flex: 0 1 auto; min-width: 0; max-width: 74%; display: flex; flex-direction: column; gap: 2px; }
.cv-msg.me .cv-msg-main { align-items: flex-end; }
.cv-msg-name { font-size: 11px; color: rgba(255, 255, 255, 0.55); padding: 0 2px; }
.cv-msg-bubble { font-size: 13px; line-height: 1.5; padding: 7px 11px; border-radius: 14px; background: rgba(255, 255, 255, 0.12); color: #fff; word-break: break-word; white-space: pre-wrap; }
.cv-msg.me .cv-msg-bubble { background: var(--accent); }
.cv-chat-input { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); }
.cv-chat-input input { flex: 1 1 auto; min-width: 0; border: none; background: rgba(255, 255, 255, 0.1); color: #fff; font-size: 13px; padding: 9px 12px; border-radius: 999px; }
.cv-chat-input input:disabled { opacity: 0.5; }
.cv-chat-input input::placeholder { color: rgba(255, 255, 255, 0.4); }
.cv-chat-input button { flex: 0 0 auto; border: none; background: var(--accent); color: #fff; width: 34px; height: 34px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.cv-chat-input button:disabled { opacity: 0.5; }

/* 横屏：视频区撑满剩余高度，聊天室限高给视频让位 */
@media (orientation: landscape) {
  .cv-stage { flex: 1 1 auto; aspect-ratio: auto; }
  .cv-chat { max-height: 38%; }
}

/* 联系人选择 */
.cv-pick-list { display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow-y: auto; }
.cv-pick { display: flex; align-items: center; gap: 10px; padding: 10px 8px; border: none; background: transparent; border-radius: 12px; text-align: left; }
.cv-pick.on { background: var(--bg-soft); }
.cv-pick-name { flex: 1 1 auto; font-size: 14px; color: var(--text); }
</style>
