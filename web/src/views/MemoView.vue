<template>
  <div class="mm-page" :class="{ dragging: !!g.id }">
    <AppHeader title="备忘录" back>
      <template #right>
        <button class="mm-op" @click="openAdd" aria-label="添加">
          <svg viewBox="0 0 24 24" width="21" height="21">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none" />
          </svg>
        </button>
      </template>
    </AppHeader>

    <div class="mm-body">
      <!-- 类型筛选 + 时间排序 -->
      <div class="mm-filter">
        <button class="mm-chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button class="mm-chip" :class="{ on: filter === 'todo' }" @click="filter = 'todo'">待办</button>
        <button class="mm-chip" :class="{ on: filter === 'note' }" @click="filter = 'note'">便签</button>
        <button class="mm-chip" :class="{ on: filter === 'done' }" @click="filter = 'done'">已完成</button>
        <button class="mm-sort" :aria-label="sortAsc ? '切换为最新在上' : '切换为最早在上'" @click="sortAsc = !sortAsc">
          {{ sortAsc ? '时间 ↑' : '时间 ↓' }}
        </button>
      </div>

      <p v-if="loading" class="mm-tip">加载中…</p>
      <template v-else>
        <div class="mm-board">
          <div
            v-for="m in board"
            :key="m.id"
            class="mm-wrap"
          >
            <!-- 左滑后露出的删除按钮 -->
            <button class="mm-del" @click.stop="confirmDelete(m)">删除</button>

            <div
              class="mm-card"
              :style="cardStyle(m)"
              @pointerdown.stop="down(m, $event)"
              @pointermove="move($event)"
              @pointerup="up(m, $event)"
              @pointercancel="cancel"
            >
              <!-- 右上角：铅笔（编辑）+ 图钉（置顶）。未置顶时图钉极淡，不抢视觉 -->
              <button class="mm-edit" @click.stop="openEdit(m)" aria-label="编辑">
                <svg viewBox="0 0 24 24" width="14" height="14">
                  <path d="M4.5 19.5l4-1 9.8-9.8a1.9 1.9 0 0 0-2.7-2.7L5.8 15.8l-1.3 3.7z M14.2 7.4l2.4 2.4"
                    fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
              <button class="mm-pin" :class="{ on: m.pinned }" @click.stop="togglePin(m)" :aria-label="m.pinned ? '取消置顶' : '置顶'">
                <svg viewBox="0 0 24 24" width="15" height="15">
                  <path d="M14.5 3.5l6 6-2 2-1.3-1.3-4.2 4.2.7 3.1-1.6 1.6-2.4-2.4-3.4 3.4-1.4-1.4 3.4-3.4-2.4-2.4 1.6-1.6 3.1.7 4.2-4.2L5.5 9.5z"
                    :fill="m.pinned ? '#d98a3d' : 'none'" :stroke="m.pinned ? '#d98a3d' : 'rgba(0,0,0,.14)'" stroke-width="1.4" stroke-linejoin="round" />
                </svg>
              </button>

              <span class="mm-type" :class="m.type">{{ m.type === 'todo' ? '待办' : '便签' }}</span>

              <!-- 待办：标题 + 子任务清单 -->
              <template v-if="m.type === 'todo'">
                <div v-if="m.title" class="mm-head">{{ m.title }}</div>
                <ul class="mm-todos">
                  <li v-for="(t, i) in m.todos" :key="i" class="mm-todo" :class="{ done: t.done }" @click.stop="toggleTodo(m, i)">
                    <span class="mm-box" :class="{ on: t.done }">
                      <AppIcon v-if="t.done" name="check" :size="11" color="#fff" />
                    </span>
                    <span class="mm-todo-text">{{ t.text }}</span>
                  </li>
                </ul>
                <div v-if="!m.todos.length" class="mm-empty-sub">还没有待办项，点开编辑添加</div>
              </template>

              <!-- 便签：纯正文 -->
              <template v-else>
                <div class="mm-note-text">{{ m.note }}</div>
              </template>

              <!-- 卡片底部：创建日期（待办另显截止日期，时间在日期下面） -->
              <div class="mm-foot">
                <span class="mm-date">{{ fmtCreated(m) }}</span>
                <span v-if="m.type === 'todo' && m.due" class="mm-due">
                  <!-- 设了提醒：截止日期前挂个小铃铛 -->
                  <span class="mm-due-line">
                    <svg v-if="m.remind && Number(m.remind.on)" class="mm-remind-ico" viewBox="0 0 24 24" width="12" height="12" aria-label="已设提醒">
                      <path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 4.2-1.6 5.6-2.3 6.1-.4.3-.2 1 .3 1h15c.5 0 .7-.7.3-1-.7-.5-2.3-1.9-2.3-6.1A5.5 5.5 0 0 0 12 3zM10 17.5a2 2 0 0 0 4 0h-4z"
                        fill="#c0724f" />
                    </svg>
                    <span class="mm-due-date">{{ fmtDue(m.due) }}</span>
                  </span>
                  <span v-if="dueTimeOf(m.due)" class="mm-due-time">{{ dueTimeOf(m.due) }}</span>
                </span>
              </div>
            </div>
          </div>

        </div>

        <!-- 空状态提示：必须放在瀑布流容器外，否则会被 column-count 分栏截成两半 -->
        <p v-if="!board.length" class="mm-empty">
          {{ filter === 'done' ? '还没有已完成的事项' : '这里还很空' }}<br />
          <span class="mm-empty-sub">{{ filter === 'done' ? '把待办都勾完，就会收进这里' : '点右上角「＋」写一张随手贴' }}</span>
        </p>
      </template>
    </div>

    <!-- 新建 / 编辑 -->
    <div v-if="show" class="mm-mask" @click.self="close">
      <div class="mm-sheet">
        <h3 class="mm-sheet-title">{{ editing ? '编辑' : '新建备忘' }}</h3>

        <div class="mm-scroll">
        <div class="mm-type-pick">
          <button class="mm-type-btn" :class="{ on: form.type === 'todo' }" @click="form.type = 'todo'">待办清单</button>
          <button class="mm-type-btn" :class="{ on: form.type === 'note' }" @click="form.type = 'note'">自由便签</button>
        </div>

        <template v-if="form.type === 'todo'">
          <!-- 标题 / 待办项用自动增高的多行输入：长文本换行展示，不会被横向截断 -->
          <textarea v-model="form.title" v-grow class="mm-input mm-ta" placeholder="标题（可选）" maxlength="40" rows="1"></textarea>
          <div class="mm-todo-edit">
            <div v-for="(t, i) in form.todos" :key="i" class="mm-te-row">
              <textarea v-model="t.text" v-grow class="mm-te-input mm-ta" rows="1" :placeholder="`第 ${i + 1} 项`" maxlength="60" @keydown="onItemKey($event)"></textarea>
              <button class="mm-te-del" @click="form.todos.splice(i, 1)" aria-label="删除该项">×</button>
            </div>
            <button class="mm-te-add" @click="addTodo">＋ 添加一项</button>
          </div>
          <div class="mm-fld">
            <span class="mm-fld-label">截止日期（可选，可精确到时间）</span>
            <input v-model="form.due" class="mm-input" type="datetime-local" />
          </div>
          <!-- 提醒：到点 / 提前 N 分钟；提醒人选「无」= 弹窗提醒我，选联系人 = 弹窗文案前缀加上对方名字 -->
          <div class="mm-fld">
            <div class="mm-remind-head">
              <span class="mm-fld-label">提醒</span>
              <ToggleSwitch v-model="form.remindOn" :disabled="!form.due" />
            </div>
            <template v-if="form.remindOn && form.due">
              <div class="mm-rm-chips">
                <button class="mm-rm-chip" :class="{ on: form.remindOffset === 0 }" @click="form.remindOffset = 0">到点提醒</button>
                <button class="mm-rm-chip" :class="{ on: form.remindOffset > 0 }" @click="form.remindOffset = form.remindOffset > 0 ? form.remindOffset : 15">提前提醒</button>
              </div>
              <div v-if="form.remindOffset > 0" class="mm-rm-chips">
                <button v-for="o in REMIND_OFFSETS" :key="o.v" class="mm-rm-chip sm" :class="{ on: form.remindOffset === o.v }" @click="form.remindOffset = o.v">{{ o.n }}</button>
              </div>
              <div class="mm-remind-to">
                <span class="mm-fld-label">提醒人</span>
                <!-- 应用内单选列表，不用系统原生的下拉弹窗 -->
                <button type="button" class="mm-rm-picker" @click="contactPicker = true">
                  <span class="mm-rm-picker-name">{{ remindContactName }}</span>
                  <svg class="mm-rm-picker-arrow" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M8 10l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </div>
              <p v-if="remindHint" class="mm-remind-hint">{{ remindHint }}</p>
            </template>
            <p v-else-if="!form.due" class="mm-remind-hint">先设置截止日期，才能开启提醒</p>
          </div>
        </template>
        <template v-else>
          <textarea v-model="form.note" class="mm-textarea" placeholder="随便写点什么…像一张空白信纸" />
        </template>

        <div class="mm-color-row">
          <span class="mm-color-label">颜色</span>
          <button
            v-for="c in PALETTE"
            :key="c"
            class="mm-color"
            :class="{ on: form.color === c }"
            :style="{ background: c }"
            @click="form.color = c"
            :aria-label="`颜色 ${c}`"
          />
        </div>

        <div class="mm-pin-row">
          <span class="row-title">置顶</span>
          <ToggleSwitch v-model="form.pinned" />
        </div>
        </div>

        <div class="mm-actions">
          <button v-if="editing" class="mm-btn danger" @click="removeEditing">删除</button>
          <button class="mm-btn ghost" @click="close">取消</button>
          <button class="mm-btn primary" @click="save">保存</button>
        </div>
      </div>
    </div>

    <!-- 提醒人选择：应用内单选列表 -->
    <Modal :show="contactPicker" title="选择提醒人" width="300px" @close="contactPicker = false">
      <div class="mr-pick-list">
        <button
          v-for="c in remindContactOptions"
          :key="c.id"
          type="button"
          class="mr-pick-item"
          :class="{ on: form.remindContact === c.id }"
          :data-id="c.id"
          @click="pickContact(c.id)"
        >
          <span class="mr-pick-name">{{ c.name }}</span>
          <AppIcon v-if="form.remindContact === c.id" name="check" :size="14" color="var(--accent)" />
        </button>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import Modal from '@/components/common/Modal.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import { useContactsStore } from '@/stores/contacts'
