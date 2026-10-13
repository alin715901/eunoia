<template>
  <div class="chat-window" :style="[solidBgStyle, fontStyle]">
    <!-- 图片背景：独立一层，可加模糊 -->
    <div v-if="isImageBg" class="bg-layer" :style="bgLayerStyle"></div>

    <!-- 聊天记录搜索：先展示全部相关记录列表；点某条再定位到会话中的真实位置 -->
    <div v-if="searchQuery" class="search-banner">
      <span class="sb-text">「{{ searchQuery }}」· {{ matches.length }} 条相关</span>
      <div class="sb-actions">
        <button v-if="searchPhase === 'located'" class="sb-btn" @click="backToList">返回列表</button>
        <button class="sb-btn sb-close" @click="$emit('close-search')">退出搜索</button>
      </div>
    </div>

    <!-- 搜索命中列表：展示全部相关聊天记录（不替换上下文） -->
    <div v-if="searchQuery && searchPhase === 'list'" ref="resultsScroller" class="search-results">
      <div class="sr-count">相关聊天记录（{{ matches.length }}）</div>
      <div v-if="!matches.length" class="empty">没有找到相关聊天记录</div>
      <button v-for="m in matches" :key="m.id" class="sr-item" @click="locate(m)">
        <div class="sr-meta">
          <span class="sr-sender">{{ senderName(m) }}</span>
          <span class="sr-time">{{ resultTime(m.created_at) }}</span>
        </div>
        <div class="sr-text">{{ m.text || '（一条卡片消息）' }}</div>
      </button>
    </div>

    <!-- 完整会话：无搜索 / 已定位到某条记录（保留上下文，仅高亮目标） -->
    <div v-else ref="scroller" class="msg-list" :class="{ 'is-positioning': !ready }" @scroll="onScroll">
      <!-- 顶部：上滑加载更早消息的提示（游标存在才显示"加载中"，已到顶显示"以上是全部消息"） -->
      <div class="hist-tip">
        <span v-if="loadingOlder" class="hist-loading">加载更早的消息…</span>
        <span v-else-if="!hasMore" class="hist-end">以上是全部消息</span>
      </div>
      <div v-if="!visibleMessages.length" class="empty">还没有消息，打个招呼吧～</div>
      <template v-for="(m, i) in visibleMessages" :key="m.id || (m.created_at + m.text)">
        <div :id="'m-' + m.id" :class="{ 'msg-hl': m.id === hlId }">
          <!-- 撤回：居中系统提示（参考微信；按撤回方区分文案） -->
          <div v-if="m.recalled" class="recalled-note">{{ m.sender === 'me' ? '我撤回了一条消息' : (name + '撤回了一条消息') }}</div>
          <!-- 拍一拍：居中系统提示（格式：联系人 + 拍一拍库字卡内容），与撤回提示同一风格 -->
          <div v-else-if="m.content_type === 'poke'" class="recalled-note">{{ name }} {{ m.text }}</div>
          <MessageBubble
            v-else
            :message="m"
            :name="name"
            :avatar="avatar"
            :my-name="myName"
            :my-avatar="myAvatar"
            :member-map="memberMap"
            :show-time="showTimeAt(i)"
            :time-label="timeLabelAt(i)"
            :bubble-style="bubbleStyle"
            :avatar-shape="avatarShape"
            :avatar-radius="avatarRadius"
            :avatar-size="avatarSize"
            :avatar-pos="avatarPos"
            :show-read-receipt="showReadReceipt"
            :read-receipt-style="readReceiptStyle"
            :show-names="showNames"
            @long-press="onLongPress"
            @quote-tap="onQuoteTap"
            @image-tap="viewerSrc = $event"
            @open-redpacket="onOpenRedPacket"
          />
        </div>
      </template>
      <!-- 正在输入：群聊只用左下角三点表示"有人正在输入"（不显示群头像） -->
      <TypingIndicator
        v-if="typing"
        :name="name"
        :avatar="avatar"
        :avatar-shape="avatarShape"
        :avatar-radius="avatarRadius"
        :plain="isGroup"
      />
    </div>
    <ChatInput
      :quote="pendingQuote"
      :sticker-tabs="stickerTabs"
      @send="onSend"
      @cancel-quote="pendingQuote = null"
      @feature="onFeature"
      @continue-talk="onContinueTalk"
      @request-stickers="loadStickers"
      @send-sticker="onSendSticker"
    />

    <!-- 相册选图：走系统文件选择（微信发图逻辑一致：选图即发送） -->
    <input
      ref="albumInput"
      type="file"
      accept="image/*"
      multiple
      hidden
      @change="onAlbumPick"
    />

    <!-- 红包金额面板（我发红包；群聊可选份数） -->
    <RedPacketSheet
      :show="showRedPacket"
      :contact-id="contactId"
      :is-group="isGroup"
      :member-count="memberCount"
      @close="showRedPacket = false"
      @send="onSendRedPacket"
    />
    <!-- 群红包详情：拼手气结果 + 领取记录（可开红包） -->
    <GroupRedPacketSheet
      v-if="groupPacket"
      :show="showGroupPacket"
      :message="groupPacket"
      :member-map="memberMap"
      :my-name="myName"
      :my-avatar="myAvatar"
      @close="showGroupPacket = false; groupPacketId = null"
    />
    <!-- 领取/退回对方红包弹窗（仅单聊） -->
    <RedPacketClaimSheet
      :show="showClaim"
      :message="claimPacket"
      :contact-name="name"
      :contact-avatar="avatar"
      @close="showClaim = false"
      @claim="onClaimPacket"
      @return="onReturnPacket"
    />
    <!-- 提问面板（单选/多选/问答） -->
    <QuestionSheet :show="showQuestion" @close="showQuestion = false" @send="onSendQuestion" />

    <!-- 长按气泡操作菜单（引用/收藏/撤回/删除）+ 背景遮罩，挂到 body 避免被聊天区 overflow 裁切 -->
    <Teleport to="body">
      <div v-if="menu.show" class="ctx-backdrop" @click="closeMenu" @contextmenu.prevent="closeMenu"></div>
      <div v-if="menu.show" class="ctx-menu" ref="menuEl" :style="menuStyle">
        <button class="ctx-item" @click="doQuote">引用</button>
        <button v-if="menu.message && menu.message.content_type === 'voice'" class="ctx-item" @click="doVoiceToText">
          {{ chatStore.voiceAsrOn(menu.message.id) ? '收文字' : '转文字' }}
        </button>
        <button v-if="!isGroup" class="ctx-item" @click="doFavorite">收藏</button>
        <button v-if="menu.message && menu.message.sender === 'me'" class="ctx-item" @click="doRecall">撤回</button>
        <button class="ctx-item ctx-danger" @click="doDelete">删除</button>
      </div>
      <!-- 图片全屏查看器：点击任意处关闭（微信式黑底大图） -->
      <div v-if="viewerSrc" class="img-viewer" @click="viewerSrc = ''">
        <img :src="viewerSrc" alt="" draggable="false" />
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onActivated } from 'vue'
import { storeToRefs } from 'pinia'
import MessageBubble from './MessageBubble.vue'
import ChatInput from './ChatInput.vue'
import TypingIndicator from './TypingIndicator.vue'
import RedPacketSheet from './RedPacketSheet.vue'
import GroupRedPacketSheet from './GroupRedPacketSheet.vue'
import RedPacketClaimSheet from './RedPacketClaimSheet.vue'
import QuestionSheet from './QuestionSheet.vue'
import { useChatStore } from '@/stores/chat'
import { favoriteMessage, recallMessage, deleteMessage, sendImage, sendRedPacket, sendQuestion, continueTalk, searchMessages, claimRedPacket, returnRedPacket } from '@/api/chat'
import { getCards } from '@/api/cards'
import { uploadFile } from '@/api/settings'
import { useSettingsStore } from '@/stores/settings'
import { compressImage } from '@/utils/image'
import { useNotificationsStore } from '@/stores/notifications'
import { useCallStore } from '@/stores/call'

