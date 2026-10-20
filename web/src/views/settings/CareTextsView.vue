<template>
  <div class="ct-page">
    <AppHeader title="关怀文案" back />
    <div class="ct-body">
      <p class="ct-intro">
        TA 在这些时刻主动发给你的关心话，默认使用<b>内置句子</b>。<br />
        可以在内置基础上<b>微调</b>，也可以<b>添加自己的话</b>；不填时一切照旧。
      </p>

      <div v-for="grp in groups" :key="grp.kind" class="ct-group">
        <div class="ct-group-head">
          <span class="ct-group-title">
            <AppIcon :name="grp.kind === 'today' ? 'drop' : 'flower'" :size="14" color="var(--accent)" />
            {{ grp.title }}
          </span>
          <span class="ct-group-sub">{{ grp.sub }}</span>
        </div>

        <div class="ct-list">
          <div v-for="(s, i) in lists[grp.kind]" :key="grp.kind + '-' + i" class="ct-row">
            <template v-if="editing && editing.kind === grp.kind && editing.idx === i">
              <input
                v-model="draft"
                class="ct-input"
                type="text"
                maxlength="60"
                placeholder="写一句关心的话（60 字以内）"
                @keyup.enter="saveEdit"
                @keyup.esc="cancelEdit"
              />
              <div class="ct-row-btns">
                <button class="ct-mini primary" type="button" @click="saveEdit">保存</button>
                <button class="ct-mini" type="button" @click="cancelEdit">取消</button>
              </div>
            </template>
            <template v-else>
              <p class="ct-text">{{ s }}</p>
              <span v-if="i < CARE_DEFAULT_TEXTS[grp.kind].length" class="ct-badge" :class="{ changed: s !== CARE_DEFAULT_TEXTS[grp.kind][i] }">
                {{ s === CARE_DEFAULT_TEXTS[grp.kind][i] ? '默认' : '已改' }}
              </span>
              <span v-else class="ct-badge custom">自定义</span>
              <div class="ct-row-btns">
                <button class="ct-mini" type="button" aria-label="编辑这条" @click="startEdit(grp.kind, i)">
                  <AppIcon name="edit" :size="12" />改
                </button>
                <button
                  v-if="i < CARE_DEFAULT_TEXTS[grp.kind].length && s !== CARE_DEFAULT_TEXTS[grp.kind][i]"
                  class="ct-mini"
                  type="button"
                  @click="restoreOne(grp.kind, i)"
                >恢复</button>
                <button
                  v-else-if="i >= CARE_DEFAULT_TEXTS[grp.kind].length"
                  class="ct-mini danger"
                  type="button"
                  aria-label="删除这条"
                  @click="removeOne(grp.kind, i)"
                >
                  <AppIcon name="trash" :size="12" />
                </button>
              </div>
            </template>
          </div>
        </div>

        <button
          v-if="lists[grp.kind].length < CARE_MAX_PER_GROUP"
          class="ct-add"
          type="button"
          @click="addOne(grp.kind)"
        >
          <AppIcon name="plus" :size="13" color="var(--text-soft)" /> 添加一句（{{ lists[grp.kind].length }}/{{ CARE_MAX_PER_GROUP }}）
        </button>
      </div>

      <button v-if="customized" class="ct-reset" type="button" @click="resetAll">全部恢复默认</button>
      <p v-else class="ct-tip">当前全部使用默认文案</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { CARE_DEFAULT_TEXTS, CARE_TEXTS_KEY, CARE_MAX_PER_GROUP } from '@/utils/careTexts'

/* 经期关怀文案编辑：
   两个场景各一句池——「today」今天处于经期，「soon」距预测经期还有 2~3 天。
   列表前 N 条与默认池按索引一一对应（可微调、可恢复默认），其后是自定义追加
   （可删除）。每次变更整体写 localStorage；与默认完全一致时移除 key，行为与
   从未自定义无异。发送时随机取一句（见 period.service 的 careTexts）。 */
const toast = useNotificationsStore()

const groups = [
  { kind: 'today', title: '经期中', sub: '今天正处在经期时发送' },
  { kind: 'soon', title: '快来了', sub: '距预测经期还有 2～3 天时发送' }
]

function loadLists() {
  const out = {}
  for (const k of ['today', 'soon']) {
    let list = null
    try {
      const raw = JSON.parse(localStorage.getItem(CARE_TEXTS_KEY) || 'null')
      if (raw && Array.isArray(raw[k])) list = raw[k]
    } catch (e) { /* 损坏数据回落默认 */ }
    out[k] = list && list.length ? list.slice() : CARE_DEFAULT_TEXTS[k].slice()
  }
  return out
}
const lists = reactive(loadLists())

