<template>
  <!-- ═══ 瓦片模式（图片/表情包板块）：缩略图网格，参考微信表情管理 ═══ -->
  <div
    v-if="media"
    class="card-item ci-tile"
    :class="{ blocked: card.blocked, selectable, selected }"
    @click="selectable ? $emit('select', card) : $emit('open', card)"
  >
    <span v-if="selectable" class="ci-check" :class="{ on: selected }">
      <AppIcon v-if="selected" name="check" :size="13" color="#fff" />
    </span>
    <img v-if="card.asset_path" :src="card.asset_path" class="ci-img-full" alt="" loading="lazy" draggable="false" />
    <div v-else class="ci-tile-text" :class="{ 'ci-line': card.blocked }">{{ card.content || '[空内容]' }}</div>
    <i v-if="card.blocked" class="ci-tile-btag">已屏蔽</i>
  </div>

  <!-- ═══ 行模式（主字卡 / emoji / 颜文字 / 语音等文字类板块） ═══ -->
  <div
    v-else
    class="card-item panel"
    :class="{ blocked: card.blocked, selectable, selected }"
    @click="selectable && $emit('select', card)"
  >
    <span v-if="selectable" class="ci-check" :class="{ on: selected }">
      <AppIcon v-if="selected" name="check" :size="13" color="#fff" />
    </span>
    <div class="ci-body">
      <!-- 语音字卡：左侧播放/暂停按钮 + 时长标注 -->
      <template v-if="isVoice">
        <button class="ci-play" :class="{ playing }" @click.stop="togglePlay">
          <AppIcon :name="playing ? 'pause' : 'play'" :size="18" color="#fff" />
        </button>
        <div class="ci-voice-txt">
          <div v-if="voiceText" class="ci-content">{{ voiceText }}</div>
          <div v-else class="ci-content ci-empty">（无文字）</div>
          <span v-if="durText" class="ci-dur">{{ durText }}</span>
        </div>      </template>
      <template v-else>
        <img v-if="card.asset_path" :src="card.asset_path" class="ci-img" alt="" loading="lazy" draggable="false" />
        <div v-if="card.content" class="ci-content">{{ card.content }}</div>
        <div v-if="!card.content && !card.asset_path" class="ci-content ci-empty">[空内容]</div>
      </template>
    </div>
    <div v-if="!selectable" class="ci-actions">
      <button class="ci-ico" :title="card.blocked ? '解除屏蔽' : '屏蔽'" @click.stop="$emit('toggleBlock', card)">
        <AppIcon :name="card.blocked ? 'block' : 'eyeOff'" :size="18" />
      </button>
      <button class="ci-ico" title="分组" @click.stop="$emit('move', card)">
        <AppIcon name="tag" :size="18" />
      </button>
      <button class="ci-ico" title="修改" @click.stop="$emit('edit', card)">
        <AppIcon name="edit" :size="18" />
      </button>
      <button class="ci-ico ci-danger" title="删除" @click.stop="$emit('remove', card)">
        <AppIcon name="trash" :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  card: { type: Object, required: true },
  /* 多选模式：点击整卡切换选中，右侧操作按钮隐藏 */
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  /* 瓦片模式：图片/表情包板块，一行三列缩略图；点击（非多选态）触发 open 弹操作面板 */
  media: { type: Boolean, default: false }
})
defineEmits(['toggleBlock', 'move', 'edit', 'remove', 'select', 'open'])

/* ── 语音字卡：播放/暂停 + 时长识别 ── */
const isVoice = computed(() => props.card.category === 'voice')
/* 文字超过六个字 → 前六字 + …… */
const voiceText = computed(() => {
  const t = String(props.card.content || '').trim()
  return t.length > 6 ? t.slice(0, 6) + '……' : t
})
const playing = ref(false)
let audio = null

/* 时长：优先用库里存的 duration（秒），没有则懒加载音频元数据识别一次 */
const metaDur = ref(0)
const durText = computed(() => {
  const d = Number(props.card.duration) || metaDur.value
  if (!d || !Number.isFinite(d)) return ''
  const m = Math.floor(d / 60)
  const s = Math.round(d % 60)
  return `${m}:${String(s).padStart(2, '0')}`
})
/* 库里没存时长时，就地解码一次音频补显示（正式回写由字卡库页面统一做） */
if (typeof window !== 'undefined' && isVoice.value && props.card.asset_path) {
  fetch(props.card.asset_path)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('fetch fail'))))
    .then((buf) => {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      ctx.decodeAudioData(
        buf,
        (audio) => {
          if (Number.isFinite(audio.duration)) metaDur.value = audio.duration
          ctx.close?.()
        },
        () => ctx.close?.()
      )
    })
    .catch(() => {})
}