const props = defineProps({
  contactId: { type: [String, Number], required: true },
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  myName: { type: String, default: '' },
  myAvatar: { type: String, default: '' },
  // 背景支持：纯色（#f4f4f6）或图片路径（/uploads/xx.jpg）
  chatBg: { type: String, default: '' },
  // 图片背景的模糊度（px）
  chatBlur: { type: Number, default: 0 },
  // 聊天字体样式对象（{fontFamily:...} 或含 font-size 等）
  chatFontStyle: { type: Object, default: null },
  bubbleStyle: { type: Object, default: null },
  avatarShape: { type: String, default: 'circle' },
  avatarRadius: { type: Number, default: 12 },
  avatarSize: { type: Number, default: 36 },
  avatarPos: { type: String, default: 'bottom' },
  // 我的消息是否显示已读标识
  showReadReceipt: { type: Boolean, default: true },
  // 已读标识样式：text=「已读」文字 check=对勾（单勾发送成功/双勾已读）
  readReceiptStyle: { type: String, default: 'text' },
  /* 群聊：成员 id → {name, avatar}，用于显示每条消息的发言人 */
  memberMap: { type: Object, default: null },
  // 是否显示昵称（群成员昵称等；关闭后气泡旁不显示名字）
  showNames: { type: Boolean, default: true },
  // 聊天记录搜索关键字：非空时进入搜索态
  searchQuery: { type: String, default: '' }
})

