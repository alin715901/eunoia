<template>
  <div class="msg-wrap" :class="{ 'has-receipt': hasReceipt }" :style="wrapStyle">
    <div v-if="showTime" class="time-stamp">{{ timeLabel }}</div>
    <div class="msg-row" :class="side" :style="rowAlignStyle">
      <div
        class="ava-col"
        :class="{ 'ava-pokeable': enablePoke && side === 'contact' }"
        @dblclick="onAvatarDblClick"
        @touchstart.passive="onAvatarTouch"
      >
        <AppAvatar :name="displayName" :avatar="displayAvatar" :size="avatarSize" :style="avatarStyle" />
        <!-- 群聊：在头像下方显示发言人昵称（显示昵称开关关闭时不显示） -->
        <span v-if="showMemberName" class="member-name">{{ displayName }}</span>
      </div>
      <!-- 气泡 + 已读标识竖排：已读标识挂在气泡正下方（右侧对齐），不占行内空间 -->
      <div class="bubble-col">
  <div
    class="bubble"
    :class="[side === 'me' ? 'bubble-me' : 'bubble-contact', bubbleExtraClass]"
    :style="bubbleStyleCss"
    @pointerdown="onPressDown"
    @pointerup="onPressUp"
    @pointerleave="onPressUp"
    @pointermove="onPressMove"
    @contextmenu.prevent="onContextMenu"
  >
          <!-- 字卡消息：带图片的图片字卡显示图（表情包式）；有文字则在图下方/或纯文字 -->
          <template v-if="message.content_type === 'card'">
            <span v-if="message.asset_path" class="img-wrap" @click="onImageTap">
              <img :src="message.asset_path" class="image-msg" alt="" draggable="false" />
              <span class="img-cover" aria-hidden="true"></span>
            </span>
            <div v-if="message.text" :class="{ 'card-text-below': message.asset_path }" v-html="squeezedHtml(message.text)"></div>
          </template>
          <!-- 图片消息（相册发送）：无气泡底，圆角图片；点击查看大图 -->
          <template v-else-if="message.content_type === 'image'">
            <span class="img-wrap" @click="onImageTap">
              <img :src="message.asset_path" class="image-msg" alt="" draggable="false" />
              <span class="img-cover" aria-hidden="true"></span>
            </span>
          </template>
          <!-- 表情包消息（表情面板点发/表情包板块字卡）：与相册图片同款式，但尺寸更小（微信表情包气泡）。
               类型由后端按板块恒定：图片板块→image（统一竖框）、表情包板块→sticker（小尺寸） -->
          <template v-else-if="message.content_type === 'sticker'">
            <span class="img-wrap" @click="onImageTap">
              <img :src="message.asset_path" class="image-msg sticker-msg" alt="" draggable="false" />
              <span class="img-cover" aria-hidden="true"></span>
            </span>
          </template>
          <!-- 语音消息：微信式语音条（喇叭+声波图标 + 秒数）；长按弹出统一菜单（含 转文字/收文字） -->
          <template v-else-if="message.content_type === 'voice'">
            <div class="voice-wrap">
              <div class="voice-bar" :style="voiceCustomStyle" @click="togglePlay">
                <span class="vm-icon" :class="{ playing }">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                    <!-- 声源圆点 + 两道弧（参考图二） -->
                    <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
                    <path class="vm-a1" d="M10.6 8.6a5.6 5.6 0 0 1 0 6.8" />
                    <path class="vm-a2" d="M14.2 5.8a10 10 0 0 1 0 12.4" />
                  </svg>
                </span>
                <span v-if="voiceDur" class="vm-dur">{{ voiceDur }}"</span>
              </div>
              <div v-if="chatStore.voiceAsrOn(message.id) && message.text" class="vm-asr" :style="voiceCustomStyle">{{ message.text }}</div>
            </div>
          </template>
          <!-- 红包：参考微信红包封的简约卡片（小尺寸，无 emoji） -->
          <template v-else-if="message.content_type === 'redpacket'">
            <div class="rp-card" @click="onRedpacketTap">
              <div class="rp-head">
                <span class="rp-label">红包</span>
                <AppIcon name="letter" :size="15" color="rgba(196, 116, 92, 0.6)" />
              </div>
              <div class="rp-amount">¥{{ fmtAmount(meta?.amount) }}</div>
              <div class="rp-note">{{ meta?.note || '恭喜发财，大吉大利' }}</div>
              <div class="rp-foot">{{ rpStatusText }}</div>
            </div>
          </template>
          <!-- 通话记录：图标 + 通话时长/结果 -->
          <template v-else-if="message.content_type === 'call'">
            <div class="call-record">
              <AppIcon name="phone" :size="18" />
              <span>{{ callText }}</span>
            </div>
          </template>
          <!-- 陪伴邀请：独立邀请卡片（无气泡底），TA 发来的未处理时可同意/拒绝，已有结果显示大按钮 -->
          <template v-else-if="message.content_type === 'companion_invite'">
            <div class="cp-card" :class="[cpMeta.status, side]">
              <div class="cpc-head">
                <div class="cpc-icon"><AppIcon :name="cpIcon" :size="24" color="#fff" /></div>
                <div class="cpc-main">
                  <div class="cpc-title">{{ cpFromMe ? `邀请${contactName}一起${cpMeta.name}` : `邀请你一起${cpMeta.name}` }}</div>
                  <div class="cpc-sub">{{ cpMeta.mode === 'down' ? `倒计时 ${Math.round((cpMeta.durationSec || 0) / 60)} 分钟` : '正计时 · 一起专注' }}</div>
                </div>
              </div>
              <!-- TA 的邀请待处理：拒绝 / 同意 -->
              <div v-if="!cpFromMe && cpMeta.status === 'pending'" class="cpc-ops">
                <button class="cpc-btn ghost" @click.stop="onCpRespond(false)">拒绝</button>
                <button class="cpc-btn primary" @click.stop="onCpRespond(true)">同意</button>
              </div>
              <!-- 已有结果：整宽大按钮 -->
              <div v-else-if="cpMeta.status === 'accepted' || cpMeta.status === 'rejected' || cpMeta.status === 'expired'" class="cpc-result" :class="cpMeta.status">
                {{ cpMeta.status === 'accepted' ? '已同意' : cpMeta.status === 'rejected' ? '已拒绝' : '已过期' }}
              </div>
              <!-- 取消 / 过期 / 我方等待中：普通状态行 -->
              <div v-else class="cpc-status">{{ cpStatusText }}</div>
            </div>
          </template>
          <!-- 一起听邀请：独立邀请卡片（无气泡底），TA 发来的未处理时可同意/拒绝 -->
          <template v-else-if="message.content_type === 'listen_invite'">
            <div class="lp-card" :class="[lpMeta.status, side]">
              <div class="lpc-head">
                <div class="lpc-cover" v-if="lpMeta.songCover"><img :src="lpMeta.songCover" alt="" /></div>
                <div class="lpc-cover lpc-no" v-else><AppIcon name="music" :size="20" color="var(--text)" /></div>
                <div class="lpc-main">
                  <div class="lpc-title">{{ lpFromMe ? `邀请${contactName}一起听歌` : `邀请你一起听歌` }}</div>
                  <div class="lpc-song">《{{ lpMeta.songTitle || '歌曲' }}》<span v-if="lpMeta.songArtist"> · {{ lpMeta.songArtist }}</span></div>
                </div>
              </div>
              <div v-if="!lpFromMe && lpMeta.status === 'pending'" class="lpc-ops">
                <button class="lpc-btn ghost" @click.stop="onLpRespond(false)">拒绝</button>
                <button class="lpc-btn primary" @click.stop="onLpRespond(true)">一起听</button>
              </div>
              <div v-else-if="lpMeta.status === 'accepted' || lpMeta.status === 'rejected' || lpMeta.status === 'expired' || lpMeta.status === 'cancelled' || lpMeta.status === 'ended'" class="lpc-result" :class="lpMeta.status">
                {{ lpStatusText }}
              </div>
              <div v-else class="lpc-status">等待对方接受…</div>
            </div>
          </template>
          <!-- 一起观影邀请：独立邀请卡片（无气泡底），TA 发来的未处理时可同意/拒绝 -->
          <template v-else-if="message.content_type === 'cinema_invite'">
            <div class="lp-card" :class="[ciMeta.status, side]">
              <div class="lpc-head">
                <div class="lpc-cover lpc-no"><AppIcon name="film" :size="20" color="var(--text)" /></div>
                <div class="lpc-main">
                  <div class="lpc-title">{{ ciFromMe ? `邀请${contactName}一起观影` : `邀请你一起观影` }}</div>
                  <div class="lpc-song">《{{ ciMeta.filmTitle || '影片' }}》</div>
                </div>
              </div>
              <div v-if="!ciFromMe && ciMeta.status === 'pending'" class="lpc-ops">
                <button class="lpc-btn ghost" @click.stop="onCiRespond(false)">拒绝</button>
                <button class="lpc-btn primary" @click.stop="onCiRespond(true)">一起看</button>
              </div>
              <div v-else-if="ciMeta.status === 'accepted' || ciMeta.status === 'rejected' || ciMeta.status === 'cancelled' || ciMeta.status === 'ended'" class="lpc-result" :class="ciMeta.status">
                {{ ciStatusText }}
              </div>
              <div v-else class="lpc-status">等待对方接受…</div>
            </div>
          </template>
          <!-- 游戏邀请：独立邀请卡片（无气泡底），TA 发来的未处理时可接受/拒绝 -->
          <template v-else-if="message.content_type === 'game_invite'">
            <div class="lp-card" :class="[giMeta.status, side]">
              <div class="lpc-head">
                <div class="lpc-cover lpc-no"><AppIcon name="game" :size="20" color="var(--text)" /></div>
                <div class="lpc-main">
                  <div class="lpc-title">{{ giFromMe ? `邀请${contactName}一起玩${giMeta.gameName}` : `邀请你一起玩${giMeta.gameName}` }}</div>
                  <div class="lpc-song">来一局 {{ giMeta.gameName || '小游戏' }} 吧</div>
                </div>
              </div>
              <div v-if="!giFromMe && giMeta.status === 'pending'" class="lpc-ops">
                <button class="lpc-btn ghost" @click.stop="onGiRespond(false)">拒绝</button>
                <button class="lpc-btn primary" @click.stop="onGiRespond(true)">来一局</button>
              </div>
              <div v-else-if="giMeta.status === 'accepted' || giMeta.status === 'rejected' || giMeta.status === 'cancelled' || giMeta.status === 'ended'" class="lpc-result" :class="giMeta.status">
                {{ giStatusText }}
              </div>
              <div v-else class="lpc-status">等待对方接受…</div>
            </div>
          </template>
          <!-- 提问卡片：形式标签 + 问题 + 选项列表（选择题对方回复选项，问答题对方抽字卡） -->
          <template v-else-if="message.content_type === 'question'">
            <div class="q-card">
              <span class="q-tag">{{ qTypeLabel }}</span>
              <div class="q-text">{{ meta?.question }}</div>
              <div v-if="meta?.options?.length" class="q-opts">
                <div v-for="(o, i) in meta.options" :key="i" class="q-opt">
                  <span class="q-opt-letter">{{ qLetter(i) }}.</span>{{ o }}
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <span class="msg-text" v-html="squeezedHtml(message.text)"></span>
          </template>
        </div>
        <!-- 引用预览：气泡下方的小摘要框（参考微信）。图片引用时缩略图取代「[图片]」占位。点击跳转到原文 -->
        <div v-if="message.quote_text" class="quote-box" :class="side" @click.stop="onQuoteTap">
          <div v-if="quoteTextShown" class="quote-text">{{ quoteTextShown }}</div>
          <img v-if="message.quote_image" :src="message.quote_image" class="quote-thumb" />
        </div>
        <!-- 我的消息：已读标识（text=已送达/已读文字；check=对勾；关闭则不显示），
             绝对定位在气泡下方右缘，不影响头像（底部对齐时）与气泡底部对齐。
             通话气泡不显示已读标识 -->
        <div
          v-if="hasReceipt"
          class="receipt"
          :class="{ ticks: readReceiptStyle === 'check' }"
        >
          <svg
            v-if="readReceiptStyle === 'check'"
            width="19"
            height="12"
            viewBox="0 0 19 12"
            aria-hidden="true"
          >
            <!-- 下面的勾：发送成功（常亮）；上面的勾：对方已读后亮起 -->
            <path
              d="M1.5 6.5 L5 10 L11.5 2.5"
              fill="none" stroke="currentColor" stroke-width="1.9"
              stroke-linecap="round" stroke-linejoin="round"
            />
            <path
              v-if="isRead"
              d="M8 6.5 L11.5 10 L18 2.5"
              fill="none" stroke="currentColor" stroke-width="1.9"
              stroke-linecap="round" stroke-linejoin="round"
            />
          </svg>
          <template v-else>{{ isRead ? '已读' : '已送达' }}</template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { cssTextToStyle } from '@/utils/bubbleStyle'