/* 是否与默认完全一致（一致则视为未自定义） */
const customized = computed(() =>
  ['today', 'soon'].some((k) => {
    const def = CARE_DEFAULT_TEXTS[k]
    if (lists[k].length !== def.length) return true
    return lists[k].some((s, i) => s !== def[i])
  })
)

function persist() {
  try {
    if (customized.value) {
      localStorage.setItem(CARE_TEXTS_KEY, JSON.stringify({ today: lists.today, soon: lists.soon }))
    } else {
      localStorage.removeItem(CARE_TEXTS_KEY)
    }
  } catch (e) {
    toast.pushToast({ title: '保存失败', text: e.message })
  }
}

/* 内联编辑 */
const editing = ref(null)
const draft = ref('')
function startEdit(kind, idx) {
  editing.value = { kind, idx }
  draft.value = lists[kind][idx]
}
function cancelEdit() {
  editing.value = null
  draft.value = ''
}
function saveEdit() {
  if (!editing.value) return
  const text = String(draft.value || '').trim().slice(0, 60)
  if (!text) {
    toast.pushToast({ title: '内容不能为空' })
    return
  }
  lists[editing.value.kind][editing.value.idx] = text
  cancelEdit()
  persist()
}
/* 恢复这一条为默认原文（仅内置位） */
function restoreOne(kind, idx) {
  lists[kind][idx] = CARE_DEFAULT_TEXTS[kind][idx]
  persist()
}
/* 删除自定义追加的一条 */
function removeOne(kind, idx) {
  lists[kind].splice(idx, 1)
  persist()
}
/* 追加一条并立即进入编辑态 */
function addOne(kind) {
  lists[kind].push('')
  startEdit(kind, lists[kind].length - 1)
}
/* 全部恢复默认 */
function resetAll() {
  lists.today = CARE_DEFAULT_TEXTS.today.slice()
  lists.soon = CARE_DEFAULT_TEXTS.soon.slice()
  persist()
  toast.pushToast({ title: '已恢复默认文案' })
}
</script>

<style scoped>
.ct-page { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.ct-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 14px;
}
/* 顶部说明框：仿字卡库枢纽的 hub-hint（accent-soft 底 + 圆角，关键词 accent 色） */
.ct-intro {
  margin: 0 0 2px; font-size: 12px; color: var(--text-soft); line-height: 1.7;
  background: var(--accent-soft); border-radius: 12px; padding: 10px 12px;
}
.ct-intro b { color: var(--accent); }

.ct-group {
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 14px;
  padding: 12px 12px 10px;
}
.ct-group-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ct-group-title { display: inline-flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 600; }
.ct-group-sub { font-size: 11px; color: var(--text-soft); }

.ct-list { display: flex; flex-direction: column; }
.ct-row {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 0; border-bottom: 1px solid var(--border);
}
.ct-row:last-child { border-bottom: none; }
.ct-text { flex: 1 1 auto; margin: 0; font-size: 13.5px; line-height: 1.6; min-width: 0; }
.ct-badge {
  flex: 0 0 auto; font-size: 10px; color: var(--text-soft);
  border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px;
}
.ct-badge.changed { color: var(--accent); border-color: var(--accent); }
.ct-badge.custom { color: #5b8def; border-color: #5b8def; }
.ct-row-btns { flex: 0 0 auto; display: flex; gap: 6px; }
.ct-mini {
  display: inline-flex; align-items: center; gap: 3px;
  border: 1px solid var(--border); background: var(--bg-soft); color: var(--text-soft);
  border-radius: 8px; padding: 4px 9px; font-size: 11.5px;
}
.ct-mini:active { transform: scale(0.94); }
.ct-mini.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.ct-mini.danger { color: #c0576b; }
.ct-input {
  flex: 1 1 auto; min-width: 0; box-sizing: border-box;
  border: 1px solid var(--accent); border-radius: 10px; background: var(--bg-soft);
  padding: 8px 10px; font-size: 13.5px; color: var(--text); outline: none;
}
.ct-add {
  align-self: flex-start; margin-top: 8px;
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px dashed var(--border); background: transparent; color: var(--text-soft);
  border-radius: 10px; padding: 7px 12px; font-size: 12px;
}
.ct-add:active { transform: scale(0.96); }

.ct-reset {
  align-self: center; border: none; background: transparent;
  color: #c0576b; font-size: 12.5px; padding: 8px 14px;
}
.ct-tip { align-self: center; margin: 2px 0 0; font-size: 12px; color: var(--text-soft); }
</style>