/* 全局单实例播放：同一时间只有一条语音在响 */
const __audioState = (window.__zikaVoice = window.__zikaVoice || { el: null, key: '' })
function stopPlayback() {
  if (__audioState.el) {
    __audioState.el.pause()
    __audioState.el = null
    __audioState.key = ''
  }
  playing.value = false
}
function togglePlay() {
  if (playing.value) {
    stopPlayback()
    return
  }
  stopPlayback()
  const a = new Audio(props.card.asset_path)
  __audioState.el = a
  __audioState.key = String(props.card.id)
  a.onended = () => { if (__audioState.el === a) stopPlayback() }
  a.onpause = () => { if (__audioState.el === a) stopPlayback() }
  a.play().catch(() => stopPlayback())
  playing.value = true
}
onBeforeUnmount(() => {
  if (__audioState.key === String(props.card.id)) stopPlayback()
})
</script>

<style scoped>
.card-item {
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  /* 防止卡片本身被长内容撑出容器，导致整列左右滑动 */
  min-width: 0;
  max-width: 100%;
  animation: rise-in 0.3s ease;
}
/* 屏蔽态：灰字 + 删除线（参考微信屏蔽样式） */
.card-item.blocked { opacity: 0.55; }
.card-item.blocked .ci-content { color: var(--text-soft); text-decoration: line-through; }
.card-item.blocked .ci-img { filter: grayscale(1); opacity: 0.6; }
/* 多选态 */
.card-item.selectable { cursor: pointer; }
.card-item.selected { border-color: var(--accent); box-shadow: 0 0 0 1.5px var(--accent) inset; }
.ci-check {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-screen);
}
.ci-check.on { background: var(--accent); border-color: var(--accent); }
.ci-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
/* 图片字卡（表情包）缩略图 */
.ci-img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  flex: 0 0 auto;
}
.ci-content {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ci-empty { color: var(--text-soft); }
/* ── 语音字卡 ── */
.ci-play {
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.ci-play:active { opacity: 0.85; }
.ci-play.playing { background: #3a9e5f; }
/* 语音文字：单行省略；时长在文字下方小字标注 */
.ci-voice-txt {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
.ci-voice-txt .ci-content {
  width: 100%;
  white-space: nowrap;
  display: block;
}
.ci-dur {
  font-size: 11px;
  line-height: 1.3;
  color: var(--text-soft);
}
.ci-dur {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-soft);
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
}
.ci-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.ci-ico {
  border: none;
  background: transparent;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  padding: 0;
}
.ci-ico:active { background: var(--bg-soft); }
.ci-danger { color: #b9b9b9; }
.ci-danger:active { color: #e5484d; background: rgba(229, 72, 77, 0.08); }

/* ═══ 瓦片模式（缩略图网格） ═══ */
.ci-tile {
  position: relative;
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-soft);
  border: 1px solid var(--border);
}
/* 正方形瓦片：用 padding-top 撑高，不用 aspect-ratio ——
   部分安卓 WebView（旧 Chromium 内核）对 grid 内 aspect-ratio 的行高计算有偏差，
   会让瓦片塌成图片原始高度、行线错位、底部图片叠在一起；padding-top 所有内核一致 */
.ci-tile::before {
  content: '';
  display: block;
  padding-top: 100%;
}
.ci-tile.selectable { cursor: pointer; }
.ci-tile.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
.ci-img-full {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ci-tile.blocked .ci-img-full { filter: grayscale(1); opacity: 0.6; }
.ci-tile-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  text-align: center;
  overflow: hidden;
  word-break: break-all;
}
.ci-line { text-decoration: line-through; color: var(--text-soft); }
.ci-tile .ci-check {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
.ci-tile-btag {
  position: absolute;
  left: 6px;
  bottom: 6px;
  z-index: 2;
  font-style: normal;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 4px;
  padding: 1px 5px;
}
</style>
