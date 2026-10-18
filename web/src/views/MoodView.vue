<template>
  <div class="md-page">
    <AppHeader title="心情手账" back />

    <div class="md-body">
      <!-- 当前互动的联系人（全局可能绑多个梦角，记录按人分开） -->
      <div class="mo-contact">
        <span class="mo-contact-label">当前互动</span>
        <div class="mo-select">
          <button class="mo-select-btn" type="button" @click="contactOpen = !contactOpen">
            <AppAvatar v-if="curContact" :name="curContact.name" :avatar="curContact.avatar" :size="22" />
            <span class="mo-select-name">{{ curContact ? curContact.name : '未选择联系人' }}</span>
            <AppIcon name="chevron-down" :size="14" color="var(--text-soft)" />
          </button>
          <div v-if="contactOpen" class="mo-select-pop">
            <button
              v-for="c in contacts"
              :key="c.id"
              class="mo-select-opt"
              type="button"
              @click="pickContact(c)"
            >
              <AppAvatar :name="c.name" :avatar="c.avatar" :size="22" />
              <span class="mo-select-name">{{ c.name }}</span>
              <AppIcon v-if="curContact && String(c.id) === String(curContact.id)" name="check" :size="14" color="var(--accent)" />
            </button>
            <div v-if="!contacts.length" class="mo-select-empty">还没有联系人，先去添加一个吧</div>
          </div>
        </div>
      </div>

      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="mood" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">{{ year }}.{{ String(month).padStart(2, '0') }} 已记录 {{ monthCount }} 天</span>
          <span class="md-sum-sub">点某一天，记下你和 TA 的心情</span>
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
          :class="{ empty: !c.day, today: c.today, has: c.mine || c.his }"
          :style="tintOf(c)"
          @click="c.day && pick(c)"
        >
          <span class="mo-day">{{ c.day || '' }}</span>
          <span class="mo-dots">
            <i v-if="c.mine" :style="{ background: colorOf(c.mine) }" />
            <i v-if="c.his" :style="{ background: colorOf(c.his) }" />
          </span>
        </button>
      </div>

      <h3 class="mo-sec">本月心情分布</h3>
      <div class="mo-dist">
        <div v-for="s in SIDES" :key="s.key" class="mo-dist-col">
          <span class="mo-dist-title"><i class="mo-idot" :class="s.key" />{{ s.label }}</span>
          <div v-for="m in MOODS" :key="m.key" class="mo-dist-row">
            <AppIcon :name="m.icon" :size="13" :color="m.color" />
            <span class="mo-dist-name">{{ m.name }}</span>
            <span class="mo-dist-bar"><i :style="{ width: pct(s.key, m.key) + '%', background: m.color }" /></span>
            <span class="mo-dist-n">{{ countOf(s.key, m.key) }}</span>
          </div>
        </div>
      </div>
      <p v-if="!monthCount" class="md-empty">这个月还没有记录<br /><span class="md-empty-sub">点日历上的任意一天，开始你和 TA 的共记</span></p>
    </div>

    <!-- 某日详情：两人的记录并排比对，各自独立保存/清除 -->
    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <h3 class="md-sheet-title">{{ curDate }} 的心情</h3>
        <p class="md-sheet-sub" v-if="curContact">与 {{ curContact.name }} 的共同记录</p>

        <div v-for="s in SIDES" :key="s.key" class="mo-block">
          <div class="mo-block-head">
            <span class="mo-block-title"><i class="mo-idot" :class="s.key" />{{ s.label }}记录</span>
            <button v-if="itemOf(s.key)" class="mo-block-del" type="button" @click="removeCur(s.key)">
              <AppIcon name="trash" :size="14" />
            </button>
          </div>
          <div class="md-chips">
            <button
              v-for="m in MOODS"
              :key="m.key"
              class="md-chip mo-mood"
              :class="{ on: formOf(s.key).mood === m.key }"
              :style="formOf(s.key).mood === m.key ? { background: m.color, borderColor: m.color } : null"
              type="button"
              @click="formOf(s.key).mood = m.key; formOf(s.key).touched = true"
            >
              <AppIcon :name="m.icon" :size="13" :color="formOf(s.key).mood === m.key ? '#fff' : m.color" />
              {{ m.name }}
            </button>
          </div>
          <textarea
            v-model="formOf(s.key).note"
            class="md-textarea"
            rows="3"
            :placeholder="s.key === 'me' ? '我的碎碎念…' : 'TA 的碎碎念…'"
            @input="formOf(s.key).touched = true"
          />
          <div class="mo-imgs">
            <div v-for="(img, i) in formOf(s.key).images" :key="i" class="mo-img">
              <img :src="img" alt="" />
              <button class="mo-img-del" type="button" @click="formOf(s.key).images.splice(i, 1)">×</button>
            </div>
            <button class="mo-img-add" type="button" @click="pickImages(s.key)">
              <AppIcon name="image" :size="16" color="var(--text-soft)" />
              <span>配图</span>
            </button>
          </div>
          <input :ref="(el) => setFileRef(s.key, el)" type="file" accept="image/*" multiple hidden @change="onImages($event, s.key)" />
        </div>

        <div class="md-actions">
          <button class="md-btn ghost" type="button" @click="close">取消</button>
          <button class="md-btn primary" type="button" @click="save">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { listItems, createItem, updateItem, removeItem } from '@/api/items'
