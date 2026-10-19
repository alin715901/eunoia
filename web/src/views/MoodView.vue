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
      <!-- 日期行：最左「回到今天」，中间 ‹ 年月 › 居中，最右 ＋ 记录心情 -->
      <div class="mo-nav">
        <button class="mo-today-btn" type="button" @click="goToday">回到今天</button>
        <div class="mo-nav-mid">
          <button class="mo-nav-arrow" type="button" aria-label="上个月" @click="shift(-1)">‹</button>
          <span class="mo-nav-title">{{ year }}年{{ month }}月</span>
          <button class="mo-nav-arrow" type="button" aria-label="下个月" @click="shift(1)">›</button>
        </div>
        <button class="mo-nav-btn mo-nav-plus" type="button" aria-label="记录心情" @click="plusRecord">
          <AppIcon name="plus" :size="16" color="var(--text-soft)" />
        </button>
      </div>

      <div class="mo-grid">
        <span v-for="w in WEEK" :key="w" class="mo-week">{{ w }}</span>
        <button
          v-for="(c, i) in cells"
          :key="i"
          class="mo-cell"
          :class="{ empty: !c.day, today: c.today, has: c.me || c.him, selected: c.date === dayDate }"
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

      <!-- 日历下方展示区：右上角「查看分布」切换本月心情分布 -->
      <div class="mo-sec-head">
        <h3 class="mo-sec">{{ distMode ? `本月心情分布 · ${year}年${month}月` : dayTitle }}</h3>
        <button class="mo-dist-btn" type="button" :aria-label="distMode ? '取消分布' : '查看分布'" @click="toggleDist">
          {{ distMode ? '取消' : '查看分布' }}
        </button>
      </div>

      <!-- 本月心情分布：统计当前浏览年月里两人的心情出现次数 -->
      <div v-if="distMode" class="mo-dist">
        <div class="mo-dist-grp">
          <div class="mo-dist-grp-head"><i class="mo-idot me" /><span>我</span><span class="mo-dist-total">共 {{ myDistTotal }} 条</span></div>
          <p v-if="!myDist.length" class="mo-dist-empty">这个月还没有我的记录</p>
          <div v-for="d in myDist" :key="'me-' + d.tag.key" class="mo-dist-row">
            <span class="mo-dist-name">
              <MoodFace v-if="!d.tag.custom" :name="d.tag.key" :size="14" :color="d.tag.color" />
              <i v-else class="mo-tag-dot" :style="{ background: d.tag.color }" />
              {{ d.tag.name }}
            </span>
            <span class="mo-dist-bar"><i :style="{ width: myBar(d.count), background: d.tag.color }" /></span>
            <span class="mo-dist-num">{{ d.count }}</span>
          </div>
        </div>

        <div class="mo-dist-grp">
          <div class="mo-dist-grp-head"><i class="mo-idot him" /><span>{{ himName }}</span><span class="mo-dist-total">共 {{ hisDistTotal }} 条</span></div>
          <p v-if="!hisDist.length" class="mo-dist-empty">这个月还没有{{ himName }}的记录</p>
          <div v-for="d in hisDist" :key="'him-' + d.tag.key" class="mo-dist-row">
            <span class="mo-dist-name">
              <MoodFace v-if="!d.tag.custom" :name="d.tag.key" :size="14" :color="d.tag.color" />
              <i v-else class="mo-tag-dot" :style="{ background: d.tag.color }" />
              {{ d.tag.name }}
            </span>
            <span class="mo-dist-bar"><i :style="{ width: hisBar(d.count), background: d.tag.color }" /></span>
            <span class="mo-dist-num">{{ d.count }}</span>
          </div>
        </div>
      </div>

      <!-- 当日双方记录：不弹窗，直接在日历下方（我的便签卡片） -->
      <div v-else class="mo-day">
        <p v-if="!myItem && !hisItem" class="mo-day-empty">
          这天还没有记录<br /><span class="md-empty-sub">点日历上的任意一天，或点右上角 ＋ 开始记录</span>
        </p>

        <!-- 我的记录：铅笔入口可修改/删除 -->
        <div v-if="myItem" class="mo-card me">
          <div class="mo-card-head">
            <AppAvatar name="我" :avatar="myAvatar" :size="30" />
            <span class="mo-card-name">我</span>
            <button class="mo-card-edit" type="button" aria-label="修改这条记录" @click="openEdit(myItem)">
              <AppIcon name="edit" :size="13" />
            </button>
          </div>
          <div class="mo-card-mood">
            <MoodFace v-if="!myTag.custom" :name="myTag.key" :size="17" :color="myTag.color" />
            <i v-else class="mo-tag-dot mo-tag-dot-lg" :style="{ background: myTag.color }" />
            <b>{{ myTag.name }}</b>
            <span v-for="ev in myEvents" :key="ev" class="mo-ev">{{ ev }}</span>
            <span v-if="myTime" class="mo-card-time">{{ myTime }}</span>
          </div>
          <p v-if="myItem.body" class="mo-note">{{ myItem.body }}</p>
        </div>
        <div v-else-if="hisItem" class="mo-card me empty">
          <div class="mo-card-head">
            <AppAvatar name="我" :avatar="myAvatar" :size="30" />
            <span class="mo-card-name">我</span>
          </div>
          <p class="mo-card-empty">还没记录</p>
        </div>

        <!-- TA 的记录：独立自主记录，只读展示 -->
        <div v-if="hisItem" class="mo-card him">
          <div class="mo-card-head">
            <AppAvatar :name="himName" :avatar="curContact && curContact.avatar" :size="30" />
            <span class="mo-card-name">{{ himName }}</span>
          </div>
          <div class="mo-card-mood">
            <MoodFace v-if="!hisTag.custom" :name="hisTag.key" :size="17" :color="hisTag.color" />
            <i v-else class="mo-tag-dot mo-tag-dot-lg" :style="{ background: hisTag.color }" />
            <b>{{ hisTag.name }}</b>
            <span v-for="ev in hisEvents" :key="ev" class="mo-ev">{{ ev }}</span>
            <span v-if="hisTime" class="mo-card-time">{{ hisTime }}</span>
          </div>
          <p v-if="hisItem.body" class="mo-note">{{ hisItem.body }}</p>
        </div>
        <div v-else-if="myItem" class="mo-card him empty">
          <div class="mo-card-head">
            <AppAvatar :name="himName" :avatar="curContact && curContact.avatar" :size="30" />
            <span class="mo-card-name">{{ himName }}</span>
          </div>
          <p class="mo-card-empty">还没记录</p>
        </div>
      </div>
    </div>

    <!-- 记录弹窗：只有「我的记录」表单（心情 + 事件 + 碎碎念） -->
    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <div class="mo-form-head">
          <span class="mo-form-title"><i class="mo-idot me" />我的记录</span>
          <div class="mo-form-btns">
            <button v-if="editingId" class="mo-close-btn mo-del-btn" type="button" aria-label="删除这条记录" @click="removeCur">
              <AppIcon name="trash" :size="14" />
            </button>
            <button class="mo-close-btn" type="button" aria-label="关闭" @click="close">
              <AppIcon name="close" :size="14" />
            </button>
          </div>
        </div>
        <p class="mo-form-sub">{{ formDateLabel }}{{ formToday ? ' · 今天' : '' }}</p>

        <p class="mo-fld-label">{{ formToday ? '今天的心情' : '这天的心情' }}</p>
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
            <MoodFace v-if="!t.custom" :name="t.key" :size="13" :color="myForm.mood === t.key ? '#fff' : t.color" />
            <i v-else class="mo-tag-dot" :style="{ background: myForm.mood === t.key ? '#fff' : t.color }" />
            {{ t.name }}
            <!-- 长按后右上角出现删除钮，点 × 才真正删除 -->
            <span v-if="pendingDel === t.key" class="mo-del" @click.stop="delTag(t)">
              <AppIcon name="close" :size="10" />
            </span>
            <!-- 删除态：每个标签右上角都有 × -->
            <span v-else-if="delMode === 'mood'" class="mo-del" @click.stop="delTagAny(t)">
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
          <!-- 删除态开关：点「删除」每个标签右上角出 ×，变成「完成」，点完成退出 -->
          <button
            class="md-chip mo-del-mode"
            :class="{ on: delMode === 'mood' }"
            type="button"
            :aria-label="delMode === 'mood' ? '完成删除' : '删除标签'"
            @click="toggleDelMode('mood')"
          >
            {{ delMode === 'mood' ? '完成' : '删除' }}
          </button>
        </div>

        <p class="mo-fld-label">{{ formToday ? '今天做了什么' : '这天做了什么' }}</p>
        <div class="md-chips">
          <button
            v-for="ev in allEvents"
            :key="ev"
            class="md-chip mo-ev"
            :class="{ on: myForm.events.includes(ev), pending: pendingDelEv === ev }"
            type="button"
            @pointerdown="evDown(ev)"
            @pointerup="evUp"
            @pointercancel="evUp"
            @pointerleave="evUp"
            @click="toggleEvent(ev)"
          >
            {{ ev }}
            <!-- 自定义事件长按后右上角出现删除钮 -->
            <span v-if="pendingDelEv === ev" class="mo-del" @click.stop="delEvent(ev)">
              <AppIcon name="close" :size="10" />
            </span>
            <!-- 删除态：每个事件右上角都有 × -->
            <span v-else-if="delMode === 'event'" class="mo-del" @click.stop="delEventAny(ev)">
              <AppIcon name="close" :size="10" />
            </span>
          </button>

          <button v-if="!addingEv" class="md-chip mo-ev mo-ev-add" type="button" aria-label="自定义事件" @click="startAddEv">
            <AppIcon name="plus" :size="12" color="var(--text-soft)" />
          </button>
          <template v-else>
            <input
              ref="addEvInput"
              v-model="newEv"
              class="mo-add-input"
              maxlength="6"
              placeholder="事件名"
              @keyup.enter="confirmAddEv"
              @keyup.esc="cancelAddEv"
            />
            <button class="mo-add-ok" type="button" @click="confirmAddEv">添加</button>
            <button class="mo-add-cancel" type="button" @click="cancelAddEv">取消</button>
          </template>
          <!-- 删除态开关：点「删除」每个事件右上角出 ×，变成「完成」，点完成退出 -->
          <button
            class="md-chip mo-ev mo-del-mode"
            :class="{ on: delMode === 'event' }"
            type="button"
            :aria-label="delMode === 'event' ? '完成删除' : '删除事件'"
            @click="toggleDelMode('event')"
          >
            {{ delMode === 'event' ? '完成' : '删除' }}
          </button>
        </div>

        <textarea
          v-model="myForm.note"
          class="md-textarea"
          rows="3"
          placeholder="写一点今天的小心情（可选）"
        />

        <div class="md-actions">
          <button class="md-btn ghost" type="button" @click="close">取消</button>
          <button class="md-btn primary" type="button" @click="save">保存</button>
        </div>
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
import { getCards } from '@/api/cards'
import { getContactSettings, getDesktop } from '@/api/contacts'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'

