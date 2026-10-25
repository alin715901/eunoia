<template>
  <div class="settings-view">
    <AppHeader title="设置" />
    <div class="sv-body">
      <!-- 分组：全局功能（不分联系人） -->
      <div class="panel sec">
        <button class="row-item" @click="goTheme">
          <span class="ri-icon"><AppIcon name="image" :size="18" /></span>
          <span class="ri-label">
            主题
            <span class="scope-tag global">全局</span>
          </span>
          <span class="spacer"></span>
          <span class="ri-value">{{ currentAccentName }} · {{ curFontName }}</span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>

      <!-- 外观：深色模式（点击弹窗选择） -->
      <div class="panel sec">
        <button class="row-item" @click="appearanceOpen = true">
          <span class="ri-icon"><AppIcon name="moon" :size="18" /></span>
          <span class="ri-label">
            深色模式
            <span class="scope-tag global">全局</span>
          </span>
          <span class="spacer"></span>
          <span class="ri-value">{{ appearanceLabel }}</span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>

      <!-- 后台保活 / 消息通知 -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="shield" :size="18" /></span>
          <span class="ri-label">后台保活</span>
          <span class="spacer"></span>
          <label class="switch" @click.stop>
            <input type="checkbox" :checked="keepAliveOn" @change="toggleKeepAlive" />
            <span class="slider-sw"></span>
          </label>
        </div>
        <div class="row-item static no-divide">
          <span class="ri-icon"><AppIcon name="chat" :size="18" /></span>
          <span class="ri-label">消息通知</span>
          <span class="spacer"></span>
          <label class="switch" @click.stop>
            <input type="checkbox" :checked="notifyOn" @change="toggleNotify" />
            <span class="slider-sw"></span>
          </label>
        </div>
        <p class="sub notif-sub">
          浏览器授权：{{ notifSupported ? notifText : '浏览器不支持' }}
          <button v-if="notifSupported && notifText !== '已开启'" class="link-btn" @click="enableNotify">
            去开启
          </button>
        </p>
      </div>

      <!-- 分组：阿里云 OSS / 内存数据 -->
      <div class="panel sec">
        <button class="row-item" @click="goOss">
          <span class="ri-icon"><AppIcon name="cloud" :size="18" /></span>
          <span class="ri-label">阿里云 OSS</span>
          <span class="spacer"></span>
          <span class="ri-value">{{ ossValue }}</span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
        <button class="row-item" @click="goStorage">
          <span class="ri-icon"><AppIcon name="archive" :size="18" /></span>
          <span class="ri-label">内存数据</span>
          <span class="spacer"></span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>

      <!-- 分组：使用说明 / 关于 -->
      <div class="panel sec">
        <button class="row-item" @click="goHelp">
          <span class="ri-icon"><AppIcon name="help" :size="18" /></span>
          <span class="ri-label">使用说明</span>
          <span class="spacer"></span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
        <button class="row-item" @click="goAbout">
          <span class="ri-icon"><AppIcon name="settings" :size="18" /></span>
          <span class="ri-label">关于</span>
          <span class="spacer"></span>
          <span class="ri-value">Eunoia字卡 v0.1.0</span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>
    </div>

    <!-- 深色模式选择弹窗 -->
    <Modal :show="appearanceOpen" title="深色模式" width="320px" @close="appearanceOpen = false">
      <div class="ap-list">
        <button
          v-for="a in APPEARANCES"
          :key="a.k"
          class="ap-row"
          :class="{ on: appearance === a.k }"
          @click="chooseAppearance(a.k)"
        >
          <span class="ap-name">{{ a.n }}</span>
          <AppIcon v-if="appearance === a.k" name="check" :size="18" color="var(--accent)" />
        </button>
      </div>
      <p class="ap-hint">{{ appearanceHint }}</p>
    </Modal>

  </div>
</template>