import { uploadImage } from '@/api/content'
import { compressImage } from '@/utils/image'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'

/* 心情手账（双人共记）：
   一天两条记录——「我的」和「TA 的」，各自选心情、写碎碎念、配图；
   日历上同一天并排两个半透明小圆点（左我右他，颜色各取当日心情色）；
   记录按当前互动的联系人分开（全局可绑多个梦角）。
   每天不限时间，随时可补记/修改。 */

const WEEK = ['一', '二', '三', '四', '五', '六', '日']
/* 淡雅符号代替夸张 emoji：天气意象 + 全站统一的线性图标。
   legacy 兼容旧版中文心情名（旧数据 extra.mood 存的是「开心/平静…」） */
const MOODS = [
  { key: 'sunny', name: '初晴', icon: 'sun', color: '#e5989b', legacy: ['开心'] },
  { key: 'calm', name: '云朵', icon: 'cloud', color: '#8ab17d', legacy: ['平静'] },
  { key: 'hope', name: '萌芽', icon: 'sprout', color: '#5fa8a0', legacy: ['期待'] },
  { key: 'low', name: '细雨', icon: 'rain', color: '#9b8fc4', legacy: ['低落'] },
  { key: 'tired', name: '风', icon: 'wind', color: '#b8b0a8', legacy: ['疲惫'] },
  { key: 'angry', name: '闷雷', icon: 'bolt', color: '#c0576b', legacy: ['生气'] }
]
const SIDES = [
  { key: 'me', label: '我的' },
  { key: 'him', label: 'TA 的' }
]
const IMG_MAX = 6 /* 每条记录最多配 6 张图 */
const LAST_CID_KEY = 'mood_last_contact'

/* 归属判定：owner 缺省视为「我的」（兼容旧版单人记录） */
const isMine = (x) => x.extra && (x.extra.owner === 'me' || !x.extra.owner)
const isHis = (x) => !!(x.extra && x.extra.owner === 'him')

const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const contacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const curCid = ref(Number(localStorage.getItem(LAST_CID_KEY)) || 0)
const curContact = computed(
  () => contacts.value.find((c) => String(c.id) === String(curCid.value)) || contacts.value[0] || null
)

const items = ref([])
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const show = ref(false)
const curDate = ref('')
const myItem = ref(null)
const hisItem = ref(null)
const myForm = reactive({ mood: 'sunny', note: '', images: [], touched: false })
const hisForm = reactive({ mood: 'sunny', note: '', images: [], touched: false })
const contactOpen = ref(false)
const fileRefs = ref({})

function setFileRef(key, el) {
  if (el) fileRefs.value[key] = el
}
function itemOf(owner) {
  return owner === 'me' ? myItem.value : hisItem.value
}
function formOf(owner) {
  return owner === 'me' ? myForm : hisForm
}