const emit = defineEmits(['close-search'])

const chat = useChatStore()
const chatStore = chat
const { messagesByContact, typingByContact } = storeToRefs(chat)
const toast = useNotificationsStore()
const call = useCallStore()
const settings = useSettingsStore()
const scroller = ref(null)
const resultsScroller = ref(null)
/* 上滑加载更早消息 */
const loadingOlder = ref(false)
const hasMore = computed(() => !!chat.cursors[props.contactId])

/* ── 长按气泡操作菜单 + 待发送引用 ── */
const menu = ref({ show: false, x: 0, y: 0, message: null })
const pendingQuote = ref(null)
/* 图片全屏查看器：点击图片消息/图片字卡时打开 */
const viewerSrc = ref('')
const menuEl = ref(null)
const menuW = ref(210)
const menuStyle = computed(() => {
  const w = typeof window !== 'undefined' ? window.innerWidth : 420
  const h = typeof window !== 'undefined' ? window.innerHeight : 860
  /* 横条菜单显示在长按点上方：按菜单实际宽度收进屏幕右缘（我的气泡靠右，整体往左让位，避免"删除"被裁切） */
  const left = Math.max(6, Math.min(menu.value.x - 6, w - menuW.value - 6))
  const top = Math.max(6, menu.value.y - 42)
  return { left: left + 'px', top: top + 'px' }
})
function onLongPress({ message, x, y }) {
  menu.value.message = message
  menu.value.x = x
  menu.value.y = y
  /* 先按条目数估宽（每项约 51px）防首帧溢出，渲染后再按实测修正 */
  menuW.value = (message && message.sender === 'me' ? 4 : 3) * 51 + 8
  menu.value.show = true
  nextTick(() => {
    if (menuEl.value) menuW.value = menuEl.value.offsetWidth || menuW.value
  })
}
function closeMenu() {
  menu.value.show = false
  menu.value.message = null
}
function snippetOf(m) {
  return m.text || (m.asset_path ? '[图片]' : '') || ''
}
/* 长按语音条 → 转文字 / 收文字：展开状态存全局（store），跨页面保留，主动收起才收 */
function doVoiceToText() {
  const m = menu.value.message
  closeMenu()
  if (m) chatStore.toggleVoiceAsr(m.id)
}

function doQuote() {
  const m = menu.value.message
  if (m) {
    /* 微信样式：引用摘要带发送者前缀。引用我的消息 → 我的备注名（实时）；
       群聊引用某位成员的发言 → 该成员昵称（不显示群名）；其余 → 对方昵称 */
    const member = m.author_member_id && props.memberMap ? props.memberMap[String(m.author_member_id)] : null
    const prefix = m.sender === 'me' ? (props.myName || '我') : (member?.name || props.name || '')
    const body = m.text || (m.asset_path ? '[图片]' : '')
    pendingQuote.value = { id: m.id, text: prefix ? `${prefix}：${body}` : body, image: m.asset_path || '', sender: m.sender }
  }
  closeMenu()
}
async function doFavorite() {
  const m = menu.value.message
  if (m) {
    try {
      await favoriteMessage(m.id)
      keepScrollUntil = Date.now() + 800
      toast.pushToast({ title: '已收藏', text: '已放入「统计」页', type: 'message' })
    } catch (e) { /* ignore */ }
  }
  closeMenu()
}
async function doRecall() {
  const m = menu.value.message
  if (m) {
    try {
      await recallMessage(m.id)
      keepScrollUntil = Date.now() + 800
      chat.recall(props.contactId, m.id)
    } catch (e) { /* ignore */ }
  }
  closeMenu()
}
async function doDelete() {
  const m = menu.value.message
  if (m) {
    try {
      await deleteMessage(m.id)
      keepScrollUntil = Date.now() + 800
      chat.remove(props.contactId, m.id)
    } catch (e) { /* ignore */ }
  }
  closeMenu()
}

