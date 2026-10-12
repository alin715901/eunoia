<template>
  <div class="md-page">
    <AppHeader title="备忘录" back>
      <template #right>
        <button class="md-op" @click="openAdd" aria-label="添加"><AppIcon name="plus" :size="22" /></button>
      </template>
    </AppHeader>

    <div class="md-body">
      <div class="md-summary">
        <span class="md-sum-ic"><AppIcon name="memo" :size="26" color="var(--accent)" /></span>
        <span class="md-sum-main">
          <span class="md-sum-title">{{ undone.length }} 条待办 · {{ done.length }} 条已完成</span>
          <span class="md-sum-sub">想记下的事，都放在这里</span>
        </span>
      </div>

      <div class="md-seg">
        <button class="md-seg-btn" :class="{ on: tab === 'todo' }" @click="tab = 'todo'">待办</button>
        <button class="md-seg-btn" :class="{ on: tab === 'done' }" @click="tab = 'done'">已完成</button>
      </div>

      <p v-if="loading" class="md-tip">加载中…</p>
      <template v-else>
        <div v-for="m in list" :key="m.id" class="md-card">
          <button class="mm-check" :class="{ on: m.done }" @click="toggle(m)" aria-label="完成">
            <AppIcon v-if="m.done" name="check" :size="14" color="#fff" />
          </button>
          <div class="md-card-main" @click="openEdit(m)">
            <div class="md-title" :class="{ through: m.done }">{{ m.title }}</div>
            <div class="md-sub" v-if="m.extra?.due">提醒：{{ m.extra.due }}</div>
            <div class="md-text" v-if="m.body">{{ m.body }}</div>
          </div>
          <div class="md-ops">
            <button class="md-op" @click="remove(m)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </div>
        </div>
        <p v-if="!list.length" class="md-empty">
          {{ tab === 'todo' ? '没有待办，很清爽' : '还没有完成的事项' }}<br />
          <span class="md-empty-sub">点右上角「＋」添加</span>
        </p>
      </template>
    </div>

    <button class="md-fab" @click="openAdd" aria-label="添加"><AppIcon name="plus" :size="24" color="#fff" /></button>

    <div v-if="show" class="md-mask" @click.self="close">
      <div class="md-sheet">
        <h3 class="md-sheet-title">{{ editing ? '编辑备忘' : '新增备忘' }}</h3>
        <div class="md-fld">
          <span class="md-fld-label">内容</span>
          <input v-model="form.title" class="md-input" placeholder="例如：周五一起去看电影" maxlength="60" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">日期（可选）</span>
          <input v-model="form.due" class="md-input" type="date" />
        </div>
        <div class="md-fld">
          <span class="md-fld-label">备注（可选）</span>
          <textarea v-model="form.body" class="md-textarea" placeholder="补充说明…" />
        </div>
        <div class="md-actions">
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
import { confirmDialog } from '@/utils/dialog'

const { items, loading, load, add, update, remove: removeItem } = useItems('memo')
const toast = useNotificationsStore()
const tab = ref('todo')
const show = ref(false)
const editing = ref(null)
const form = reactive({ title: '', due: '', body: '' })

const undone = computed(() => items.value.filter((x) => !x.done))
const done = computed(() => items.value.filter((x) => x.done))
const list = computed(() => (tab.value === 'todo' ? undone.value : done.value))

function openAdd() {
  editing.value = null
  Object.assign(form, { title: '', due: '', body: '' })
  show.value = true
}
function openEdit(m) {
  editing.value = m
  Object.assign(form, { title: m.title || '', due: m.extra?.due || '', body: m.body || '' })
  show.value = true
}
function close() {
  show.value = false
}
async function save() {
  if (!form.title.trim()) {
    toast.pushToast({ title: '写点内容吧' })
    return
  }
  const payload = { title: form.title.trim(), body: form.body.trim(), extra: { due: form.due } }
  const id = editing.value?.id
  close()
  try {
    if (id) await update(id, payload)
    else await add(payload)
    toast.pushToast({ title: '已保存' })
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
async function toggle(m) {
  // 先本地切换，再同步到服务端 —— 点击即时有反馈
  m.done = m.done ? 0 : 1
  try {
    await update(m.id, { done: !!m.done })
  } catch (e) {
    m.done = m.done ? 0 : 1
  }
}
async function remove(m) {
  if (!(await confirmDialog({ title: '删除这条备忘？', danger: true }))) return
  await removeItem(m.id)
  toast.pushToast({ title: '已删除' })
}

onMounted(load)
</script>

<style scoped>
.mm-check {
  flex: 0 0 auto;
  width: 20px; height: 20px; border-radius: 50%;
  border: 1.6px solid var(--border); background: transparent;
  display: flex; align-items: center; justify-content: center;
  margin-top: 2px; padding: 0;
}
.mm-check.on { background: var(--accent); border-color: var(--accent); }
.through { text-decoration: line-through; color: var(--text-soft); }
</style>
