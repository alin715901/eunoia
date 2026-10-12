<template>
  <transition name="ml-fade">
    <div v-if="store.showLyrics && store.current" class="ml">
      <!-- 模糊封面背景 -->
      <div class="ml-bg" :style="bgStyle"></div>
      <div class="ml-shade"></div>

      <!-- 顶部：下拉关闭 + 歌名 + ⋯邀请 -->
      <div class="ml-top">
        <button class="ml-close" @click="store.showLyrics = false" aria-label="收起"><AppIcon name="chevron-down" :size="24" /></button>
        <div class="ml-meta">
          <div class="ml-title">{{ store.current.title }}</div>
          <div class="ml-artist">{{ store.current.artist || '' }}</div>
        </div>
        <button class="ml-more" @click="openPicker" aria-label="邀请一起听"><AppIcon name="more" :size="22" /></button>
      </div>

      <!-- 一起听状态条：仅邀请成功并进行中才显示（一人一只耳机） -->
      <div v-if="store.listenSession" class="ml-together">
        <div class="ml-tg-row">
          <AppAvatar class="ml-av me" :name="'我'" :avatar="store.listenSession.myAvatar" :size="72" />
          <AppAvatar class="ml-av you" :name="store.listenSession.contactName" :avatar="store.listenSession.contactAvatar" :size="72" />
          <!-- 耳机：左耳塞在左头像左侧、右耳塞在右头像右侧；线似括号，向下渐隐 -->
          <svg class="ml-cable" viewBox="0 0 176 132" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <linearGradient id="mlCableFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#fff" stop-opacity="0.95" />
                <stop offset="0.55" stop-color="#fff" stop-opacity="0.62" />
                <stop offset="1" stop-color="#fff" stop-opacity="0" />
              </linearGradient>
            </defs>
            <path class="ml-line" stroke="url(#mlCableFade)" d="M14 44 C 4 62, 4 88, 16 104" />
            <path class="ml-line" stroke="url(#mlCableFade)" d="M162 44 C 172 62, 172 88, 160 104" />
            <circle class="ml-bud" cx="13" cy="38" r="4.5" />
            <circle class="ml-bud" cx="163" cy="38" r="4.5" />
          </svg>
        </div>
        <p class="ml-tg-tip">和 {{ store.listenSession.contactName }} 一起听</p>
      </div>
      <div v-else-if="store.pendingListen" class="ml-waiting">
        <div class="ml-wait-dot"></div>
        等待 <b>{{ store.pendingListen.contactName }}</b> 接受一起听…
        <button class="ml-cancel" @click="store.cancelListen()">取消</button>
      </div>

      <!-- 中部：滚动歌词 -->
      <div ref="scrollEl" class="ml-lyric">
        <p v-if="!lines.length" class="ml-empty">暂无歌词<br /><span>仅网易云导入的歌曲支持自动识别歌词</span></p>
        <template v-else>
          <p
            v-for="(l, i) in lines"
            :key="i"
            ref="lineEls"
            class="ml-line"
            :class="{ on: i === active }"
          >{{ l.text }}</p>
        </template>
      </div>

      <!-- 底部：进度 + 控制 -->
      <div class="ml-bottom">
        <div
          class="ml-prog"
          :class="{ dragging: dragPct >= 0 }"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <div class="ml-prog-on" :style="{ width: shownPct + '%' }"></div>
        </div>
        <div class="ml-time">
          <span>{{ fmt(currentTime) }}</span>
          <span>{{ fmt(duration) }}</span>
        </div>
        <div class="ml-ctrl">
          <button class="ml-btn" @click="store.prev()" aria-label="上一首"><AppIcon name="prev" :size="22" /></button>
          <button class="ml-btn main" @click="store.toggle()" aria-label="播放暂停"><AppIcon :name="store.playing ? 'pause' : 'play'" :size="34" /></button>
          <button class="ml-btn" @click="store.next()" aria-label="下一首"><AppIcon name="next" :size="22" /></button>
        </div>
      </div>

      <!-- 被邀请弹窗 -->
      <div v-if="store.incomingListen" class="ml-inv-mask" @click.self="ignoreInvite">
        <div class="ml-inv">
          <AppAvatar :name="store.incomingListen.contactName" :avatar="store.incomingListen.contactAvatar" :size="52" />
          <div class="ml-inv-name">{{ store.incomingListen.contactName }} 邀请你一起听歌</div>
          <div class="ml-inv-song" v-if="store.incomingListen.songTitle">《{{ store.incomingListen.songTitle }}》<span v-if="store.incomingListen.songArtist"> · {{ store.incomingListen.songArtist }}</span></div>
          <div class="ml-inv-ops">
            <button class="ml-inv-btn ghost" @click="store.respondListen(false)">拒绝</button>
            <button class="ml-inv-btn primary" @click="store.respondListen(true)">一起听</button>
          </div>
        </div>
      </div>

      <!-- 进行中再点⋯：先结束当前一起听，才能邀请别人 -->
      <div v-if="showEnd" class="ml-pick-mask" @click.self="showEnd = false">
        <div class="ml-pick ml-end">
          <div class="ml-pick-head">正在和 {{ store.listenSession?.contactName }} 一起听</div>
          <button class="ml-end-btn danger" @click="doEndSession">结束一起听</button>
          <button class="ml-pick-close" @click="showEnd = false">取消</button>
        </div>
      </div>

      <!-- 邀请联系人选择 -->
      <div v-if="showPicker" class="ml-pick-mask" @click.self="showPicker = false">
        <div class="ml-pick">
          <div class="ml-pick-head">邀请谁一起听《{{ store.current.title }}》</div>
          <div class="ml-pick-list">
            <button
              v-for="c in contactList"
              :key="c.id"
              class="ml-pick-item"
              :disabled="busy"
              @click="pick(c)"
            >
              <AppAvatar :name="c.name" :avatar="avatarOf(c)" :size="38" />
              <span class="ml-pick-name">{{ c.name }}</span>
            </button>
            <p v-if="!contactList.length" class="ml-pick-empty">还没有联系人</p>
          </div>
          <button class="ml-pick-close" @click="showPicker = false">取消</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { useMusicStore } from '@/stores/music'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSeekDrag } from '@/composables/useSeekDrag'

