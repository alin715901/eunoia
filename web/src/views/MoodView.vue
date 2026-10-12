<template>
  <div class="md-page">
    <AppHeader title="心情手账" back />

    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="mood" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">{{ year }}.{{ String(month).padStart(2, '0') }} 已记录 {{ monthCount }} 天</span>
          <span class="md-sum-sub">点某一天，记下当天的心情</span>
        </span>
      </div>

      <div class="mo-nav">
        <button class="mo-nav-btn" @click="shift(-1)">‹</button>
        <span class="mo-nav-title">{{ year }}年{{ month }}月</span>
        <button class="mo-nav-btn" @click="shift(1)">›</button>
      </div>

      <div class="mo-grid">
        <span v-for="w in WEEK" :key="w" class="mo-week">{{ w }}</span>
        <button
          v-for="(c, i) in cells"
          :key="i"
          class="mo-cell"
          :class="{ empty: !c.day, today: c.today, has: c.item }"
          :style="c.item ? { background: colorOf(c.item.extra?.mood) + '22' } : null"
          @click="c.day && pick(c)"
        >
          <span class="mo-day">{{ c.day || '' }}</span>
          <span v-if="c.item" class="mo-dot" :style="{ background: colorOf(c.item.extra?.mood) }"></span>
        </button>
      </div>

      <h3 class="mo-sec">本月心情分布</h3>
      <div v-for="m in MOODS" :key="m.name" class="mo-stat">
        <span class="mo-stat-name">{{ m.name }}</span>
        <span class="mo-bar"><i :style="{ width: pct(countOf(m.name)) + '%', background: m.color }"></i></span>
        <span class="mo-stat-num">{{ countOf(m.name) }}</span>
      </div>
      <p v-if="!monthCount" class="md-empty">这个月还没有记录<br /><span class="md-empty-sub">点日历上的任意一天开始</span></p>
    </div>

    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <h3 class="md-sheet-title">{{ curDate }} 的心情</h3>
        <div class="md-fld">
          <span class="md-fld-label">今天感觉如何</span>
          <div class="md-chips">
            <button
              v-for="m in MOODS"
              :key="m.name"
              class="md-chip"
              :class="{ on: form.mood === m.name }"
              :style="form.mood === m.name ? { background: m.color, borderColor: m.color } : null"
              @click="form.mood = m.name"
            >{{ m.name }}</button>
          </div>
        </div>
        <div class="md-fld">
          <span class="md-fld-label">想说点什么（可选）</span>
          <textarea v-model="form.note" class="md-textarea" placeholder="今天的碎碎念…" />
        </div>
        <div class="md-actions">
          <button v-if="curItem" class="md-btn danger" @click="removeCur">清除</button>
          <button class="md-btn ghost" @click="close">取消</button>
          <button class="md-btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const MOODS = [
  { name: '开心', color: '#e5989b' },
  { name: '平静', color: '#8ab17d' },
  { name: '期待', color: '#5fa8a0' },
  { name: '低落', color: '#9b8fc4' },
  { name: '疲惫', color: '#b8b0a8' },
  { name: '生气', color: '#c0576b' }
]
const { items, load, add, update, remove: removeItem } = useItems('mood')
const toast = useNotificationsStore()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const show = ref(false)
const curDate = ref('')
const curItem = ref(null)
const form = reactive({ mood: '开心', note: '' })

/* 月历格子：按周一为第一列 */
const cells = computed(() => {
  const y = year.value
  const m = month.value
  const first = new Date(y, m - 1, 1)
  const startIdx = (first.getDay() + 6) % 7 // 周一=0
  const days = new Date(y, m, 0).getDate()
  const out = []
  for (let i = 0; i < startIdx; i++) out.push({ day: 0 })
  const t = todayStr()
  for (let d = 1; d <= days; d++) {
    const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    out.push({ day: d, date: ds, today: ds === t, item: items.value.find((x) => x.title === ds) || null })
  }
  return out
})
const monthCount = computed(() => cells.value.filter((c) => c.item).length)

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function shift(n) {
  let m = month.value + n
  let y = year.value
  if (m < 1) { m = 12; y -= 1 }
  if (m > 12) { m = 1; y += 1 }
  year.value = y
  month.value = m
}
function colorOf(name) {
  return (MOODS.find((m) => m.name === name) || MOODS[0]).color
}
function countOf(name) {
  return cells.value.filter((c) => c.item?.extra?.mood === name).length
}
function pct(n) {
  if (!monthCount.value) return 0
  return Math.round((n / monthCount.value) * 100)
}
function pick(c) {
  curDate.value = c.date
  curItem.value = c.item
  form.mood = c.item?.extra?.mood || '开心'
  form.note = c.item?.body || ''
  show.value = true
}
function close() {
  show.value = false
}
async function save() {
  const payload = { title: curDate.value, body: form.note.trim(), extra: { mood: form.mood } }
  const id = curItem.value?.id
  close()
  try {
    if (id) await update(id, payload)
    else await add(payload)
    toast.pushToast({ title: '已记录' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function removeCur() {
  const id = curItem.value?.id
  close()
  if (id) await removeItem(id)
}

onMounted(load)
</script>

<style scoped>
.mo-nav { display: flex; align-items: center; justify-content: center; gap: 18px; margin-bottom: 10px; }
.mo-nav-btn { border: none; background: transparent; font-size: 22px; color: var(--text-soft); padding: 0 6px; }
.mo-nav-title { font-size: 15px; font-weight: 600; min-width: 96px; text-align: center; }
.mo-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.mo-week { text-align: center; font-size: 11px; color: var(--text-soft); padding: 4px 0; }
.mo-cell {
  aspect-ratio: 1 / 1; border: none; background: var(--bg-soft); border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  padding: 0; position: relative;
}
.mo-cell.empty { background: transparent; }
.mo-cell.today { outline: 1.5px solid var(--accent); }
.mo-day { font-size: 13px; color: var(--text); }
.mo-dot { width: 6px; height: 6px; border-radius: 50%; }
.mo-sec { font-size: 13px; color: var(--text-soft); margin: 18px 0 10px; font-weight: 500; }
.mo-stat { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.mo-stat-name { font-size: 13px; width: 34px; flex: 0 0 auto; }
.mo-bar { flex: 1; height: 8px; border-radius: 4px; background: var(--bg-soft); overflow: hidden; }
.mo-bar > i { display: block; height: 100%; border-radius: 4px; }
.mo-stat-num { font-size: 12px; color: var(--text-soft); width: 20px; text-align: right; }
</style>
