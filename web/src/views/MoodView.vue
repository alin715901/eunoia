<template>
  <div class="md-page">
    <!-- 联系人切换放到顶部导航栏最右侧（全局可能绑多个梦角，记录按人分开） -->
    <AppHeader title="心情手账" back>
      <template #right>
        <div class="mo-select mo-select-head">
          <button class="mo-select-btn mo-select-btn-head" type="button" aria-label="切换联系人" @click="contactOpen = !contactOpen">
            <AppAvatar v-if="curContact" :name="curContact.name" :avatar="curContact.avatar" :size="24" />
            <AppIcon v-else name="user" :size="18" color="var(--text-soft)" />
            <AppIcon name="chevron-down" :size="11" color="var(--text-soft)" />
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
      </template>
    </AppHeader>

    <div class="md-body">
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
          :class="{ empty: !c.day, today: c.today, has: c.me || c.him }"
          :style="tintOf(c)"
          @click="c.day && pick(c)"
        >
          <span class="mo-day">{{ c.day || '' }}</span>
          <span class="mo-dots">
            <i v-if="c.him" :style="{ background: colorOf(c.him) }" />
            <i v-if="c.me" :style="{ background: colorOf(c.me) }" />
          </span>
        </button>
      </div>

      <h3 class="mo-sec">本月心情分布</h3>
      <div class="mo-dist">
        <div class="mo-dist-col">
          <div class="mo-dist-head">
            <span class="mo-dist-title"><i class="mo-idot" :class="distSide" />{{ distSide === 'me' ? '我的' : 'TA 的' }}</span>
            <div class="mo-dist-switch">
              <button class="mo-sw-btn" :class="{ on: distSide === 'me' }" type="button" @click="distSide = 'me'">我的</button>
              <button class="mo-sw-btn" :class="{ on: distSide === 'him' }" type="button" @click="distSide = 'him'">TA 的</button>
            </div>
          </div>
          <div v-for="t in allTags" :key="t.key" class="mo-dist-row">
            <MoodFace v-if="!t.custom" :name="t.key" :size="13" :color="t.color" />
            <i v-else class="mo-tag-dot" :style="{ background: t.color }" />
            <span class="mo-dist-name">{{ t.name }}</span>
            <span class="mo-dist-bar"><i :style="{ width: pct(distSide, t.key) + '%', background: t.color }" /></span>
            <span class="mo-dist-n">{{ countOf(distSide, t.key) }}</span>
          </div>
        </div>
      </div>
      <p v-if="!monthCount" class="md-empty">这个月还没有记录<br /><span class="md-empty-sub">点日历上的任意一天，开始你和 TA 的共记</span></p>
    </div>

    <!-- 某日弹窗：恒先进详情态（两人记录并排 + 右上角铅笔入口），点铅笔才进编辑 -->
    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <!-- 详情：两人的记录并排，右上角铅笔进入编辑、× 关闭弹窗 -->
        <template v-if="!editing">
          <div class="mo-detail-head">
            <div class="mo-detail-head-main">
              <h3 class="md-sheet-title">{{ dateLabel }} 的心情</h3>
            </div>
            <div class="mo-detail-btns">
              <button class="mo-edit-btn" type="button" aria-label="修改记录" @click="openEdit">
                <AppIcon name="edit" :size="15" />
              </button>
              <button class="mo-close-btn" type="button" aria-label="关闭" @click="close">
                <AppIcon name="close" :size="14" />
              </button>
            </div>
          </div>

          <div class="mo-detail">
            <div class="mo-detail-card">
              <span class="mo-detail-title"><i class="mo-idot me" />我的记录</span>
              <template v-if="myItem">
                <div class="mo-detail-mood">
                  <MoodFace v-if="!myTag.custom" :name="myTag.key" :size="18" :color="myTag.color" />
                  <i v-else class="mo-tag-dot mo-tag-dot-lg" :style="{ background: myTag.color }" />
                  <b>{{ myTag.name }}</b>
                </div>
                <p v-if="myItem.body" class="mo-detail-note">{{ myItem.body }}</p>
              </template>
              <p v-else class="mo-detail-empty">还没记录</p>
            </div>
            <div class="mo-detail-card">
              <span class="mo-detail-title"><i class="mo-idot him" />TA 的记录</span>
              <template v-if="hisItem">
                <div class="mo-detail-mood">
                  <MoodFace v-if="!hisTag.custom" :name="hisTag.key" :size="18" :color="hisTag.color" />
                  <i v-else class="mo-tag-dot mo-tag-dot-lg" :style="{ background: hisTag.color }" />
                  <b>{{ hisTag.name }}</b>
                </div>
                <p v-if="hisItem.body" class="mo-detail-note">{{ hisItem.body }}</p>
              </template>
              <p v-else class="mo-detail-empty">还没记录</p>
            </div>
          </div>
        </template>

        <!-- 编辑：我的记录（TA 的心情只读展示，不在这里填） -->
        <template v-else>
          <div class="mo-detail-head">
            <div class="mo-detail-head-main">
              <h3 class="md-sheet-title">{{ dateLabel }} 的心情</h3>
            </div>
            <button class="mo-close-btn" type="button" aria-label="关闭" @click="close">
              <AppIcon name="close" :size="14" />
            </button>
          </div>

          <div class="mo-block">
            <div class="mo-block-head">
              <span class="mo-block-title"><i class="mo-idot me" />我的记录</span>
              <button v-if="myItem" class="mo-block-del" type="button" @click="removeCur">
                <AppIcon name="trash" :size="14" />
              </button>
            </div>

            <div class="md-chips">
              <button
                v-for="t in allTags"
                :key="t.key"
                class="md-chip mo-mood"
                :class="{ on: myForm.mood === t.key, pending: pendingDel === t.key }"
                :style="myForm.mood === t.key ? { background: t.color, borderColor: t.color } : null"
                type="button"
                @pointerdown="chipDown(t)"
                @pointerup="chipUp"
                @pointercancel="chipUp"
                @pointerleave="chipUp"
                @click="selectTag(t)"
              >
                <MoodFace v-if="!t.custom" :name="t.key" :size="14" :color="myForm.mood === t.key ? '#fff' : t.color" />
                <i v-else class="mo-tag-dot" :style="{ background: myForm.mood === t.key ? '#fff' : t.color }" />
                {{ t.name }}
                <!-- 长按后右上角出现删除钮，点 × 才真正删除 -->
                <span v-if="pendingDel === t.key" class="mo-del" @click.stop="delTag(t)">
                  <AppIcon name="close" :size="10" />
                </span>
              </button>

              <button v-if="!adding" class="md-chip mo-add" type="button" @click="startAdd">
                <AppIcon name="plus" :size="12" color="var(--text-soft)" />自定义
              </button>
              <template v-else>
                <input
                  ref="addInput"
                  v-model="newTag"
                  class="mo-add-input"
                  maxlength="6"
                  placeholder="标签名"
                  @keyup.enter="confirmAdd"
                  @keyup.esc="cancelAdd"
                />
                <button class="mo-add-ok" type="button" @click="confirmAdd">添加</button>
                <button class="mo-add-cancel" type="button" @click="cancelAdd">取消</button>
              </template>
            </div>

            <textarea
              v-model="myForm.note"
              class="md-textarea"
              rows="3"
              placeholder="写点什么…（可选）"
            />

            <!-- TA 当天的心情由 TA 自主记录，这里只读展示 -->
            <div v-if="hisItem" class="mo-his">
              <span class="mo-his-title"><i class="mo-idot him" />TA 今天的心情</span>
              <span class="mo-his-mood">
                <MoodFace v-if="!hisTag.custom" :name="hisTag.key" :size="16" :color="hisTag.color" />
                <i v-else class="mo-tag-dot" :style="{ background: hisTag.color }" />
                {{ hisTag.name }}
              </span>
            </div>
          </div>

          <div class="md-actions">
            <button class="md-btn ghost" type="button" @click="editing = false">取消</button>
            <button class="md-btn primary" type="button" @click="save">保存</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import MoodFace from '@/components/mood/MoodFace.vue'