const store = useMusicStore()
const contacts = useContactsStore()
const scrollEl = ref(null)
const lineEls = ref([])

const showPicker = ref(false)
const showEnd = ref(false)
const busy = ref(false)

const contactList = computed(() => (contacts.list || []).filter((c) => c.kind !== 'group'))
/* 头像以联系人设置/聊天里实际显示的为准（人物卡头像开启同步到联系人时用人物卡头像） */
function avatarOf(c) {
  return c.chat_avatar || c.avatar || ''
}

const lines = computed(() => store.lyricLines)
const duration = computed(() => store.duration || 0)
const currentTime = computed(() => store.currentTime || 0)
const progressPct = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))

/* 进度条按住拖动跳转：拖动中展示拖动位置，未拖动展示真实进度 */
const { dragPct, onDown, onMove, onUp } = useSeekDrag(duration, (frac) => store.seek(frac))
const shownPct = computed(() => (dragPct.value >= 0 ? dragPct.value * 100 : progressPct.value))

const active = computed(() => {
  const t = currentTime.value
  let idx = -1
  for (let i = 0; i < lines.value.length; i++) {
    if (lines.value[i].t <= t + 0.15) idx = i
    else break
  }
  return idx
})

const bgStyle = computed(() => {
  const c = store.current?.cover
  return c ? { backgroundImage: `url(${c})` } : {}
})

function fmt(sec) {
  if (!sec) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function scrollToActive() {
  const el = scrollEl.value
  const arr = lineEls.value
  if (!el || !arr || !arr[active.value]) return
  const target = arr[active.value]
  const top = target.offsetTop - el.clientHeight / 2 + target.clientHeight / 2
  el.scrollTo({ top, behavior: 'smooth' })
}
watch(active, () => nextTick(scrollToActive))
watch(() => store.showLyrics, (v) => {
  if (v) {
    store.fetchLyric()
    nextTick(() => { scrollEl.value && (scrollEl.value.scrollTop = 0); scrollToActive() })
  }
})

function openPicker() {
  /* 正在一起听：先结束这一轮，才能再邀请别人 */
  if (store.listenSession) { showEnd.value = true; return }
  if (!contacts.list || !contacts.list.length) contacts.load().catch(() => {})
  showPicker.value = true
}
async function doEndSession() {
  await store.endListenSession()
  showEnd.value = false
  const toast = useNotificationsStore()
  toast.pushToast({ title: '已结束一起听', text: '可以再邀请别的联系人了' })
}
async function pick(c) {
  if (busy.value) return
  busy.value = true
  try {
    await store.inviteListen(c)
    showPicker.value = false
  } catch (e) { /* ignore */ }
  busy.value = false
}
function ignoreInvite() { /* 点击遮罩不自动处理，等待用户选择 */ }

onMounted(() => {
  if (store.showLyrics) store.fetchLyric()
})
</script>

<style scoped>
.ml {
  position: fixed; inset: 0; z-index: 200;
  display: flex; flex-direction: column;
  color: #fff; overflow: hidden;
}
.ml-bg {
  position: absolute; inset: -40px;
  background-size: cover; background-position: center;
  filter: blur(40px) brightness(0.55); transform: scale(1.2);
}
.ml-shade {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.6));
}