import { useChatStore } from '@/stores/chat'
import { useCompanionStore } from '@/stores/companion'
import { useMusicStore } from '@/stores/music'
import { useCinemaStore } from '@/stores/cinema'
import { respondGameInvite } from '@/api/games'
import router from '@/router'

const emit = defineEmits(['long-press', 'quote-tap', 'image-tap', 'open-redpacket', 'avatar-dblclick'])

const props = defineProps({
  message: { type: Object, required: true },
  // 对方（单聊）
  name: { type: String, default: '' },
  avatar: { type: String, default: '' },
  // 我
  myName: { type: String, default: '' },
  myAvatar: { type: String, default: '' },
  // 群聊：消息发送成员信息映射（author_member_id → {name, avatar}）
  memberMap: { type: Object, default: null },
  // 显示
  showTime: { type: Boolean, default: false },
  timeLabel: { type: String, default: '' },
  // 样式：{ my, contact, radius, size, css }
  bubbleStyle: { type: Object, default: null },
  avatarShape: { type: String, default: 'circle' },
  avatarRadius: { type: Number, default: 12 },
  // 头像尺寸（px）与相对气泡的垂直位置：bottom / center / top
  avatarSize: { type: Number, default: 36 },
  avatarPos: { type: String, default: 'bottom' },
  // 我的消息是否显示已读标识（关闭则一律不显示）
  showReadReceipt: { type: Boolean, default: true },
  // 标识样式：text=「已读」文字 check=对勾
  readReceiptStyle: { type: String, default: 'text' },
  // 是否显示昵称（群成员昵称等；关闭后气泡旁不显示名字）
  showNames: { type: Boolean, default: true },
  // 是否允许双击头像触发「拍一拍」（仅单聊、且仅对方头像；群聊传 false）
  enablePoke: { type: Boolean, default: false }
})

