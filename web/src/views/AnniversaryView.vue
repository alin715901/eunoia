<template>
  <div class="ann-page">
    <AppHeader title="纪念" back>
      <template #right>
        <button class="ap-add" @click="openAdd" aria-label="添加纪念日">
          <AppIcon name="plus" :size="22" color="var(--text)" />
        </button>
      </template>
    </AppHeader>

    <div class="ap-body">
      <!-- 板块切换：我的 / 联系人 -->
      <div class="ap-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="ap-tab"
          :class="{ on: tab === t.key }"
          @click="tab = t.key"
        >{{ t.name }}</button>
      </div>

      <p v-if="loading" class="ap-tip">加载中…</p>

      <template v-else>
        <section class="ap-group" v-if="currentItems.length">
          <h2 class="ap-gtitle">{{ currentTitle }}</h2>
          <div class="ap-list">
            <div class="ap-item" v-for="a in currentItems" :key="a.id">
              <span class="ap-ic"><AppIcon :name="a.type === 'countdown' ? 'hourglass' : 'calendar'" :size="16" :color="a.type === 'countdown' ? '#5b8def' : 'var(--accent)'" /></span>
              <span class="ap-main">
                <span class="ap-name">{{ a.title }}</span>
                <span class="ap-date">{{ displayDate(a) }}</span>
              </span>
              <span class="ap-tag" :class="a.type === 'countdown' ? 'tg-cd' : 'tg-an'">{{ a.type === 'countdown' ? '倒数日' : '纪念日' }}</span>
              <span class="ap-days">{{ daysInfo(a) }}</span>
              <button class="ap-edit" @click="openEdit(a)" aria-label="编辑"><AppIcon name="edit" :size="15" color="var(--text-soft)" /></button>
              <button class="ap-del" @click="remove(a)" aria-label="删除"><AppIcon name="trash" :size="15" color="#c0576b" /></button>
            </div>
          </div>
        </section>
        <p v-else class="ap-empty">
          {{ tab === 'mine' ? '我的纪念日还是空的' : '这个联系人还没有纪念日' }}<br />
          <span class="ap-empty-sub">点右上角「＋」添加一个</span>
        </p>
      </template>
    </div>

    <!-- 添加 / 编辑弹窗 -->
    <div v-if="showModal" class="ap-mask" @click.self="closeModal">
      <div class="ap-modal">
        <h3 class="ap-mtitle">{{ editing ? '编辑纪念日' : '新建纪念日' }}</h3>

        <label class="fld">
          <span class="fld-label">名称</span>
          <input class="field" v-model="form.title" placeholder="例如：在一起的日子" maxlength="30" />
        </label>

        <!-- 日期：历法切换就放在选日期这一行，选农历后日期直接按农历显示 -->
        <div class="fld">
          <div class="fld-head">
            <span class="fld-label">日期</span>
            <div class="cal-seg">
              <button type="button" :class="{ on: form.calendar === 'solar' }" @click="form.calendar = 'solar'">公历</button>
              <button type="button" :class="{ on: form.calendar === 'lunar' }" @click="form.calendar = 'lunar'">农历</button>
            </div>
          </div>
          <input class="field" type="date" v-model="form.date" />
          <p v-if="datePreview" class="fld-hint">{{ datePreview }}</p>
        </div>

        <div class="fld">
          <span class="fld-label">类型</span>
          <div class="seg">
            <button :class="{ on: form.type === 'anniversary' }" @click="form.type = 'anniversary'">纪念日</button>
            <button :class="{ on: form.type === 'countdown' }" @click="form.type = 'countdown'">倒数日</button>
          </div>
        </div>

        <label class="fld">
          <span class="fld-label">归属</span>
          <select class="field" v-model="form.contactId">
            <option value="">我的（通用）</option>
            <option v-for="c in personList" :key="c.id" :value="String(c.id)">{{ c.name }}</option>
          </select>
        </label>

        <p v-if="formErr" class="ap-err">{{ formErr }}</p>

        <div class="ap-actions">
          <button class="ap-btn ghost" @click="closeModal">取消</button>
          <button class="ap-btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { getAnniversaries, createAnniversary, updateAnniversary, deleteAnniversary } from '@/api/anniversary'
import { lunarText, displayDate } from '@/utils/lunar'
import { confirmDialog, notify } from '@/utils/dialog'

const contactsStore = useContactsStore()
const list = ref([])
const loading = ref(true)
const showModal = ref(false)
const editing = ref(false)
const saving = ref(false)
const formErr = ref('')
/* 板块切换：mine 我的纪念日 / contact 各联系人专属 */
const tab = ref('mine')

const form = reactive({ id: 0, title: '', date: '', type: 'anniversary', contactId: '', calendar: 'solar' })

/* 选日期时实时提示：选农历则直接显示农历文本，选公历则顺带给出对应农历参考 */
const datePreview = computed(() => {
  if (!form.date) return ''
  const lt = lunarText(form.date)
  if (!lt) return form.date
  if (form.calendar === 'lunar') return `农历${lt}`
  return `${form.date} · 农历${lt}`
})

const personList = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))

/* 板块按钮：固定的「我的」+ 每个联系人各一个 */
const tabs = computed(() => [
  { key: 'mine', name: '我的' },
  ...personList.value.map((c) => ({ key: String(c.id), name: c.name }))
])