import { confirmDialog } from '@/utils/dialog'
import { remindAtMs } from '@/local/services/memoReminder.service'

const { items, loading, load, add, update, remove: removeItem } = useItems('memo')
const toast = useNotificationsStore()
const contactsStore = useContactsStore()
const filter = ref('all')
const sortAsc = ref(false) /* false：最新在上（默认）；true：最早在上 */

const PALETTE = ['#fff7e6', '#fdeef0', '#eef4fb', '#eaf5ee', '#f3eefb', '#fdf3e3', '#eef7f6', '#f6eef4']

/* 提前提醒的预设（分钟） */
const REMIND_OFFSETS = [
  { v: 5, n: '5 分钟' },
  { v: 15, n: '15 分钟' },
  { v: 30, n: '30 分钟' },
  { v: 60, n: '1 小时' },
  { v: 1440, n: '1 天' }
]

/* 旧数据（无 type）兼容：归一成 待办，标题作为唯一子任务 */
function normalize(it) {
  const ex = it.extra || {}
  let type = ex.type
  let todos = ex.todos || []
  let color = ex.color || PALETTE[0]
  let pinned = !!Number(ex.pinned)
  if (!type) {
    type = 'todo'
    todos = it.title ? [{ text: it.title, done: !!Number(it.done) }] : []
  }
  return { ...it, type, todos, color, pinned, due: ex.due || '', note: it.body || '', remind: ex.remind || null }
}