/* ── "+"扩展功能：红包 / 相册 / 通话 / 提问 ── */
const showRedPacket = ref(false)
const showQuestion = ref(false)
const albumInput = ref(null)

function onFeature(key) {
  if (key === 'redpacket') showRedPacket.value = true
  else if (key === 'album') albumInput.value?.click()
  else if (key === 'call') {
    // 发起通话走全局通话组件（跨页面保持、可缩小悬浮窗），按联系人设置的概率决定接听/拒绝
    // 群聊：把成员列表带过去 —— 通话界面显示成员陆续加入（不显示群头像），悬浮窗仍用群头像
    const members = props.memberMap ? Object.values(props.memberMap) : null
    call.startOutgoing({
      contactId: props.contactId,
      name: props.name,
      avatar: props.avatar,
      avatarShape: props.avatarShape,
      avatarRadius: props.avatarRadius,
      members,
      self: { name: props.myName || '我', avatar: props.myAvatar || '' }
    })
  }
  else if (key === 'question') showQuestion.value = true
}

/* 相册选图 → 压缩 → 上传 → 逐张发送图片消息（微信发图逻辑一致） */
async function onAlbumPick(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  for (const raw of files) {
    if (!raw.type?.startsWith('image/')) continue
    try {
      const small = await compressImage(raw)
      const res = await uploadFile(small)
      if (!res?.path) continue
      const msg = await sendImage(props.contactId, res.path)
      chat.push(props.contactId, msg)
    } catch (err) {
      toast.pushToast({ title: '发送失败', text: '图片发送失败，请重试', type: 'message' })
    }
  }
}

/* ── 表情包（输入框 😊 按钮）：全部来自字卡库里带图片的字卡
     首栏「通用」= 通用库；其余每栏一个联系人 —— 群聊里按群成员分设（每人一个 tab），
     单聊只有一个「专属」栏（就是这位联系人自己） ── */
const stickerTabs = ref([{ key: 'general', label: '通用', list: [] }])
function pickImages(res) {
  const list = []
  const seen = new Set()
  // 表情包面板只同步字卡库里「表情包」板块（带图、未屏蔽）的字卡；
  // 「图片」板块是相册图片素材，不进表情面板（两者不放在一起）
  const STICKER_CATS = new Set(['sticker'])
  for (const c of res || []) {
    if (!c.asset_path || c.blocked) continue
    if (c.category && !STICKER_CATS.has(c.category)) continue
    const key = String(c.asset_path)
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ id: c.id, content: c.content || '', asset_path: c.asset_path })
  }
  return list
}
async function loadStickers() {
  /* 群聊：每位成员一栏（取成员自己的专属库）；单聊：就一栏「专属」 */
  const owners = props.memberMap
    ? Object.keys(props.memberMap).map((id) => ({
        id,
        label: props.memberMap[id]?.name || '联系人'
      }))
    : [{ id: props.contactId, label: '专属' }]
  try {
    const results = await Promise.allSettled([
      getCards({ scope: 'general' }),
      ...owners.map((o) => getCards({ scope: 'contact', contactId: o.id }))
    ])
    const take = (r) => pickImages(r && r.status === 'fulfilled' ? r.value : [])
    const tabs = [{ key: 'general', label: '通用', list: take(results[0]) }]
    owners.forEach((o, i) => {
      tabs.push({ key: 'c' + o.id, label: o.label, list: take(results[i + 1]) })
    })
    stickerTabs.value = tabs
  } catch (e) { /* ignore */ }
}
/* 点专属表情包：直接作为图片消息发出（微信表情包逻辑：点击即发送）。
   contentType 传 'sticker'，前端按表情包尺寸渲染（比相册图片小一号） */
async function onSendSticker(assetPath) {
  if (!assetPath) return
  try {
    const msg = await sendImage(props.contactId, assetPath, 'sticker')
    chat.push(props.contactId, msg)
  } catch (e) {
    toast.pushToast({ title: '发送失败', text: '表情包发送失败，请重试', type: 'message' })
  }
}

/* 红包：确认金额（+ 可选留言）后发送红包卡片（状态由服务端流转：已领取/退回）。
   群聊：带份数一起发（拼手气群红包，成员随机领取） */
async function onSendRedPacket({ amount, count, note }) {
  showRedPacket.value = false
  try {
    const msg = await sendRedPacket(props.contactId, amount, note, count || 1)
    chat.push(props.contactId, msg)
  } catch (e) {
    toast.pushToast({ title: '发送失败', text: e?.message || '红包发送失败，请重试', type: 'message' })
  }
}