const mine = computed(() => list.value.filter((a) => !a.contact_id))
const currentItems = computed(() => {
  if (tab.value === 'mine') return mine.value
  const cid = Number(tab.value)
  return list.value.filter((a) => Number(a.contact_id) === cid)
})
/* 当前板块标题 */
const currentTitle = computed(() => {
  if (tab.value === 'mine') return '我的纪念日'
  return `${contactsStore.getById(Number(tab.value))?.name || '联系人'} 的纪念日`
})

/* 基于日期与类型计算展示文案（不依赖 annual 假设） */
function daysInfo(a) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${a.date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  /* 倒数日：名称 +「还有 N 天」；纪念日：只显示累计天数，不带前缀 */
  if (a.type === 'countdown') return diff >= 0 ? `还有 ${diff} 天` : `已过 ${-diff} 天`
  return diff >= 0 ? `还有 ${diff} 天` : `${Math.abs(diff) + 1} 天`
}

async function load() {
  loading.value = true
  try {
    list.value = await getAnniversaries()
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editing.value = false
  formErr.value = ''
  Object.assign(form, { id: 0, title: '', date: '', type: 'anniversary', contactId: '', calendar: 'solar' })
  showModal.value = true
}
function openEdit(a) {
  editing.value = true
  formErr.value = ''
  Object.assign(form, {
    id: a.id,
    title: a.title,
    date: a.date,
    type: a.type || 'anniversary',
    contactId: a.contact_id ? String(a.contact_id) : '',
    calendar: a.calendar || 'solar'
  })
  showModal.value = true
}
function closeModal() {
  showModal.value = false
}

async function save() {
  formErr.value = ''
  if (!form.title || !form.title.trim()) {
    formErr.value = '请填写名称'
    return
  }
  if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    formErr.value = '请选择日期'
    return
  }
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      date: form.date,
      type: form.type,
      calendar: form.calendar,
      contactId: form.contactId ? Number(form.contactId) : null
    }
    if (editing.value) {
      await updateAnniversary(form.id, payload)
    } else {
      await createAnniversary(payload)
    }
    closeModal()
    await load()
  } catch (e) {
    formErr.value = e?.message || '保存失败，请重试'
  } finally {
    saving.value = false
  }
}

async function remove(a) {
  const ok = await confirmDialog({
    title: '删除纪念日',
    text: `确定删除「${a.title}」吗？`,
    okText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteAnniversary(a.id)
    await load()
  } catch (e) {
    notify('删除失败')
  }
}

onMounted(async () => {
  try { await contactsStore.load() } catch (e) {}
  await load()
})
</script>

<style scoped>
.ann-page { flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; background: var(--bg-body); }
.ap-add {
  border: none;
  background: transparent;
  color: var(--text);
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ap-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 14px 30px; }

/* 板块切换：「我的」+ 每个联系人各一个按钮，人多时可横向滑动 */
.ap-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  overflow-x: auto;
  padding-bottom: 3px;
  -webkit-overflow-scrolling: touch;
}
.ap-tab {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.ap-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.ap-tip { text-align: center; color: var(--text-soft); font-size: 13px; padding: 30px 0; }
.ap-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 40px 0; line-height: 1.8; }
.ap-empty-sub { font-size: 12px; opacity: 0.75; }

.ap-group { margin-bottom: 18px; }
.ap-gtitle {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0.5px;
}
.ap-list { display: flex; flex-direction: column; gap: 8px; }
.ap-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
.ap-ic { flex: 0 0 auto; }
.ap-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ap-name { font-size: 14px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-date { font-size: 11px; color: var(--text-soft); }
.ap-tag {
  flex: 0 0 auto;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}
.tg-an { background: rgba(197, 164, 126, 0.16); color: #9a7c54; }
.tg-cd { background: rgba(91, 141, 239, 0.16); color: #4a78d6; }
.ap-days {
  flex: 0 0 auto;
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  min-width: 52px;
  text-align: right;
}
.ap-edit, .ap-del { flex: 0 0 auto; border: none; background: transparent; padding: 2px; }
.ap-edit:active, .ap-del:active { opacity: 0.6; }

/* ── 表单弹窗 ── */
.ap-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ap-modal {
  width: 100%;
  max-width: 340px;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 18px 16px 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
}
.ap-mtitle { margin: 0 0 14px; font-size: 16px; font-weight: 700; font-family: var(--font-serif); text-align: center; }
.fld { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.fld-label { font-size: 12px; color: var(--text-soft); }
/* 日期行：左侧标签 + 右侧历法切换（公历 / 农历） */
.fld-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cal-seg {
  display: flex;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  overflow: hidden;
  background: var(--bg-soft);
}
.cal-seg button {
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 12px;
  padding: 4px 12px;
}
.cal-seg button.on { background: var(--accent); color: #fff; font-weight: 600; }
.fld-hint { margin: 0; font-size: 11px; color: var(--accent); }
.field {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
  font-size: 14px;
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
}
.field:focus { border-color: var(--accent); outline: none; }
select.field { appearance: none; background-image: linear-gradient(45deg, transparent 50%, var(--text-soft) 50%), linear-gradient(135deg, var(--text-soft) 50%, transparent 50%); background-position: calc(100% - 16px) 50%, calc(100% - 11px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.ap-err { color: #c0576b; font-size: 12px; margin: 0 0 8px; }
.ap-actions { display: flex; gap: 10px; margin-top: 4px; }
.ap-btn {
  flex: 1;
  border-radius: 999px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text);
}
.ap-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.ap-btn:disabled { opacity: 0.6; }

/* 类型选择胶囊：复用通用胶囊风格 */
.seg { display: flex; gap: 10px; }
.seg button {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 9px 0;
  font-size: 13px;
  color: var(--text);
}
.seg button.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
</style>
