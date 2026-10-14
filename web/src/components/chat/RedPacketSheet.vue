<template>
  <!-- 红包金额选择面板：底部弹出，预设金额 + 自定义输入 -->
  <Teleport to="body">
    <div v-if="show" class="rp-mask" @click="$emit('close')">
      <div class="rp-sheet" @click.stop>
        <div class="rp-head">
          <span class="rp-title">红包</span>
          <button class="rp-close" @click="$emit('close')">✕</button>
        </div>

        <!-- 余额：单聊展示「我的余额」与「对方余额」；群聊只展示「我的余额」。
             「我的余额」可直接编辑自定义（点金额进入编辑）；「对方余额」只读。
             两行的 ¥ 符号与数字同字号；金额过长时向左伸展贴近标签，仍超长则省略尾部 -->
        <div v-if="wallet" class="rp-wallet">
          <div class="rp-bal">
            <span class="rp-bal-label">我的余额</span>
            <!-- 编辑中：输入框（失焦/回车保存） -->
            <span v-if="balEditing" class="rp-bal-edit is-edit">
              <span class="rp-bal-yen">¥</span>
              <input
                ref="balInput"
                v-model="myBalanceDraft"
                class="rp-bal-input"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                aria-label="我的余额，可自定义"
                @blur="onBalBlur"
                @keyup.enter="saveMyBalance"
              />
            </span>
            <!-- 未编辑：纯文本展示，超长省略（与「对方余额」同一套省略规则） -->
            <span v-else class="rp-bal-val rp-bal-tap" title="点此修改" @click="startBalEdit">¥{{ myBalanceText }}</span>
          </div>
          <div v-if="!isGroup" class="rp-bal">
            <span class="rp-bal-label">对方余额</span>
            <span class="rp-bal-val">¥{{ wallet.contact_balance?.toFixed(2) }}</span>
          </div>
        </div>
        <p class="rp-tip">{{ isGroup ? '群成员也可发红包，以各自余额为准；红包可设置个数，群成员随机领取' : '对方会随机给你发红包，领取后计入「我的余额」；「我的余额」也可直接输入自定义' }}</p>

        <!-- 红包个数（仅群聊）：预设 + 自定义，每人随机领取一份 -->
        <div v-if="isGroup" class="rp-count">
          <span class="rp-count-label">红包个数</span>
          <div class="rp-count-chips">
            <button
              v-for="c in countPresets"
              :key="c"
              type="button"
              class="rp-count-chip"
              :class="{ active: count === String(c) }"
              @click="count = String(c)"
            >
              {{ c }}
            </button>
            <input
              v-model="count"
              class="rp-count-input"
              type="number"
              inputmode="numeric"
              min="1"
              max="100"
              placeholder="自定义"
              aria-label="红包个数，可自定义"
            />
          </div>
        </div>

        <div class="rp-presets">
          <button
            v-for="p in presets"
            :key="p"
            class="rp-preset"
            :class="{ active: amount === String(p) }"
            @click="amount = String(p)"
          >
            ¥{{ p }}
          </button>
        </div>

        <div class="rp-custom">
          <span class="rp-yen">¥</span>
          <input
            v-model="amount"
            class="rp-input"
            type="number"
            inputmode="decimal"
            min="0.01"
            placeholder="自定义金额"
          />
        </div>

        <input v-model="note" class="rp-note-input" maxlength="30" placeholder="留言（可不填）" />

        <p v-if="err" class="rp-err">{{ err }}</p>

        <button class="rp-confirm" :disabled="!valid" @click="confirm">
          塞钱进红包
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { getWallet, setMyBalance } from '@/api/chat'
import { useNotificationsStore } from '@/stores/notifications'

const props = defineProps({
  show: { type: Boolean, default: false },
  contactId: { type: [String, Number], default: null },
  isGroup: { type: Boolean, default: false },
  // 群成员数（群聊传）：用于默认红包份数
  memberCount: { type: Number, default: 0 }
})
const emit = defineEmits(['close', 'send'])
const toast = useNotificationsStore()