/* 双击 / 双触 对方头像 → 触发拍一拍弹窗（仅 enablePoke 且对方消息）
   桌面用 dblclick；移动端 dblclick 不可靠，这里手动做 320ms 内的双触判定 */
let lastAvatarTap = 0
let avatarPokeCooldown = 0
function fireAvatarPoke() {
  const now = Date.now()
  if (now < avatarPokeCooldown) return
  avatarPokeCooldown = now + 400
  /* 双击发生在头像上，手指/鼠标的 touchstart 会冒泡触发气泡的长按计时器；
     这里主动取消，否则约 500ms 后长按菜单又会弹出，与拍一拍面板叠在一起「闪」 */
  clearTimeout(pressTimer)
  emit('avatar-dblclick')
}
function onAvatarDblClick() {
  if (props.enablePoke && side.value === 'contact') fireAvatarPoke()
}
function onAvatarTouch() {
  if (!props.enablePoke || side.value !== 'contact') return
  const now = Date.now()
  if (now - lastAvatarTap < 320) {
    lastAvatarTap = 0
    fireAvatarPoke()
  } else {
    lastAvatarTap = now
  }
}

const side = computed(() => (props.message.sender === 'me' ? 'me' : 'contact'))

const chatStore = useChatStore()

/* ── 语音消息：播放/暂停（转文字由长按菜单的「转文字」切换 message.__showAsr） ── */
const playing = ref(false)
const voiceDur = computed(() => {
  /* 不足 1 分钟 → 只显示秒（7）；超过 1 分钟 → 几分几秒（1'09）。末尾的秒符号由模板统一加 */
  const d = Number(props.message.duration)
  if (!Number.isFinite(d) || d <= 0) return ''
  const s = Math.round(d)
  if (s < 60) return `${s}`
  const m = Math.floor(s / 60)
  return `${m}'${String(s % 60).padStart(2, '0')}`
})
/* 全局单实例：同一时间只有一条语音在响 */
const __vState = (window.__zikaChatVoice = window.__zikaChatVoice || { el: null, key: '' })
function stopVm() {
  if (__vState.el) {
    __vState.el.pause()
    __vState.el = null
    __vState.key = ''
  }
  playing.value = false
}
function togglePlay() {
  if (playing.value) {
    stopVm()
    return
  }
  stopVm()
  const a = new Audio(props.message.asset_path)
  __vState.el = a
  __vState.key = String(props.message.id)
  a.onended = () => { if (__vState.el === a) stopVm() }
  a.onpause = () => { if (__vState.el === a) stopVm() }
  a.play().catch(() => stopVm())
  playing.value = true
}
onBeforeUnmount(() => {
  if (__vState.key === String(props.message.id)) stopVm()
})

