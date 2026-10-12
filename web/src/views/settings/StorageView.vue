<template>
  <div class="sp-view">
    <AppHeader title="内存数据" back />
    <div class="sp-body">
      <div class="panel sec">
        <div class="sec-head">
          <span class="sec-title">数据统计</span>
          <button class="mini-btn" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '刷新' }}</button>
        </div>
        <div class="stat-row" v-for="t in stats.tables" :key="t.key">
          <span class="stat-label">{{ t.label }}</span>
          <span class="stat-value">{{ t.count }} 条</span>
        </div>
      </div>

      <div class="panel sec">
        <div class="sec-title">占用空间</div>
        <div class="stat-row">
          <span class="stat-label">数据库</span>
          <span class="stat-value">{{ fmtSize(stats.dbSize) }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">图片 / 附件</span>
          <span class="stat-value">{{ fmtSize(stats.uploadsSize) }}</span>
        </div>
        <div class="stat-row total">
          <span class="stat-label">合计</span>
          <span class="stat-value">{{ fmtSize((stats.dbSize || 0) + (stats.uploadsSize || 0)) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getStorageStats } from '@/api/settings'

const stats = ref({ tables: [], dbSize: 0, uploadsSize: 0 })
const loading = ref(false)

function fmtSize(n) {
  const v = Number(n) || 0
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`
  return `${(v / 1024 / 1024).toFixed(2)} MB`
}

async function load() {
  loading.value = true
  try {
    const d = await getStorageStats()
    stats.value = d || { tables: [], dbSize: 0, uploadsSize: 0 }
  } catch (e) {
    /* 忽略，保留上次数据 */
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.sec-title { font-size: 14px; font-weight: 700; }
.mini-btn {
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; color: var(--text);
}
.mini-btn:disabled { opacity: 0.6; }
.stat-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 2px; font-size: 14px; color: var(--text);
  border-bottom: 1px solid var(--border);
}
.stat-row:last-child { border-bottom: none; }
.stat-label { color: var(--text); }
.stat-value { color: var(--text-soft); font-size: 13px; }
.stat-row.total .stat-label { font-weight: 600; }
.stat-row.total .stat-value { color: var(--text); font-weight: 600; }
</style>