/* 心情手账（双人共记）：
   我的记录：12 个预设心情标签（各配极简线条表情）+ 自定义标签（长按删除）
             + 「今天做了什么」事件标签（多选，24 个预设 + 自定义）+ 碎碎念；
             自定义旁有「删除」开关：点删除每个标签右上角出 ×（预设删了进隐藏清单，
             跨会话保留），按钮变「完成」，点完成退出删除态；
   TA 的记录：独立于我——当天一个随机时刻（8:00~21:59，按日期派生）自主记录，
              从全部可选标签里随机选一个心情、按日期派生 1~2 个事件，
              碎碎念从字卡里随机抽 1~3 张拼成，不在弹窗里手动填；
   月历同一天并排两个半透明小圆点（左 TA 右我，颜色各取当日最新心情色）；
   点日期不弹窗：日历下方直接展示当天两人的记录卡片
             （头像 + 名称 + 心情 + 事件 + 便签条碎碎念，我的卡片带铅笔可改）；
   展示区右上角「查看分布」可切换本月心情分布（按当前浏览年月统计两人各心情出现次数，
             带进度条；再点「取消」回到便签卡片）；
   保存/修改我的记录：时刻刷新为当前（改了心情/事件，时间就算最新一次）；
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
const HIDDEN_KEY = 'mood_hidden_tags'
const EVENT_KEY = 'mood_custom_events'
const HIDDEN_EV_KEY = 'mood_hidden_events'
const LAST_CID_KEY = 'mood_last_contact'

/* 24 个预设事件标签（「今天做了什么」） */
const PRESET_EVENTS = [
  '散步', '摸鱼', '钓鱼', '阅读', '游戏', '工作', '做饭', '咸鱼',
  '发呆', '学习', '爱情', '灵感', '画画', '创作', '购物', '回家',
  '游玩', '宅家', '生病', '下雨', '打扫', '出差', '休息', '追剧'
]

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
/* 被删除的预设标签：记 key 隐藏起来（删除态里删预设也生效，跨会话保留） */
const hiddenTags = ref([])
try {
  const raw = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
  if (Array.isArray(raw)) hiddenTags.value = raw.filter((k) => typeof k === 'string')
} catch (e) { /* 忽略损坏数据 */ }
function persistHidden() {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(hiddenTags.value)) } catch (e) { /* ignore */ }
}
const allTags = computed(() => [...PRESET_MOODS.filter((t) => !hiddenTags.value.includes(t.key)), ...customTags.value])
function persistCustom() {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customTags.value)) } catch (e) { /* ignore */ }
}