/* ── 特殊消息（图片/红包/通话/提问）的元数据与渲染辅助 ── */
const meta = computed(() => {
  const t = props.message.content_type
  if (!['redpacket', 'call', 'question'].includes(t)) return null
  try {
    return JSON.parse(props.message.text || '{}')
  } catch (e) {
    return null
  }
})
/* 图片/红包/纯图字卡用无气泡底的独立卡片样式 */
const bubbleExtraClass = computed(() => {
  const t = props.message.content_type
  if (t === 'image' || t === 'sticker' || t === 'redpacket') return 'bare'
  if (t === 'voice' || t === 'companion_invite' || t === 'listen_invite' || t === 'cinema_invite' || t === 'game_invite') return 'bare'
  // 图片字卡（无文字）＝表情包：同样去掉气泡底
  if (t === 'card' && props.message.asset_path && !props.message.text) return 'bare'
  return ''
})
function fmtAmount(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : String(v ?? '')
}
/* 中文标点挤压：全角标点（逗号、句号、括号、引号等）的墨迹只占字身框的一侧，
   另半边是空白，导致行内字距稀密不均、文字到气泡左右边缘留白不一致。
   对每一个全角标点做半角挤压（负 margin -0.5em）：墨迹偏左的（，。等）挤右侧空白，
   墨迹偏右的（（「『《等）挤左侧空白。逐字符包 span，先转义再输出，避免 XSS。 */
const PUNCT_RIGHT_BLANK = '，。、；：？！）」』》】〕］｝”’'
const PUNCT_LEFT_BLANK = '（「『《【〔［｛“‘'
function escChar(ch) {
  if (ch === '&') return '&amp;'
  if (ch === '<') return '&lt;'
  if (ch === '>') return '&gt;'
  if (ch === '"') return '&quot;'
  return ch
}
function squeezedHtml(raw) {
  const s = String(raw ?? '')
  if (!s) return ''
  let out = ''
  let prev = ''
  for (const ch of s) {
    /* 标点（已有半边挤压的视觉间隔）后紧跟的空格直接去掉：
       拼字卡按空格拼接时会产生「。 想吃」这类双重间隔，换行后空格还会落到行首，看着像缩进错位 */
    if (ch === ' ' && (PUNCT_RIGHT_BLANK.includes(prev) || PUNCT_LEFT_BLANK.includes(prev))) { prev = ch; continue }
    if (PUNCT_RIGHT_BLANK.includes(ch)) out += '<span class="pt-r">' + escChar(ch) + '</span>'
    else if (PUNCT_LEFT_BLANK.includes(ch)) out += '<span class="pt-l">' + escChar(ch) + '</span>'
    else out += escChar(ch)
    prev = ch
  }
  return out
}
/* 红包状态文案（群红包按「我是否抢到 / 领完 / 退回」区分） */
const rpStatusText = computed(() => {
  const s = meta.value?.status
  if (meta.value?.group) {
    if (s === 'expired') return '已退回'
    if (meta.value.my_grab != null) return '已领取 ¥' + fmtAmount(meta.value.my_grab)
    if (s === 'claimed') return '已领完'
    return '待领取'
  }
  return s === 'claimed' ? '已领取' : s === 'returned' ? '已退回' : '待领取'
})
/* 通话气泡文案：接通后（我或对方挂断）一律显示「通话时长 + 时长」；未接通按结果区分 */
const callText = computed(() => {
  const dur = Number(meta.value?.duration) || 0
  const r = meta.value?.result
  if (r === 'rejected') return '对方拒绝通话'
  if (r === 'declined') return '已拒绝通话'
  if (r === 'missed') return '未接听'
  if (r === 'cancelled') return '通话已取消'
  // answered / hangup_by_them：已接通，显示通话时长
  return '通话时长 ' + fmtDuration(dur)
})
function fmtDuration(sec) {
  const m = String(Math.floor((Number(sec) || 0) / 60)).padStart(2, '0')
  const s = String((Number(sec) || 0) % 60).padStart(2, '0')
  return `${m}:${s}`
}
const qTypeLabel = computed(() => {
  const t = meta.value?.type
  return t === 'single' ? '提问 · 单选' : t === 'multi' ? '提问 · 多选' : '提问 · 问答'
})
function qLetter(i) {
  return ['A', 'B', 'C', 'D', 'E', 'F'][i] || i + 1
}

/* ── 陪伴邀请卡片 ── */
const CP_ICONS = { eat: 'meal', sleep: 'sleep', work: 'work', study: 'study', train: 'train', fish: 'fish' }
const cpMeta = computed(() => {
  try { return JSON.parse(props.message.text || '{}') } catch (e) { return {} }
})
const cpFromMe = computed(() => side.value === 'me')
const cpIcon = computed(() => CP_ICONS[cpMeta.value.activity] || 'archive')
const contactName = computed(() => props.name || '对方')
const cpStatusText = computed(() => {
  const s = cpMeta.value.status
  if (s === 'pending') return cpFromMe.value ? '等待 TA 同意…' : '邀请你一起参加'
  if (s === 'accepted') return '已同意'
  if (s === 'rejected') return '已拒绝'
  if (s === 'cancelled') return '已取消'
  if (s === 'expired') return '已过期'
  return ''
})
async function onCpRespond(accept) {
  try {
    await useCompanionStore().respond(cpMeta.value.inviteId, accept)
  } catch (e) { /* 忽略 */ }
}