import { listItems, createItem, updateItem, removeItem } from '@/api/items'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'

/* 心情手账（双人共记）：
   我的记录：12 个预设心情标签（各配极简线条表情）+ 自定义标签（长按删除）+ 碎碎念；
   TA 的记录：独立于我——当天一个随机时刻（8:00~21:59，按日期派生）自主记录，
              从全部可选标签里随机选一个心情，不在弹窗里手动填；
   日历同一天并排两个半透明小圆点（左 TA 右我，颜色各取当日心情色）；
   点有记录的日期先看详情（两人并排 + 铅笔入口），点铅笔才编辑；
   联系人切换在顶部导航栏最右侧；记录按当前互动的联系人分开（全局可绑多个梦角）。 */

const WEEK = ['一', '二', '三', '四', '五', '六', '日']

/* 12 个预设心情标签 */
const PRESET_MOODS = [
  { key: 'happy', name: '开心', color: '#e08e9b' },
  { key: 'excited', name: '激动', color: '#e8977a' },
  { key: 'sweet', name: '甜蜜', color: '#dd9ab8' },
  { key: 'calm', name: '平静', color: '#8ab17d' },
  { key: 'tired', name: '疲惫', color: '#b3ada6' },
  { key: 'sad', name: '难过', color: '#7f9ec4' },
  { key: 'anxious', name: '焦虑', color: '#b58bb0' },
  { key: 'angry', name: '生气', color: '#c05a6e' },
  { key: 'irritable', name: '烦躁', color: '#c98f5f' },
  { key: 'wronged', name: '委屈', color: '#a99ec9' },
  { key: 'bored', name: '无聊', color: '#b5b0a3' },
  { key: 'blank', name: '呆滞', color: '#93a8b5' }
]
/* 自定义标签的循环取色 */
const CUSTOM_COLORS = ['#a393c0', '#7fa8a0', '#c9a05f', '#b58bb0', '#c07f7f', '#7f9ec4']
const CUSTOM_KEY = 'mood_custom_tags'
const LAST_CID_KEY = 'mood_last_contact'

