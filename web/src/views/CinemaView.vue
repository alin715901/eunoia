<template>
  <div class="cv-page">
    <AppHeader title="影院" back />

    <div class="cv-body">
      <!-- 顶部观看统计（保留） -->
      <div class="cv-summary">
        <span class="cv-sum-ic"><AppIcon name="film" :size="26" color="var(--accent)" /></span>
        <span class="cv-sum-main">
          <span class="cv-sum-title">站点 {{ allSites.length }} 个 · 片单 {{ linkList.length }} 条</span>
          <span class="cv-sum-sub">一起看过的，和想一起看的</span>
        </span>
      </div>

      <!-- 站点 / 影片 切换 -->
      <div class="cv-tabs">
        <button class="cv-tab" :class="{ on: tab === 'sites' }" @click="tab = 'sites'">站点</button>
        <button class="cv-tab" :class="{ on: tab === 'films' }" @click="tab = 'films'">影片</button>
      </div>

      <!-- 站点 -->
      <section v-if="tab === 'sites'" class="cv-sec">
        <div class="cv-sec-head">
          <span class="cv-sec-title">站点 {{ allSites.length }} 个</span>
          <button class="cv-add" @click="openAddSite"><AppIcon name="plus" :size="18" /> 添加</button>
        </div>
        <p class="cv-sec-tip">点站点直接进去看；部分站点禁止应用内嵌，会自动让你在浏览器打开。</p>
        <button
          v-for="s in allSites"
          :key="s.id"
          class="cv-card"
          @click="openUrl(s.url, s.name)"
        >
          <span class="cv-card-ic"><AppIcon name="film" :size="18" color="var(--accent)" /></span>
          <span class="cv-card-main">
            <span class="cv-card-title">{{ s.name }}</span>
            <span class="cv-card-sub">{{ s.desc || hostOf(s.url) }}</span>
          </span>
          <span class="cv-card-ops" @click.stop v-if="s.custom">
            <button class="cv-op" @click="removeSite(s)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" v-else />
        </button>
        <p v-if="!allSites.length" class="cv-empty">还没有站点，点右上角「添加」。</p>
      </section>

      <!-- 影片（片单） -->
      <section v-else class="cv-sec">
        <div class="cv-sec-head">
          <span class="cv-sec-title">片单 {{ linkList.length }} 条</span>
          <button class="cv-add" @click="openAddLink"><AppIcon name="plus" :size="18" /> 导入</button>
        </div>
        <p class="cv-sec-tip">粘贴 B 站 / 爱奇艺 / 腾讯视频等播放页链接，给影片起个名，存起来随时看。</p>
        <button
          v-for="l in linkList"
          :key="l.id"
          class="cv-card"
          @click="openUrl(l.body, l.title)"
        >
          <span class="cv-card-ic"><AppIcon name="link" :size="18" color="var(--accent)" /></span>
          <span class="cv-card-main">
            <span class="cv-card-title">{{ l.title }}</span>
            <span class="cv-card-sub">{{ l.body }}</span>
          </span>
          <span class="cv-card-ops" @click.stop>
            <button class="cv-op" @click="removeLink(l)" aria-label="删除"><AppIcon name="trash" :size="16" color="#c0576b" /></button>
          </span>
        </button>
        <p v-if="!linkList.length" class="cv-empty">片单还是空的，点右上角「导入」添加一部。</p>
      </section>
    </div>

    <!-- 添加站点弹窗 -->
    <div v-if="siteSheet.show" class="cv-mask" @click.self="closeSiteSheet">
      <div class="cv-sheet">
        <h3 class="cv-sheet-title">添加观影站点</h3>
        <div class="cv-fld">
          <span class="cv-fld-label">名称</span>
          <input v-model="siteSheet.name" class="cv-input" placeholder="例如：某某影视" maxlength="20" />
        </div>
        <div class="cv-fld">
          <span class="cv-fld-label">网址</span>
          <input v-model="siteSheet.url" class="cv-input" placeholder="https://..." />
        </div>
        <div class="cv-actions">
          <button class="cv-btn ghost" @click="closeSiteSheet">取消</button>
          <button class="cv-btn primary" @click="saveSite">保存</button>
        </div>
      </div>
    </div>

    <!-- 导入影片弹窗 -->
    <div v-if="linkSheet.show" class="cv-mask" @click.self="closeLinkSheet">
      <div class="cv-sheet">
        <h3 class="cv-sheet-title">导入影片</h3>
        <div class="cv-fld">
          <span class="cv-fld-label">影片名称</span>
          <input v-model="linkSheet.name" class="cv-input" placeholder="例如：你的名字" maxlength="40" />
        </div>
        <div class="cv-fld">
          <span class="cv-fld-label">视频链接</span>
          <input v-model="linkSheet.url" class="cv-input" placeholder="https://..." />
        </div>
        <div class="cv-actions">
          <button class="cv-btn ghost" @click="closeLinkSheet">取消</button>
          <button class="cv-btn primary" @click="saveLink">保存</button>
        </div>
      </div>
    </div>

    <!-- 应用内观看器 -->
    <div v-if="viewer.show" class="cv-player">
      <div class="cv-bar">
        <button class="cv-bar-btn" @click="closeViewer" aria-label="关闭"><AppIcon name="close" :size="20" /></button>
        <span class="cv-bar-title">{{ viewer.title }}</span>
        <button class="cv-bar-open" @click="openExternal">浏览器打开</button>
      </div>
      <iframe class="cv-frame" :src="viewer.url" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      <p class="cv-player-tip">若页面空白（部分站点禁止内嵌），点右上角「浏览器打开」。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useItems } from '@/composables/useItems'