/* 自定义事件：本地持久化（纯名字数组） */
const customEvents = ref([])
try {
  const raw = JSON.parse(localStorage.getItem(EVENT_KEY) || '[]')
  if (Array.isArray(raw)) customEvents.value = raw.filter((e) => typeof e === 'string' && e.trim())
} catch (e) { /* 忽略损坏数据 */ }
/* 被删除的预设事件：记名字隐藏起来 */
const hiddenEvents = ref([])
try {
  const raw = JSON.parse(localStorage.getItem(HIDDEN_EV_KEY) || '[]')
  if (Array.isArray(raw)) hiddenEvents.value = raw.filter((e) => typeof e === 'string')
} catch (e) { /* 忽略损坏数据 */ }
function persistHiddenEvents() {
  try { localStorage.setItem(HIDDEN_EV_KEY, JSON.stringify(hiddenEvents.value)) } catch (e) { /* ignore */ }
}
const allEvents = computed(() => [...PRESET_EVENTS.filter((e) => !hiddenEvents.value.includes(e)), ...customEvents.value])
function persistCustomEvents() {
  try { localStorage.setItem(EVENT_KEY, JSON.stringify(customEvents.value)) } catch (e) { /* ignore */ }
}

const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const contacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const curCid = ref(Number(localStorage.getItem(LAST_CID_KEY)) || 0)
const curContact = computed(
  () => contacts.value.find((c) => String(c.id) === String(curCid.value)) || contacts.value[0] || null
)
/* 界面上的「他」一律显示当前联系人名（无联系人时兜底 TA） */
const himName = computed(() => (curContact.value && curContact.value.name) || 'TA')
/* 「我」的头像：与一起听歌/聊天同一套规则——开启「同步人物卡头像到聊天」时优先桌面 my_avatar，
   否则用联系人设置里的 my_avatar，最后桌面 my_avatar 兜底；都没有就显示「我」字 */
const myAvatar = ref('')
async function loadMyAvatar() {
  const cid = curContact.value ? curContact.value.id : null
  if (!cid) { myAvatar.value = ''; return }
  try {
    const [settings, desk] = await Promise.all([
      getContactSettings(cid).catch(() => null),
      getDesktop(cid).catch(() => null)
    ])
    const deskMy = (desk && desk.my_avatar) || ''
    const setMy = (settings && settings.my_avatar) || ''
    myAvatar.value = (desk && desk.sync_chat_avatar && deskMy) ? deskMy : (setMy || deskMy)
  } catch (e) { /* 忽略：读取失败就显示「我」字兜底 */ }
}

