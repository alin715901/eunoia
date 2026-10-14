<template>
  <!-- 全局通话组件：独立于路由，跨页面保持。支持：我方呼叫(等待接听) / 对方来电(接听拒绝) / 通话中。
       可最小化、悬浮小窗可拖动，在任何页面都显示不隐藏。 -->
  <Teleport to="body">
    <template v-if="call.active">
      <!-- 最小化：悬浮小窗（可拖动，显示在所有页面） -->
      <div
        v-if="call.minimized"
        ref="miniEl"
        class="call-mini"
        :style="{ left: miniPos.x + 'px', top: miniPos.y + 'px' }"
        @pointerdown="onMiniDown"
      >
        <AppAvatar :name="call.name" :avatar="call.avatar" :size="32" :style="avatarStyle" />
        <div class="call-mini-info">
          <div class="call-mini-name">{{ call.name }}</div>
          <div class="call-mini-timer">{{ miniLabel }}</div>
        </div>
        <button class="call-mini-hangup" @click.stop="call.hangup()" aria-label="挂断">
          <AppIcon name="phone" :size="14" color="#fff" class="hangup-icon" />
        </button>
      </div>

      <!-- 全屏通话 -->
      <div v-else class="call-full">
        <!-- 收起为悬浮窗：右上角（来电界面除外） -->
        <button
          v-if="call.phase !== 'incoming'"
          class="call-min"
          @click="call.minimize()"
          aria-label="收起为悬浮窗"
        >
          <AppIcon name="chevron-down" :size="22" color="#fff" />
        </button>

        <div class="call-body">
          <!-- 群聊通话：不显示群头像，改为展示陆续加入的成员（头像+备注）；无人加入时显示虚线占位 -->
          <template v-if="call.isGroup">
            <div class="call-members">
              <!-- 我自己也算通话里的一员：等待加入和通话中都显示（头像 + 我的备注） -->
              <div v-if="call.selfPart" class="call-member">
                <AppAvatar :name="call.selfPart.name" :avatar="call.selfPart.avatar" :size="56" />
                <span class="call-member-name">{{ call.selfPart.name }}</span>
              </div>
              <div v-for="m in call.groupJoined" :key="m.name" class="call-member">
                <AppAvatar :name="m.name" :avatar="m.avatar" :size="56" />
                <span class="call-member-name">{{ m.name }}</span>
              </div>
              <!-- 还没人加入：虚线占位圈表示在等其他人陆续进来 -->
              <template v-if="call.phase === 'ringing'">
                <div class="call-ghost"></div>
                <div class="call-ghost"></div>
              </template>
            </div>
          </template>
          <AppAvatar v-else :name="call.name" :avatar="call.avatar" :size="96" :style="avatarStyle" class="call-avatar" />

          <div class="call-name">{{ call.name }}</div>

          <!-- 振铃（我方呼叫，等待接听） -->
          <div v-if="call.phase === 'ringing'" class="call-status">
            <template v-if="call.isGroup">等待成员加入…</template>
            <template v-else><span class="call-ring"></span> 等待对方接听…</template>
          </div>
          <!-- 来电（对方/群聊成员呼叫） -->
          <div v-else-if="call.phase === 'incoming'" class="call-status">
            {{ call.isGroup ? (call.initiatorName ? call.initiatorName + ' 邀请你群聊通话' : '群聊来电') : '对方邀请你通话' }}
          </div>
          <!-- 通话中 -->
          <div v-else class="call-status">
            <template v-if="call.isGroup">通话中 · {{ call.groupJoined.length + 1 }} 人</template>
            <template v-else>正在通话中…</template>
          </div>

          <div v-if="call.isConnected" class="call-timer">{{ timerText }}</div>
        </div>

        <!-- 操作区：来电 → 拒绝(左,电话朝下)/接听(右,电话朝上)；其余 → 仅发起人可挂断 -->
        <div class="call-actions" :class="call.phase">
          <template v-if="call.phase === 'incoming'">
            <button class="call-btn call-decline" @click="call.declineIncoming()" aria-label="拒绝">
              <AppIcon name="phone" :size="26" color="#fff" class="icon-down" />
            </button>
            <button class="call-btn call-accept" @click="call.answerIncoming()" aria-label="接听">
              <AppIcon name="phone" :size="26" color="#fff" class="icon-up" />
            </button>
          </template>
          <template v-else>
            <button class="call-btn call-hangup" @click="call.hangup()" aria-label="挂断">
              <AppIcon name="phone" :size="26" color="#fff" class="hangup-icon" />
            </button>
          </template>
        </div>
      </div>
    </template>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useCallStore } from '@/stores/call'

const call = useCallStore()
const route = useRoute()

/* 点通知跳转到该联系人的聊天页后，弹出暂存的来电界面（接听/拒绝） */
watch(
  () => route.fullPath,
  () => call.checkPending()
)

const timerText = computed(() => {
  const m = String(Math.floor(call.seconds / 60)).padStart(2, '0')
  const s = String(call.seconds % 60).padStart(2, '0')
  return `${m}:${s}`
})

const miniLabel = computed(() => {
  if (call.phase === 'incoming') return '对方来电…'
  if (call.phase === 'ringing') return '等待接听…'
  return timerText.value
})

const avatarStyle = computed(() => ({
  borderRadius: call.avatarShape === 'circle' ? '50%' : (call.avatarRadius || 12) + 'px'
}))