/* 旧版心情 key / 中文名 → 新标签 key（旧数据 extra.mood 存的是「sunny/初晴/开心…」） */
const LEGACY_MAP = {
  sunny: 'happy', '初晴': 'happy', '开心': 'happy',
  calm: 'calm', '云朵': 'calm', '平静': 'calm',
  tired: 'tired', '风': 'tired', '疲惫': 'tired',
  angry: 'angry', '闷雷': 'angry', '生气': 'angry',
  low: 'sad', '细雨': 'sad', '低落': 'sad',
  hope: 'excited', '萌芽': 'excited', '期待': 'excited'
}

/* 归属判定：owner 缺省视为「我的」（兼容旧版单人记录） */
const isMine = (x) => x.extra && (x.extra.owner === 'me' || !x.extra.owner)
const isHis = (x) => !!(x.extra && x.extra.owner === 'him')

/* 自定义标签：本地持久化，跨会话保留 */
const customTags = ref([])
try {
  const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]')
  if (Array.isArray(raw)) customTags.value = raw.filter((t) => t && t.key && t.name)
} catch (e) { /* 忽略损坏数据 */ }
const allTags = computed(() => [...PRESET_MOODS, ...customTags.value])
function persistCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customTags.value)) } catch (e) { /* ignore */ }
}

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
const editing = ref(false)
const curDate = ref('')
const myItem = ref(null)
const hisItem = ref(null)
const myForm = reactive({ mood: PRESET_MOODS[0].key, note: '' })
const contactOpen = ref(false)
/* 长按后进入「待删除」状态的标签 key（右上角显示 ×） */
const pendingDel = ref(null)

/* 本月分布：单栏 + 右上角切换「我的 / TA 的」 */
const distSide = ref('me')

/* 自定义标签的添加输入 */
const adding = ref(false)
const newTag = ref('')
const addInput = ref(null)

/* 旧 key / 中文名 / 新 key 都能定位到心情项 */
function moodKeyOf(v) {
  if (!v) return null
  const hit = allTags.value.find((t) => t.key === v || t.name === v)
  if (hit) return hit.key
  return LEGACY_MAP[v] || null
}
function tagOf(key) {
  return allTags.value.find((t) => t.key === key) || null
}
function colorOf(key) {
  const t = tagOf(key)
  return t ? t.color : '#b5b0a3'
}
function tagName(key) {
  const t = tagOf(key)
  return t ? t.name : key
}
function tintOf(c) {
  const key = c.me || c.him
  return key ? { background: colorOf(key) + '1a' } : null
}
/* 详情展示用：两人当天的心情标签 */
const myTag = computed(() => {
  const it = myItem.value
  const k = it ? moodKeyOf(it.extra && it.extra.mood) : null
  return (k && tagOf(k)) || { key: 'calm', name: '平静', color: '#8ab17d', custom: false }
})
const hisTag = computed(() => {
  const it = hisItem.value
  const k = it ? moodKeyOf(it.extra && it.extra.mood) : null
  return (k && tagOf(k)) || { key: 'calm', name: '平静', color: '#8ab17d', custom: false }
})

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

