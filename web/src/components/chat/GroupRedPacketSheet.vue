<template>
  <!-- 群红包详情：拼手气结果 + 领取记录。未领取且仍有份额时可点「开」随机领取一份 -->
  <Teleport to="body">
    <div v-if="show" class="gpr-mask" @click="$emit('close')">
      <div class="gpr-sheet" @click.stop>
        <button class="gpr-close" @click="$emit('close')" aria-label="关闭">✕</button>

        <div class="gpr-head">
          <AppAvatar :name="senderName" :avatar="senderAvatar" :size="44" />
          <div class="gpr-sender">{{ senderName }}的红包</div>
        </div>

        <template v-if="detail">
          <!-- 主金额：未领取显示总金额；已领取显示我抢到的份额 -->
          <div class="gpr-amount">
            <span v-if="detail.myGrab != null" class="gpr-yen">¥</span>{{ detail.myGrab != null ? fmt(detail.myGrab) : fmt(detail.meta.amount) }}
          </div>
          <div class="gpr-sub">
            <template v-if="detail.myGrab != null">已存入我的余额</template>
            <template v-else-if="detail.meta.status === 'unclaimed'">{{ detail.meta.count }} 份 · 剩余 {{ detail.remainingCount }} 份待抢</template>
            <template v-else-if="detail.meta.status === 'claimed'">{{ detail.meta.count }} 份 · 已被领完</template>
            <template v-else>红包已退回</template>
          </div>
          <div class="gpr-note">{{ detail.meta.note || '恭喜发财，大吉大利' }}</div>

          <!-- 开红包 / 状态 -->
          <button v-if="detail.canGrab" class="gpr-open" :disabled="grabbing" @click="onGrab">
            {{ grabbing ? ' opening…' : '开' }}
          </button>
          <div v-else-if="detail.expired" class="gpr-status">
            超过 5 分钟未领完，剩余 ¥{{ fmt(detail.meta.expired_refund ?? detail.remainingAmount) }} 已退回给{{ senderName }}
          </div>

          <!-- 领取记录 -->
          <div class="gpr-list">
            <div class="gpr-list-title">领取记录 · {{ detail.grabs.length }}/{{ detail.meta.count }}</div>
            <div v-if="!detail.grabs.length" class="gpr-empty">还没人领取，快来手气一把</div>
            <div v-for="(g, i) in detail.grabs" :key="g.grabber" class="gpr-row">
              <AppAvatar :name="grabName(g)" :avatar="grabAvatar(g)" :size="30" />
              <span class="gpr-name">{{ grabName(g) }}</span>
              <span v-if="isBest(i)" class="gpr-best">手气最佳</span>
              <span class="gpr-amt">¥{{ fmt(g.amount) }}</span>
            </div>
          </div>
        </template>

        <div v-else class="gpr-loading">加载中…</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import { claimGroupRedPacket, getGroupRedPacketDetail } from '@/api/chat'
import { useNotificationsStore } from '@/stores/notifications'

const props = defineProps({
  show: { type: Boolean, default: false },
  message: { type: Object, default: null },
  // 群成员 id → {name, avatar}
  memberMap: { type: Object, default: null },
  myName: { type: String, default: '我' },
  myAvatar: { type: String, default: '' }
})
defineEmits(['close'])
const toast = useNotificationsStore()

const detail = ref(null)
const grabbing = ref(false)

/* 发送者：我 → 我的头像；否则 → 对应群成员 */
const senderKey = computed(() => {
  try {
    const meta = JSON.parse((props.message && props.message.text) || '{}')
    return meta.sender === 'me' ? 'me' : String(meta.sender)
  } catch (e) {
    return 'me'
  }
})
const senderName = computed(() =>
  senderKey.value === 'me' ? props.myName || '我' : props.memberMap?.[senderKey.value]?.name || '群成员'
)
const senderAvatar = computed(() =>
  senderKey.value === 'me' ? props.myAvatar : props.memberMap?.[senderKey.value]?.avatar || ''
)

/* 领取人行：我 → 我的头像/名；否则 → 群成员 */
function grabName(g) {
  return g.grabber === 'me' ? props.myName || '我' : props.memberMap?.[String(g.grabber).slice(2)]?.name || g.name || '群成员'
}
function grabAvatar(g) {
  return g.grabber === 'me' ? props.myAvatar : props.memberMap?.[String(g.grabber).slice(2)]?.avatar || ''
}

