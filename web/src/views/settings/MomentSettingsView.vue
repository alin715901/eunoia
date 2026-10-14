<template>
  <div class="sp-view">
    <AppHeader title="朋友圈设置" back />
    <div class="sp-body">
      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">主动发朋友圈</div>
        </div>
        <ToggleSwitch v-model="postEnabled" @update:modelValue="queueSave" />
      </div>

      <!-- 发布频率常驻显示：关着也能先调好，不用先开开关才看得见 -->
      <div class="panel sec">
        <div class="sec-title">发布频率</div>
        <DualRangeInput
          v-model:lo="postLo"
          v-model:hi="postHi"
          :min="0"
          :max="10"
          unit="条/天"
          @update:lo="queueSave"
          @update:hi="queueSave"
        />
        <p class="hint">每天发 {{ postLo }} ~ {{ postHi }} 条，最多10条</p>
      </div>

      <div class="panel sec row-between">
        <div class="row-main">
          <div class="row-title">对方会回复评论</div>
        </div>
        <ToggleSwitch v-model="replyEnabled" @update:modelValue="queueSave" />
      </div>

      <div class="panel sec">
        <div class="sec-title">评论速度</div>
        <div class="seg">
          <button class="seg-i" :class="{ on: commentSpeed === 'slow' }" @click="setSpeed('slow')">慢</button>
          <button class="seg-i" :class="{ on: commentSpeed === 'normal' }" @click="setSpeed('normal')">适中</button>
          <button class="seg-i" :class="{ on: commentSpeed === 'fast' }" @click="setSpeed('fast')">快</button>
        </div>
        <p class="hint">对方给我朋友圈点赞 / 评论 / 回复的快慢。调慢后对方不会立刻反应，更自然。</p>
      </div>

      <p class="hint standalone">
        开启后：你评论 TA 的动态时，TA 会从字卡里随机抽 1~3 张拼成一条回复你；有小概率不回复。<br />
        TA 也会按「评论速度」延迟、选择性地在你的朋友圈下点赞或评论（可点也可不点，不会秒赞秒评）。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import DualRangeInput from '@/components/common/DualRangeInput.vue'
import { useContactSettingsPage } from '@/composables/useContactSettingsPage'
import { notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const { settings, load, patch } = useContactSettingsPage(props.id)

const postEnabled = ref(false)
const postLo = ref(0)
const postHi = ref(2)
const replyEnabled = ref(true)
const commentSpeed = ref('normal')

function setSpeed(v) {
  commentSpeed.value = v
  queueSave()
}

async function doSave() {
  try {
    await patch({
      moment_enabled: postEnabled.value ? 1 : 0,
      moment_count_min: postLo.value,
      moment_count_max: postHi.value,
      moment_reply_enabled: replyEnabled.value ? 1 : 0,
      moment_comment_speed: commentSpeed.value
    })
  } catch (e) {
    notify('保存失败：' + e.message)
  }
}
function queueSave() {
  clearTimeout(doSave._t)
  doSave._t = setTimeout(doSave, 450)
}

onMounted(async () => {
  const s = await load()
  if (!s) return
  postEnabled.value = !!Number(s.moment_enabled)
  postLo.value = Number(s.moment_count_min ?? 0)
  postHi.value = Number(s.moment_count_max ?? 2)
  replyEnabled.value = Number(s.moment_reply_enabled ?? 1) !== 0
  commentSpeed.value = s.moment_comment_speed || 'normal'
})
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.seg { display: flex; gap: 8px; }
.seg-i {
  flex: 1 1 0;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  border-radius: 999px;
  padding: 9px 0;
  cursor: pointer;
}
.seg-i.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.seg-i:active { background: var(--accent-soft); }
.row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.row-main { flex: 1 1 auto; min-width: 0; }
.row-title { font-size: 14px; font-weight: 600; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 8px 0 0; }
.hint.standalone {
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 12px 14px;
  margin: 0;
}
</style>