/* 点击红包卡片：
   群红包 → 打开群红包详情（可开红包/看领取记录）；
   对方发来的、待领取 → 弹出「领取 / 退回」选择框；其余（我发的、已领取/退回）不弹窗 */
const claimPacket = ref(null)
const showClaim = ref(false)
/* 群红包详情：按消息 id 从会话列表派生——成员实时领取（message_update）后，
   卡片与详情弹窗都会跟着刷新 */
const groupPacketId = ref(null)
const showGroupPacket = ref(false)
function onOpenRedPacket(m) {
  if (!m || m.content_type !== 'redpacket') return
  let meta
  try { meta = JSON.parse(m.text || '{}') } catch (e) { return }
  if (meta.group) {
    groupPacketId.value = m.id
    showGroupPacket.value = true
    return
  }
  if (m.sender === 'contact' && meta.status === 'unclaimed') {
    claimPacket.value = m
    showClaim.value = true
  }
}

/* 领取对方红包：我的余额 += 金额 */
async function onClaimPacket() {
  const m = claimPacket.value
  showClaim.value = false
  if (!m) return
  try {
    const res = await claimRedPacket(m.id)
    // 服务端已通过 message_update 推送最新消息；这里用返回值直接覆盖，保证即时刷新
    if (res && res.message) chat.updateFromSSE(props.contactId, res.message)
    const amt = Number(JSON.parse(m.text || '{}').amount) || 0
    toast.pushToast({ title: '已领取红包', text: `¥${amt}`, type: 'message' })
  } catch (e) {
    toast.pushToast({ title: '领取失败', text: e?.message || '请重试', type: 'message' })
  }
}

/* 退回对方红包：不改余额，状态置为退回 */
async function onReturnPacket() {
  const m = claimPacket.value
  showClaim.value = false
  if (!m) return
  try {
    const res = await returnRedPacket(m.id)
    if (res && res.message) chat.updateFromSSE(props.contactId, res.message)
    toast.pushToast({ title: '已退回红包', text: '已退回给对方', type: 'message' })
  } catch (e) {
    toast.pushToast({ title: '退回失败', text: e?.message || '请重试', type: 'message' })
  }
}

/* 提问：单选/多选/问答；选择题对方"回复所选选项"，问答题对方抽字卡；记录已存入「统计」 */
async function onSendQuestion(payload) {
  showQuestion.value = false
  try {
    const msg = await sendQuestion(props.contactId, payload)
    chat.push(props.contactId, msg)
  } catch (e) {
    toast.pushToast({ title: '发送失败', text: e?.message || '提问发送失败，请重试', type: 'message' })
  }
}

const messages = computed(() => messagesByContact.value[props.contactId] || [])
const typing = computed(() => !!typingByContact.value[props.contactId])
/* 群聊：群成员表非空即为群聊（父组件只在群聊时传）→ 输入指示器走「三点」样式 */
const isGroup = computed(() => !!props.memberMap)
/* 群成员数：群红包默认份数用 */
const memberCount = computed(() => (props.memberMap ? Object.keys(props.memberMap).length : 0))
/* 群红包详情弹窗的目标消息：跟着 store 实时更新（成员领取后卡片/详情同步刷新） */
const groupPacket = computed(() =>
  groupPacketId.value != null ? messages.value.find((m) => m.id === groupPacketId.value) || null : null
)

/* ── 聊天记录搜索：两段式 ──
   list    ：展示全部相关记录（命中列表）
   located ：跳到完整会话中该记录的真实位置（保留上下文，仅高亮） */
const searchPhase = ref('list')
const locatedId = ref(null)
const hlId = ref(null)

const matches = computed(() => {
  const kw = String(props.searchQuery || '').trim().toLowerCase()
  if (!kw) return []
  // 只搜文本/字卡消息（红包/通话/提问等的 text 是 JSON 元数据，不参与搜索）
  return messages.value.filter(
    (m) => ['text', 'card', 'poke'].includes(m.content_type) && String(m.text || '').toLowerCase().includes(kw)
  )
})

/* 展示列表：无搜索 / 已定位 → 完整会话；列表态由 results 面板接管（此处不渲染） */
const visibleMessages = computed(() => {
  if (props.searchQuery && searchPhase.value === 'located') return messages.value
  if (!props.searchQuery) return messages.value
  return messages.value // list 态下会话区不显示，matches 由 results 面板渲染
})