.ml-top {
  position: relative; z-index: 1; display: flex; align-items: center; gap: 8px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 6px;
}
.ml-close { padding: 6px; background: transparent; border: none; color: #fff; opacity: 0.92; }
.ml-more { padding: 6px; background: transparent; border: none; color: #fff; opacity: 0.92; }
.ml-meta { flex: 1; min-width: 0; text-align: center; }
.ml-title { font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ml-artist { font-size: 12px; opacity: 0.7; margin-top: 2px; }

/* 一起听：双人头像（放大）+ 耳机线相连 */
.ml-together {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 0;
  padding: 12px 16px 6px;
}
.ml-tg-row {
  position: relative; display: flex; align-items: flex-start; justify-content: center;
  height: 74px; margin-bottom: 40px;   /* 给头像下方垂下的耳机线留位置 */
}
.ml-av {
  flex: 0 0 auto; position: relative; z-index: 2;
  border-radius: 50%; overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  border: 2px solid rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.12);
}
/* 两个头像相切（紧贴但不互相压叠） */
.ml-av.you { margin-left: 0; }
/* 耳机线：覆盖在头像之上，画的是左右两侧的外置耳塞 + 括号形渐隐线 */
/* 耳机线在头像下层（被子两个头像压住一段），只有外露部分可见 */
.ml-cable {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 176px; height: 132px; z-index: 1; pointer-events: none; overflow: visible;
}
.ml-line {
  fill: none; stroke-width: 2;
  stroke-linecap: round; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));
}
.ml-bud {
  fill: #fff; stroke: rgba(255, 255, 255, 0.95); stroke-width: 1;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.4));
}
.ml-tg-tip { margin: 0; font-size: 12px; color: rgba(255, 255, 255, 0.82); letter-spacing: 0.4px; }

