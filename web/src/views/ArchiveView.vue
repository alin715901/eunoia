<template>
  <div class="md-page">
    <AppHeader title="陪伴" back />

    <div class="md-body">
      <!-- ═══ 收到的邀请（TA 邀我） ═══ -->
      <div v-for="inv in store.incoming" :key="inv.id" class="cp-incoming">
        <AppAvatar :name="inv.contact_name || '对方'" :avatar="inv.contact_avatar || ''" :size="42" />
        <div class="cpi-main">
          <div class="cpi-name">{{ inv.contact_name || '对方' }} 邀你一起{{ nameOf(inv.activity) }}</div>
          <div class="cpi-sub">{{ inv.mode === 'down' ? `倒计时 ${Math.round((inv.duration_sec || 0) / 60)} 分钟` : '正计时' }}</div>
        </div>
        <div class="cpi-ops">
          <button class="cpi-btn ghost" @click="store.respond(inv.id, false)">拒绝</button>
          <button class="cpi-btn primary" @click="store.respond(inv.id, true)">同意</button>
        </div>
      </div>

      <!-- ═══ 进行中的陪伴 ═══ -->
      <div v-if="store.active" class="cp-active">
        <div class="cpa-top">
          <span class="cpa-emoji"><AppIcon :name="store.actMeta?.icon || 'archive'" :size="32" color="var(--accent)" /></span>
          <div class="cpa-info">
            <div class="cpa-name">{{ store.actMeta?.name }}<template v-if="mateName"> · 与{{ mateName }}一起</template></div>
            <div class="cpa-sub">{{ store.active.mode === 'down' ? `倒计时 ${store.fmtDur(store.active.durationSec)}` : '正计时' }}{{ store.active.paused ? ' · 已暂停' : '' }}</div>
          </div>
          <AppAvatar v-if="mateName" :name="mateName" :avatar="mateAvatar" :size="42" />
        </div>
        <div class="cpa-timer" :class="{ paused: store.active.paused, done: store.justDone }">{{ store.timerText }}</div>
        <div class="cpa-ops">
          <button class="cpa-btn" @click="store.togglePause()">{{ store.active.paused ? '继续' : '暂停' }}</button>
          <button class="cpa-btn danger" @click="onFinish">结束</button>
        </div>
      </div>

      <!-- ═══ 等待 TA 响应我的邀请 ═══ -->
      <div v-else-if="store.pendingInvite" class="cp-wait">
        <span class="cpw-icon"><AppIcon :name="store.pendingInvite.icon" :size="30" color="var(--accent)" /></span>
        <div class="cpw-name">已向 {{ mateNameById(store.pendingInvite.contactId) }} 发出「一起{{ store.pendingInvite.name }}」邀请</div>
        <div class="cpw-spin"><span></span><span></span><span></span></div>
        <div class="cpw-sub">等待 TA 接受…</div>
        <button class="cpw-cancel" @click="store.cancelInvite()">取消邀请</button>
      </div>

      <!-- ═══ 选择活动 ═══ -->
      <template v-else>
        <p class="cp-tip">今天想和 TA 一起做点什么？</p>
        <div class="cp-grid">
          <button v-for="a in store.ACTIVITIES" :key="a.key" class="cp-act" @click="pick(a)">
            <span class="cp-act-emoji"><AppIcon :name="a.icon" :size="30" color="var(--accent)" /></span>
            <span class="cp-act-name">{{ a.name }}</span>
          </button>
        </div>
      </template>

      <!-- ═══ 陪伴记录 ═══ -->
      <div class="cp-hist">
        <div class="cp-hist-head">
          <div class="cp-hist-title">最近的陪伴</div>
          <button v-if="store.history.length" class="cp-hist-clear" @click="clearHistory">清空</button>
        </div>
        <div v-for="h in store.history" :key="h.id" class="cp-hitem">
          <span class="cp-h-emoji"><AppIcon :name="h.icon || 'archive'" :size="22" color="var(--accent)" /></span>
          <div class="cp-h-main">
            <div class="cp-h-name">{{ h.name }}<template v-if="mateNameOf(h)"> · 与{{ mateNameOf(h) }}</template></div>
            <div class="cp-h-sub">{{ h.dateText }}</div>
          </div>
          <span class="cp-h-dur">{{ store.fmtDur(h.durationSec) }}</span>
          <button class="cp-h-del" @click="delHistory(h)" title="删除这条记录">
            <AppIcon name="trash" :size="15" />
          </button>
        </div>
        <p v-if="!store.history.length" class="cp-empty">还没有陪伴记录<br /><span class="cp-empty-sub">选一个活动，邀请 TA 开始第一次陪伴吧</span></p>
      </div>
    </div>

    <!-- ═══ 开始陪伴设置弹层 ═══ -->
    <Modal :show="!!picked" :title="picked ? `一起${picked.name}` : ''" @close="closeSheet">
      <div v-if="picked" class="cp-sheet">
        <!-- 邀请联系人：单选 -->
        <div class="cps-label">邀请联系人</div>
        <div class="cps-mates">
          <button
            v-for="c in mateOptions"
            :key="c.id"
            class="cps-mate"
            :class="{ on: pickedMateId === c.id }"
            @click="pickedMateId = pickedMateId === c.id ? null : c.id"
          >
            <AppAvatar :name="c.name" :avatar="c.avatar" :size="44" />
            <span class="cps-mate-name">{{ c.name }}</span>
          </button>
          <p v-if="!mateOptions.length" class="cps-none">还没有联系人</p>
        </div>

        <!-- 计时方式 -->
        <div class="cps-label">计时方式</div>
        <div class="cps-seg">
          <button class="cps-seg-btn" :class="{ on: mode === 'up' }" @click="mode = 'up'">正计时</button>
          <button class="cps-seg-btn" :class="{ on: mode === 'down' }" @click="mode = 'down'">倒计时</button>
        </div>

        <!-- 倒计时时长 -->
        <template v-if="mode === 'down'">
          <div class="cps-label">时长</div>
          <div class="cps-chips">
            <button
              v-for="m in store.DURATIONS"
              :key="m"
              class="cps-chip"
              :class="{ on: durMin === m }"
              @click="durMin = m"
            >{{ m }} 分钟</button>
            <span class="cps-custom" :class="{ on: isCustomDur }">
              <input
                v-model.number="customMin"
                class="cps-custom-input"
                type="number"
                min="1"
                max="600"
                placeholder="自定义"
                @input="applyCustom"
              />
              <span class="cps-custom-unit">分钟</span>
            </span>
          </div>
        </template>

        <button class="cps-start" @click="start" :disabled="starting">
          {{ starting ? '邀请发送中…' : pickedMateId ? `邀请${mateNameById(pickedMateId)}一起${picked.name}` : `开始${picked.name}` }}
        </button>
        <p v-if="pickedMateId" class="cps-hint">发出后 TA 会收到邀请通知，接受后开始计时</p>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import Modal from '@/components/common/Modal.vue'