import { useNotificationsStore } from '@/stores/notifications'
import { confirmDialog } from '@/utils/dialog'

const toast = useNotificationsStore()
const sites = useItems('cinema_sites')
const links = useItems('cinema_links')

/* 内置几个正版免费平台，用户也能自行添加更多 */
const BUILTIN = [
  { id: 'bili', name: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '番剧 / 影视 / 纪录片' },
  { id: 'm1905', name: '1905 电影网', url: 'https://www.1905.com', desc: '官方正版免费电影' },
  { id: 'xigua', name: '西瓜视频', url: 'https://www.ixigua.com', desc: '免费影视综艺' },
  { id: 'cctv', name: 'CCTV 节目官网', url: 'https://tv.cctv.com', desc: '央视免费节目' }
]

const tab = ref('sites')

const allSites = computed(() =>
  [...BUILTIN, ...sites.items.value.map((it) => ({ id: it.id, name: it.title, url: it.body, desc: '自定义站点', custom: true }))]
)
/* 过滤出有效链接，避免空数据渲染出空卡片 */
const linkList = computed(() =>
  (Array.isArray(links.items.value) ? links.items.value : []).filter((x) => x && x.body)
)

const viewer = reactive({ show: false, url: '', title: '' })
function openUrl(url, title) {
  viewer.url = url
  viewer.title = title || url
  viewer.show = true
}
function openExternal() {
  if (viewer.url) window.open(viewer.url, '_blank', 'noopener')
}
function closeViewer() {
  viewer.show = false
  viewer.url = ''
}

function hostOf(u) {
  try {
    return new URL(u).host.replace(/^www\./, '')
  } catch {
    return u
  }
}

/* 添加站点 */
const siteSheet = reactive({ show: false, name: '', url: '' })
function openAddSite() {
  Object.assign(siteSheet, { show: true, name: '', url: '' })
}
function closeSiteSheet() {
  siteSheet.show = false
}
async function saveSite() {
  const url = siteSheet.url.trim()
  const name = siteSheet.name.trim()
  if (!/^https?:\/\//i.test(url)) {
    toast.pushToast({ title: '网址要以 http(s):// 开头' })
    return
  }
  if (!name) {
    toast.pushToast({ title: '填一下站点名称' })
    return
  }
  closeSiteSheet()
  await sites.add({ title: name, body: url, extra: {} })
  toast.pushToast({ title: '已添加站点' })
}
async function removeSite(it) {
  if (!(await confirmDialog({ title: '删除该站点？', danger: true }))) return
  await sites.remove(it.id)
}

/* 导入影片（片单） */
const linkSheet = reactive({ show: false, name: '', url: '' })
function openAddLink() {
  Object.assign(linkSheet, { show: true, name: '', url: '' })
}
function closeLinkSheet() {
  linkSheet.show = false
}
async function saveLink() {
  const url = linkSheet.url.trim()
  if (!/^https?:\/\//i.test(url)) {
    toast.pushToast({ title: '请输入 http(s) 开头的链接' })
    return
  }
  const name = linkSheet.name.trim() || hostOf(url)
  closeLinkSheet()
  await links.add({ title: name, body: url, extra: {} })
  toast.pushToast({ title: '已加入片单' })
}
async function removeLink(it) {
  if (!(await confirmDialog({ title: '删除该影片？', danger: true }))) return
  await links.remove(it.id)
}