/* 图片背景走独立模糊层；纯色背景直接铺底 */
const isImageBg = computed(() => !!props.chatBg && !props.chatBg.startsWith('#'))
const solidBgStyle = computed(() =>
  !isImageBg.value && props.chatBg ? { background: props.chatBg } : {}
)
const bgLayerStyle = computed(() => {
  const blur = Number(props.chatBlur) || 0
  /* 深色模式下把聊天背景图压暗，避免亮图在深色界面里刺眼 */
  const filters = []
  if (blur) filters.push(`blur(${blur}px)`)
  if (settings.isDark) filters.push('brightness(0.62)')
  return {
    backgroundImage: `url(${props.chatBg})`,
    filter: filters.length ? filters.join(' ') : 'none',
    transform: blur ? `scale(${1 + blur / 30})` : 'none'
  }
})
const fontStyle = computed(() => props.chatFontStyle || {})

function pad(n) { return String(n).padStart(2, '0') }
/* 纯时分，如 09:30 */
function fmtHM(sec) {
  const d = new Date(sec * 1000)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/* 与今天的日期差（按自然日，跨零点的当天也算 0 天） */
function dayDiff(ts) {
  const d = new Date(ts * 1000)
  const now = new Date()
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((b - a) / 86400000)
}
const WEEKDAY = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
/* 聊天时间规则（微信式）：
   今天 → 时分；昨天 → 昨天 时分；前天 → 前天 时分；
   一星期内（3~6 天）→ 星期几 时分；更早 → 几月几日 时分 */
function smartTime(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const hm = fmtHM(ts)
  const diff = dayDiff(ts)
  if (diff === 0) return hm
  if (diff === 1) return '昨天 ' + hm
  if (diff === 2) return '前天 ' + hm
  if (diff < 7) return WEEKDAY[d.getDay()] + ' ' + hm
  return `${d.getMonth() + 1}月${d.getDate()}日 ` + hm
}
function resultTime(sec) {
  if (!sec) return ''
  return smartTime(sec)
}
function senderName(m) {
  if (m.sender === 'me') return props.myName || '我'
  if (props.memberMap && m.author_member_id) {
    return props.memberMap[String(m.author_member_id)]?.name || props.name || '对方'
  }
  return props.name || '对方'
}

function showTimeAt(i) {
  const list = visibleMessages.value
  if (i === 0) return true
  const prev = list[i - 1]
  const cur = list[i]
  return cur.created_at - prev.created_at > 300
}
function timeLabelAt(i) {
  const m = visibleMessages.value[i]
  return m ? smartTime(m.created_at) : ''
}

/* 进入聊天定位：加载完成前隐藏消息列表，滚动到底后再显示，
   避免用户先看到顶部再"从头滑"到底部的刷新感 */
const ready = ref(false)

async function loadAndScroll() {
  const hasCache = !!(chat.messagesByContact[props.contactId] || []).length
  if (hasCache) {
    /* 本地已有这次会话的消息：直接渲染已有内容（不隐藏不给刷新感），
       再后台静默补最新一条即可 —— SSE 本来也已保证实时性 */
    ready.value = true
    await nextTick()
    scrollToBottom()
    requestAnimationFrame(() => scrollToBottom())
    chat.syncFromServer(props.contactId).then(() => nextTick(() => scrollToBottom())).catch(() => {})
    return
  }
  ready.value = false
  await chat.load(props.contactId)
  await nextTick()
  scrollToBottom()
  // 兜底：等一轮渲染帧后再校准一次（图片/字体加载可能改变高度）
  requestAnimationFrame(() => {
    scrollToBottom()
    requestAnimationFrame(() => {
      ready.value = true
    })
  })
}

function scrollToBottom() {
  const el = scroller.value
  if (el) el.scrollTop = el.scrollHeight
}

/* 上滑到顶部：加载更早的消息并保住当前阅读位置（避免跳动） */
async function onScroll() {
  const el = scroller.value
  if (!el || loadingOlder.value || props.searchQuery) return
  // 接近顶部（阈值 120px）且还有更早消息时触发
  if (el.scrollTop > 120) return
  if (!chat.cursors[props.contactId]) return
  loadingOlder.value = true
  const oldHeight = el.scrollHeight
  try {
    await chat.loadOlder(props.contactId)
    await nextTick()
    // 保持视口内容不动：新内容高度差补偿到 scrollTop
    el.scrollTop = el.scrollHeight - oldHeight
  } catch (e) {
    /* ignore */
  } finally {
    loadingOlder.value = false
  }
}
function scrollToMessage(id) {
  if (!scroller.value) return
  const el = scroller.value.querySelector('#m-' + id)
  if (el) el.scrollIntoView({ block: 'center' })
  else scrollToBottom()
}

/* 点命中记录 → 跳到完整会话中它的真实位置，保留上下文并高亮 */
function locate(m) {
  locatedId.value = m.id
  searchPhase.value = 'located'
  hlId.value = null
  nextTick(() => {
    scrollToMessage(m.id)
    // 重新挂载高亮动画（即便再次点同一条也能重放）
    requestAnimationFrame(() => { hlId.value = m.id })
    setTimeout(() => { if (hlId.value === m.id) hlId.value = null }, 3100)
  })
}
function backToList() {
  locatedId.value = null
  searchPhase.value = 'list'
  nextTick(() => {
    if (resultsScroller.value) resultsScroller.value.scrollTop = 0
  })
}

/* 底部省略号：让对方继续说 —— 服务端先推"正在输入"，随后回一条新消息 */
async function onContinueTalk() {
  try {
    await continueTalk(props.contactId)
  } catch (e) {
    toast.pushToast({ title: '他这会儿没接上话', text: e.message || '', type: 'message' })
  }
}

/* 点击引用摘要 → 跳到被引用的原消息位置并高亮（复用搜索定位的滚动/高亮逻辑）；
   原消息已被删除/撤回（不在列表中）则不动作 */
function onQuoteTap(quoteId) {
  const id = Number(quoteId)
  if (!id || !messages.value.some((m) => m.id === id)) return
  hlId.value = null
  nextTick(() => {
    scrollToMessage(id)
    // 重新挂载高亮动画（即便再次点同一条也能重放）
    requestAnimationFrame(() => { hlId.value = id })
    setTimeout(() => { if (hlId.value === id) hlId.value = null }, 3100)
  })
}

async function onSend(text) {
  const q = pendingQuote.value
  await chat.send(props.contactId, text, q)
  pendingQuote.value = null
  await nextTick()
  // 搜索态下发送：退出搜索，回到完整会话并滚到底
  if (props.searchQuery) {
    emit('close-search')
    return
  }
  scrollToBottom()
}

watch(
  () => props.contactId,
  () => loadAndScroll()
)
/* 删除/收藏/撤回等自己操作引起的列表变化：短时间内不自动滚底，
   保持当前阅读位置（新消息到来的滚底不受影响） */
let keepScrollUntil = 0
watch(messages, async () => {
  await nextTick()
  if (Date.now() < keepScrollUntil) return
  // 搜索定位中不自动滚底，避免打断查看
  if (!props.searchQuery) scrollToBottom()
})
/* 对方开始输入：输入指示器出现在消息列表底部，滚到底把它带入视野，
   不让用户还要手动往下滑才能看到「正在输入」 */
watch(typing, (v) => {
  if (v && !props.searchQuery) {
    nextTick(() => scrollToBottom())
  }
})
/* 进入/退出/切换搜索：进入即回到命中列表态。
   关键：会话消息接口只拉最近 50 条，列表搜索却能搜到全库——
   所以进搜索时向服务端按本联系人搜一遍，把「分页之外的旧消息」合并进本地列表，
   保证相关记录能显示出整条消息、点击也能跳到原文位置（微信式） */
watch(
  () => props.searchQuery,
  (v) => {
    const on = !!(v && String(v).trim())
    searchPhase.value = 'list'
    locatedId.value = null
    hlId.value = null
    if (!on) return
    mergeServerMatches(String(v).trim())
    nextTick(() => {
      if (resultsScroller.value) resultsScroller.value.scrollTop = 0
    })
  },
  { immediate: true }
)

/* 服务端搜索本聊天的命中记录并合并进本地消息列表（含分页外的旧消息） */
async function mergeServerMatches(kw) {
  if (!kw) return
  try {
    const hits = await searchMessages(kw, props.contactId)
    const msgs = (hits || [])
      .filter((h) => String(h.contactId) === String(props.contactId))
      .map((h) => ({
        id: h.id,
        sender: h.sender,
        content_type: h.contentType || 'text',
        text: h.text || '',
        asset_path: h.assetPath || '',
        author_member_id: h.authorMemberId || null,
        created_at: h.createdAt,
        seq: h.seq ?? null,
        read_receipt: 'read',
        read: 1
      }))
    chat.mergeMessages(props.contactId, msgs)
  } catch (e) { /* 搜索合并失败不打断本地匹配 */ }
}

onMounted(() => {
  loadAndScroll()
  /* 预拉取表情包数据：避免点开表情面板时「专属」栏因异步请求而延迟出现 */
  loadStickers()
})

/* keep-alive 关键修复：组件被缓存后重新激活（从列表进入已缓存的聊天、
   或从聊天设置返回聊天）时，DOM 重新挂载会把 scrollTop 重置为 0，
   表现为"回到顶部、要从头滑"。这里在激活时重新定位到最新消息。
   搜索态除外：搜索列表/定位位置不打断 */
onActivated(() => {
  if (props.searchQuery) return
  nextTick(() => {
    scrollToBottom()
    requestAnimationFrame(() => scrollToBottom())
  })
})
</script>

<style scoped>
.chat-window {
  position: relative;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  background: linear-gradient(180deg, var(--bg-soft) 0%, var(--bg-screen) 100%);
}
/* 图片背景层：垫在消息下面，可模糊 */
.bg-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
  pointer-events: none;
}
.msg-list {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  /* 隐藏滚动条（保留可滚动，滑块不显示） */
  scrollbar-width: none;        /* Firefox */
  -ms-overflow-style: none;     /* 旧 Edge */
}
/* 进入聊天定位中：隐藏列表，滚到底后再显示（避免看到从顶部滚下来的过程） */
.msg-list.is-positioning { visibility: hidden; }
.chat-window :deep(.chat-input) { position: relative; z-index: 1; }

