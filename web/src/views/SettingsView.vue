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

      <!-- 外观：浅色 / 深色 / 跟随系统 -->
      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="image" :size="18" /></span>
          <span class="ri-label">
            深色模式
            <span class="scope-tag global">全局</span>
          </span>
        </div>
        <div class="chips">
          <button
            v-for="a in APPEARANCES"
            :key="a.k"
            class="chip"
            :class="{ on: appearance === a.k }"
            @click="pickAppearance(a.k)"
          >{{ a.n }}</button>
        </div>
        <p class="sub mode-sub">
          {{ appearanceHint }}
        </p>
      </div>

      <div class="panel sec">
        <div class="row-item static">
          <span class="ri-icon"><AppIcon name="chat" :size="18" /></span>
          <span class="ri-label">
            消息通知
            <span class="scope-tag global">全局</span>
          </span>
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

      <!-- 分组：内存数据 / 关于 -->
      <div class="panel sec">
        <button class="row-item" @click="goStorage">
          <span class="ri-icon"><AppIcon name="archive" :size="18" /></span>
          <span class="ri-label">内存数据</span>
          <span class="spacer"></span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
        <button class="row-item" @click="goAbout">
          <span class="ri-icon"><AppIcon name="settings" :size="18" /></span>
          <span class="ri-label">关于</span>
          <span class="spacer"></span>
          <span class="ri-value">字卡 v0.1.0</span>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>
    </div>

  </div>
</template>

<script setup>
import { onMounted, computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useNotificationsStore } from '@/stores/notifications'
import {
  useNotification,
  notificationPermission,
  notificationSupported,
  requestNotificationPermission
} from '@/composables/useNotification'
import { useContactsStore } from '@/stores/contacts'
import { useDesktopStore } from '@/stores/desktop'
import { useSettingsStore, FONTS, APPEARANCES } from '@/stores/settings'

const router = useRouter()
const toast = useNotificationsStore()
const notif = useNotification()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()
const settings = useSettingsStore()

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
const notifText = computed(() => {
  const p = notificationPermission()
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
const appearanceHint = computed(() => {
  const cur = appearance.value
  if (cur === 'dark') return '当前：深色'
  if (cur === 'system') return '跟随系统：' + (sysDark.value ? '深色' : '浅色')
  return '当前：浅色'
})
const sysDark = ref(false)
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
function goAbout() {
  router.push('/about')
}
function goStorage() {
  router.push('/storage')
}

/* 通知开关：全局 */
const notifyOn = computed(() => settings.global.notifications?.browser !== false)
async function toggleNotify(e) {
  const on = e.target.checked
  settings.global.notifications = { ...(settings.global.notifications || {}), browser: on }
  try {
    await settings.save()
    toast.pushToast({ title: on ? '已开启消息通知' : '已关闭消息通知' })
    if (on && notificationPermission() === 'default') enableNotify()
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

onMounted(async () => {
  try { await contactsStore.load() } catch (e) { /* ignore */ }
  await settings.load().catch(() => {})
  sysDark.value = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  await desktop.ensureValid()
})

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
.row-item:not(.static):active { background: var(--bg-soft); }
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
.chips { display: flex; gap: 8px; padding: 4px 12px; }
.chip {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text);
}
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mode-sub { margin: 0; padding: 8px 12px 12px; }
.about-sub { margin: 0; padding: 0 12px 12px; }
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