/* 悬浮小窗拖动：
 * 用 left/top 定位（而非 right/bottom），拖动时按视口边界钳制；
 * 位移超过 4px 算拖动——拖动结束后不再恢复全屏（否则一拖就弹回全屏）。
 * 关键：setPointerCapture 让指针全程锁定到小窗，避免被文本选择/其他元素吞掉；
 * 同时处理 pointercancel（手势被系统中断）并清理监听，防止状态残留导致失灵。 */
const miniEl = ref(null)
const miniPos = ref({ x: 14, y: 90 })
let dragging = false
let moved = false
let startX = 0
let startY = 0
let baseX = 0
let baseY = 0
let miniInited = false
/* 首次最小化：定位到右下角（之后记住拖动到的位置） */
function ensureMiniPos() {
  if (miniInited) return
  miniInited = true
  const el = miniEl.value
  const w = el ? el.offsetWidth : 160
  const h = el ? el.offsetHeight : 48
  miniPos.value = {
    x: Math.max(8, window.innerWidth - w - 14),
    y: Math.max(8, window.innerHeight - h - 90)
  }
}
watch(() => call.minimized, (v) => {
  if (v) nextTick(ensureMiniPos)
})
function onMiniDown(e) {
  // 按下挂断按钮不触发拖动（让按钮的 click 正常挂断）
  if (e.target.closest && e.target.closest('.call-mini-hangup')) return
  dragging = true
  moved = false
  startX = e.clientX
  startY = e.clientY
  baseX = miniPos.value.x
  baseY = miniPos.value.y
  try { miniEl.value.setPointerCapture(e.pointerId) } catch (_) {}
  window.addEventListener('pointermove', onMiniMove)
  window.addEventListener('pointerup', onMiniUp)
  window.addEventListener('pointercancel', onMiniUp)
}
function onMiniMove(e) {
  if (!dragging) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true
  if (!moved) return
  const el = miniEl.value
  const w = el ? el.offsetWidth : 160
  const h = el ? el.offsetHeight : 48
  miniPos.value.x = Math.min(Math.max(0, baseX + dx), Math.max(0, window.innerWidth - w))
  miniPos.value.y = Math.min(Math.max(0, baseY + dy), Math.max(0, window.innerHeight - h))
}
function onMiniUp() {
  if (!dragging) return
  dragging = false
  window.removeEventListener('pointermove', onMiniMove)
  window.removeEventListener('pointerup', onMiniUp)
  window.removeEventListener('pointercancel', onMiniUp)
  // 未移动（视为点按）→ 恢复全屏通话；拖动过则忽略
  if (!moved) call.restore()
  moved = false
}
</script>

<style scoped>
.call-full {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 90px 0 calc(60px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #4a4f63 0%, #2d3140 100%);
  animation: call-in 0.25s ease;
}
@keyframes call-in { from { opacity: 0; } to { opacity: 1; } }

/* 收起（最小化）按钮：右上角 */
.call-min {
  position: absolute;
  top: 18px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
}

.call-body { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.call-avatar { box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35); }
.call-name { margin-top: 8px; font-size: 24px; font-weight: 700; color: #fff; }

/* 群聊通话：已加入成员的展示区（头像 + 备注），一行五个、自动换行，最小高度占位避免等待时塌缩 */
.call-members {
  min-height: 96px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 360px;
}
.call-member {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: rise-in 0.3s ease;
}
.call-member-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  max-width: 56px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 无人加入时的虚线占位圈 */
.call-ghost {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1.5px dashed rgba(255, 255, 255, 0.35);
  animation: ghost-pulse 1.6s ease-in-out infinite;
}
.call-ghost:nth-child(2) { animation-delay: 0.3s; }
@keyframes ghost-pulse {
  0%, 100% { opacity: 0.35; transform: scale(0.94); }
  50% { opacity: 0.8; transform: scale(1); }
}
.call-status { font-size: 14px; color: rgba(255, 255, 255, 0.78); display: flex; align-items: center; gap: 8px; }
.call-ring {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #7fd6a0;
  animation: ring-pulse 1s ease-in-out infinite;
}
@keyframes ring-pulse { 0%,100% { transform: scale(0.8); opacity: 0.6; } 50% { transform: scale(1.2); opacity: 1; } }
.call-timer { font-size: 15px; color: rgba(255, 255, 255, 0.9); font-variant-numeric: tabular-nums; }

.call-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 60px;
  width: 100%;
  max-width: 320px;
  padding: 0 20px;
  /* 按钮整体上移：不再贴着屏幕最底部，留出一截安全距离 */
  margin-bottom: 46px;
}
/* 来电：拒绝(左) / 接听(右) 横向并排 */
.call-actions.incoming {
  gap: 72px;
}
.call-btn {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  flex: 0 0 auto;
}
.call-hangup { background: #ef5a5a; }
.call-accept { background: #4cd07d; }
.call-decline { background: #ef5a5a; }
.hangup-icon { transform: rotate(135deg); }
/* 接听：电话朝上 */
.icon-up { transform: rotate(-45deg); }
/* 拒绝：电话朝下（挂断） */
.icon-down { transform: rotate(135deg); }

/* 悬浮小窗 */
.call-mini {
  position: fixed;
  z-index: 149;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(45, 49, 64, 0.92);
  border-radius: 14px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  animation: call-in 0.2s ease;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.call-mini:active { cursor: grabbing; }
.call-mini-info { display: flex; flex-direction: column; }
.call-mini-name { font-size: 12px; font-weight: 600; color: #fff; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.call-mini-timer { font-size: 11px; color: rgba(255, 255, 255, 0.7); font-variant-numeric: tabular-nums; }
.call-mini-hangup {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: #ef5a5a;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