import { useContactsStore } from '@/stores/contacts'
import { useCompanionStore } from '@/stores/companion'
import { confirmDialog } from '@/utils/dialog'

const contactsStore = useContactsStore()
const store = useCompanionStore()

/* 弹层状态 */
const picked = ref(null)
const pickedMateId = ref(null)
const mode = ref('up')
const durMin = ref(30)
const customMin = ref('')
const starting = ref(false)
/* 自定义时长是否生效：输入了预设以外的有效分钟数 */
const isCustomDur = computed(() => customMin.value > 0 && !store.DURATIONS.includes(customMin.value))
function applyCustom() {
  const v = Number(customMin.value)
  if (Number.isFinite(v) && v >= 1) durMin.value = Math.min(600, Math.round(v))
}

const mateOptions = computed(() =>
  (contactsStore.list || [])
    .filter((c) => c.kind !== 'group')
    .map((c) => ({ ...c, avatar: c.chat_avatar || c.avatar || '' }))
)
const mateNameById = (id) => contactsStore.getById(id)?.name || ''
const mateName = computed(() => (store.active?.mateId ? mateNameById(store.active.mateId) : ''))
const mateAvatar = computed(() => {
  const m = store.active?.mateId ? contactsStore.getById(store.active.mateId) : null
  return m ? (m.chat_avatar || m.avatar || '') : ''
})
const nameOf = (key) => store.ACTIVITIES.find((a) => a.key === key)?.name || '陪伴'
const iconOf = (key) => store.ACTIVITIES.find((a) => a.key === key)?.icon || 'archive'
/* 历史记录的陪伴对象：优先用记录里的 mateName，旧记录缺失时按 mateId 兜底查联系人 */
const mateNameOf = (h) =>
  h.mateName || (h.mateId ? (contactsStore.getById(h.mateId)?.name || '对方') : '')