const items = ref([])
const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
/* 记录表单弹窗 */
const show = ref(false)
/* 正在编辑的我的记录 id（null = ＋ 开的新记录） */
const editingId = ref(null)
/* 表单记录的日期（＋ 取当前浏览的日期，铅笔取该记录自己的日期） */
const formDate = ref('')
/* 日历下方展示的日期（默认今天；点日历某日时跟随切换，不弹窗） */
const dayDate = ref('')
const myForm = reactive({ mood: PRESET_MOODS[0].key, note: '', events: [] })
const contactOpen = ref(false)
/* 长按后进入「待删除」状态的标签 key / 事件名（右上角显示 ×） */
const pendingDel = ref(null)
const pendingDelEv = ref(null)
/* 「删除」按钮进入的整列删除态：'mood' / 'event' / null（此时每个标签右上角都有 ×） */
const delMode = ref(null)
function toggleDelMode(kind) {
  delMode.value = delMode.value === kind ? null : kind
  pendingDel.value = null
  pendingDelEv.value = null
  if (adding.value) cancelAdd()
  if (addingEv.value) cancelAddEv()
}

/* 自定义标签的添加输入 */
const adding = ref(false)
const newTag = ref('')
const addInput = ref(null)
/* 自定义事件的添加输入 */
const addingEv = ref(false)
const newEv = ref('')
const addEvInput = ref(null)

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
/* 记录里存的事件列表（旧数据没有该字段 → 空） */
function eventsOf(it) {
  const evs = it && it.extra && it.extra.events
  return Array.isArray(evs) ? evs.filter((e) => typeof e === 'string' && e.trim()) : []
}

/* 当天两人的记录（各取最新一条）：日历下方卡片直接展示 */
function latestOf(dayItems, pred) {
  const list = dayItems.filter(pred)
  if (!list.length) return null
  return list.reduce((a, b) => {
    const ta = timeMin(a), tb = timeMin(b)
    if (tb !== ta) return tb > ta ? b : a
    return (b.id || 0) >= (a.id || 0) ? b : a
  })
}
const dayItems = computed(() => items.value.filter((x) => x.title === dayDate.value))
const myItem = computed(() => latestOf(dayItems.value, isMine))
const hisItem = computed(() => latestOf(dayItems.value, isHis))
/* 展示用：两人当天的心情标签 / 事件 / 时刻 */
function tagOfItem(it) {
  const k = it ? moodKeyOf(it.extra && it.extra.mood) : null
  return (k && tagOf(k)) || { key: 'calm', name: '平静', color: '#8ab17d', custom: false }
}
const myTag = computed(() => tagOfItem(myItem.value))
const hisTag = computed(() => tagOfItem(hisItem.value))
const myEvents = computed(() => eventsOf(myItem.value))
const hisEvents = computed(() => eventsOf(hisItem.value))
const myTime = computed(() => (myItem.value ? timeOf(myItem.value) : ''))
const hisTime = computed(() => (hisItem.value ? timeOf(hisItem.value) : ''))

/* 本月心情分布：统计当前浏览年月里两人的心情出现次数（随 ‹ › 切换月份而变） */
const distMode = ref(false)
function toggleDist() { distMode.value = !distMode.value }
const PRESET_BY_KEY = Object.fromEntries(PRESET_MOODS.map((t) => [t.key, t]))
const monthPrefix = computed(() => `${year.value}-${String(month.value).padStart(2, '0')}-`)
const monthItems = computed(() => items.value.filter((x) => x.title && x.title.startsWith(monthPrefix.value)))
function distList(pred) {
  const counts = {}
  /* 按天分组，每天只取该人「最新一条」记录（与日历下方卡片一致），
     避免把同一天的多次修改都算进去，只统计当天最后/最新的心情 */
  const byDay = {}
  for (const it of monthItems.value.filter(pred)) {
    if (!byDay[it.title]) byDay[it.title] = []
    byDay[it.title].push(it)
  }
  for (const d in byDay) {
    const latest = latestOf(byDay[d], () => true)
    const k = moodKeyOf(latest.extra && latest.extra.mood)
    if (!k) continue
    counts[k] = (counts[k] || 0) + 1
  }
  return Object.keys(counts)
    .map((k) => {
      const t = tagOf(k) || PRESET_BY_KEY[k] || { key: k, name: tagName(k) || k, color: '#b5b0a3', custom: false }
      return { tag: t, count: counts[k] }
    })
    .sort((a, b) => b.count - a.count)
}
const myDist = computed(() => distList(isMine))
const hisDist = computed(() => distList(isHis))
const myDistTotal = computed(() => myDist.value.reduce((s, d) => s + d.count, 0))
const hisDistTotal = computed(() => hisDist.value.reduce((s, d) => s + d.count, 0))
function myBar(n) { const max = Math.max(1, ...myDist.value.map((d) => d.count)); return (n / max * 100).toFixed(1) + '%' }
function hisBar(n) { const max = Math.max(1, ...hisDist.value.map((d) => d.count)); return (n / max * 100).toFixed(1) + '%' }

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

/* TA 当天的记录：独立于我，当天可分多次自主记录。
   次数与时刻都由日期 hash 派生（同一天稳定，首条落在 8:00~21:59，其后每条错开 35~90 分钟）。
   心情从全部可选标签里随机选，事件按日期派生 1~2 个，碎碎念从字卡里随机抽 1~3 张拼成。
   进入心情页时按当前时间补齐已到点的记录；保存/删除我的记录都不会触发或清除 TA 的。 */
