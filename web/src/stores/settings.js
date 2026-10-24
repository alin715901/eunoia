import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '@/api/settings'

/**
 * 全局设置（不分联系人）：主题美化、浏览器通知授权、开屏是否显示联系人选择。
 * 业务内容数据（签名/灵魂链接/备忘录/背景/头像、字卡库、朋友圈…）仍按联系人独立，
 * 见 stores/desktop.js 与各功能自己的 store。
 */
/* 可选字体（预设）：直接写进 --font-sans，全站正文与标题一起变 */
export const FONTS = [
  { k: 'default', n: '系统默认', css: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif" },
  { k: 'serif', n: '宋体', css: "'Songti SC', 'STSong', 'Noto Serif CJK SC', 'Noto Serif SC', SimSun, serif" },
  { k: 'kai', n: '楷体', css: "'Kaiti SC', KaiTi, STKaiti, 'Noto Serif CJK SC', serif" },
  { k: 'hei', n: '黑体', css: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif" },
  { k: 'round', n: '圆体', css: "'Yuanti SC', 'Hiragino Sans GB', 'Quicksand', 'PingFang SC', sans-serif" },
  /* 手写：马善政手写体（Google Fonts，选中时按需加载；字形偏小，
     配 0.5px 字距增加呼吸感；无网络时回退行楷/楷体） */
  { k: 'hand', n: '手写', css: "'Ma Shan Zheng', 'Xingkai SC', STXingkai, 'Kaiti SC', cursive", wf: 'Ma+Shan+Zheng', extra: 'html,body{letter-spacing:.5px}' }
]

const DEFAULT = {
  theme: {
    /* 主题色，默认奶茶驼 */
    accent: '#c5a47e',
    /* 字体：预设 key，见 FONTS */
    font: 'default',
    /* 自定义字体 CSS，原样注入 <style>，可覆盖预设 */
    fontCss: '',
    /* 主页背景图（上传） */
    homeBg: '',
    /* 主页背景图透明度 0-100 */
    homeBgOpacity: 100,
    /* 主页卡片透明度 0-100：越低越透，主页背景图越清晰 */
    cardOpacity: 100,
    /* 桌面图标背景：{ [iconName]: url }，每个图标可单独上传图片 */
    icons: {}
  },
  /* 保存下来的主题套装：多套之间可一键切换 */
  themePresets: [],
  notifications: {
    browser: false
  },
  /* 开屏是否显示联系人选择（参考图「打开时显示联系人列表」） */
  startup: {
    showPicker: true
  },
  /* 朋友圈我的资料：头像 / 名称 / 封面背景图 */
  moments: {
    name: '',
    avatar: '',
    bg: ''
  },
  /* 后台保活：防止浏览器清理 / 刷新 / 杀掉页面 */
  keepAlive: false,
  /* 外观模式：light 浅色 / dark 深色 / system 跟随系统 */
  appearance: 'light'
}

/* 实际生效的深浅（跟随系统时会变），供各页面判断「当前是否深色」 */
export const resolvedTheme = ref('light')

export const APPEARANCES = [
  { k: 'light', n: '浅色' },
  { k: 'dark', n: '深色' },
  { k: 'system', n: '跟随系统' }
]

/* 外观模式生效：给 <html> 打 data-theme=light|dark，并设置 color-scheme；
   system 时读系统偏好并实时跟随（系统切换深浅时立即变）。 */
let sysQuery = null
let sysHandler = null
export function applyAppearance(mode) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const m = mode === 'dark' || mode === 'system' ? mode : 'light'
  // 切换前先清掉「卡片透明度」写死的内联色，后续 applyCardAlpha 会按新主题重新算
  ;['--card-bg-soft', '--card-bg-screen', '--icon-bg', '--tab-bg'].forEach((k) => root.style.removeProperty(k))
  const resolve = () => {
    if (m !== 'system') return m
    const dark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
  const paint = () => {
    const t = resolve()
    resolvedTheme.value = t
    root.dataset.theme = t
    root.style.colorScheme = t
    try {
      localStorage.setItem('zika.appearance', m)
    } catch (e) {
      /* 隐私模式下忽略 */
    }
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    if (sysQuery && sysHandler) sysQuery.removeEventListener('change', sysHandler)
    sysQuery = null
    sysHandler = null
    if (m === 'system') {
      sysQuery = window.matchMedia('(prefers-color-scheme: dark)')
      sysHandler = () => paint()
      sysQuery.addEventListener('change', sysHandler)
    }
  }
  paint()
}

/* 主题色写进 CSS 变量，切主题即时生效 */
function applyAccent(accent) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--accent', accent || DEFAULT.theme.accent)
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(accent || '').trim())
  if (m) {
    const rgb = [m[1], m[2], m[3]].map((x) => parseInt(x, 16)).join(',')
    root.style.setProperty('--accent-soft', `rgba(${rgb}, 0.12)`)
  }
}

