<template>
  <!-- 领取/退回对方红包：底部弹窗，展示金额与留言，提供「领取」「退回」两个动作 -->
  <Teleport to="body">
    <div v-if="show" class="rpc-mask" @click="$emit('close')">
      <div class="rpc-sheet" @click.stop>
        <button class="rpc-close" @click="$emit('close')">✕</button>
        <div class="rpc-head">
          <AppAvatar :name="contactName" :avatar="contactAvatar" :size="40" />
          <div class="rpc-name">{{ contactName }}</div>
          <div class="rpc-sub">的红包</div>
        </div>
        <div class="rpc-amount">¥{{ fmtAmount(meta?.amount) }}</div>
        <div class="rpc-note">{{ meta?.note || '恭喜发财，大吉大利' }}</div>
        <div class="rpc-actions">
          <button class="rpc-btn rpc-return" @click="$emit('return')">退回</button>
          <button class="rpc-btn rpc-claim" @click="$emit('claim')">领取</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  message: { type: Object, default: null },
  contactName: { type: String, default: '' },
  contactAvatar: { type: String, default: '' }
})
defineEmits(['close', 'claim', 'return'])

const meta = computed(() => {
  try {
    return JSON.parse((props.message && props.message.text) || '{}')
  } catch (e) {
    return {}
  }
})
function fmtAmount(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : String(v ?? '')
}
</script>

<style scoped>
.rpc-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(0, 0, 0, 0.45);
  animation: rpc-fade 0.2s ease;
}
@keyframes rpc-fade { from { opacity: 0; } to { opacity: 1; } }
.rpc-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(165deg, #fdf0e7 0%, #fbdfd2 100%);
  border-radius: 20px 20px 0 0;
  padding: 26px 20px calc(28px + env(safe-area-inset-bottom));
  text-align: center;
  animation: rpc-up 0.25s ease;
}
@keyframes rpc-up { from { transform: translateY(40%); } to { transform: translateY(0); } }
.rpc-close {
  position: absolute;
  right: 14px;
  top: 14px;
  border: none;
  background: transparent;
  color: #c98d75;
  font-size: 18px;
  width: 30px;
  height: 30px;
}
.rpc-head { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.rpc-name { font-size: 16px; font-weight: 700; color: #b5634a; }
.rpc-sub { font-size: 12px; color: #c98d75; margin-top: -4px; }
.rpc-amount {
  margin-top: 18px;
  font-size: 40px;
  font-weight: 800;
  color: #c05e45;
  letter-spacing: 0.5px;
}
.rpc-note {
  margin-top: 6px;
  font-size: 13px;
  color: #c98d75;
  white-space: pre-wrap;
  word-break: break-word;
}
.rpc-actions { display: flex; gap: 12px; margin-top: 26px; }
.rpc-btn {
  flex: 1;
  border: none;
  border-radius: 999px;
  padding: 13px 0;
  font-size: 16px;
  font-weight: 700;
}
.rpc-return { background: var(--bg-screen); color: #b5634a; box-shadow: 0 2px 8px rgba(176, 99, 74, 0.12); }
.rpc-claim { background: linear-gradient(135deg, #f9a8b8, #ef7d98); color: #fff; }
</style>