function hisMoments(ds) {
  let h = 0
  for (const ch of String(ds)) h = (h * 31 + ch.charCodeAt(0)) % 100003
  const count = 1 + (h % 3)
  const out = []
  let cur = 8 * 60 + (h % (14 * 60))
  for (let i = 0; i < count && cur < 24 * 60; i++) {
    out.push({ h: Math.floor(cur / 60), m: cur % 60 })
    cur += 35 + ((h >>> ((i + 2) * 3)) % 56)
  }
  return out
}
function hm(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
/* TA 当天做了些什么：按日期 + 第几条 hash 派生 1~2 个事件（同一天稳定、不重复） */
function hisEventsFor(ds, i) {
  let h = 0
  for (const ch of `${ds}#e${i}`) h = (h * 31 + ch.charCodeAt(0)) % 100003
  const n = 1 + (h % 2)
  const out = []
  for (let k = 0; k < n; k++) {
    const ev = PRESET_EVENTS[(h + k * 7 + (h >>> (k + 1))) % PRESET_EVENTS.length]
    if (!out.includes(ev)) out.push(ev)
  }
  return out
}
/* 旧数据（无 time 字段）的展示兜底：TA 用日期派生时刻，我的不显示时间 */
function timeOf(it) {
  const t = it.extra && it.extra.time
  if (t) return t
  if (isHis(it)) {
    const { h, m } = hisMoments(it.title)[0]
    return hm(h, m)
  }
  return ''
}
/* 排序用：把 HH:mm 转分钟；无时间的排在最前 */
function timeMin(it) {
  const t = it.extra && it.extra.time
  if (!t) return -1
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/* 字卡（碎碎念素材）：公共日常组 + 当前联系人自己的字卡，去重缓存 */
const cardTexts = ref([])
async function loadCardTexts() {
  try {
    const cid = curContact.value ? curContact.value.id : null
    const [general, mine] = await Promise.all([
      getCards({ scope: 'general', category: 'main' }),
      cid ? getCards({ scope: 'contact', contactId: cid, category: 'main' }) : Promise.resolve([])
    ])
    const seen = new Set()
    cardTexts.value = []
    for (const c of [...(general || []), ...(mine || [])]) {
      const t = c && c.content
      if (t && !seen.has(t)) { seen.add(t); cardTexts.value.push(t) }
    }
  } catch (e) { /* 字卡读取失败不影响心情记录 */ }
}
/* 从字卡随机抽 1~3 张拼成一句碎碎念 */
function pickCardNote() {
  const pool = cardTexts.value.slice()
  if (!pool.length) return ''
  const n = Math.min(1 + Math.floor(Math.random() * 3), pool.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, n).join('，')
}

async function ensureHisToday() {
  const ds = todayStr()
  if (!curContact.value) return
  const moments = hisMoments(ds)
  const have = items.value.filter((x) => x.title === ds && isHis(x)).length
  if (have >= moments.length) return
  const d = new Date()
  const nowMin = d.getHours() * 60 + d.getMinutes()
  let created = false
  for (let i = have; i < moments.length; i++) {
    const { h, m } = moments[i]
    if (nowMin < h * 60 + m) break /* 还没到 TA 的时刻 */
    try {
      const tag = allTags.value[Math.floor(Math.random() * allTags.value.length)]
      await createItem({
        module: 'mood',
        contactId: curContact.value.id,
        title: ds,
        body: pickCardNote(),
        extra: { mood: tag.key, moodName: tag.name, owner: 'him', time: hm(h, m), events: hisEventsFor(ds, i) }
      })
      created = true
    } catch (e) { /* 忽略：TA 的自动记录失败不影响我的使用 */ }
  }
  if (created) await reload()
}

/* 切换联系人：记住选择并重载该梦角的记录、字卡与我的头像 */
watch(curContact, async (c) => {
  if (c) localStorage.setItem(LAST_CID_KEY, String(c.id))
  await loadCardTexts()
  await loadMyAvatar()
  await reload()
  await ensureHisToday()
})

/* 月历格子：周一为第一列；同一天取两人的记录（左 TA 右我，多条时取最新一条） */
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
    const day = items.value.filter((x) => x.title === ds)
    const mine = latestOf(day, isMine)
    const his = latestOf(day, isHis)
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
/* 「回到今天」：年月拉回当前月，选中切回今天 */
function goToday() {
  const t = todayStr()
  year.value = Number(t.slice(0, 4))
  month.value = Number(t.slice(5, 7))
  dayDate.value = t
}
function dateLabelOf(d) {
  const [y, m, dd] = d.split('-').map(Number)
  const w = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, dd).getDay()]
  return `${m}月${dd}日 周${w}`
}
/* 日历下方小标题：今天显示「今天」 */
const dayTitle = computed(() => {
  const d = dayDate.value
  if (!d) return ''
  const label = dateLabelOf(d)
  return d === todayStr() ? `今天 · ${label}` : label
})
/* 表单日期小字 */
const formDateLabel = computed(() => (formDate.value ? dateLabelOf(formDate.value) : ''))
const formToday = computed(() => !!formDate.value && formDate.value === todayStr())

