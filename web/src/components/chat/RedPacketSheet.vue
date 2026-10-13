<template>
  <!-- 红包金额选择面板：底部弹出，预设金额 + 自定义输入 -->
  <Teleport to="body">
    <div v-if="show" class="rp-mask" @click="$emit('close')">
      <div class="rp-sheet" @click.stop>
        <div class="rp-head">
          <span class="rp-title">红包</span>
          <button class="rp-close" @click="$emit('close')">✕</button>
        </div>

        <!-- 余额：仅单人联系人展示「我的余额」与「对方余额」（群聊不涉及钱包）。
             「我的余额」可直接编辑自定义；「对方余额」只读，不提供修改 -->
        <div v-if="!isGroup && wallet" class="rp-wallet">
          <div class="rp-bal">
            <span class="rp-bal-label">我的余额</span>
            <span class="rp-bal-edit">
              <span class="rp-bal-yen">¥</span>
              <input
                v-model="myBalanceDraft"
                class="rp-bal-input"
                type="number"
                inputmode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                aria-label="我的余额，可自定义"
                @change="saveMyBalance"
                @keyup.enter="saveMyBalance"
              />
            </span>
          </div>
          <div class="rp-bal">
            <span class="rp-bal-label">对方余额</span>
            <span class="rp-bal-val">¥{{ wallet.contact_balance?.toFixed(2) }}</span>
          </div>
        </div>
        <p v-if="!isGroup" class="rp-tip">对方会随机给你发红包，领取后计入「我的余额」；「我的余额」也可直接输入自定义</p>

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
import { ref, computed, watch } from 'vue'
import { getWallet, setMyBalance } from '@/api/chat'
import { useNotificationsStore } from '@/stores/notifications'

const props = defineProps({
  show: { type: Boolean, default: false },
  contactId: { type: [String, Number], default: null },
  isGroup: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'send'])
const toast = useNotificationsStore()

/* 预设金额：52.0 / 520 / 1314 */
const presets = ['52.0', '520', '1314']
const amount = ref('')
const note = ref('')
const err = ref('')
const wallet = ref(null)

/* 「我的余额」编辑草稿：打开面板/钱包加载后用当前值填充 */
const myBalanceDraft = ref('0.00')

watch(
  () => props.show,
  (v) => {
    if (v) {
      amount.value = ''
      note.value = ''
      err.value = ''
      myBalanceDraft.value = '0.00'
      if (!props.isGroup && props.contactId != null) {
        getWallet(props.contactId)
          .then((w) => {
            wallet.value = w
            myBalanceDraft.value = (w.my_balance ?? 0).toFixed(2)
          })
          .catch(() => { wallet.value = null })
      } else {
        wallet.value = null
      }
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
  return Number.isFinite(n) && n > 0 && n <= 99999
})

function confirm() {
  const n = Number(amount.value)
  if (!Number.isFinite(n) || n <= 0) {
    err.value = '请输入有效金额'
    return
  }
  err.value = ''
  emit('send', { amount: n, note: note.value.trim() })
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
.rp-bal { display: flex; align-items: baseline; justify-content: space-between; }
.rp-bal-label { font-size: 13px; color: #c98d75; }
.rp-bal-val { font-size: 18px; font-weight: 800; color: #c05e45; }
/* 我的余额：可直接输入自定义（虚线下划线提示可编辑） */
.rp-bal-edit {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  border-bottom: 1px dashed rgba(192, 94, 69, 0.45);
  padding: 0 2px;
}
.rp-bal-edit:focus-within { border-bottom-color: #c05e45; }
.rp-bal-yen { font-size: 14px; font-weight: 800; color: #c05e45; }
.rp-bal-input {
  width: 84px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 18px;
  font-weight: 800;
  color: #c05e45;
  text-align: right;
  font-family: inherit;
  -moz-appearance: textfield;
}
.rp-bal-input::-webkit-outer-spin-button,
.rp-bal-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
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