const all = computed(() => items.value.map(normalize))
/* 待办卡「已完成」：有子任务且全部勾完（便签无完成概念） */
function isDone(m) {
  return m.type === 'todo' && m.todos.length > 0 && m.todos.every((t) => t.done)
}
const board = computed(() => {
  let list
  if (filter.value === 'all') list = all.value.filter((m) => !isDone(m)) /* 已完成的只在「已完成」里 */
  else if (filter.value === 'done') list = all.value.filter(isDone)
  else list = all.value.filter((m) => m.type === filter.value && !isDone(m))
  const dir = sortAsc.value ? 1 : -1
  return list.slice().sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1
    return (Number(a.updated_at || 0) - Number(b.updated_at || 0)) * dir
  })
})

/* 日期文案：创建时间（秒级时间戳 → M月D日） */
function fmtCreated(m) {
  const sec = Number(m.created_at || 0)
  if (!sec) return ''
  const d = new Date(sec * 1000)
  return `${d.getMonth() + 1}月${d.getDate()}日创建`
}
/* 截止日期：'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm' → M月D日（时间部分单独一行） */
function fmtDue(s) {
  const d = new Date(`${s.split('T')[0]}T00:00:00`)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
function dueTimeOf(s) {
  const t = String(s || '').split('T')[1]
  return t ? t.slice(0, 5) : ''
}

/* ═══ 手势：长按删除 / 左滑露出删除 / 点击编辑 ═══ */
const g = reactive({ id: null, x0: 0, y0: 0, t0: 0, moved: false, tx: 0, long: false })
const openId = ref(null)
const dragId = computed(() => (g.moved ? g.id : null))
let pressTimer = null

function down(m, e) {
  /* 卡片内的交互元素（铅笔/图钉/待办行）不启动手势 */
  const t = e.target
  if (t && t.closest && (t.closest('.mm-edit') || t.closest('.mm-pin') || t.closest('.mm-todo'))) return
  if (openId.value && openId.value !== m.id) openId.value = null
  g.id = m.id
  g.x0 = e.clientX
  g.y0 = e.clientY
  g.t0 = Date.now()
  g.moved = false
  g.tx = 0
  g.long = false
  pressTimer = setTimeout(() => {
    if (g.id === m.id && !g.moved) {
      g.long = true
      confirmDelete(m)
    }
  }, 500)
}
function move(e) {
  if (!g.id) return
  const dx = e.clientX - g.x0
  const dy = e.clientY - g.y0
  /* 阈值放宽：触摸点按的轻微晃动仍算「点击」，不至于误判成滑动 */
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
    g.moved = true
    clearTimeout(pressTimer)
  }
  if (!g.long) g.tx = Math.min(0, dx)
}
function up(m, e) {
  clearTimeout(pressTimer)
  if (!g.id) return
  if (g.long) {
    reset()
    return
  }
  if (g.moved && g.tx <= -56) {
    openId.value = m.id
  } else {
    /* 点卡片本体只负责收起滑出的删除（修改入口统一为铅笔） */
    openId.value = null
  }
  reset()
}
function cancel() {
  clearTimeout(pressTimer)
  reset()
}
function reset() {
  g.id = null
  g.tx = 0
  g.moved = false
  g.long = false
}
function cardStyle(m) {
  const base = { background: m.color || PALETTE[0] }
  if (openId.value === m.id) return { ...base, transform: 'translateX(-76px)' }
  if (dragId.value === m.id) return { ...base, transform: `translateX(${g.tx}px)` }
  return base
}