onMounted(async () => {
  await Promise.all([sites.load(), links.load()])
})
</script>

<style scoped>
.cv-page { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-body); }
.cv-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 14px; }

.cv-summary { display: flex; align-items: center; gap: 12px; padding: 14px 12px; background: var(--bg-screen); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow); }
.cv-sum-ic { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 12px; background: var(--bg-soft); display: flex; align-items: center; justify-content: center; }
.cv-sum-main { display: flex; flex-direction: column; gap: 2px; }
.cv-sum-title { font-size: 15px; font-weight: 600; color: var(--text); }
.cv-sum-sub { font-size: 12px; color: var(--text-soft); }

.cv-tabs { display: flex; gap: 8px; }
.cv-tab { flex: 1; padding: 10px 0; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-screen); color: var(--text-soft); font-size: 14px; font-weight: 600; }
.cv-tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }

.cv-sec { background: var(--bg-screen); border: 1px solid var(--border); border-radius: 16px; padding: 12px; box-shadow: var(--shadow); }
.cv-sec-head { display: flex; align-items: center; justify-content: space-between; }
.cv-sec-title { font-size: 14px; font-weight: 600; color: var(--text); }
.cv-add { display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent; color: var(--accent); font-size: 13px; font-weight: 600; padding: 4px 6px; }
.cv-sec-tip { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 6px 0 10px; }

.cv-card { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px 4px; background: transparent; border: none; border-bottom: 1px solid var(--border); text-align: left; }
.cv-card:last-of-type { border-bottom: none; }
.cv-card-ic { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 10px; background: var(--bg-soft); display: flex; align-items: center; justify-content: center; }
.cv-card-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cv-card-title { font-size: 14px; color: var(--text); }
.cv-card-sub { font-size: 12px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-card-ops { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; }
.cv-op { border: none; background: transparent; padding: 4px; }

.cv-empty { font-size: 12px; color: var(--text-soft); padding: 10px 4px; }

.cv-mask { position: fixed; inset: 0; background: rgba(60, 50, 56, 0.5); display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50; }
.cv-sheet { width: 100%; max-width: 340px; background: var(--bg-screen); border: 1px solid var(--border); border-radius: 20px; padding: 18px 16px; box-shadow: var(--shadow); animation: cv-pop 0.18s ease; }
@keyframes cv-pop { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
.cv-sheet-title { font-size: 16px; font-weight: 700; color: var(--text); margin: 0 0 14px; text-align: center; }
.cv-fld { margin-bottom: 12px; }
.cv-fld-label { display: block; font-size: 12px; color: var(--text-soft); margin-bottom: 6px; }
.cv-input { width: 100%; padding: 11px 12px; font-size: 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-soft); color: var(--text); }
.cv-actions { display: flex; gap: 10px; margin-top: 6px; }
.cv-btn { flex: 1; padding: 12px 0; border-radius: 12px; font-size: 15px; border: none; font-weight: 600; }
.cv-btn.ghost { background: var(--bg-soft); color: var(--text); }
.cv-btn.primary { background: var(--accent); color: #fff; }

.cv-player { position: fixed; inset: 0; background: #000; display: flex; flex-direction: column; z-index: 60; }
.cv-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: rgba(0, 0, 0, 0.85); color: #fff; }
.cv-bar-btn { border: none; background: transparent; color: #fff; padding: 4px; display: inline-flex; }
.cv-bar-title { flex: 1 1 auto; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-bar-open { flex: 0 0 auto; border: none; background: rgba(255, 255, 255, 0.18); color: #fff; font-size: 13px; padding: 6px 12px; border-radius: 999px; }
.cv-frame { flex: 1 1 auto; width: 100%; border: none; background: #fff; }
.cv-player-tip { flex: 0 0 auto; margin: 0; font-size: 11px; color: rgba(255, 255, 255, 0.7); text-align: center; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); background: rgba(0, 0, 0, 0.85); }
</style>
