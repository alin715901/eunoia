<template>
  <div class="chat-input">
    <!-- 待发送引用栏：引用某条消息后，输入框上方显示其摘要（含图片缩略图，参考微信） -->
    <div v-if="quote" class="quote-bar">
      <div class="qb-inner">
        <div v-if="quoteTextShown" class="qb-text">{{ quoteTextShown }}</div>
        <img v-if="quote.image" :src="quote.image" class="qb-thumb" />
      </div>
      <button class="qb-cancel" @click.stop="$emit('cancel-quote')" aria-label="取消引用">✕</button>
    </div>

    <button class="ci-btn ci-plus" @click.stop="plusOpen = !plusOpen" aria-label="更多功能">
      <AppIcon name="plus" :size="22" />
    </button>

    <textarea
      ref="ta"
      v-model="text"
      class="ci-field"
      rows="1"
      @keydown.enter.exact.prevent="submit"
      @input="autoGrow"
    ></textarea>

    <button class="ci-btn" @click.stop="toggleEmoji" aria-label="表情包">
      <AppIcon name="emoji" :size="22" />
    </button>
    <!-- 省略号：让对方继续说（点击后对方先"正在输入"，随后再回一条） -->
    <button class="ci-btn" @click.stop="$emit('continue-talk')" aria-label="让他继续说">
      <AppIcon name="more" :size="22" />
    </button>
    <button class="btn btn-primary ci-send" :disabled="!text.trim()" @click="submit">发送</button>

    <!-- 表情包面板：首栏「通用」= 通用字卡库，其余每栏一个联系人（群聊按成员分设），都是图片字卡 -->
    <div v-if="emojiOpen" class="emoji-panel" @click.stop>
      <div class="ep-tabs">
        <button
          v-for="t in stickerTabs"
          :key="t.key"
          class="ep-tab"
          :class="{ on: tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </div>
      <div class="ep-grid ep-stickers">
        <button v-for="s in currentStickers" :key="s.id || s.asset_path" class="ep-sticker" @click="sendSticker(s)">
          <img :src="s.asset_path" alt="" loading="lazy" />
        </button>
        <div v-if="!currentStickers.length" class="ep-empty">
          还没有「{{ tabLabel }}」表情包
          <span v-if="tab === 'general'">去「字卡库」的通用库里添加吧</span>
          <span v-else>去「字卡库」给联系人添加吧</span>
        </div>
      </div>
    </div>
    <!-- + 扩展面板：微信式从底部弹出，一行四个功能（马卡龙配色圆角卡片） -->
    <transition name="sheet">
      <div v-if="plusOpen" class="plus-sheet" @click.stop>
        <button v-for="f in features" :key="f.key" class="pf" @click="pick(f)">
          <span class="pf-icon">
            <AppIcon :name="f.icon" :size="26" color="var(--accent)" />
          </span>
          <span class="pf-label">{{ f.label }}</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

const emit = defineEmits(['send', 'cancel-quote', 'feature', 'continue-talk', 'send-sticker', 'request-stickers'])

const props = defineProps({
  // 待发送引用：{ id, text, image, sender }
  quote: { type: Object, default: null },
  // 表情包分栏：[{key:'general', label:'通用', list:[...]}, {key:'c1', label:'成员名', list:[...]}]
  stickerTabs: { type: Array, default: () => [] }
})

const text = ref('')
const ta = ref(null)
const plusOpen = ref(false)
const emojiOpen = ref(false)
const tab = ref('general') // 当前表情包分栏 key

/* 引用栏展示：图片引用时「[图片]」占位由缩略图取代，只留前缀文字 */
const quoteTextShown = computed(() => {
  if (!props.quote) return ''
  if (!props.quote.image) return props.quote.text || ''
  return String(props.quote.text || '').replace('[图片]', '').trim()
})

/* 当前分栏的表情包列表与该栏名称（数据没回来时容错到首栏） */
const activeTab = computed(() => {
  const list = props.stickerTabs
  if (!list.length) return null
  return list.find((t) => t.key === tab.value) || list[0]
})
const currentStickers = computed(() => activeTab.value?.list || [])
const tabLabel = computed(() => activeTab.value?.label || '通用')

/* 一行四个功能（跟随全局主题：中性圆角卡片 + 强调色图标） */
const features = [
  { key: 'redpacket', label: '红包', icon: 'redpacket' },
  { key: 'album', label: '相册', icon: 'image' },
  { key: 'call', label: '通话', icon: 'phone' },
  { key: 'question', label: '提问', icon: 'question' }
]