/* ── 一起听邀请卡片 ── */
const lpMeta = computed(() => {
  try { return JSON.parse(props.message.text || '{}') } catch (e) { return {} }
})
const lpFromMe = computed(() => side.value === 'me')
const lpStatusText = computed(() => {
  const s = lpMeta.value.status
  if (s === 'accepted') return '已一起听'
  if (s === 'rejected') return '已拒绝'
  if (s === 'cancelled') return '已取消'
  if (s === 'ended') return '已结束'
  if (s === 'expired') return '已过期'
  return ''
})
async function onLpRespond(accept) {
  try {
    await useMusicStore().respondListen(accept)
  } catch (e) { /* 忽略 */ }
}

/* ── 一起观影邀请卡片 ── */
const ciMeta = computed(() => {
  try { return JSON.parse(props.message.text || '{}') } catch (e) { return {} }
})
const ciFromMe = computed(() => side.value === 'me')
const ciStatusText = computed(() => {
  const s = ciMeta.value.status
  if (s === 'accepted') return '已一起看'
  if (s === 'rejected') return '已拒绝'
  if (s === 'cancelled') return '已取消'
  if (s === 'ended') return '已结束'
  return ''
})
async function onCiRespond(accept) {
  try {
    const cinema = useCinemaStore()
    if (accept) {
      const r = await cinema.accept(ciMeta.value.inviteId)
      /* 接受成功：带上影片跳转影院，CinemaView 监听到 active 会自动打开播放器 */
      if (r && r.ok) router.push('/cinema')
    } else {
      await cinema.reject(ciMeta.value.inviteId)
    }
  } catch (e) { /* 忽略 */ }
}

/* ── 游戏邀请卡片 ── */
const giMeta = computed(() => {
  try { return JSON.parse(props.message.text || '{}') } catch (e) { return {} }
})
const giFromMe = computed(() => side.value === 'me')
const giStatusText = computed(() => {
  const s = giMeta.value.status
  if (s === 'accepted') return '已开桌'
  if (s === 'rejected') return '已拒绝'
  if (s === 'cancelled') return '已取消'
  if (s === 'ended') return '已结束'
  return ''
})
async function onGiRespond(accept) {
  try {
    const r = await respondGameInvite(giMeta.value.inviteId, accept)
    /* 接受成功：跳转对应游戏对局页，带上对方联系人 */
    if (accept && r && r.ok) {
      router.push(`/game/play/${r.gameKind}?contactId=${r.contactId}`)
    }
  } catch (e) { /* 忽略 */ }
}

/* 群聊里这条消息是谁发的（谁发就显示谁的头像/昵称） */
const author = computed(() => {
  const id = props.message.author_member_id
  if (!id || !props.memberMap) return null
  return props.memberMap[String(id)] || null
})
const showMemberName = computed(() => props.showNames && side.value === 'contact')
const displayName = computed(() => {
  if (side.value === 'me') return props.myName || '我'
  return author.value?.name || props.name || '对方'
})
const displayAvatar = computed(() => {
  if (side.value === 'me') return props.myAvatar
  // 群聊成员：只用该成员自己的头像（空则由 AppAvatar 显示名字首字），不回退群头像
  if (side.value === 'contact' && author.value) return author.value.avatar
  // 单聊：用对方头像
  return props.avatar
})

const bubbleColor = computed(() => {
  if (!props.bubbleStyle) return null
  return side.value === 'me' ? props.bubbleStyle.my : props.bubbleStyle.contact
})
const bubbleRadius = computed(() => props.bubbleStyle?.radius ?? 8)

/* 前景色：仅「近白色」气泡（素白等）配黑字，其余彩色/深色气泡一律白字。
   阈值取高（210），使素白与浅色对方气泡落黑字，所有彩色/墨黑预设落白字 */
function fgOf(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16))
  return 0.299 * r + 0.587 * g + 0.114 * b < 210 ? '#fff' : '#3a3a3a'
}

const bubbleStyleCss = computed(() => {
  const s = {}
  if (bubbleColor.value) {
    s['--bubble-color'] = bubbleColor.value
    const fg = fgOf(bubbleColor.value)
    if (fg) {
      s['color'] = fg
      s['--bubble-fg'] = fg
      // 标签底色随前景反相：白字气泡用白色半透明，黑字气泡用黑色半透明
      s['--q-tag-bg'] = fg === '#fff' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.07)'
    }
  }
  s['--bubble-radius'] = bubbleRadius.value + 'px'
  /* 语音条 / 转文字气泡：用各自侧的气泡底色（自定义气泡色优先） */
  s['--vm-bg'] = bubbleColor.value || (side.value === 'me' ? 'var(--bubble-me)' : 'var(--bubble-contact)')
  s['--vm-fg'] = s['color'] || (side.value === 'me' ? 'var(--bubble-me-fg)' : 'var(--text)')
  // 自定义气泡 CSS（用户在设置页填写的声明式样式，优先级最高，对我/对方气泡统一生效）
  const custom = scaledCustomCss(cssTextToStyle(props.bubbleStyle?.css))
  /* bare 消息（图片/表情包/红包/语音/各类邀请卡片）是无气泡底的独立卡片：
     自定义 CSS 的 background / padding 是内联样式，会盖掉 .bubble.bare 的
     transparent + padding:0，让邀请卡片底下多出一层气泡底 —— bare 时剥离这两类声明 */
  if (bubbleExtraClass.value === 'bare') {
    for (const k of Object.keys(custom)) {
      if (k === 'background' || k === 'backgroundImage' || k === 'backgroundColor' || k.startsWith('padding')) delete custom[k]
    }
  }
  return Object.assign(s, custom)
})

/* 自定义 CSS 里的尺寸声明（font-size / padding）是内联样式，会盖掉 .bubble 类规则里
   calc(… * var(--bubble-scale)) 的缩放计算，导致「气泡大小」滑条对自定义气泡失效。
   这里把 px 数值包一层 calc，让滑条继续按比例缩放（非 px 单位如 em/% 不动，
   em 本身会随字号缩放）。 */