/* 手气最佳：领完后份额最大的人（至少两人领取才评） */
const bestIdx = computed(() => {
  if (!detail.value || detail.value.meta.status !== 'claimed') return -1
  const list = detail.value.grabs
  if (list.length < 2) return -1
  let idx = 0
  for (let i = 1; i < list.length; i++) if (list[i].amount > list[idx].amount) idx = i
  return idx
})
function isBest(i) { return i === bestIdx.value }

function fmt(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.00$/, '') : String(v ?? '')
}

async function loadDetail() {
  if (!props.message) return
  detail.value = null
  try {
    detail.value = await getGroupRedPacketDetail(props.message.id)
  } catch (e) {
    detail.value = null
  }
}

/* 开红包：随机领一份 → 刷新详情（message_update 已同步群里的卡片状态） */
async function onGrab() {
  if (grabbing.value) return
  grabbing.value = true
  try {
    const res = await claimGroupRedPacket(props.message.id)
    await loadDetail()
    if (res && res.grab != null) {
      toast.pushToast({ title: '抢到红包', text: `¥${fmt(res.grab)}`, type: 'message' })
    }
  } catch (e) {
    toast.pushToast({ title: '领取失败', text: e?.message || '请稍后再试', type: 'message' })
  } finally {
    grabbing.value = false
  }
}

/* 打开时拉详情；群里其他人实时领取时，message prop 会被替换成新对象，跟着刷新 */
watch(
  () => props.show,
  (v) => { if (v) loadDetail() },
  { immediate: true }
)
watch(
  () => props.message,
  () => { if (props.show) loadDetail() }
)
</script>

<style scoped>
.gpr-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(0, 0, 0, 0.45);
  animation: gpr-fade 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
@keyframes gpr-fade { from { opacity: 0; } to { opacity: 1; } }
.gpr-sheet {
  position: relative;
  width: 100%;
  max-width: 320px;
  max-height: 82vh;
  overflow-y: auto;
  background: linear-gradient(165deg, #fdf0e7 0%, #fbdfd2 100%);
  border-radius: 18px;
  padding: 24px 20px calc(22px + env(safe-area-inset-bottom));
  text-align: center;
  animation: gpr-pop 0.22s ease;
  scrollbar-width: none;
}
.gpr-sheet::-webkit-scrollbar { display: none; }
@keyframes gpr-pop {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
.gpr-close {
  position: absolute;
  right: 12px;
  top: 12px;
  border: none;
  background: transparent;
  color: #c98d75;
  font-size: 17px;
  width: 30px;
  height: 30px;
}
.gpr-head { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.gpr-sender { font-size: 14px; font-weight: 700; color: #b5634a; }
.gpr-amount {
  margin-top: 16px;
  font-size: 34px;
  font-weight: 800;
  color: #c05e45;
  letter-spacing: 0.5px;
}
.gpr-yen { font-size: 20px; margin-right: 2px; }
.gpr-sub { margin-top: 4px; font-size: 12px; color: #c98d75; }
.gpr-note {
  margin-top: 6px;
  font-size: 13px;
  color: #b5634a;
  white-space: pre-wrap;
  word-break: break-word;
}
/* 「开」按钮：微信式圆形大按钮 */
.gpr-open {
  margin: 20px auto 4px;
  width: 76px;
  height: 76px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #f9a8b8, #ef7d98);
  color: #fff;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 2px;
  box-shadow: 0 6px 16px rgba(239, 125, 152, 0.35);
  transition: transform 0.12s ease;
}
.gpr-open:active { transform: scale(0.94); }
.gpr-open:disabled { opacity: 0.6; }
.gpr-status {
  margin: 14px 4px 0;
  font-size: 12px;
  color: #b5634a;
  line-height: 1.6;
}
.gpr-list {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(192, 94, 69, 0.14);
  text-align: left;
}
.gpr-list-title { font-size: 12px; color: #c98d75; margin-bottom: 8px; }
.gpr-empty { font-size: 12px; color: #c98d75; padding: 6px 0 10px; }
.gpr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.gpr-name { font-size: 13px; color: #b5634a; flex: 0 0 auto; max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gpr-best {
  flex: 0 0 auto;
  font-size: 10px;
  color: #fff;
  background: #e8a33d;
  border-radius: 4px;
  padding: 1px 5px;
}
.gpr-amt { margin-left: auto; font-size: 13px; font-weight: 700; color: #c05e45; }
.gpr-loading { padding: 40px 0; font-size: 13px; color: #c98d75; }
</style>