/* 等待对方接受 */
.ml-waiting {
  position: relative; z-index: 1; text-align: center;
  font-size: 13px; opacity: 0.85; padding: 12px 16px 4px;
}
.ml-waiting b { color: #fff; }
.ml-wait-dot {
  display: inline-block; width: 7px; height: 7px; border-radius: 50%;
  background: #fff; margin-right: 6px; vertical-align: middle;
  animation: mlPulse 1.1s ease-in-out infinite;
}
@keyframes mlPulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
.ml-cancel {
  margin-left: 8px; background: rgba(255,255,255,0.16); border: none;
  color: #fff; font-size: 12px; padding: 3px 10px; border-radius: 999px;
}

.ml-lyric {
  position: relative; z-index: 1; flex: 1; overflow-y: auto;
  padding: 26vh 26px 16vh; scroll-behavior: smooth;
  scrollbar-width: none; -ms-overflow-style: none;
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 18%, #000 78%, transparent);
          mask-image: linear-gradient(180deg, transparent, #000 18%, #000 78%, transparent);
}
.ml-lyric::-webkit-scrollbar { display: none; width: 0; height: 0; }
.ml-line {
  font-size: 15px; line-height: 1.5; margin: 14px 0; padding: 2px 0;
  text-align: center; color: rgba(255,255,255,0.5);
  transition: color 0.25s ease, font-size 0.25s ease, transform 0.25s ease;
}
.ml-line.on {
  color: #fff; font-size: 18px; font-weight: 700;
  transform: scale(1.04); text-shadow: 0 2px 12px rgba(0,0,0,0.4);
}
.ml-empty {
  text-align: center; font-size: 15px; color: rgba(255,255,255,0.6); margin-top: 30vh;
}
.ml-empty span { font-size: 12px; opacity: 0.6; }

.ml-bottom {
  position: relative; z-index: 1;
  padding: 8px 26px calc(22px + env(safe-area-inset-bottom, 0px));
}
.ml-prog {
  height: 3px; border-radius: 3px; background: rgba(255,255,255,0.22);
  position: relative;
  touch-action: none; /* 拖动进度条时禁止页面滚动/缩放手势 */
  cursor: pointer;
}
/* 透明热区：细条上下各扩 14px，手指粗也能按住拖动 */
.ml-prog::before {
  content: ''; position: absolute; left: 0; right: 0; top: -14px; bottom: -14px;
}
.ml-prog-on {
  height: 100%; border-radius: 3px; background: #fff;
}
/* 拖动中：条加粗 + 末端出现圆点把手 */
.ml-prog.dragging { height: 5px; }
.ml-prog.dragging .ml-prog-on::after {
  content: ''; position: absolute; right: -5px; top: 50%; transform: translateY(-50%);
  width: 11px; height: 11px; border-radius: 50%; background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.65);
}
.ml-time {
  display: flex; justify-content: space-between; margin: 8px 0 14px;
  font-size: 11px; color: rgba(255,255,255,0.7); font-variant-numeric: tabular-nums;
}
.ml-ctrl { display: flex; align-items: center; justify-content: center; gap: 40px; }
.ml-btn { background: transparent; border: none; color: #fff; display: flex; }
.ml-btn.main { transform: scale(1); }
.ml-btn:active { transform: scale(0.9); }

/* 被邀请弹窗 */
.ml-inv-mask {
  position: absolute; inset: 0; z-index: 5; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
}
.ml-inv {
  width: 78%; max-width: 320px; background: rgba(28,28,32,0.92); border-radius: 20px;
  padding: 24px 20px 18px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
}
.ml-inv-name { font-size: 15px; font-weight: 700; margin: 12px 0 4px; }
.ml-inv-song { font-size: 13px; opacity: 0.78; margin-bottom: 18px; }
.ml-inv-ops { display: flex; gap: 12px; }
.ml-inv-btn {
  flex: 1; padding: 11px 0; border-radius: 12px; font-size: 15px; border: none; font-weight: 600;
}
.ml-inv-btn.ghost { background: rgba(255,255,255,0.12); color: #fff; }
.ml-inv-btn.primary { background: #fff; color: #1c1c20; }

/* 邀请联系人选择 */
.ml-pick-mask {
  position: absolute; inset: 0; z-index: 6; display: flex; align-items: flex-end; justify-content: center;
  background: rgba(0,0,0,0.5);
}
.ml-pick {
  width: 100%; background: rgba(30,30,34,0.96); border-radius: 18px 18px 0 0;
  padding: 16px 16px calc(16px + env(safe-area-inset-bottom, 0px)); max-height: 70%;
  display: flex; flex-direction: column;
}
.ml-pick-head { font-size: 14px; color: rgba(255,255,255,0.7); text-align: center; margin-bottom: 12px; }
.ml-pick-list { overflow-y: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 8px; }
.ml-pick-item {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: transparent; border: none; color: #fff; padding: 4px;
}
.ml-pick-name { font-size: 12px; opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 64px; }
.ml-pick-item:disabled { opacity: 0.5; }
.ml-pick-empty { grid-column: 1 / -1; text-align: center; color: rgba(255,255,255,0.5); font-size: 13px; padding: 20px 0; }
.ml-pick-close {
  margin-top: 14px; background: rgba(255,255,255,0.12); border: none; color: #fff;
  font-size: 15px; padding: 12px 0; border-radius: 12px;
}
/* 结束一起听确认 */
.ml-end { padding-top: 20px; }
.ml-end-btn {
  font-size: 15px; padding: 13px 0; border-radius: 12px; border: none;
  background: rgba(255,255,255,0.12); color: #fff; font-weight: 600;
}
.ml-end-btn.danger { color: #ff6b7f; }

.ml-fade-enter-active, .ml-fade-leave-active { transition: opacity 0.25s ease; }
.ml-fade-enter-from, .ml-fade-leave-to { opacity: 0; }
</style>