<script setup>
import { onMounted, onActivated, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import Modal from '@/components/common/Modal.vue'
import { useNotificationsStore } from '@/stores/notifications'
import {
  useNotification,
  notificationPermissionState,
  notificationSupported,
  requestNotificationPermission
} from '@/composables/useNotification'
import { useContactsStore } from '@/stores/contacts'
import { useDesktopStore } from '@/stores/desktop'
import { useSettingsStore, FONTS, APPEARANCES } from '@/stores/settings'
import { useKeepAlive } from '@/composables/useKeepAlive'
import { fmtSyncTime } from '@/utils/syncTime'

const router = useRouter()
const toast = useNotificationsStore()
const notif = useNotification()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()
const settings = useSettingsStore()
const keepAlive = useKeepAlive()

/* 莫兰迪 / 奶茶色系（全局一份，对所有联系人生效） */
const accents = [
  { c: '#c5a47e', n: '奶茶' },
  { c: '#7FA6CD', n: '雾蓝' },
  { c: '#BB9EC7', n: '藕荷' },
  { c: '#F4A6B3', n: '樱粉' },
  { c: '#7BC8A4', n: '薄荷' },
  { c: '#A8D8EA', n: '天蓝' },
  { c: '#FF9A8B', n: '珊瑚' },
  { c: '#7BA05B', n: '苔绿' },
  { c: '#1c1c1e', n: '墨黑' }
]

const notifSupported = computed(() => notif.supported)
/* 权限状态用响应式 ref 镜像（授权成功 / 切回前台自动刷新），
   否则 computed 读非响应式的 Notification.permission 会永远缓存「未开启」 */
const notifPerm = notificationPermissionState()
const notifText = computed(() => {
  const p = notifPerm.value
  if (p === 'granted') return '已开启'
  if (p === 'denied') return '被拒绝'
  if (p === 'unsupported') return '不支持'
  return '未开启'
})

/* 主题入口：点进去才设置主题色 / 字体 / 背景 / 图标 */
const currentAccent = computed(() => settings.accent)
const currentAccentName = computed(() => {
  const f = accents.find((a) => a.c === currentAccent.value)
  return f ? f.n : '自定义'
})
const curFontName = computed(() => {
  const k = settings.global?.theme?.font || 'default'
  return (FONTS.find((f) => f.k === k) || FONTS[0]).n
})
/* 外观：浅色 / 深色 / 跟随系统，切换即时生效并保存 */
const appearance = computed(() => settings.appearance)
const appearanceOpen = ref(false)
const appearanceLabel = computed(() => (APPEARANCES.find((a) => a.k === appearance.value) || APPEARANCES[0]).n)
const appearanceHint = computed(() => {
  const cur = appearance.value
  if (cur === 'dark') return '当前：深色'
  if (cur === 'system') return '跟随系统：' + (sysDark.value ? '深色' : '浅色')
  return '当前：浅色'
})
const sysDark = ref(false)
async function chooseAppearance(mode) {
  await pickAppearance(mode)
  appearanceOpen.value = false
}
async function pickAppearance(mode) {
  settings.setAppearance(mode)
  try {
    await settings.save()
  } catch (err) {
    toast.pushToast({ title: '保存失败', text: err.message })
  }
}
function goTheme() {
  router.push('/theme')
}
function goHelp() {
  router.push('/help')
}
function goAbout() {
  router.push('/about')
}
function goStorage() {
  router.push('/storage')
}
function goOss() {
  router.push('/settings/oss')
}

/* 阿里云 OSS 是否已配置（驱动入口行的状态文字） */
const ossOn = computed(() => {
  const c = settings.global.oss_config || {}
  return !!(c.accessKeyId && c.accessKeySecret && c.bucket && c.endpoint)
})

/* OSS 行右侧状态：已配置时附带最近一次云端同步时间 */
const ossValue = computed(() => {
  if (!ossOn.value) return '未配置'
  const t = Number(settings.global.oss_last_backup_at) || 0
  return t ? `已配置 · ${fmtSyncTime(t)}` : '已配置'
})

/* 通知开关：全局 */
const notifyOn = computed(() => settings.global.notifications?.browser !== false)
async function toggleNotify(e) {
  const on = e.target.checked
  settings.global.notifications = { ...(settings.global.notifications || {}), browser: on }
  try {
    await settings.save()
    toast.pushToast({ title: on ? '已开启消息通知' : '已关闭消息通知' })
    if (on && notifPerm.value === 'default') enableNotify()
  } catch (err) {
    toast.pushToast({ title: '保存失败', text: err.message })
  }
}

/* 后台保活开关：全局 */
const keepAliveOn = computed(() => settings.global.keepAlive === true)
async function toggleKeepAlive(e) {
  const on = e.target.checked
  settings.global.keepAlive = on
  try {
    await settings.save()
    await keepAlive.setEnabled(on)
    toast.pushToast({ title: on ? '已开启后台保活' : '已关闭后台保活' })
  } catch (err) {
    toast.pushToast({ title: '保存失败', text: err.message })
  }
}

async function enableNotify() {
  const res = await requestNotificationPermission()
  if (res === 'granted') {
    toast.pushToast({ title: '浏览器通知已授权' })
    notif.notify('字卡', { body: '浏览器通知已开启' })
  } else {
    toast.pushToast({ title: '未能开启', text: '请在浏览器设置中允许通知' })
  }
}

async function refresh() {
  try { await contactsStore.load() } catch (e) { /* ignore */ }
  await settings.load().catch(() => {})
  /* 若之前已开启后台保活，启动即恢复（无需手动进设置页） */
  if (settings.global.keepAlive === true) keepAlive.setEnabled(true).catch(() => {})
  sysDark.value = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  await desktop.ensureValid()
}

onMounted(refresh)
/* keep-alive 缓存：从 OSS 等子页返回时重读全局设置，刷新「已配置/未配置」状态 */
onActivated(refresh)

</script>

<style scoped>
.settings-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sv-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec { padding: 6px 4px; }

/* 设置行：图标 + 文案 + 右侧值 + 箭头（对齐参考图） */
.row-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--border);
  text-align: left;
  font-size: 15px;
  color: var(--text);
}
.row-item:last-child { border-bottom: none; }
.row-item.no-divide { border-bottom: none; }
.ri-icon { color: var(--text); display: inline-flex; }
.ri-label { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; }
.ri-value { font-size: 13px; color: var(--text-soft); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scope-tag.global {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-soft);
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 6px;
  padding: 1px 6px;
  white-space: nowrap;
}
.sub { font-size: 12px; color: var(--text-soft); line-height: 1.6; }
.swatches { display: flex; gap: 10px; flex-wrap: wrap; padding: 12px 12px 4px; }
.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: var(--shadow);
}
.swatch.on { outline: 3px solid var(--text); outline-offset: 2px; transform: scale(1.08); }
.swatch-name { margin: 6px 12px 12px; }
.notif-sub { margin: 0; padding: 0 12px 12px; display: flex; align-items: center; gap: 8px; }
/* 深色模式弹窗选项 */
.ap-list { display: flex; flex-direction: column; }
.ap-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 4px; border: none; background: transparent;
  border-bottom: 1px solid var(--border);
  font-size: 15px; color: var(--text); text-align: left;
}
.ap-row:last-child { border-bottom: none; }
.ap-row.on { color: var(--accent); font-weight: 600; }
.ap-hint { margin: 10px 4px 0; font-size: 12px; color: var(--text-soft); }
.link-btn { border: none; background: transparent; color: var(--accent); font-size: 12px; padding: 0; }

.spacer { flex: 1 1 auto; }

/* 开关 */
.switch { position: relative; display: inline-flex; align-items: center; }
.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
.slider-sw {
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: var(--bg-soft);
  position: relative;
  transition: background 0.2s ease;
  display: block;
}
.slider-sw::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--bg-screen);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}
.switch input:checked + .slider-sw { background: var(--text); }
.switch input:checked + .slider-sw::after { transform: translateX(18px); }

</style>