function closePops() {
  plusOpen.value = false
  emojiOpen.value = false
}
/* 选完功能后自动收回面板 */
function pick(f) {
  plusOpen.value = false
  emit('feature', f.key)
}
/* 打开表情包面板：顺带让父组件刷新通用/专属表情（字卡库可能有新增） */
function toggleEmoji() {
  emojiOpen.value = !emojiOpen.value
  if (emojiOpen.value) emit('request-stickers')
}
/* 专属表情包：点击即发送（微信表情包逻辑），发送后收起面板 */
function sendSticker(s) {
  emojiOpen.value = false
  emit('send-sticker', s.asset_path)
}
function submit() {
  const val = text.value.trim()
  if (!val) return
  emit('send', val)
  text.value = ''
  if (ta.value) ta.value.value = ''
  autoGrow() // 发完回到一行
}
/* 输入框高度：一行起步，最多两行（再多就内部滚动，滑块已隐藏）
   数值 = 行高 22 × 行数 + 上下 padding 16 + 上下边框 2 */
const INPUT_ONE_LINE = 40
const INPUT_TWO_LINES = 62
function autoGrow() {
  if (!ta.value) return
  ta.value.style.height = 'auto'
  const want = ta.value.scrollHeight + 2 // scrollHeight 不含边框，补 2px
  ta.value.style.height = Math.min(Math.max(want, INPUT_ONE_LINE), INPUT_TWO_LINES) + 'px'
}
function onDocClick() { closePops() }
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.chat-input {
  flex: 0 0 auto;
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
}
.ci-btn {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  width: 34px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ci-btn:active { color: var(--accent); }
.ci-field {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 8px 12px;
  font-size: 15px;
  line-height: 22px;
  /* 高度固定：一行 40px，最多两行 62px（超出内部滚动） */
  height: 40px;
  max-height: 62px;
  resize: none;
  outline: none;
  background: var(--bg-soft);
  overflow-y: auto;
  /* 不显示滚动条滑块（没输入/没超出时更是完全看不到） */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.ci-field::-webkit-scrollbar { width: 0; height: 0; display: none; }
.ci-field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(28, 28, 30, 0.08); }
/* 发送按钮：小巧 + 在输入行里垂直居中（原来是底对齐，看着偏下） */
.ci-send {
  flex: 0 0 auto;
  align-self: center;
  height: 32px;
  min-width: 52px;
  padding: 0 13px;
  font-size: 13px;
  line-height: 1;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 待发送引用栏（参考微信：输入框上方一条引用摘要） */
.quote-bar {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  padding: 8px 12px;
  background: var(--bg-soft);
  border-top: 1px solid var(--border);
}
.qb-inner {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.qb-thumb {
  width: 34px;
  height: 34px;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 auto;
}
.qb-text {
  font-size: 13px;
  color: var(--text-soft);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
.qb-cancel {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 16px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.qb-cancel:active { background: rgba(0, 0, 0, 0.06); }

/* 表情包面板：微信式，从输入框上方整块展开 */
.emoji-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 40;
  height: 264px;
  display: flex;
  flex-direction: column;
  background: var(--bg-screen, #f7f7f8);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.06);
  animation: sheet-up 0.18s ease;
}
@keyframes sheet-up {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
/* 分栏：群聊成员多时可横向滑动 */
.ep-tabs {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 14px 4px;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.ep-tabs::-webkit-scrollbar { display: none; }
.ep-tab {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-soft);
  padding: 4px 2px;
  border-bottom: 2px solid transparent;
}
.ep-tab.on { color: var(--text); border-bottom-color: var(--accent); }
.ep-grid {
  flex: 1 1 auto;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 2px;
  padding: 6px 10px 12px;
}
/* 通用/专属：图片表情包网格，点击即发送 */
.ep-stickers { grid-template-columns: repeat(4, 1fr); gap: 10px; }
.ep-sticker { border: none; background: transparent; padding: 0; border-radius: 10px; transition: transform 0.12s ease; }
.ep-sticker img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
  background: var(--bg-soft);
}
.ep-sticker:active { transform: scale(0.94); }
.ep-empty {
  grid-column: 1 / -1;
  margin: auto;
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 0 24px;
}
.menu-pop { right: 8px; display: flex; flex-direction: column; min-width: 150px; }

/* + 扩展面板：微信式从底部弹出，一行四个功能卡片 */
.plus-sheet {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  justify-content: space-around;
  gap: 6px;
  padding: 26px 18px 30px;
  background: var(--bg-screen, #f7f7f8);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.06);
}
.pf {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  padding: 0;
}
.pf-icon {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  transition: transform 0.15s ease;
}
.pf:active .pf-icon { transform: scale(0.92); }
.pf-label { font-size: 12px; color: var(--text-soft); }

/* 底部弹出动画 */
.sheet-enter-active, .sheet-leave-active { transition: transform 0.2s ease, opacity 0.2s ease; }
.sheet-enter-from, .sheet-leave-to { transform: translateY(24px); opacity: 0; }
</style>