/* 预设金额：52.0 / 520 / 1314 */
const presets = ['52.0', '520', '1314']
const amount = ref('')
const note = ref('')
const err = ref('')
const wallet = ref(null)
/* 群红包份数：预设 + 自定义（默认与群成员数一致，拿不到成员数时回落 1） */
const countPresets = [1, 3, 5, 8, 10]
const count = ref('1')

/* 「我的余额」编辑草稿：打开面板/钱包加载后用当前值填充 */
const myBalanceDraft = ref('0.00')
/* 编辑态：点金额进入编辑（输入框 + 虚线下划线），失焦退出 */
const balEditing = ref(false)
/* 未编辑时展示的格式化金额（两位小数，与「对方余额」同规则） */
const myBalanceText = computed(() => (wallet.value?.my_balance ?? 0).toFixed(2))
const balInput = ref(null)
/* 点金额进入编辑：草稿取当前值并聚焦输入框 */
function startBalEdit() {
  myBalanceDraft.value = myBalanceText.value
  balEditing.value = true
  nextTick(() => balInput.value?.focus())
}
/* 失焦即保存并退出编辑（saveMyBalance 内部对未变化的值会早退，不会重复弹提示） */
function onBalBlur() {
  balEditing.value = false
  saveMyBalance()
}

watch(
  () => props.show,
  (v) => {
    if (v) {
      amount.value = ''
      note.value = ''
      err.value = ''
      myBalanceDraft.value = '0.00'
      balEditing.value = false
      // 群聊也展示「我的余额」（群里的我的钱 = wallets(群).my_balance）
      if (props.contactId != null) {
        getWallet(props.contactId)
          .then((w) => {
            wallet.value = w
            myBalanceDraft.value = (w.my_balance ?? 0).toFixed(2)
          })
          .catch(() => { wallet.value = null })
      } else {
        wallet.value = null
      }
      count.value = String(Math.max(1, Number(props.memberCount) || 1))
    }
  }
)

/* 自定义我的余额：失焦/回车时落库（只改我的余额，对方余额不动） */
async function saveMyBalance() {
  if (!wallet.value || props.contactId == null) return
  const raw = String(myBalanceDraft.value ?? '').trim()
  const n = Number(raw)
  if (raw === '' || !Number.isFinite(n) || n < 0) {
    myBalanceDraft.value = (wallet.value.my_balance ?? 0).toFixed(2)
    toast.pushToast({ title: '余额没改', text: '请输入大于等于 0 的数字' })
    return
  }
  const val = Math.round(n * 100) / 100
  if (val === wallet.value.my_balance) return
  try {
    const w = await setMyBalance(props.contactId, val)
    wallet.value = w
    myBalanceDraft.value = (w.my_balance ?? 0).toFixed(2)
    toast.pushToast({ title: '我的余额已更新', text: `¥${(w.my_balance ?? 0).toFixed(2)}` })
  } catch (e) {
    myBalanceDraft.value = (wallet.value.my_balance ?? 0).toFixed(2)
    toast.pushToast({ title: '修改失败', text: e?.message || '请稍后再试' })
  }
}

const valid = computed(() => {
  const n = Number(amount.value)
  if (!Number.isFinite(n) || n <= 0 || n > 99999) return false
  if (props.isGroup) {
    const c = Math.floor(Number(count.value))
    // 份数须为 1~100 的整数，且每份至少 0.01 元
    return Number.isInteger(c) && c >= 1 && c <= 100 && n >= c * 0.01
  }
  return true
})

function confirm() {
  const n = Number(amount.value)
  if (!Number.isFinite(n) || n <= 0) {
    err.value = '请输入有效金额'
    return
  }
  if (props.isGroup) {
    const c = Math.floor(Number(count.value))
    if (!Number.isInteger(c) || c < 1 || c > 100) {
      err.value = '红包个数须为 1~100 的整数'
      return
    }
    if (n < c * 0.01) {
      err.value = '每份至少 0.01 元，请提高金额或减少份数'
      return
    }
  }
  err.value = ''
  emit('send', {
    amount: n,
    count: props.isGroup ? Math.floor(Number(count.value)) : 1,
    note: note.value.trim()
  })
}
</script>