/* 聊天记录搜索横幅 */
.search-banner {
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 14px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-soft);
}
.sb-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.sb-btn {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  padding: 4px 6px;
}
/* 命中记录列表：展示全部相关聊天记录（不替换上下文） */
.search-results {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  overflow-y: auto;
  background: var(--bg-screen);
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.msg-list::-webkit-scrollbar,
.search-results::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
/* 命中数量标题（参考微信搜索详情页） */
.sr-count {
  padding: 8px 14px;
  font-size: 12px;
  color: var(--text-soft);
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.sr-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
  padding: 12px 14px;
}
.sr-item:active { background: var(--bg-soft); }
.sr-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sr-sender { font-size: 15px; font-weight: 700; color: var(--text); }
.sr-time { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.sr-text {
  margin-top: 4px;
  font-size: 15px;
  color: var(--text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* 定位到某条时的高亮（保留上下文，高亮闪烁时长加长，更容易找到目标） */
.msg-hl :deep(.bubble) {
  animation: bubble-flash 3s ease;
}
@keyframes bubble-flash {
  0% { box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 55%, transparent), var(--shadow); }
  100% { box-shadow: 0 0 0 0 transparent, var(--shadow); }
}

.empty {
  margin: auto;
  color: var(--text-soft);
  font-size: 14px;
}

/* 顶部：上滑加载更早消息的提示 */
.hist-tip {
  flex: 0 0 auto;
  text-align: center;
  padding: 8px 0 4px;
  min-height: 20px;
}
.hist-loading { font-size: 12px; color: var(--accent); }
.hist-end { font-size: 12px; color: var(--text-soft); }

/* 撤回：居中系统提示（参考微信：纯文字浅灰小字，无底色块） */
.recalled-note {
  /* 它挂在消息包裹层里（非 flex 容器），靠 fit-content + auto 外边距实现真正居中 */
  width: fit-content;
  margin: 10px auto;
  text-align: center;
  font-size: 13px;
  color: var(--text-soft);
}
</style>

<!-- 长按菜单（横向横条，微信式深色底）与遮罩通过 Teleport 挂到 body，需用全局样式（scoped 不生效） -->
<style>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: transparent;
}
.ctx-menu {
  position: fixed;
  z-index: 91;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background: #4c4c4e;
  border-radius: 5px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.26);
  overflow: hidden;
  animation: ctx-pop 0.14s ease;
}
@keyframes ctx-pop {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
.ctx-item {
  border: none;
  background: transparent;
  padding: 7px 12px;
  font-size: 13px;
  color: #fff;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.ctx-item + .ctx-item { border-left: 1px solid rgba(255, 255, 255, 0.16); }
.ctx-item:active { background: rgba(255, 255, 255, 0.1); }
.ctx-item.ctx-danger { color: #ff7b76; }

/* 图片全屏查看器：黑底居中大图，点击任意处关闭 */
.img-viewer {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
  animation: viewer-in 0.18s ease;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}
.img-viewer img {
  max-width: 100vw;
  max-height: 100vh;
  object-fit: contain;
  border-radius: 4px;
}
@keyframes viewer-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