/* 旧数据一次性迁移：① 无联系人归属的记录归到第一个梦角；② 旧心情 key/中文名 → 新标签 key */
async function migrateLegacy() {
  try {
    const all = await listItems('mood')
    const orphans = all.filter((x) => x.contact_id == null)
    if (orphans.length && contacts.value.length) {
      for (const it of orphans) await updateItem(it.id, { contactId: contacts.value[0].id })
    }
    for (const it of all) {
      const ex = typeof it.extra === 'string' ? JSON.parse(it.extra || '{}') : it.extra || {}
      const nk = moodKeyOf(ex.mood)
      if (nk && nk !== ex.mood) {
        await updateItem(it.id, { extra: { ...ex, mood: nk, moodName: tagName(nk) } })
      }
    }
  } catch (e) {
    /* 忽略：迁移失败不影响使用，只是旧数据显示为兜底色 */
  }
}

/* TA 当天的记录：独立于我，在当天一个随机时刻自主生成。
   时刻由日期派生（同一天稳定，落在 8:00~21:59），进入心情页时若已过该时刻就补上。
   保存/删除我的记录都不会触发或清除 TA 的记录。 */
function hisMoment(ds) {
  let h = 0
  for (const ch of String(ds)) h = (h * 31 + ch.charCodeAt(0)) % 100003
  const minutes = 8 * 60 + (h % (14 * 60))
  return { h: Math.floor(minutes / 60), m: minutes % 60 }
}
function hisMomentPassed(ds) {
  const { h, m } = hisMoment(ds)
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes() >= h * 60 + m
}
async function ensureHisToday() {
  const ds = todayStr()
  if (!curContact.value) return
  if (items.value.some((x) => x.title === ds && isHis(x))) return
  if (!hisMomentPassed(ds)) return
  try {
    const tag = allTags.value[Math.floor(Math.random() * allTags.value.length)]
    await createItem({
      module: 'mood',
      contactId: curContact.value.id,
      title: ds,
      body: '',
      extra: { mood: tag.key, moodName: tag.name, owner: 'him' }
    })
    await reload()
  } catch (e) { /* 忽略：TA 的自动记录失败不影响我的使用 */ }
}

/* 切换联系人：记住选择并重载该梦角的记录 */
watch(curContact, async (c) => {
  if (c) localStorage.setItem(LAST_CID_KEY, String(c.id))
  await reload()
  await ensureHisToday()
})

/* 月历格子：周一为第一列；同一天取两人的记录（左 TA 右我） */
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
      me: mine ? moodKeyOf(mine.extra && mine.extra.mood) : null,
      him: his ? moodKeyOf(his.extra && his.extra.mood) : null
    })
  }
  return out
})
const monthCount = computed(() => cells.value.filter((c) => c.me || c.him).length)

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

const dateLabel = computed(() => {
  const d = curDate.value
  if (!d) return ''
  const [y, m, dd] = d.split('-').map(Number)
  const w = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, dd).getDay()]
  return `${m}月${dd}日 周${w}`
})

/* 打开某日：永远先看详情（哪怕空的），点铅笔才进编辑 */
function pick(c) {
  curDate.value = c.date
  refreshDay()
  editing.value = false
  pendingDel.value = null
  show.value = true
}
function refreshDay() {
  const dayItems = items.value.filter((x) => x.title === curDate.value)
  myItem.value = dayItems.find(isMine) || null
  hisItem.value = dayItems.find(isHis) || null
}
/* 详情 → 编辑：回填我的记录 */
function openEdit() {
  myForm.mood = myItem.value ? moodKeyOf(myItem.value.extra && myItem.value.extra.mood) || PRESET_MOODS[0].key : PRESET_MOODS[0].key
  myForm.note = myItem.value ? myItem.value.body || '' : ''
  adding.value = false
  newTag.value = ''
  pendingDel.value = null
  editing.value = true
}
function close() {
  show.value = false
  editing.value = false
  pendingDel.value = null
}