/* ═══ 开始 / 结束 ═══ */
function pick(a) {
  picked.value = a
  pickedMateId.value = null
  mode.value = 'up'
  durMin.value = 30
  customMin.value = ''
}
function closeSheet() { picked.value = null }

async function start() {
  const a = picked.value
  if (!a || starting.value) return
  starting.value = true
  try {
    if (pickedMateId.value) {
      /* 选了联系人 → 发邀请，进入等待；TA 接受后自动开始计时 */
      await store.invite(pickedMateId.value, {
        activity: a.key,
        mode: mode.value,
        durationSec: mode.value === 'down' ? durMin.value * 60 : 0
      })
    } else {
      /* 不邀请：自己直接开始 */
      store.startSession({
        key: a.key, name: a.name, icon: a.icon, mateId: null,
        mode: mode.value,
        durationSec: mode.value === 'down' ? durMin.value * 60 : 0
      })
    }
    picked.value = null
  } catch (e) {
    confirmDialog({ title: '邀请发送失败', text: e?.message || '请重试' })
  } finally {
    starting.value = false
  }
}

function onFinish() {
  const a = store.active
  if (!a) return
  confirmDialog({
    title: `结束这次${a.name}？`,
    text: `已陪伴 ${store.timerText}，结束后会记入陪伴记录`,
    danger: false
  }).then((ok) => { if (ok) store.complete(store.elapsedSec()) })
}

/* ═══ 陪伴记录管理 ═══ */
function clearHistory() {
  confirmDialog({
    title: '清空陪伴记录',
    text: '将删除全部陪伴记录，且无法恢复。',
    okText: '清空',
    danger: true
  }).then((ok) => { if (ok) store.clearHistory() })
}
function delHistory(h) {
  confirmDialog({
    title: '删除这条记录',
    text: `${h.name}${mateNameOf(h) ? ' · 与' + mateNameOf(h) : ''}\n${h.dateText}\n删除后无法恢复。`,
    okText: '删除',
    danger: true
  }).then((ok) => { if (ok) store.removeHistory(h.id) })
}

/* 页面标题同步：等待/进行中在标签上提示 */
watch(
  () => [store.timerText, !!store.pendingInvite],
  ([t, waiting]) => {
    document.title = store.active ? `${t} · 陪伴` : waiting ? '等待响应 · 陪伴' : '陪伴'
  }
)

onMounted(async () => {
  if (!(contactsStore.list || []).length) contactsStore.load().catch(() => {})
  await store.init()
})
onBeforeUnmount(() => {
  document.title = '陪伴'
})
</script>

<style scoped>
.md-body { padding: 14px 14px 24px; }