/* 旧版中文名 / 新 key 都能定位到心情项 */
function moodKeyOf(v) {
  if (!v) return null
  const hit = MOODS.find((m) => m.key === v || m.name === v || (m.legacy || []).includes(v))
  return hit ? hit.key : null
}
function colorOf(key) {
  return (MOODS.find((m) => m.key === key) || MOODS[0]).color
}
function tintOf(c) {
  const key = c.mine || c.his
  return key ? { background: colorOf(key) + '1a' } : null
}

async function reload() {
  try {
    const cid = curContact.value ? curContact.value.id : null
    const res = await listItems('mood', cid)
    items.value = (Array.isArray(res) ? res : []).map((it) => ({
      ...it,
      extra: typeof it.extra === 'string' ? JSON.parse(it.extra || '{}') : it.extra || {}
    }))
  } catch (e) {
    items.value = []
  }
}

/* 旧版心情记录没有联系人归属（contact_id 为空）。双人共记后按梦角分开，
   一次性把孤儿记录归到第一个联系人，否则它们会在每个梦角下重复出现 */
async function migrateLegacy() {
  try {
    const all = await listItems('mood')
    const orphans = all.filter((x) => x.contact_id == null)
    if (!orphans.length || !contacts.value.length) return
    for (const it of orphans) await updateItem(it.id, { contactId: contacts.value[0].id })
  } catch (e) {
    /* 忽略：迁移失败不影响使用，只是旧数据会留在全局 */
  }
}

/* 切换联系人：记住选择并重载该梦角的记录 */
watch(curContact, (c) => {
  if (c) localStorage.setItem(LAST_CID_KEY, String(c.id))
  reload()
})

/* 月历格子：周一为第一列；同一天取两人的记录（左我右他） */
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
    const dayItems = items.value.filter((x) => x.title === ds)
    const mine = dayItems.find(isMine)
    const his = dayItems.find(isHis)
    out.push({
      day: d,
      date: ds,
      today: ds === t,
      mine: mine ? moodKeyOf(mine.extra && mine.extra.mood) : null,
      his: his ? moodKeyOf(his.extra && his.extra.mood) : null
    })
  }
  return out
})
const monthCount = computed(() => cells.value.filter((c) => c.mine || c.his).length)

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
function countOf(owner, key) {
  return cells.value.filter((c) => c[owner] === key).length
}
function pct(owner, key) {
  const total = cells.value.filter((c) => c[owner]).length
  if (!total) return 0
  return Math.round((countOf(owner, key) / total) * 100)
}