<style scoped>
.rp-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(0, 0, 0, 0.4);
  animation: fade-in 0.2s ease;
}
.rp-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-screen);
  border-radius: 20px 20px 0 0;
  padding: 18px 20px calc(24px + env(safe-area-inset-bottom));
  animation: sheet-up 0.25s ease;
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes sheet-up { from { transform: translateY(40%); } to { transform: translateY(0); } }

.rp-head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 18px;
}
.rp-title { font-size: 17px; font-weight: 700; color: var(--text); }
/* 余额：我的余额 / 对方余额 两行，红色数字呼应红包主题 */
.rp-wallet {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding: 12px 14px;
  background: linear-gradient(165deg, #fdf0e7 0%, #fbdfd2 100%);
  border-radius: 14px;
}
.rp-bal { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
/* 标签不收缩；金额区占满剩余空间，超长时向左伸展靠近标签，仍超长则省略尾部 */
.rp-bal-label { font-size: 13px; color: #c98d75; flex: none; }
.rp-bal-val {
  font-size: 18px;
  font-weight: 800;
  color: #c05e45;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* 我的余额：编辑态才显示输入框（带虚线下划线示意可改）；未编辑是纯文本，点一下进入编辑 */
.rp-bal-edit {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  flex: 1;
  min-width: 0;
  border-bottom: 1px dashed rgba(192, 94, 69, 0.45);
  padding: 0 2px;
}
.rp-bal-edit:focus-within { border-bottom-style: solid; border-bottom-color: #c05e45; }
.rp-bal-tap { cursor: pointer; }
/* ¥ 符号与对方余额保持一致：18px/800，不再小一号 */
.rp-bal-yen { font-size: 18px; font-weight: 800; color: #c05e45; flex: none; }
.rp-bal-input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 18px;
  font-weight: 800;
  color: #c05e45;
  text-align: right;
  text-overflow: ellipsis;
  font-family: inherit;
  -moz-appearance: textfield;
}
.rp-bal-input::-webkit-outer-spin-button,
.rp-bal-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
/* 群红包份数：预设 chips + 自定义输入 */
.rp-count { margin-bottom: 14px; }
.rp-count-label { display: block; margin: 0 2px 8px; font-size: 12px; color: var(--text-soft); }
.rp-count-chips { display: flex; gap: 8px; }
.rp-count-chip {
  flex: 1;
  padding: 9px 0;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--bg-soft);
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  transition: all 0.15s ease;
}
.rp-count-chip.active { border-color: #f391a9; background: #fdf0f3; color: #e56a87; }
.rp-count-chip:active { transform: scale(0.97); }
.rp-count-input {
  width: 64px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--bg-soft);
  padding: 9px 8px;
  font-size: 14px;
  color: var(--text);
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}
.rp-count-input::-webkit-outer-spin-button,
.rp-count-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.rp-count-input:focus { border-color: #f391a9; }
.rp-tip { margin: 0 2px 14px; font-size: 11px; color: var(--text-soft); line-height: 1.5; }
.rp-close {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 16px;
  width: 28px;
  height: 28px;
}
.rp-presets { display: flex; gap: 10px; margin-bottom: 14px; }
.rp-preset {
  flex: 1;
  padding: 14px 0;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  transition: all 0.15s ease;
}
.rp-preset.active {
  border-color: #f391a9;
  background: #fdf0f3;
  color: #e56a87;
}
.rp-custom {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  padding: 0 14px;
  background: var(--bg-soft);
}
.rp-custom:focus-within { border-color: #f391a9; }
.rp-yen { font-size: 18px; font-weight: 700; color: var(--text-soft); }
.rp-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 13px 0;
  font-size: 16px;
  color: var(--text);
}
.rp-err { margin: 8px 2px 0; font-size: 12px; color: #e56a87; }
.rp-note-input {
  margin-top: 12px;
  width: 100%;
  box-sizing: border-box;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
  padding: 11px 12px;
  font-size: 14px;
  color: var(--text);
  outline: none;
}
.rp-note-input:focus { border-color: #f391a9; }
.rp-confirm {
  width: 100%;
  margin-top: 18px;
  border: none;
  border-radius: 999px;
  padding: 14px 0;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #f9a8b8, #ef7d98);
}
.rp-confirm:disabled { opacity: 0.45; }
</style>