function scaledCustomCss(custom) {
  const out = { ...custom }
  const wrapPx = (v) => {
    const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v).trim())
    return m ? `calc(${m[1]}px * var(--bubble-scale, 1))` : null
  }
  if (out.fontSize) {
    const w = wrapPx(out.fontSize)
    if (w) out.fontSize = w
  }
  if (out.padding) {
    const parts = String(out.padding).trim().split(/\s+/)
    if (parts.length && parts.every((p) => wrapPx(p))) {
      out.padding = parts.map((p) => wrapPx(p)).join(' ')
    }
  }
  return out
}

/* 气泡大小：控制整体气泡缩放（字号、内边距、最大宽度随比例变化），放在根节点供 .bubble 继承 */
const wrapStyle = computed(() => {
  const raw = Number(props.bubbleStyle?.size)
  const size = Number.isFinite(raw) && raw > 0 ? raw : 68
  return { '--bubble-scale': String(size / 68) }
})

/* 语音条 / 转文字块跟随自定义气泡外观：自定义 CSS 的视觉声明（背景/边框/阴影/文字色）
   直接应用到语音条上（与普通气泡一致，不再只是「贴一块预设色」）。
   尺寸类声明（padding / font-size / 宽高）不透传——语音条有自己的缩放规则；
   没有自定义 CSS 时返回 null，回落到 --vm-bg 的预设气泡色。 */
const voiceCustomStyle = computed(() => {
  if (props.message.content_type !== 'voice') return null
  const custom = scaledCustomCss(cssTextToStyle(props.bubbleStyle?.css))
  const out = {}
  for (const k of Object.keys(custom)) {
    if (k === 'padding' || k.startsWith('padding')) continue
    if (k === 'fontSize' || k === 'maxWidth' || k === 'maxHeight' || k === 'width' || k === 'height') continue
    out[k] = custom[k]
  }
  return Object.keys(out).length ? out : null
})

const avatarStyle = computed(() => ({
  borderRadius: props.avatarShape === 'circle' ? '50%' : props.avatarRadius + 'px'
}))

/* 头像相对气泡的垂直位置：底部 / 居中 / 顶部 */
const rowAlignStyle = computed(() => ({
  alignItems: props.avatarPos === 'center' ? 'center' : props.avatarPos === 'top' ? 'flex-start' : 'flex-end'
}))

/* 已读状态：对方回复后，后端会把我的消息标为 read */
const isRead = computed(() => props.message.read_receipt === 'read')

/* 长按气泡（触摸/鼠标按住 500ms）或右键 → 弹出操作菜单；带出坐标供菜单定位 */
let pressTimer = null
let pressX = 0
let pressY = 0
/* 长按弹菜单后的那次松手会触发 click，用它挡住，避免"查看大图"误开 */
let suppressClick = false
function fireMenu() {
  emit('long-press', { message: props.message, x: pressX, y: pressY })
  suppressClick = true
  setTimeout(() => { suppressClick = false }, 400)
  if (navigator.vibrate) navigator.vibrate(30)
}
function onPressDown(e) {
  pressX = e.clientX
  pressY = e.clientY
  clearTimeout(pressTimer)
  pressTimer = setTimeout(fireMenu, 500)
}
function onPressUp() {
  clearTimeout(pressTimer)
}
function onPressMove(e) {
  // 手指/鼠标移动超阈值则视为滚动/滑动，取消长按
  if (Math.abs(e.clientX - pressX) > 10 || Math.abs(e.clientY - pressY) > 10) clearTimeout(pressTimer)
}
function onContextMenu(e) {
  clearTimeout(pressTimer)
  pressX = e.clientX
  pressY = e.clientY
  fireMenu()
}
/* 是否有已读标识（挂气泡下方时给消息留出垂直空间）；
   通话气泡不显示已读标识（其余类型正常显示） */
const hasReceipt = computed(
  () => side.value === 'me' && props.showReadReceipt && props.message.content_type !== 'call'
)

/* 引用摘要展示：图片引用时「[图片]」占位由缩略图取代，只留前缀文字 */
const quoteTextShown = computed(() => {
  if (!props.message.quote_image) return props.message.quote_text
  return String(props.message.quote_text || '').replace('[图片]', '').trim()
})

/* 点击引用摘要 → 通知外层滚动定位到被引用的原消息（原消息不存在时外层忽略） */
function onQuoteTap() {
  if (props.message.quote_id) emit('quote-tap', props.message.quote_id)
}

/* 点击图片 → 通知外层打开全屏查看器（长按弹菜单后的松手 click 已被 suppressClick 挡住） */
function onImageTap() {
  if (suppressClick) return
  if (props.message.asset_path) emit('image-tap', props.message.asset_path)
}

/* 点击红包卡片：长按弹菜单后的松手 click 已被 suppressClick 挡住；普通点击通知外层（领取/查看） */
function onRedpacketTap() {
  if (suppressClick) return
  emit('open-redpacket', props.message)
}
</script>