/* 打开某日详情：两人的表单各自回填（没有记录时给默认心情，保存才落库） */
function pick(c) {
  curDate.value = c.date
  const dayItems = items.value.filter((x) => x.title === c.date)
  myItem.value = dayItems.find(isMine) || null
  hisItem.value = dayItems.find(isHis) || null
  resetForm(myForm, myItem.value)
  resetForm(hisForm, hisItem.value)
  show.value = true
}
function resetForm(form, item) {
  form.mood = item ? moodKeyOf(item.extra && item.extra.mood) || 'sunny' : 'sunny'
  form.note = item ? item.body || '' : ''
  form.images = item && item.extra && Array.isArray(item.extra.images) ? [...item.extra.images] : []
  /* 已有记录 → 视为动过（允许改/清空）；新记录 → 等用户真的输入再落库，
     避免只记一侧时另一侧被默认心情建成一条空记录 */
  form.touched = !!item
}
function close() {
  show.value = false
}
async function save() {
  const cid = curContact.value ? curContact.value.id : null
  const date = curDate.value
  close()
  try {
    await saveOne('me', myItem.value, myForm, cid, date)
    await saveOne('him', hisItem.value, hisForm, cid, date)
    await reload()
    toast.pushToast({ title: '已记录' })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
}
async function saveOne(owner, item, form, cid, date) {
  /* 没动过、也没有任何内容的一侧，不建空记录（只记自己时不该强行生成 TA 的记录） */
  const hasContent = form.touched || String(form.note || '').trim() || form.images.length
  if (!item && !hasContent) return
  const payload = {
    title: date,
    body: String(form.note || '').trim(),
    extra: { mood: form.mood, owner, images: form.images.slice(0, IMG_MAX) }
  }
  if (item) await updateItem(item.id, payload)
  else await createItem({ module: 'mood', contactId: cid, ...payload })
}
async function removeCur(owner) {
  const item = itemOf(owner)
  if (!item) return
  close()
  try {
    await removeItem(item.id)
    await reload()
    toast.pushToast({ title: '已清除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* 配图：选图 → 压缩 → 存 dataURL 到 extra.images（最多 6 张） */
function pickImages(who) {
  const el = fileRefs.value[who]
  if (el) el.click()
}
async function onImages(e, who) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  if (!files.length) return
  const form = formOf(who)
  try {
    for (const f of files) {
      if (form.images.length >= IMG_MAX) break
      const small = await compressImage(f)
      const res = await uploadImage(small)
      if (res && res.path) {
        form.images.push(res.path)
        form.touched = true
      }
    }
  } catch (err) {
    toast.pushToast({ title: '图片添加失败', text: err.message })
  }
}

function pickContact(c) {
  curCid.value = c.id
  contactOpen.value = false
}
/* 点下拉外部关闭 */
function onDocClick(e) {
  if (!e.target.closest('.mo-select')) contactOpen.value = false
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
  await migrateLegacy()
  await reload()
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/* 联系人下拉 */
.mo-contact { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.mo-contact-label { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.mo-select { position: relative; flex: 1; min-width: 0; }
.mo-select-btn {
  width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--bg-soft);
  font-size: 14px; color: var(--text);
}
.mo-select-name { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mo-select-pop {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 20;
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); padding: 6px; max-height: 260px; overflow-y: auto;
}
.mo-select-opt {
  width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: none; background: transparent; border-radius: 8px; font-size: 14px; color: var(--text);
}
.mo-select-opt:hover { background: var(--bg-soft); }
.mo-select-empty { padding: 12px; text-align: center; font-size: 12px; color: var(--text-soft); }

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
/* 同一天并排两个半透明小圆点：左我右他，颜色各取当日心情色 */
.mo-dots { display: flex; align-items: center; gap: 3px; height: 6px; }
.mo-dots i { width: 6px; height: 6px; border-radius: 50%; opacity: 0.55; }
.mo-sec { font-size: 13px; color: var(--text-soft); margin: 18px 0 10px; font-weight: 500; }

/* 本月心情分布：我的 / TA 的两栏 */
.mo-dist { display: flex; gap: 10px; }
.mo-dist-col { flex: 1; min-width: 0; background: var(--bg-soft); border-radius: 12px; padding: 10px 12px; }
.mo-dist-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-soft); margin-bottom: 8px; }
.mo-idot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.mo-idot.me { background: var(--accent); }
.mo-idot.him { background: #8e9eb3; }
.mo-dist-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.mo-dist-name { font-size: 12px; color: var(--text); width: 30px; flex: 0 0 auto; }
.mo-dist-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--bg-screen); overflow: hidden; }
.mo-dist-bar > i { display: block; height: 100%; border-radius: 3px; }
.mo-dist-n { font-size: 11px; color: var(--text-soft); width: 16px; text-align: right; }

/* 详情弹窗内的双人记录区块 */
.md-sheet-sub { font-size: 12px; color: var(--text-soft); margin: -6px 0 12px; }
.mo-block { border: 1px solid var(--border); border-radius: 14px; padding: 12px; margin-bottom: 12px; }
.mo-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.mo-block-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.mo-block-del { border: none; background: transparent; color: var(--text-soft); padding: 4px; }
.mo-mood { display: inline-flex; align-items: center; gap: 5px; }
.mo-mood.on { color: #fff; }
.mo-imgs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.mo-img { position: relative; width: 56px; height: 56px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.mo-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mo-img-del {
  position: absolute; top: 2px; right: 2px; width: 16px; height: 16px; border: none;
  border-radius: 50%; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 11px;
  line-height: 1; display: flex; align-items: center; justify-content: center;
}
.mo-img-add {
  width: 56px; height: 56px; border: 1px dashed var(--border); border-radius: 8px;
  background: transparent; color: var(--text-soft); font-size: 11px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
}
</style>