/* ═══ 进行中的陪伴 ═══ */
.cp-active {
  background: var(--card-bg-soft, var(--bg-screen));
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 16px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.cpa-top { display: flex; align-items: center; gap: 12px; width: 100%; }
.cpa-emoji { display: flex; }
.cpa-info { flex: 1; min-width: 0; }
.cpa-name { font-size: 15px; font-weight: 700; }
.cpa-sub { font-size: 12px; color: var(--text-soft); margin-top: 3px; }
.cpa-timer {
  font-family: var(--font-serif);
  font-size: 44px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.cpa-timer.paused { color: var(--text-soft); }
.cpa-timer.done { animation: cpa-pop 0.5s ease; }
@keyframes cpa-pop { 0% { transform: scale(1); } 40% { transform: scale(1.12); } 100% { transform: scale(1); } }
.cpa-ops { display: flex; gap: 10px; }
.cpa-btn {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  color: var(--text);
  font-size: 13px;
  border-radius: 999px;
  padding: 7px 22px;
  cursor: pointer;
}
.cpa-btn.danger { color: #fa5151; border-color: #fa5151; }

/* ═══ 等待 TA 响应 ═══ */
.cp-wait {
  background: var(--card-bg-soft, var(--bg-screen));
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 26px 16px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.cpw-icon {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cpw-name { font-size: 14px; font-weight: 700; text-align: center; }
.cpw-sub { font-size: 12px; color: var(--text-soft); }
.cpw-spin { display: flex; gap: 5px; margin-top: 2px; }
.cpw-spin span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: cpw-b 1.2s ease-in-out infinite;
}
.cpw-spin span:nth-child(2) { animation-delay: 0.15s; }
.cpw-spin span:nth-child(3) { animation-delay: 0.3s; }
@keyframes cpw-b { 0%, 100% { opacity: 0.25; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-3px); } }
.cpw-cancel {
  margin-top: 6px;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  color: var(--text-soft);
  font-size: 12px;
  border-radius: 999px;
  padding: 6px 18px;
  cursor: pointer;
}

/* ═══ 收到的邀请 ═══ */
.cp-incoming {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--card-bg-soft, var(--bg-screen));
  border: 1px solid var(--accent);
  border-radius: var(--radius);
  padding: 12px;
  margin-bottom: 10px;
}
.cpi-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.cpi-main { flex: 1; min-width: 0; }
.cpi-name { font-size: 13px; font-weight: 700; }
.cpi-sub { font-size: 11px; color: var(--text-soft); margin-top: 2px; }
.cpi-ops { display: flex; gap: 8px; flex: 0 0 auto; }
.cpi-btn {
  border-radius: 999px;
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
}
.cpi-btn.ghost { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text-soft); }
.cpi-btn.primary { border: 1px solid var(--accent); background: var(--accent); color: #fff; }

/* ═══ 活动选择 ═══ */
.cp-tip { text-align: center; font-size: 13px; color: var(--text-soft); margin: 6px 0 14px; }
.cp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cp-act {
  border: 1px solid var(--border);
  background: var(--card-bg-soft, var(--bg-screen));
  border-radius: var(--radius-sm, 14px);
  padding: 18px 0 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.cp-act:active { transform: scale(0.96); }
.cp-act-emoji { display: flex; }
.cp-act-name { font-size: 13px; font-weight: 600; }

/* ═══ 陪伴记录 ═══ */
.cp-hist { margin-top: 20px; }
.cp-hist-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.cp-hist-title { font-size: 13px; font-weight: 700; }
.cp-hist-clear {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 12px;
  color: var(--text-soft);
  cursor: pointer;
}
.cp-hist-clear:active { color: #c0576b; border-color: #c0576b; }
.cp-hitem {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 2px;
  border-bottom: 1px solid var(--border);
}
.cp-h-emoji { display: flex; }
.cp-h-main { flex: 1; min-width: 0; }
.cp-h-name { font-size: 14px; font-weight: 600; }
.cp-h-sub { font-size: 11px; color: var(--text-soft); margin-top: 2px; }
.cp-h-dur { font-size: 13px; color: var(--accent); font-weight: 600; flex: 0 0 auto; }
.cp-h-del {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  padding: 4px;
  border-radius: 8px;
  display: flex;
  cursor: pointer;
  transition: all 0.2s ease;
}
.cp-h-del:active { background: var(--bg-soft); color: #c0576b; }
.cp-empty { text-align: center; font-size: 13px; color: var(--text-soft); padding: 18px 0 4px; }
.cp-empty-sub { font-size: 11px; }

/* ═══ 设置弹层 ═══ */
.cp-sheet { display: flex; flex-direction: column; gap: 10px; }
.cps-label { font-size: 12px; font-weight: 700; color: var(--text-soft); margin-top: 2px; }
.cps-mates {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 4px 2px 8px;
  min-height: 72px;
}
.cps-mate {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0.55;
}
.cps-mate.on { opacity: 1; }
.cps-mate.on :deep(.avatar) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 50%; }
.cps-mate-name { font-size: 11px; }
.cps-none { font-size: 12px; color: var(--text-soft); }
.cps-seg { display: flex; gap: 8px; }
.cps-seg-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;
}
.cps-seg-btn.on { background: var(--text); color: var(--bg-screen); border-color: var(--text); }
.cps-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.cps-chip {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  cursor: pointer;
}
.cps-chip.on { background: var(--accent); color: #fff; border-color: var(--accent); }
/* 自定义时长输入：与 chips 同排，选中时描边高亮 */
.cps-custom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 4px 12px;
}
.cps-custom.on { border-color: var(--accent); }
.cps-custom-input {
  width: 58px;
  border: none;
  background: transparent;
  font-size: 12px;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}
.cps-custom-input::-webkit-outer-spin-button,
.cps-custom-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.cps-custom-unit { font-size: 12px; color: var(--text-soft); }
.cps-start {
  margin-top: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 999px;
  padding: 11px 0;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.cps-start:disabled { opacity: 0.6; }
.cps-hint { font-size: 11px; color: var(--text-soft); text-align: center; margin: 0; }
</style>