async function save() {
  const cid = curContact.value ? curContact.value.id : null
  const date = curDate.value
  try {
    await saveMine(cid, date)
    await reload()
    refreshDay()
    editing.value = false /* 保存后回详情，看两人的记录 */
    toast.pushToast({ title: '已记录' })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
}
async function saveMine(cid, date) {
  const payload = {
    title: date,
    body: String(myForm.note || '').trim(),
    extra: { mood: myForm.mood, moodName: tagName(myForm.mood), owner: 'me' }
  }
  if (myItem.value) await updateItem(myItem.value.id, payload)
  else await createItem({ module: 'mood', contactId: cid, ...payload })
}
/* 删除我的记录：不动 TA 的（TA 独立记录） */
async function removeCur() {
  if (!myItem.value) return
  try {
    await removeItem(myItem.value.id)
    await reload()
    refreshDay()
    editing.value = false
    toast.pushToast({ title: '已清除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* 自定义标签：添加 */
function startAdd() {
  adding.value = true
  newTag.value = ''
  nextTick(() => { if (addInput.value) addInput.value.focus() })
}
function cancelAdd() {
  adding.value = false
  newTag.value = ''
}
function confirmAdd() {
  const name = String(newTag.value || '').trim().slice(0, 6)
  if (!name) return cancelAdd()
  if (allTags.value.some((t) => t.name === name)) {
    toast.pushToast({ title: '标签已存在' })
    return
  }
  const tag = {
    key: 'c' + Date.now().toString(36),
    name,
    color: CUSTOM_COLORS[customTags.value.length % CUSTOM_COLORS.length],
    custom: true
  }
  customTags.value.push(tag)
  persistCustom()
  myForm.mood = tag.key
  adding.value = false
  newTag.value = ''
}
function removeTag(tag) {
  const i = customTags.value.findIndex((t) => t.key === tag.key)
  if (i >= 0) {
    customTags.value.splice(i, 1)
    persistCustom()
  }
  if (myForm.mood === tag.key) myForm.mood = PRESET_MOODS[0].key
}

/* 长按自定义标签 500ms → 标签右上角出现删除钮（×），点 × 才真正删除。
   长按触发后吞掉随后的 click 选中 */
let pressTimer = null
let longFired = false
function chipDown(t) {
  if (!t.custom) return
  longFired = false
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    longFired = true
    pendingDel.value = t.key
  }, 500)
}
function chipUp() {
  clearTimeout(pressTimer)
}
function selectTag(t) {
  if (longFired) return /* 长按抬手的 click：吞掉选中，保留待删除态 */
  pendingDel.value = null
  myForm.mood = t.key
}
function delTag(t) {
  pendingDel.value = null
  removeTag(t)
  toast.pushToast({ title: `已删除标签「${t.name}」` })
}

function pickContact(c) {
  curCid.value = c.id
  contactOpen.value = false
}
/* 点下拉外部关闭；点标签以外的区域取消「待删除」态 */
function onDocClick(e) {
  if (!e.target.closest('.mo-select')) contactOpen.value = false
  if (pendingDel.value && !e.target.closest('.mo-mood')) pendingDel.value = null
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
  await migrateLegacy()
  await reload()
  await ensureHisToday()
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
/* 联系人下拉（位于顶部导航栏右侧，只显示头像） */
.mo-select { position: relative; }
.mo-select-btn {
  display: flex; align-items: center; gap: 3px; padding: 5px 6px;
  border: none; border-radius: 10px; background: transparent;
  font-size: 13px; color: var(--text);
}
.mo-select-btn:active { background: var(--bg-soft); }
.mo-select-pop {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 30;
  min-width: 150px;
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); padding: 6px; max-height: 260px; overflow-y: auto;
}
.mo-select-opt {
  width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: none; background: transparent; border-radius: 8px; font-size: 14px; color: var(--text);
}
.mo-select-opt:hover { background: var(--bg-soft); }
.mo-select-empty { padding: 12px; text-align: center; font-size: 12px; color: var(--text-soft); }
.mo-select-opt .mo-select-name { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mo-nav { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 14px 0 10px; }
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
/* 同一天并排两个半透明小圆点：左 TA 右我，颜色各取当日心情色 */
.mo-dots { display: flex; align-items: center; gap: 3px; height: 6px; }
.mo-dots i { width: 6px; height: 6px; border-radius: 50%; opacity: 0.55; }
.mo-sec { font-size: 13px; color: var(--text-soft); margin: 18px 0 10px; font-weight: 500; }

/* 本月心情分布：单栏 + 右上角切换视图 */
.mo-dist-col { background: var(--bg-soft); border-radius: 12px; padding: 10px 12px; }
.mo-dist-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.mo-dist-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-soft); }
.mo-idot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.mo-idot.me { background: var(--accent); }
.mo-idot.him { background: #8e9eb3; }
.mo-dist-switch {
  display: flex; flex: 0 0 auto; background: var(--bg-screen); border-radius: 999px; padding: 2px;
}
.mo-sw-btn {
  border: none; background: transparent; border-radius: 999px; padding: 3px 10px;
  font-size: 11px; color: var(--text-soft);
}
.mo-sw-btn.on { background: var(--accent); color: #fff; }
.mo-dist-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.mo-dist-name { font-size: 12px; color: var(--text); width: 30px; flex: 0 0 auto; }
.mo-dist-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--bg-screen); overflow: hidden; }
.mo-dist-bar > i { display: block; height: 100%; border-radius: 3px; }
.mo-dist-n { font-size: 11px; color: var(--text-soft); width: 16px; text-align: right; }
/* 自定义标签的纯色小点（无表情） */
.mo-tag-dot { width: 5px; height: 5px; border-radius: 50%; flex: 0 0 auto; }
.mo-tag-dot-lg { width: 8px; height: 8px; }

/* 详情弹窗：标题 + 右上角铅笔 / 关闭 */
.mo-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mo-detail-head-main { min-width: 0; }
.mo-detail-btns { display: flex; gap: 8px; flex: 0 0 auto; }
.mo-edit-btn, .mo-close-btn {
  border: 1px solid var(--border); border-radius: 10px; padding: 7px;
  background: var(--bg-soft); color: var(--text-soft);
}
.mo-edit-btn:active, .mo-close-btn:active { transform: scale(0.94); }
.mo-detail-head + .mo-detail, .mo-detail-head + .mo-block { margin-top: 12px; }
/* 详情：两人的记录卡片 */
.mo-detail { display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px; }
.mo-detail-card { border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.mo-detail-title { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--text-soft); }
.mo-detail-mood { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 16px; font-weight: 600; color: var(--text); }
.mo-detail-note { margin: 8px 0 0; font-size: 13px; line-height: 1.7; color: var(--text); white-space: pre-wrap; word-break: break-word; }
.mo-detail-empty { margin: 8px 0 0; font-size: 12px; color: var(--text-soft); }

/* 编辑弹窗：我的记录区块 */
.mo-block { border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.mo-block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.mo-block-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.mo-block-del { border: none; background: transparent; color: var(--text-soft); padding: 4px; }
/* 心情 chips 与输入框之间留间距 */
.mo-block .md-chips { margin-bottom: 10px; }
.mo-mood {
  position: relative;
  display: inline-flex; align-items: center; gap: 5px;
  /* 长按删除：禁掉系统长按菜单/文本选择，按压缩放给反馈 */
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  touch-action: manipulation;
}
.mo-mood:active { transform: scale(0.96); }
.mo-mood.on { color: #fff; }
/* 长按 500ms 后右上角浮出删除钮 */
.mo-mood.pending { border-color: var(--text-soft); }
.mo-del {
  position: absolute; top: -7px; right: -7px; width: 16px; height: 16px;
  border: none; border-radius: 50%; background: #c0576b; color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
/* 自定义标签入口与输入（按钮收窄，和输入框拉开距离） */
.mo-add { border-style: dashed; display: inline-flex; align-items: center; gap: 4px; }
.mo-add-input {
  width: 84px; padding: 5px 10px; font-size: 12px; border: 1px solid var(--accent);
  border-radius: 999px; background: var(--bg-screen); color: var(--text); outline: none;
}
.mo-add-ok, .mo-add-cancel { padding: 5px 10px; font-size: 11px; border-radius: 999px; border: none; }
.mo-add-ok { background: var(--accent); color: #fff; }
.mo-add-cancel { background: var(--bg-soft); color: var(--text-soft); }
/* TA 今日心情：只读一行 */
.mo-his {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 10px; padding: 9px 12px; border-radius: 12px; background: var(--bg-soft);
}
.mo-his-title { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-soft); }
.mo-his-mood { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: var(--text); }
</style>