/* ═══ 数据操作 ═══ */
function findRaw(id) {
  return items.value.find((x) => x.id === id)
}
async function toggleTodo(m, i) {
  const raw = findRaw(m.id)
  if (!raw) return
  const todos = (raw.extra.todos || []).map((t, idx) => (idx === i ? { ...t, done: !t.done } : t))
  try {
    await update(m.id, { extra: { ...raw.extra, todos } })
  } catch (e) { /* ignore */ }
}
async function togglePin(m) {
  const raw = findRaw(m.id)
  if (!raw) return
  const pinned = raw.extra.pinned ? 0 : 1
  try {
    await update(m.id, { extra: { ...raw.extra, pinned } })
  } catch (e) { /* ignore */ }
}
async function confirmDelete(m) {
  if (!(await confirmDialog({ title: '删除这张备忘？', danger: true }))) return
  await removeItem(m.id)
  openId.value = null
  toast.pushToast({ title: '已删除' })
}

/* ═══ 新建 / 编辑 ═══ */
const show = ref(false)
const editing = ref(null)
const form = reactive({ id: null, type: 'todo', title: '', todos: [], note: '', color: PALETTE[0], pinned: false, due: '', remindOn: false, remindOffset: 0, remindContact: 0 })

/* 提醒人候选：「无」= 屏幕中间弹窗提醒我；其余为联系人（排除群聊与已拉黑） */
const contactPicker = ref(false)
const remindContactOptions = computed(() => [
  { id: 0, name: '无' },
  ...(contactsStore.list || []).filter((c) => c.kind !== 'group' && !Number(c.blocked))
])
const remindContactName = computed(() => {
  const c = remindContactOptions.value.find((x) => x.id === form.remindContact)
  return c ? c.name : '无'
})
function pickContact(id) {
  form.remindContact = id
  contactPicker.value = false
}