/* 点日期：不弹窗，日历下方切换到该日的记录 */
function pick(c) {
  dayDate.value = c.date
  pendingDel.value = null
  pendingDelEv.value = null
  delMode.value = null
}
/* ＋ 记录心情：为当前浏览的日期开一张空白新记录表单（保存即新增一条） */
function plusRecord() {
  formDate.value = dayDate.value || todayStr()
  dayDate.value = formDate.value
  editingId.value = null
  myForm.mood = PRESET_MOODS[0].key
  myForm.note = ''
  myForm.events = []
  adding.value = false
  newTag.value = ''
  addingEv.value = false
  newEv.value = ''
  pendingDel.value = null
  pendingDelEv.value = null
  delMode.value = null
  show.value = true
}
/* 卡片铅笔：编辑这条记录（保存=更新它自己） */
function openEdit(it) {
  formDate.value = it.title
  dayDate.value = it.title
  editingId.value = it.id
  myForm.mood = moodKeyOf(it.extra && it.extra.mood) || PRESET_MOODS[0].key
  myForm.note = it.body || ''
  myForm.events = eventsOf(it).slice()
  adding.value = false
  newTag.value = ''
  addingEv.value = false
  newEv.value = ''
  pendingDel.value = null
  pendingDelEv.value = null
  delMode.value = null
  show.value = true
}
function close() {
  show.value = false
  editingId.value = null
  pendingDel.value = null
  pendingDelEv.value = null
  delMode.value = null
}

