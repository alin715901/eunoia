<template>
  <div class="stats-view">
    <AppHeader title="收藏" back />
    <div class="sv-body">
    <div v-if="loading" class="sv-loading">加载中…</div>
    <div v-else-if="!groups.length" class="sv-empty">
      <div class="sv-empty-emoji">⭐</div>
      <div class="sv-empty-title">还没有收藏</div>
      <div class="sv-empty-sub">长按聊天里的气泡，点「收藏」即可把消息存到这里</div>
    </div>

    <template v-else>
      <div v-for="g in groups" :key="g.contactId" class="sv-group">
        <div class="sv-group-head">
          <AppAvatar :avatar="g.avatar" :name="g.name" :size="30" />
          <span class="sv-group-name">{{ g.name }}</span>
          <span class="sv-group-count">{{ g.items.length }}</span>
        </div>
        <div class="sv-items">
          <div v-for="it in g.items" :key="it.id" class="sv-card">
            <div class="sv-card-sender">
              {{ it.sender === 'me' ? '我' : g.name }}
            </div>
            <div class="sv-card-body">
              <!-- 提问记录：解析 JSON 显示问题与选项 -->
              <template v-if="it.content_type === 'question' && parseQ(it.text)">
                <div class="sv-q">
                  <span class="sv-q-tag">{{ qLabel(parseQ(it.text).type) }}</span>
                  <div class="sv-q-text">{{ parseQ(it.text).question }}</div>
                  <div v-if="parseQ(it.text).options?.length" class="sv-q-opts">
                    <div v-for="(o, i) in parseQ(it.text).options" :key="i" class="sv-q-opt">
                      {{ ['A','B','C','D','E','F'][i] || i + 1 }}. {{ o }}
                    </div>
                  </div>
                </div>
              </template>
              <template v-else>
                <img v-if="it.asset_path" :src="it.asset_path" class="sv-card-img" />
                <div class="sv-card-text">{{ it.text || (it.asset_path ? '[图片]' : '') }}</div>
              </template>
            </div>
            <div v-if="it.quote_text" class="sv-card-quote">
              <img v-if="it.quote_image" :src="it.quote_image" class="sv-quote-thumb" />
              <span class="sv-quote-text">{{ it.quote_text }}</span>
            </div>
            <div class="sv-card-time">{{ fmt(it.created_at) }}</div>
          </div>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import * as api from '@/api/chat'

const loading = ref(true)
const favorites = ref([])

function pad(n) { return String(n).padStart(2, '0') }
function fmt(sec) {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (new Date().toDateString() === d.toDateString()) return hm
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

const groups = computed(() => {
  const map = new Map()
  for (const f of favorites.value) {
    const cid = f.contact_id
    if (!map.has(cid)) {
      map.set(cid, {
        contactId: cid,
        name: f.contact_name || '对方',
        avatar: f.chat_avatar || f.contact_avatar || '',
        items: []
      })
    }
    map.get(cid).items.push(f)
  }
  return [...map.values()]
})

/* 提问记录（text 为 JSON）解析与标签 */
function parseQ(text) {
  try {
    const q = JSON.parse(text || '{}')
    return q && q.question ? q : null
  } catch (e) {
    return null
  }
}
function qLabel(t) {
  return t === 'single' ? '提问 · 单选' : t === 'multi' ? '提问 · 多选' : '提问 · 问答'
}

onMounted(async () => {
  try {
    const res = await api.getFavorites()
    favorites.value = res.favorites || res || []
  } catch (e) {
    favorites.value = []
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stats-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-screen);
}
/* 头部固定，内容区独立滚动（与其他页面 AppHeader 结构一致） */
.sv-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.sv-loading, .sv-empty { padding: 60px 20px; text-align: center; color: var(--text-soft); font-size: 14px; }
.sv-empty-emoji { font-size: 40px; margin-bottom: 12px; }
.sv-empty-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.sv-empty-sub { font-size: 13px; line-height: 1.5; max-width: 260px; margin: 0 auto; }

.sv-group { margin: 12px; }
.sv-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 8px;
}
.sv-group-name { font-size: 15px; font-weight: 600; color: var(--text); }
.sv-group-count {
  font-size: 12px;
  color: var(--text-soft);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 1px 8px;
}
.sv-items { display: flex; flex-direction: column; gap: 8px; }
.sv-card {
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
}
.sv-card-sender { font-size: 12px; color: var(--accent); margin-bottom: 6px; }
.sv-card-body { display: flex; gap: 8px; align-items: flex-start; }
.sv-card-img { width: 90px; height: 90px; object-fit: cover; border-radius: 8px; flex: 0 0 auto; }
.sv-card-text { font-size: 15px; color: var(--text); line-height: 1.5; word-break: break-word; white-space: pre-wrap; }
.sv-card-quote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 9px;
  background: var(--bg-soft);
  border-left: 2px solid var(--accent, #c5a47e);
  border-radius: 6px;
}
.sv-quote-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 4px; flex: 0 0 auto; }
.sv-quote-text { font-size: 12px; color: var(--text-soft); overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.sv-card-time { margin-top: 8px; font-size: 11px; color: var(--text-soft); }

/* 提问记录卡片 */
.sv-q { display: flex; flex-direction: column; gap: 6px; }
.sv-q-tag {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  color: #d99a3d;
  background: #fdf6ea;
  border-radius: 999px;
  padding: 2px 8px;
}
.sv-q-text { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.5; word-break: break-word; }
.sv-q-opts { display: flex; flex-direction: column; gap: 3px; }
.sv-q-opt { font-size: 13px; color: var(--text-soft); line-height: 1.5; }
</style>
