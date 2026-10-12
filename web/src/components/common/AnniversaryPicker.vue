<template>
  <!-- 纪念日选择弹窗：从已添加的纪念日中挑一个显示在首页卡片。
       分「我的纪念日」与「当前联系人专属」两类 -->
  <div class="ann-mask" @click.self="close">
    <div class="ann-modal">
      <h3 class="am-title">选择纪念日</h3>

      <div class="am-body">
        <p v-if="loading" class="am-tip">加载中…</p>
        <template v-else>
          <!-- 我的纪念日（通用） -->
          <div class="am-sec" v-if="mine.length">
            <div class="am-sec-h">我的纪念日</div>
            <ul class="am-list">
              <li v-for="a in mine" :key="a.id">
                <button class="am-item" :class="{ on: a.id === currentId }" @click="choose(a)">
                  <span class="am-ic"><AppIcon :name="a.type === 'countdown' ? 'hourglass' : 'calendar'" :size="16" :color="a.type === 'countdown' ? '#5b8def' : 'var(--accent)'" /></span>
                  <span class="am-main">
                    <span class="am-name">{{ a.title }}</span>
                    <span class="am-date">{{ displayDate(a) }}</span>
                  </span>
                  <span class="am-tag" :class="a.type === 'countdown' ? 'tg-cd' : 'tg-an'">{{ a.type === 'countdown' ? '倒数' : '纪念' }}</span>
                  <span class="am-days">{{ daysInfo(a) }}</span>
                  <AppIcon v-if="a.id === currentId" name="check" :size="16" color="var(--accent)" />
                </button>
              </li>
            </ul>
          </div>

          <!-- 当前联系人专属 -->
          <div class="am-sec" v-if="contactItems.length">
            <div class="am-sec-h">{{ contactName || '当前联系人' }} 专属</div>
            <ul class="am-list">
              <li v-for="a in contactItems" :key="a.id">
                <button class="am-item" :class="{ on: a.id === currentId }" @click="choose(a)">
                  <span class="am-ic"><AppIcon :name="a.type === 'countdown' ? 'hourglass' : 'calendar'" :size="16" :color="a.type === 'countdown' ? '#5b8def' : 'var(--accent)'" /></span>
                  <span class="am-main">
                    <span class="am-name">{{ a.title }}</span>
                    <span class="am-date">{{ displayDate(a) }}</span>
                  </span>
                  <span class="am-tag" :class="a.type === 'countdown' ? 'tg-cd' : 'tg-an'">{{ a.type === 'countdown' ? '倒数' : '纪念' }}</span>
                  <span class="am-days">{{ daysInfo(a) }}</span>
                  <AppIcon v-if="a.id === currentId" name="check" :size="16" color="var(--accent)" />
                </button>
              </li>
            </ul>
          </div>

          <p v-if="!list.length" class="am-empty">
            还没有纪念日<br />
            <span class="am-empty-sub">点下方「＋ 新建纪念日」添加</span>
          </p>
        </template>
      </div>

      <div class="am-actions">
        <button class="am-btn primary" @click="goManage">＋ 新建纪念日</button>
        <button class="am-btn" @click="close">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/common/AppIcon.vue'
import { getAnniversaries } from '@/api/anniversary'
import { displayDate } from '@/utils/lunar'

const router = useRouter()
const props = defineProps({
  currentId: { type: Number, default: 0 },
  contactId: { type: Number, default: 0 },
  contactName: { type: String, default: '' }
})
const emit = defineEmits(['close', 'select'])

const list = ref([])
const loading = ref(true)

/* 列表里：contact_id 为空 = 我的（通用）；否则 = 当前联系人专属 */
const mine = computed(() => list.value.filter((a) => !a.contact_id))
const contactItems = computed(() => list.value.filter((a) => a.contact_id))

onMounted(async () => {
  try {
    list.value = await getAnniversaries({ contactId: props.contactId || undefined })
  } catch (e) {
    list.value = []
  } finally {
    loading.value = false
  }
})

function daysInfo(a) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(`${a.date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (a.type === 'countdown') return diff >= 0 ? `还有 ${diff} 天` : `已过 ${-diff} 天`
  return diff >= 0 ? `还有 ${diff} 天` : `${Math.abs(diff) + 1} 天`
}

function choose(a) {
  emit('select', a)
}
function close() {
  emit('close')
}
function goManage() {
  emit('close')
  router.push('/anniversary')
}
</script>

<style scoped>
.ann-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 180;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.ann-modal {
  width: 100%;
  max-width: 320px;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.28);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.am-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--font-serif);
  text-align: center;
}
.am-body { overflow-y: auto; min-height: 0; }
.am-tip, .am-empty {
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  padding: 22px 0;
  line-height: 1.7;
}
.am-empty-sub { font-size: 12px; opacity: 0.75; }
.am-sec { margin-bottom: 12px; }
.am-sec:last-child { margin-bottom: 0; }
.am-sec-h {
  font-size: 12px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 6px;
  letter-spacing: 0.5px;
}
/* 每个板块最多露出两条，更多条目在内部滑动 */
.am-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 132px;
  overflow-y: auto;
}
.am-item {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
}
.am-item.on { border-color: var(--accent); background: var(--bg-screen); }
.am-ic { flex: 0 0 auto; }
.am-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.am-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.am-date { font-size: 11px; color: var(--text-soft); }
.am-tag {
  flex: 0 0 auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-weight: 600;
}
.tg-an { background: rgba(197, 164, 126, 0.16); color: #9a7c54; }
.tg-cd { background: rgba(91, 141, 239, 0.16); color: #4a78d6; }
.am-days {
  font-family: var(--font-serif);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  flex: 0 0 auto;
  min-width: 50px;
  text-align: right;
}
.am-actions { margin-top: 12px; display: flex; gap: 10px; }
.am-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 10px 0;
  font-size: 14px;
  color: var(--text);
}
.am-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
</style>