/* 字体：预设同时写进正文变量与衬线变量，标题/字卡/朋友圈等一起跟着变；
   自定义 CSS 注入 <style id="zika-font-css">（预设自带的 extra 在前，用户自定义在后，可覆盖） */
export function applyFont(fontKey, fontCss) {
  if (typeof document === 'undefined') return
  const preset = FONTS.find((f) => f.k === fontKey) || FONTS[0]
  document.documentElement.style.setProperty('--font-sans', preset.css)
  /* 标题、字卡、朋友圈等用的是衬线变量，也一起换，才叫「全局生效」 */
  document.documentElement.style.setProperty('--font-serif', preset.css)
  /* 预设依赖的 Google Fonts webfont（如手写·马善政）：按需注入一次 */
  if (preset.wf) ensureWebfont(preset.wf)
  let tag = document.getElementById('zika-font-css')
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'zika-font-css'
    document.head.appendChild(tag)
  }
  tag.textContent = (preset.extra || '') + (fontCss || '')
}

/* 按需加载 Google Fonts 的字体族（幂等；display=swap 保证加载前用回退字体渲染） */
const webfontLoaded = new Set()
function ensureWebfont(family) {
  if (typeof document === 'undefined' || webfontLoaded.has(family)) return
  webfontLoaded.add(family)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`
  document.head.appendChild(link)
}

/* 卡片透明度：数值越低，主页卡片越透，主页背景图越清晰 */
export function applyCardAlpha(alpha) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  let a = Number(alpha)
  if (!Number.isFinite(a)) a = 100
  a = Math.max(0, Math.min(100, a)) / 100
  const soft = (getComputedStyle(root).getPropertyValue('--bg-soft') || '').trim() || '#f1f1f4'
  const screen = (getComputedStyle(root).getPropertyValue('--bg-screen') || '').trim() || '#ffffff'
  const icon = (getComputedStyle(root).getPropertyValue('--icon-bg') || '').trim()
  const iconRgb = toRgb(stripAlpha(icon) || '#efeff2')
  /* 深色模式下，桌面图标与底部导航用接近实心的深色（参考 mochi：壁纸上深色图标更醒目），
     不被「卡片透明度」稀释成半透明灰 */
  const dark = root.dataset.theme === 'dark'
  const chromeA = dark ? Math.max(a, 0.92) : a
  root.style.setProperty('--card-bg-soft', `rgba(${toRgb(stripAlpha(soft))}, ${a})`)
  root.style.setProperty('--card-bg-screen', `rgba(${toRgb(stripAlpha(screen))}, ${a})`)
  root.style.setProperty('--icon-bg', `rgba(${iconRgb}, ${chromeA})`)
  /* 底部导航栏：与卡片、图标完全一致（同一个透明度），一起透出主页背景图 */
  root.style.setProperty('--tab-bg', `rgba(${toRgb(stripAlpha(screen))}, ${chromeA})`)
}

/* 去掉 rgba() 里的 alpha，保留 "rgb(r, g, b" 形式供 toRgb 解析 */
function stripAlpha(color) {
  const s = String(color || '').trim()
  if (/^rgba?\(/i.test(s)) return s.replace(/^rgba?\(/i, 'rgb(')
  return s
}

/* #rgb / #rrggbb / rgb() 统一转成 "r, g, b" */
function toRgb(color) {
  let r = 255
  let g = 255
  let b = 255
  const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color)
  const hex3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(color)
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color)
  if (hex6) {
    r = parseInt(hex6[1], 16)
    g = parseInt(hex6[2], 16)
    b = parseInt(hex6[3], 16)
  } else if (hex3) {
    r = parseInt(hex3[1] + hex3[1], 16)
    g = parseInt(hex3[2] + hex3[2], 16)
    b = parseInt(hex3[3] + hex3[3], 16)
  } else if (rgb) {
    r = Number(rgb[1])
    g = Number(rgb[2])
    b = Number(rgb[3])
  }
  return `${r}, ${g}, ${b}`
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    global: JSON.parse(JSON.stringify(DEFAULT)),
    loaded: false
  }),
  getters: {
    accent: (state) => state.global?.theme?.accent || DEFAULT.theme.accent,
    appearance: (state) => (state.global?.appearance === 'dark' || state.global?.appearance === 'system' ? state.global.appearance : 'light'),
    /* 当前是否真正处于深色（跟随系统时按系统偏好实时判断） */
    isDark: () => resolvedTheme.value === 'dark'
  },
  actions: {
    async load() {
      try {
        const data = await api.getSettings()
        /* 外观以 localStorage 的「显式选择」为准（applyAppearance 每次都会写入）。
           没有显式选择时一律用「浅色」安全默认——早期版本曾把默认写成 system/dark 并落库，
           若不拦截，在深色系统上首屏即整页发黑。库里的 appearance 仅作兜底，不再覆盖用户选择。 */
        let appearance = 'light'
        try {
          const ls = window.localStorage && window.localStorage.getItem('zika.appearance')
          if (ls === 'light' || ls === 'dark' || ls === 'system') appearance = ls
        } catch (e) {}
        this.global = {
          theme: { ...DEFAULT.theme, ...(data.theme || {}), icons: { ...(data.theme?.icons || {}) } },
          themePresets: Array.isArray(data.themePresets) ? data.themePresets : [],
          notifications: { ...DEFAULT.notifications, ...(data.notifications || {}) },
          startup: { ...DEFAULT.startup, ...(data.startup || {}) },
          moments: { ...DEFAULT.moments, ...(data.moments || {}) },
          keepAlive: data.keepAlive === true,
          appearance,
          /* 阿里云 OSS 配置（对象，未配置为 null） */
          oss_config: data.oss_config || null,
          /* 最近一次云端备份时间戳（设置页 OSS 行显示同步时间） */
          oss_last_backup_at: Number(data.oss_last_backup_at) || 0
        }
      } catch (e) {
        this.global = JSON.parse(JSON.stringify(DEFAULT))
      }
      this.loaded = true
      this.applyTheme()
      return this.global
    },
    async save() {
      const data = await api.saveSettings(this.global)
      if (data) {
        this.global = {
          theme: { ...DEFAULT.theme, ...(data.theme || {}), icons: { ...(data.theme?.icons || {}) } },
          themePresets: Array.isArray(data.themePresets) ? data.themePresets : [],
          notifications: { ...DEFAULT.notifications, ...(data.notifications || {}) },
          startup: { ...DEFAULT.startup, ...(data.startup || {}) },
          moments: { ...DEFAULT.moments, ...(data.moments || {}) },
          keepAlive: data.keepAlive === true,
          appearance: data.appearance === 'dark' || data.appearance === 'system' ? data.appearance : 'light',
          oss_config: data.oss_config || null,
          oss_last_backup_at: Number(data.oss_last_backup_at) || 0
        }
      }
      this.applyTheme()
      return this.global
    },
    /* 外观：浅色 / 深色 / 跟随系统，立刻生效（配合 save 防抖） */
    setAppearance(mode) {
      this.global.appearance = mode === 'dark' || mode === 'system' ? mode : 'light'
      applyAppearance(this.global.appearance)
    },
    /* 只改主题色，立刻生效（配合 save 防抖） */
    setAccent(hex) {
      this.global.theme.accent = hex
      applyAccent(hex)
    },
    /* 合并写入主题字段（字体 / 背景 / 图标） */
    setTheme(patch) {
      this.global.theme = { ...this.global.theme, ...patch }
      this.applyTheme()
    },
    /* 单个桌面图标的背景图 */
    setIconBg(name, url) {
      const icons = { ...(this.global.theme.icons || {}) }
      if (url) icons[name] = url
      else delete icons[name]
      this.global.theme.icons = icons
      this.applyTheme()
    },
    /* 主题全部生效：主题色 + 字体 + 自定义 CSS + 卡片透明度 */
    applyTheme() {
      applyAppearance(this.appearance)
      applyAccent(this.accent)
      applyFont(this.global?.theme?.font, this.global?.theme?.fontCss)
      applyCardAlpha(this.global?.theme?.cardOpacity)
    },

    /* ── 主题套装 ── */
    /* 把当前主题另存为一套 */
    savePreset(name) {
      const t = JSON.parse(JSON.stringify(this.global.theme || {}))
      const preset = { id: Date.now(), name: (name || '').trim() || '我的主题', theme: t }
      this.global.themePresets = [...(this.global.themePresets || []), preset]
      return preset
    },
    /* 切换到某一套：整包覆盖当前主题 */
    applyPreset(id) {
      const p = (this.global.themePresets || []).find((x) => x.id === id)
      if (!p) return false
      this.global.theme = { ...DEFAULT.theme, ...(p.theme || {}), icons: { ...(p.theme?.icons || {}) } }
      this.applyTheme()
      return true
    },
    removePreset(id) {
      this.global.themePresets = (this.global.themePresets || []).filter((x) => x.id !== id)
    }
  }
})

export { DEFAULT as DEFAULT_SETTINGS, applyAccent }