/* 提醒时间预览：「将于 10月26日 09:00 由「XX」提醒你」/「弹窗提醒你」 */
const remindHint = computed(() => {
  if (!form.due || !form.remindOn) return ''
  const at = remindAtMs(form.due, form.remindOffset)
  if (!at) return ''
  const d = new Date(at)
  const pad = (n) => String(n).padStart(2, '0')
  const when = `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  const c = remindContactOptions.value.find((x) => x.id === form.remindContact)
  return c && c.id > 0 ? `将于 ${when} 由「${c.name}」提醒你` : `将于 ${when} 弹窗提醒你`
})

/* 截止日期被清空时自动关闭提醒（提醒依赖截止时间） */
watch(
  () => form.due,
  (v) => {
    if (!v && form.remindOn) form.remindOn = false
  }
)

/* 自动增高的多行输入：随内容换行拉高，长文本不再被横向截断。
   scrollLeft 归零是兜底：任何情况下输入内容左对齐显示，绝不出现「左边被截」。
   input 事件里也做一次：IME 组词 / 粘贴等路径下 Vue 的 updated 钩子可能不触发 */
const vGrow = {
  mounted(el) {
    growTa(el)
    el.__growInput = () => growTa(el)
    el.addEventListener('input', el.__growInput)
  },
  updated(el) {
    growTa(el)
  },
  unmounted(el) {
    if (el.__growInput) {
      el.removeEventListener('input', el.__growInput)
      el.__growInput = null
    }
  }
}
function growTa(el) {
  el.scrollLeft = 0
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  el.scrollLeft = 0
}
/* 回车（不加 Shift）快速添加下一项；Shift+回车 换行 */
function onItemKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    addTodo()
  }
}

function openAdd() {
  editing.value = null
  Object.assign(form, { id: null, type: 'todo', title: '', todos: [{ text: '', done: false }], note: '', color: PALETTE[0], pinned: false, due: '', remindOn: false, remindOffset: 0, remindContact: 0 })
  openId.value = null
  show.value = true
}
function openEdit(m) {
  editing.value = m.id
  const rm = m.remind
  Object.assign(form, {
    id: m.id,
    type: m.type,
    title: m.title || '',
    todos: (m.todos || []).map((t) => ({ ...t })),
    note: m.note || '',
    color: m.color,
    pinned: m.pinned,
    due: m.due || '',
    remindOn: !!(rm && Number(rm.on) && m.due),
    remindOffset: rm && Number(rm.offset) > 0 ? Number(rm.offset) : 0,
    remindContact: rm && Number(rm.contactId) ? Number(rm.contactId) : 0
  })
  show.value = true
}
function close() {
  show.value = false
}
function addTodo() {
  form.todos.push({ text: '', done: false })
}
async function save() {
  if (form.type === 'todo') {
    if (!form.title.trim() && !form.todos.some((t) => t.text.trim())) {
      toast.pushToast({ title: '写点内容吧' })
      return
    }
    form.todos = form.todos.filter((t) => t.text.trim())
  } else {
    if (!form.note.trim()) {
      toast.pushToast({ title: '写点内容吧' })
      return
    }
  }
  const payload =
    form.type === 'todo'
      ? { title: form.title.trim(), body: '', extra: { type: 'todo', color: form.color, pinned: form.pinned ? 1 : 0, todos: form.todos, due: form.due || '' } }
      : { title: '', body: form.note.trim(), extra: { type: 'note', color: form.color, pinned: form.pinned ? 1 : 0, todos: [] } }
  /* 提醒配置（仅待办 + 填了截止日期才落库）；fired 每次保存重置——改存即重新装弹 */
  if (form.type === 'todo' && form.remindOn && form.due) {
    payload.extra.remind = { on: 1, offset: form.remindOffset, contactId: form.remindContact, fired: 0 }
  }
  const id = editing.value
  close()
  try {
    if (id) await update(id, payload)
    else await add(payload)
    toast.pushToast({ title: '已保存' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function removeEditing() {
  if (!(await confirmDialog({ title: '删除这张备忘？', danger: true }))) return
  await removeItem(editing.value)
  close()
  toast.pushToast({ title: '已删除' })
}

onMounted(() => {
  load()
  /* 提醒人下拉要用；列表空时拉一次（App 启动时通常已加载） */
  if (!contactsStore.list.length) contactsStore.load().catch(() => {})
})
</script>

<style scoped>
.mm-page { min-height: 100%; background:
  radial-gradient(circle at 20% 12%, rgba(214,196,160,.10), transparent 40%),
  radial-gradient(circle at 82% 30%, rgba(201,160,150,.08), transparent 42%),
  #f7f2e7;
}
/* 右上角＋：无边框，仅细线图标 */
.mm-op { border: none; background: transparent; color: var(--text); padding: 6px; display: inline-flex; align-items: center; justify-content: center; }
.mm-op:active { transform: scale(0.92); }
.mm-body { padding: 12px; }
.mm-filter { display: flex; gap: 6px; margin-bottom: 12px; align-items: center; overflow-x: auto; scrollbar-width: none; }
.mm-filter::-webkit-scrollbar { display: none; }
.mm-chip { border: 1px solid var(--border); background: rgba(255,255,255,.5); color: var(--text-soft); border-radius: 999px; padding: 5px 13px; font-size: 12.5px; white-space: nowrap; flex: 0 0 auto; }
.mm-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.mm-sort { margin-left: auto; border: 1px solid var(--border); background: rgba(255,255,255,.5); color: var(--text-soft); border-radius: 999px; padding: 5px 12px; font-size: 12px; white-space: nowrap; flex: 0 0 auto; }
.mm-sort:active { transform: scale(0.95); }

/* 瀑布流：CSS 多列 */
.mm-board { column-count: 2; column-gap: 10px; }
@media (min-width: 560px) { .mm-board { column-count: 3; } }
.mm-wrap { position: relative; break-inside: avoid; margin-bottom: 10px; }
.mm-card {
  position: relative; border-radius: 12px; padding: 12px 12px 14px;
  background: #fff7e6; box-shadow: 0 1px 3px rgba(120,90,60,.12);
  transition: transform .18s ease; touch-action: pan-y; user-select: none;
}
.mm-edit { position: absolute; top: 8px; right: 30px; background: transparent; border: none; padding: 2px; cursor: pointer; display: flex; align-items: center; }
.mm-edit:active { transform: scale(0.9); }
.mm-pin { position: absolute; top: 8px; right: 8px; background: transparent; border: none; padding: 2px; cursor: pointer; }
.mm-type { display: inline-block; font-size: 10px; color: var(--text-soft); border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; margin-bottom: 8px; }
.mm-type.note { color: #b07a86; border-color: rgba(176,122,134,.4); }
.mm-head { font-size: 14px; font-weight: 600; color: #4a3f33; margin: 2px 18px 8px 0; line-height: 1.4; }
.mm-todos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.mm-todo { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #4a3f33; cursor: pointer; }
.mm-todo.done .mm-todo-text { color: #c3baa9; text-decoration: line-through; }
.mm-box { flex: 0 0 auto; width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid #c9bca6; background: transparent; display: flex; align-items: center; justify-content: center; margin-top: 1px; }
.mm-box.on { background: #8fb98a; border-color: #8fb98a; }
.mm-todo-text { flex: 1; line-height: 1.45; word-break: break-word; }
.mm-empty-sub { font-size: 12px; color: var(--text-soft); margin-top: 6px; }
.mm-note-text { font-size: 13.5px; line-height: 1.7; color: #4a3f33; white-space: pre-wrap; word-break: break-word; }

/* 卡片底部：创建日期 + 截止日期（时间显示在日期下面） */
.mm-foot { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; margin-top: 10px; }
.mm-date { font-size: 10.5px; color: rgba(74, 63, 51, .38); }
.mm-due { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; white-space: nowrap; }
.mm-due-date { font-size: 10.5px; color: #c0724f; }
.mm-due-time { font-size: 10px; color: #c0724f; opacity: .8; }

.mm-del {
  position: absolute; top: 0; right: 0; height: 100%; width: 76px;
  background: #d9534f; color: #fff; border: none; border-radius: 0 12px 12px 0;
  font-size: 14px;
}
.mm-empty { text-align: center; color: var(--text-soft); margin-top: 40px; font-size: 14px; line-height: 1.8; }
.mm-tip { text-align: center; color: var(--text-soft); margin-top: 30px; }

/* 弹层（左右留白 22px：输入框不贴弹窗边缘，避免高亮边框显得被截断） */
.mm-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; z-index: 50; }
.mm-sheet { width: 100%; background: var(--bg-screen); border-radius: 16px 16px 0 0; padding: 16px 22px calc(16px + env(safe-area-inset-bottom)); max-height: 86vh; display: flex; flex-direction: column; overflow: hidden; }
.mm-sheet-title { font-size: 16px; font-weight: 600; margin: 0 0 12px; }
.mm-type-pick { display: flex; gap: 8px; margin-bottom: 12px; }
.mm-type-btn { flex: 1; border: 1px solid var(--border); background: var(--bg-soft); border-radius: 10px; padding: 10px; font-size: 14px; color: var(--text-soft); }
.mm-type-btn.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.mm-input, .mm-textarea, .mm-te-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: 10px; padding: 10px; font-size: 14px; background: var(--bg-soft); }
.mm-textarea { min-height: 130px; resize: none; line-height: 1.6; overflow-wrap: anywhere; word-break: break-word; }
.mm-todo-edit { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.mm-te-row { display: flex; gap: 8px; align-items: center; min-width: 0; }
.mm-te-del { width: 30px; height: 36px; border: none; background: transparent; color: #d9534f; font-size: 20px; flex: 0 0 auto; }
.mm-te-add { align-self: flex-start; border: 1px dashed var(--border); background: transparent; color: var(--text-soft); border-radius: 10px; padding: 8px 14px; font-size: 13px; }
/* 自动增高的多行输入（标题 / 待办项）：随内容换行拉高，长文本不再被横向截断。
   长串（无空格英文/数字/URL）也允许任意处断行，配合 JS 里 scrollLeft 归零，
   双保险杜绝「输入框左边被截」。横向绝不滚动（overflow-x:hidden），
   超过 120px 上限后允许纵向滚动查看已输入的内容 */
.mm-ta { overflow-x: hidden; overflow-y: auto; resize: none; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word; }
/* 提醒区块 */
.mm-remind-head { display: flex; align-items: center; justify-content: space-between; }
.mm-remind-head .mm-fld-label { margin-bottom: 0; }
.mm-rm-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.mm-rm-chip { border: 1px solid var(--border); background: var(--bg-soft); color: var(--text-soft); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; }
.mm-rm-chip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.mm-rm-chip.sm { padding: 5px 11px; font-size: 12px; }
.mm-remind-to { margin-top: 12px; }
/* 提醒人选择器：外观同输入框的按钮，点击弹应用内单选列表（不用系统原生下拉） */
.mm-rm-picker {
  width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between;
  border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 14px;
  background: var(--bg-soft); color: var(--text); text-align: left;
}
.mm-rm-picker-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-rm-picker-arrow { flex: 0 0 auto; color: var(--text-soft); }
.mm-remind-hint { font-size: 11.5px; color: var(--text-soft); margin: 8px 0 0; line-height: 1.6; }
/* 提醒人单选列表 */
.mr-pick-list { display: flex; flex-direction: column; }
.mr-pick-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: none; background: transparent; padding: 12px 6px; font-size: 14px; color: var(--text);
  border-bottom: 1px solid var(--border); text-align: left;
}
.mr-pick-item:last-child { border-bottom: none; }
.mr-pick-item.on { color: var(--accent); font-weight: 600; }
.mr-pick-item.on .mr-pick-name { color: var(--accent); }
.mr-pick-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mm-due-line { display: flex; align-items: center; gap: 3px; }
.mm-remind-ico { flex: 0 0 auto; }
.mm-fld { margin-top: 12px; }
.mm-fld-label { display: block; font-size: 12.5px; color: var(--text-soft); margin-bottom: 6px; }
.mm-color-row { display: flex; align-items: center; gap: 8px; margin: 14px 0; flex-wrap: wrap; }
.mm-color-label { font-size: 13px; color: var(--text-soft); margin-right: 2px; }
.mm-color { width: 26px; height: 26px; border-radius: 7px; border: 2px solid transparent; }
.mm-color.on { border-color: var(--accent); }
.mm-pin-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 14px; }
.mm-pin-row .row-title { font-size: 14px; }
/* 中间内容滚动；标题与按钮固定不随滚动 */
.mm-scroll { flex: 1; min-height: 0; overflow-y: auto; }
/* 取消/保存固定底部，按钮大小与心情弹窗一致 */
.mm-actions { display: flex; gap: 10px; flex: 0 0 auto; margin-top: 12px; }
.mm-btn { flex: 1; border: none; border-radius: 10px; padding: 12px; font-size: 15px; }
.mm-btn.ghost { background: var(--bg-soft); color: var(--text); }
.mm-btn.primary { background: var(--accent); color: #fff; }
.mm-btn.danger { background: #fbe9e8; color: #d9534f; }

/* ── 深色模式：米纸底翻深暖棕；便签卡的内联 pastel 底色无法用类规则覆盖
   （inline 优先级高于一切非 !important 规则），用 ::after 暗色叠加层压深，
   既保留每张便签的色相身份，又让浅色底变深；卡片文字整体翻亮 ── */
html[data-theme='dark'] .mm-page {
  background:
    radial-gradient(circle at 20% 12%, rgba(214,196,160,.05), transparent 40%),
    radial-gradient(circle at 82% 30%, rgba(201,160,150,.04), transparent 42%),
    #1b1815;
}
html[data-theme='dark'] .mm-chip,
html[data-theme='dark'] .mm-sort { background: rgba(255,255,255,.07); }
/* isolation 建立层叠上下文，使 ::after 的 z-index:-1 压在卡片底色之上、文字之下 */
html[data-theme='dark'] .mm-card { isolation: isolate; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
html[data-theme='dark'] .mm-card::after {
  content: ''; position: absolute; inset: 0; z-index: -1;
  border-radius: inherit; pointer-events: none;
  background: rgba(20,17,22,.80);
}
/* 内联 SVG 的 stroke 是 presentation attribute，优先级低于 CSS，可直接覆盖 */
html[data-theme='dark'] .mm-edit path { stroke: rgba(255,255,255,.45); }
html[data-theme='dark'] .mm-pin path { stroke: rgba(255,255,255,.22); }
html[data-theme='dark'] .mm-pin.on path { stroke: #d98a3d; }
html[data-theme='dark'] .mm-type.note { color: #d9a0a8; border-color: rgba(217,160,168,.35); }
html[data-theme='dark'] .mm-head,
html[data-theme='dark'] .mm-todo,
html[data-theme='dark'] .mm-note-text { color: #e8e1d5; }
html[data-theme='dark'] .mm-todo.done .mm-todo-text { color: rgba(232,225,213,.45); }
html[data-theme='dark'] .mm-box { border-color: rgba(232,225,213,.35); }
html[data-theme='dark'] .mm-date { color: rgba(232,225,213,.45); }
html[data-theme='dark'] .mm-due-date,
html[data-theme='dark'] .mm-due-time { color: #dd9a78; }
html[data-theme='dark'] .mm-btn.danger { background: rgba(217,83,79,.18); color: #e87b76; }
</style>