async function save() {
  const cid = curContact.value ? curContact.value.id : null
  const date = formDate.value
  try {
    const payload = {
      title: date,
      body: String(myForm.note || '').trim(),
      extra: { mood: myForm.mood, moodName: tagName(myForm.mood), owner: 'me', events: myForm.events.slice() }
    }
    if (editingId.value) {
      /* 更新这条记录：时刻刷新为当前（改了心情/事件，时间就算最新一次） */
      await updateItem(editingId.value, { ...payload, extra: { ...payload.extra, time: nowHM() } })
    } else {
      await createItem({ module: 'mood', contactId: cid, ...payload, extra: { ...payload.extra, time: nowHM() } })
    }
    await reload()
    dayDate.value = date
    show.value = false
    editingId.value = null
    toast.pushToast({ title: '已记录' })
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
}
/* 删除我的记录：不动 TA 的（TA 独立记录） */
async function removeCur() {
  if (!editingId.value) return
  try {
    await removeItem(editingId.value)
    await reload()
    show.value = false
    editingId.value = null
    toast.pushToast({ title: '已清除' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
/* 当前时刻 HH:mm（固定系统时间下也可被测试控制） */
function nowHM() {
  const d = new Date()
  return hm(d.getHours(), d.getMinutes())
}

/* 自定义心情标签：添加 */
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

/* 删除态里删任意标签：自定义 → 直接移除；预设 → 记入隐藏清单（跨会话保留，可随时再加回来暂不支持，删了就是删了） */
function delTagAny(t) {
  if (t.custom) {
    const i = customTags.value.findIndex((x) => x.key === t.key)
    if (i >= 0) { customTags.value.splice(i, 1); persistCustom() }
  } else if (!hiddenTags.value.includes(t.key)) {
    hiddenTags.value.push(t.key)
    persistHidden()
  }
  /* 选中的正好是被删的标签 → 回退到剩下里的第一个 */
  if (myForm.mood === t.key) myForm.mood = (allTags.value[0] || PRESET_MOODS[0]).key
  toast.pushToast({ title: `已删除标签「${t.name}」` })
}
/* 删除态里删任意事件：自定义 → 移除；预设 → 记入隐藏清单；已勾选的一并取消 */
function delEventAny(ev) {
  if (customEvents.value.includes(ev)) {
    const i = customEvents.value.indexOf(ev)
    if (i >= 0) { customEvents.value.splice(i, 1); persistCustomEvents() }
  } else if (!hiddenEvents.value.includes(ev)) {
    hiddenEvents.value.push(ev)
    persistHiddenEvents()
  }
  const j = myForm.events.indexOf(ev)
  if (j >= 0) myForm.events.splice(j, 1)
  toast.pushToast({ title: `已删除事件「${ev}」` })
}

/* 自定义事件：添加 / 删除 */
function startAddEv() {
  addingEv.value = true
  newEv.value = ''
  nextTick(() => { if (addEvInput.value) addEvInput.value.focus() })
}
function cancelAddEv() {
  addingEv.value = false
  newEv.value = ''
}
function confirmAddEv() {
  const name = String(newEv.value || '').trim().slice(0, 6)
  if (!name) return cancelAddEv()
  if (allEvents.value.includes(name)) {
    toast.pushToast({ title: '事件已存在' })
    return
  }
  customEvents.value.push(name)
  persistCustomEvents()
  if (!myForm.events.includes(name)) myForm.events.push(name)
  addingEv.value = false
  newEv.value = ''
}
function delEvent(name) {
  pendingDelEv.value = null
  const i = customEvents.value.indexOf(name)
  if (i >= 0) {
    customEvents.value.splice(i, 1)
    persistCustomEvents()
  }
  const j = myForm.events.indexOf(name)
  if (j >= 0) myForm.events.splice(j, 1)
  toast.pushToast({ title: `已删除事件「${name}」` })
}

/* 长按自定义标签 / 自定义事件 500ms → 右上角出现删除钮（×），点 × 才真正删除。
   长按触发后吞掉随后的 click 选中 */
let pressTimer = null
let longFired = false
function chipDown(t) {
  if (!t.custom || delMode.value) return
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
  if (delMode.value) return /* 删除态：点标签本体不选中，只删右上角 × */
  myForm.mood = t.key
}
function evDown(ev) {
  if (!customEvents.value.includes(ev) || delMode.value) return
  longFired = false
  clearTimeout(pressTimer)
  pressTimer = setTimeout(() => {
    longFired = true
    pendingDelEv.value = ev
  }, 500)
}
function evUp() {
  clearTimeout(pressTimer)
}
/* 事件是多选：点一下选中，再点一下取消 */
function toggleEvent(ev) {
  if (longFired) return
  pendingDelEv.value = null
  if (delMode.value) return /* 删除态：点事件本体不勾选，只删右上角 × */
  const i = myForm.events.indexOf(ev)
  if (i >= 0) myForm.events.splice(i, 1)
  else myForm.events.push(ev)
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
  if (pendingDelEv.value && !e.target.closest('.mo-ev')) pendingDelEv.value = null
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  if (!contactsStore.list || !contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) { /* ignore */ }
  }
  await migrateLegacy()
  dayDate.value = todayStr() /* 日历下方默认展示今天 */
  await loadCardTexts() /* 字卡素材（TA 的碎碎念从这里抽） */
  await loadMyAvatar() /* 我的头像（跟随当前联系人，规则同一齐听歌） */
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

/* 日期行：最左「回到今天」，中间 ‹ 年月 › 居中，＋ 在最右（上方留白收窄，标题贴着头部） */
.mo-nav { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin: 4px 0 8px; }
.mo-nav-mid { display: flex; align-items: center; justify-content: center; gap: 6px; }
.mo-nav-arrow { border: none; background: transparent; font-size: 20px; color: var(--text-soft); padding: 0 4px; line-height: 1; }
.mo-nav-title { font-size: 15px; font-weight: 600; min-width: 96px; text-align: center; }
.mo-today-btn {
  justify-self: start; border: 1px solid var(--border); background: var(--bg-screen);
  color: var(--text-soft); font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer;
}
.mo-today-btn:active { transform: scale(0.94); }
.mo-nav-btn { border: none; background: transparent; color: var(--text-soft); padding: 5px; display: inline-flex; align-items: center; justify-self: end; }
.mo-nav-btn:active { transform: scale(0.92); }
.mo-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.mo-week { text-align: center; font-size: 11px; color: var(--text-soft); padding: 4px 0; }
.mo-cell {
  aspect-ratio: 1 / 1; box-sizing: border-box; border: 2px solid transparent; background: var(--bg-soft); border-radius: 10px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  padding: 0; position: relative;
}
.mo-cell.empty { background: transparent; }
.mo-cell.today { outline: 1.5px solid var(--accent); }
/* 选中：仅以边框标记（不填充），与今天的描边区分；今天被选中时只保留边框 */
.mo-cell.selected { border-color: var(--accent); }
.mo-cell.selected .mo-day { font-weight: 700; }
.mo-cell.selected.today { outline: none; }
.mo-day { font-size: 13px; color: var(--text); }
/* 同一天并排两个半透明小圆点：左 TA 右我，颜色各取当日最新心情色 */
.mo-dots { display: flex; align-items: center; gap: 3px; height: 6px; }
.mo-dots i { width: 6px; height: 6px; border-radius: 50%; opacity: 0.55; }
.mo-sec { font-size: 13px; color: var(--text-soft); margin: 18px 0 10px; font-weight: 500; }

/* 日历下方标题行：标题（左）+ 右上角「查看分布 / 取消」（右） */
.mo-sec-head { display: flex; align-items: center; gap: 10px; margin: 18px 0 10px; }
.mo-sec-head .mo-sec { margin: 0; flex: 1; min-width: 0; }
.mo-dist-btn {
  flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px;
  padding: 5px 12px; font-size: 12px; color: var(--text-soft); background: var(--bg-screen);
}
.mo-dist-btn:active { transform: scale(0.96); }
/* 本月心情分布面板（两栏纸卡：我 / TA） */
.mo-dist { display: flex; flex-direction: column; gap: 14px; }
.mo-dist-grp {
  background: color-mix(in srgb, #f8f2df 80%, var(--bg-screen));
  border: 1px solid color-mix(in srgb, #d9cca6 55%, var(--border));
  border-radius: 2px; padding: 12px; box-shadow: 0 1px 2px rgba(0, 0, 0, .07);
}
.mo-dist-grp-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.mo-dist-grp-head .mo-dist-total { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--text-soft); }
.mo-dist-empty { margin: 2px 0 0; font-size: 12px; color: var(--text-soft); }
.mo-dist-row { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
.mo-dist-name { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text); width: 66px; flex: 0 0 66px; }
.mo-dist-bar { flex: 1; height: 8px; background: var(--bg-soft); border-radius: 999px; overflow: hidden; }
.mo-dist-bar i { display: block; height: 100%; border-radius: 999px; }
.mo-dist-num { width: 22px; text-align: right; font-size: 12px; color: var(--text-soft); font-variant-numeric: tabular-nums; }

/* 双人小圆点（卡片名、表单标题用） */
.mo-idot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.mo-idot.me { background: var(--accent); }
.mo-idot.him { background: #7d8ba0; }

/* 日历下方：当天两人的记录卡片（整张卡片便签化：暖纸底 + 方角 + 顶部胶带） */
.mo-day { display: flex; flex-direction: column; gap: 12px; }
.mo-card {
  position: relative;
  border: 1px solid color-mix(in srgb, #d9cca6 55%, var(--border));
  border-radius: 2px; padding: 12px 12px 14px;
  background: var(--bg-screen);
  background: color-mix(in srgb, #f8f2df 80%, var(--bg-screen));
  box-shadow: 0 1px 2px rgba(0, 0, 0, .07);
}
/* 顶部斜贴的一小截透明胶带（做大做实，存在感更强） */
.mo-card::before {
  content: ''; position: absolute; top: -8px; left: calc(50% - 23px);
  width: 46px; height: 15px;
  background: color-mix(in srgb, #ffffff 58%, transparent);
  border-left: 1px dashed rgba(0, 0, 0, .06); border-right: 1px dashed rgba(0, 0, 0, .06);
  transform: rotate(-2.5deg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, .12);
}
/* TA 的卡片：冷调纸 */
.mo-card.him {
  background: color-mix(in srgb, #e9eef5 82%, var(--bg-screen));
  border-color: color-mix(in srgb, #aebccd 55%, var(--border));
}
.mo-card-head { display: flex; align-items: center; gap: 8px; }
.mo-card-name { font-size: 13px; font-weight: 600; }
.mo-card.me .mo-card-name { color: var(--accent); }
.mo-card.him .mo-card-name { color: #7d8ba0; }
.mo-card-edit {
  margin-left: auto; border: none; background: transparent; color: var(--text-soft);
  padding: 5px; border-radius: 8px; display: inline-flex; align-items: center;
}
.mo-card-edit:active { background: var(--bg-soft); transform: scale(0.94); }
.mo-card-mood { display: flex; align-items: center; gap: 7px; margin-top: 10px; font-size: 15px; font-weight: 600; color: var(--text); }
.mo-card-mood { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 7px; margin-top: 10px; font-size: 15px; font-weight: 600; color: var(--text); }
/* 卡片心情行里的事件小签（只读，跟在心情词旁边） */
.mo-card-mood .mo-ev { background: var(--bg-soft); color: var(--text-soft); border-radius: 999px; line-height: 1.4; font-weight: 400; }
.mo-card-time { margin-left: auto; font-size: 11px; font-weight: 400; color: var(--text-soft); font-variant-numeric: tabular-nums; letter-spacing: .03em; }
.mo-card-empty { margin: 8px 0 0; font-size: 12px; color: var(--text-soft); }
.mo-day-empty { text-align: center; font-size: 12px; color: var(--text-soft); padding: 20px 0 8px; line-height: 1.9; }

/* 碎碎念：卡片内的普通段落（便签感由整张卡片承担，不再单独贴条） */
.mo-note {
  margin: 10px 0 0; max-width: 100%;
  font-size: 12.5px; font-weight: 400; line-height: 1.8; color: var(--text);
  white-space: pre-wrap; word-break: break-word;
}
/* 自定义标签的纯色小点（无表情） */
.mo-tag-dot { width: 5px; height: 5px; border-radius: 50%; flex: 0 0 auto; }
.mo-tag-dot-lg { width: 8px; height: 8px; }

/* 记录表单弹窗 */
/* 记录表单弹窗：整体收短，内容多了内部滑动；头部吸顶 */
.mo-form-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; position: sticky; top: -16px; z-index: 1; background: var(--bg-screen); padding: 4px 0 8px; margin-bottom: 0; }
.mo-form-title { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 600; }
.mo-form-btns { display: flex; gap: 8px; flex: 0 0 auto; }
.mo-close-btn {
  border: 1px solid var(--border); border-radius: 10px; padding: 7px;
  background: var(--bg-soft); color: var(--text-soft);
  display: inline-flex; align-items: center;
}
.mo-close-btn:active { transform: scale(0.94); }
.mo-del-btn { color: #c0576b; }
.mo-form-sub { font-size: 11px; color: var(--text-soft); margin: 6px 0 0; }
.mo-fld-label { font-size: 12px; color: var(--text-soft); margin: 16px 0 8px; }
/* 弹窗收短：一屏放不下就内部滑动（从底部滑入） */
.md-sheet { max-height: 60vh; animation: mo-slide-up 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.05); }
@keyframes mo-slide-up { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: none } }
/* 事件 chips 与碎碎念输入框之间留间距 */
.md-textarea { margin-top: 12px; }
/* 心情 / 事件标签都做小一点 */
.mo-mood, .mo-ev {
  position: relative;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 9px; font-size: 11.5px;
  /* 长按删除：禁掉系统长按菜单/文本选择，按压缩放给反馈 */
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  touch-action: manipulation;
}
.mo-mood:active, .mo-ev:active { transform: scale(0.96); }
.mo-mood.on, .mo-ev.on { color: #fff; }
/* 长按 500ms 后右上角浮出删除钮 */
.mo-mood.pending, .mo-ev.pending { border-color: var(--text-soft); }
.mo-del {
  position: absolute; top: -7px; right: -7px; width: 16px; height: 16px;
  border: none; border-radius: 50%; background: #c0576b; color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}
/* 自定义标签入口与输入（按钮收窄，和输入框拉开距离） */
.mo-add { border-style: dashed; display: inline-flex; align-items: center; gap: 4px; }
.mo-ev-add { border-style: dashed; padding: 4px 10px; }
/* 「删除/完成」整列删除态开关：激活时实底，一眼看出在删档模式 */
.mo-del-mode { border-style: dashed; display: inline-flex; align-items: center; gap: 4px; color: var(--text-soft); }
.mo-del-mode.on { background: #c0576b; border-color: #c0576b; border-style: solid; color: #fff; }
.mo-add-input {
  width: 84px; padding: 5px 10px; font-size: 12px; border: 1px solid var(--accent);
  border-radius: 999px; background: var(--bg-screen); color: var(--text); outline: none;
}
.mo-add-ok, .mo-add-cancel { padding: 5px 10px; font-size: 11px; border-radius: 999px; border: none; }
.mo-add-ok { background: var(--accent); color: #fff; }
.mo-add-cancel { background: var(--bg-soft); color: var(--text-soft); }
</style>