<style scoped>
.msg-wrap { margin: 8px 0; animation: rise-in 0.3s ease; }
/* 有已读标识（挂气泡下方）的消息，多留出垂直空间防止与下一条重叠 */
.msg-wrap.has-receipt { margin-bottom: 22px; }
.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.msg-row.me { flex-direction: row-reverse; }
.ava-col {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
/* 可拍一拍的头像：给出可点反馈（移动端双击也不会触发页面缩放） */
.ava-pokeable {
  cursor: pointer;
  touch-action: manipulation;
}
.ava-pokeable:active {
  opacity: 0.7;
}
.member-name {
  font-size: 10px;
  color: var(--text-soft);
  max-width: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-stamp {
  text-align: center;
  font-size: 11px;
  color: var(--text-soft);
  margin: 6px 0;
}

/* 气泡 + 已读标识的竖排容器：宽度上限决定气泡最大宽度 */
.bubble-col {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: calc(72% * var(--bubble-scale, 1));
}

/* 气泡：整体随 --bubble-scale 缩放（字号/内边距/最大宽度一起变，不再只调宽度） */
.bubble {
  /* 按内容自适应宽度：带引用的消息里，气泡不再被引用框拉到一样宽 */
  width: fit-content;
  max-width: 100%;
  padding: calc(10px * var(--bubble-scale, 1)) calc(14px * var(--bubble-scale, 1));
  font-size: calc(15px * var(--bubble-scale, 1));
  line-height: 1.45;
  word-break: break-word;
  /* 左对齐（不两端对齐）：justify + inter-character 会把满行 CJK 按字拉开间距，
     导致满行（如首行）字距比末行（text-align-last:left）宽，看起来不一致；
     微信气泡本就是左对齐、右端参差属正常 */
  text-align: left;
  box-shadow: var(--shadow);
  border-radius: var(--bubble-radius, 8px);
}
.bubble-me {
  background: var(--bubble-color, var(--bubble-me));
  color: var(--bubble-me-fg);
  margin-left: auto; /* 气泡缩为内容宽后保持贴右侧（靠近头像一侧） */
}
.bubble-contact {
  background: var(--bubble-color, var(--bubble-contact));
  color: var(--text);
  margin-right: auto;
}

/* 标点挤压：全角标点空白半边用负 margin 挤回（em 随字号自动随 --bubble-scale 缩放）。
   pt-r：墨迹偏左、右侧空白（句号/逗号/闭括号/闭引号）→ 挤右边；
   pt-l：墨迹偏右、左侧空白（开括号/开引号）→ 挤左边 */
.pt-r { margin-right: -0.5em; }
.pt-l { margin-left: -0.5em; }

/* 图片/红包：无气泡底的独立卡片（padding/背景/阴影全部去掉） */
.bubble.bare {
  padding: 0;
  background: transparent;
  box-shadow: none;
}

/* ── 语音消息：微信式 —— 语音条与转写文字是两块独立气泡（参考截图） ── */
.voice-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  /* 不再自带百分比 max-width：嵌套百分比会与气泡的 68% 相乘，
     把转写框钳得只剩半截（短文也被折成两行）。宽度上限交给 .bubble.bare 统一管 */
}
.voice-bar {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 124px;
  padding: calc(10px * var(--bubble-scale, 1)) calc(14px * var(--bubble-scale, 1));
  background: var(--vm-bg, var(--bubble-contact));
  color: var(--vm-fg, var(--text));
  border-radius: var(--bubble-radius, 8px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.vm-icon { display: flex; align-items: center; color: inherit; }
/* 播放中：两道弧依次亮起（参考微信播放动效） */
.vm-icon .vm-a1, .vm-icon .vm-a2 { opacity: 1; }
.vm-icon.playing .vm-a1 { animation: vmArc 0.9s ease-in-out infinite; }
.vm-icon.playing .vm-a2 { animation: vmArc 0.9s ease-in-out 0.3s infinite; }
@keyframes vmArc {
  0%, 100% { opacity: 1; }
  45% { opacity: 0.15; }
}
.vm-dur { font-size: calc(15px * var(--bubble-scale, 1)); line-height: 1; }
/* 转写文字：独立的一块气泡（长按菜单 转文字/收文字 切换）。
   宽度随内容自适应：短文单行（不强制撑满或折行），长文换行且可比语音条长 */
.vm-asr {
  width: max-content;
  max-width: 100%;
  padding: calc(10px * var(--bubble-scale, 1)) calc(14px * var(--bubble-scale, 1));
  background: var(--vm-bg, var(--bubble-contact));
  color: var(--vm-fg, var(--text));
  border-radius: var(--bubble-radius, 8px);
  font-size: calc(15px * var(--bubble-scale, 1));
  line-height: 1.55;
  overflow-wrap: break-word;
  white-space: pre-wrap;
}

/* 图片消息：统一显示框 —— 宽 165 × 高 220（随气泡缩放），object-fit:cover 居中裁剪。
   任何原比例（横图/竖图/方图）都填满同一个框、画面不变形，
   对方抽卡图与相册发送图尺寸完全一致，不再出现「对方的图小一圈/发成方形」。 */
.image-msg {
  display: block;
  width: calc(165px * var(--bubble-scale, 1));
  height: calc(220px * var(--bubble-scale, 1));
  object-fit: cover;
  border-radius: 8px;
  background: var(--bg-soft);
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 表情包消息：参考微信表情包气泡，比相册图片更小一号 */
.image-msg.sticker-msg {
  max-width: 120px;
  max-height: calc(135px * var(--bubble-scale, 1));
}

/* 图片命中测试屏蔽层：盖在图片上的透明层，长按/点击落在它（普通元素）上，
   浏览器就不会再弹原生的「保存图片/查看图片」菜单（-webkit-touch-callout 只对 iOS 有效，
   Android 浏览器拦不住 —— 用这层才能真正根治）；事件仍会冒泡到 .bubble 的长按逻辑 */
.img-wrap {
  position: relative;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
}
.img-cover {
  position: absolute;
  inset: 0;
  z-index: 1;
}

/* 图片字卡带文字时：文字放在图下方 */
.card-text-below { margin-top: 6px; }

/* 红包：参考微信红包封的简约卡片（小尺寸，无气泡底，无 emoji） */
.rp-card {
  width: calc(176px * var(--bubble-scale, 1));
  border-radius: 12px;
  padding: 11px 13px 0;
  background: linear-gradient(165deg, #fdf0e7 0%, #fbdfd2 100%);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.rp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #cf9a86;
}
.rp-label { font-weight: 600; letter-spacing: 1px; }
.rp-amount {
  margin-top: 5px;
  font-size: 20px;
  font-weight: 800;
  color: #c05e45;
  letter-spacing: 0.5px;
  line-height: 1.2;
}
.rp-note {
  margin-top: 2px;
  font-size: 11px;
  color: #c98d75;
  white-space: pre-wrap;
  word-break: break-word;
}
.rp-foot {
  margin-top: 9px;
  padding: 6px 0;
  border-top: 1px solid rgba(192, 94, 69, 0.14);
  font-size: 10.5px;
  color: #bd8b78;
}

/* 通话记录 */
.call-record {
  display: flex;
  align-items: center;
  gap: 7px;
  font-variant-numeric: tabular-nums;
}

/* 提问卡片 */
/* 提问卡片 */
.q-card { display: flex; flex-direction: column; gap: 8px; min-width: 150px; }
/* 陪伴邀请：独立邀请卡片（无气泡底），色调跟随主题色 */
.cp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: calc(228px * var(--bubble-scale, 1));
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 7%, #fff) 0%, color-mix(in srgb, var(--accent) 16%, var(--bg-screen)) 100%);
  border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  box-shadow: var(--shadow);
}
.cpc-head { display: flex; gap: 11px; align-items: center; }
.cpc-icon {
  width: 42px; height: 42px; border-radius: 12px; flex: 0 0 auto;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
}
.cpc-main { flex: 1; min-width: 0; }
.cpc-title { font-size: 13px; font-weight: 700; color: var(--text); line-height: 1.35; }
.cpc-sub { font-size: 11px; color: var(--text-soft); margin-top: 3px; }
.cpc-status { font-size: 11px; color: var(--text-soft); }
/* 待处理：拒绝 / 同意 等宽双按钮 */
.cpc-ops { display: flex; gap: 8px; }
.cpc-btn {
  flex: 1;
  border-radius: 999px;
  font-size: 12px;
  padding: 7px 0;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
}
.cpc-btn.ghost { border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); background: var(--bg-screen); color: var(--text-soft); }
.cpc-btn.primary { border: 1px solid var(--accent); background: var(--accent); color: #fff; }
/* 已有结果：整宽大按钮 */
.cpc-result {
  text-align: center;
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 700;
}
.cpc-result.accepted { background: var(--accent); color: #fff; }
.cpc-result.rejected { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text-soft); }
.cpc-result.expired { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text-soft); opacity: 0.75; }

/* 一起听邀请卡片：复用陪伴卡片风格，封面缩略图替代图标 */
.lp-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: calc(228px * var(--bubble-scale, 1));
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(150deg, color-mix(in srgb, var(--accent) 7%, #fff) 0%, color-mix(in srgb, var(--accent) 16%, var(--bg-screen)) 100%);
  border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent);
  box-shadow: var(--shadow);
}
.lpc-head { display: flex; gap: 11px; align-items: center; }
.lpc-cover {
  width: 42px; height: 42px; border-radius: 12px; flex: 0 0 auto; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.lpc-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.lpc-main { flex: 1; min-width: 0; }
.lpc-title { font-size: 13px; font-weight: 700; color: var(--text); line-height: 1.35; }
.lpc-song { font-size: 11px; color: var(--text-soft); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lpc-status { font-size: 11px; color: var(--text-soft); }
.lpc-ops { display: flex; gap: 8px; }
.lpc-btn {
  flex: 1;
  border-radius: 999px;
  font-size: 12px;
  padding: 7px 0;
  cursor: pointer;
  white-space: nowrap;
  text-align: center;
}
.lpc-btn.ghost { border: 1px solid color-mix(in srgb, var(--accent) 32%, transparent); background: var(--bg-screen); color: var(--text-soft); }
.lpc-btn.primary { border: 1px solid var(--accent); background: var(--accent); color: #fff; }
.lpc-result {
  text-align: center;
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 700;
}
.lpc-result.accepted { background: var(--accent); color: #fff; }
.lpc-result.rejected, .lpc-result.cancelled, .lpc-result.ended { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text-soft); }
.lpc-result.expired { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text-soft); opacity: 0.75; }
.q-tag {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-soft);
}
.q-text { font-size: 15px; font-weight: 600; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.q-opts { display: flex; flex-direction: column; gap: 4px; }
.q-opt { font-size: 13px; color: var(--text-soft); line-height: 1.5; word-break: break-word; }
.q-opt-letter { font-weight: 700; margin-right: 5px; color: var(--text-soft); }
/* 提问卡片：跟随当前气泡前景色自适配（近白气泡→黑字、其余→白字），
   标签底色也随前景反相，避免任何气泡配色下文字看不清 */
.bubble-me .q-tag, .bubble-contact .q-tag {
  background: var(--q-tag-bg, rgba(0, 0, 0, 0.08));
  color: var(--bubble-fg, var(--text-soft));
}
.bubble-me .q-opt, .bubble-contact .q-opt {
  color: var(--bubble-fg, var(--text-soft));
  opacity: 0.95;
}
.bubble-me .q-opt-letter, .bubble-contact .q-opt-letter {
  color: var(--bubble-fg, var(--text-soft));
  opacity: 0.85;
}

/* 引用预览：气泡下方的小摘要框，参考微信（灰底圆角，跟随气泡一侧对齐；含图片缩略图）。
   点击可跳转到被引用的原消息位置 */
.quote-box {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin: 3px 0 0 auto;
  padding: 3px 7px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  box-sizing: border-box;
  width: fit-content;
  cursor: pointer;
}
.quote-box.contact { margin: 3px auto 0 0; }
.quote-thumb {
  width: 22px;
  height: 22px;
  object-fit: cover;
  border-radius: 3px;
  flex: 0 0 auto;
}
.quote-text {
  font-size: 10.5px;
  line-height: 1.35;
  color: var(--text-soft);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

/* 已读标识：绝对定位在气泡正下方、靠气泡右缘，不占行内空间（不影响头像与气泡底部对齐） */
.receipt {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 3px;
  font-size: 10px;
  line-height: 12px;
  color: var(--text-soft);
  display: flex;
  align-items: center;
  white-space: nowrap;
}
.receipt.ticks { color: var(--accent, #c5a47e); }
</style>
