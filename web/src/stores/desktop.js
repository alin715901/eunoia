import { defineStore } from 'pinia'
import { getDesktop, updateDesktop } from '@/api/contacts'
import { useContactsStore } from './contacts'
import { useSettingsStore } from './settings'

const LS_KEY = 'zika_current_contact'

function loadCurrent() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v) return Number(v)
  } catch (e) {
    /* ignore */
  }
  return 1
}

/* 桌面人物卡配置：每个联系人一份，互不影响
   （主题色 / 通知 / 播放模式：主题色与通知已改回全局） */
const DEFAULT_DESKTOP = {
  sign: '',
  love: 0,
  listenHours: 0,
  memo: '',
  period: '',
  cardBg: '',
  /* 人物卡背景图透明度：0-100（100 = 完全不透明） */
  cardBgOpacity: 100,
  avaLeft: 'me',
  myAvatar: '',
  partnerAvatar: '',
  myName: '',
  partnerName: '',
  annId: 0,
  /* 音乐播放模式：list 顺序 / shuffle 随机 / one 单曲 */
  playMode: 'list',
  /* 是否把人物卡设置的头像同步应用到与该联系人的聊天界面 */
  syncChatAvatar: false
}

export const useDesktopStore = defineStore('desktop', {
  state: () => ({
    currentContactId: loadCurrent(),
    d: JSON.parse(JSON.stringify(DEFAULT_DESKTOP)),
    loading: false,
    saving: false
  }),
  getters: {
    contact: (state) => {
      const contacts = useContactsStore()
      return contacts.getById(state.currentContactId) || contacts.list[0] || null
    },
    myName: (state) => state.d.myName || state.contact?.name || '我',
    partnerName: (state) => state.d.partnerName || 'TA',
    isGroup: (state) => state.contact?.kind === 'group',
    /* 当前桌面播放模式 */
    playMode: (state) => state.d.playMode || 'list'
  },
  actions: {
    setCurrent(id) {
      this.currentContactId = Number(id)
      try {
        localStorage.setItem(LS_KEY, String(this.currentContactId))
      } catch (e) {
        /* ignore */
      }
    },
    normalize(raw) {
      const d = JSON.parse(JSON.stringify(DEFAULT_DESKTOP))
      if (raw) {
        /* 后端字段为 snake_case，这里做一次映射 */
        const map = {
          listen_hours: 'listenHours',
          card_bg: 'cardBg',
          card_bg_opacity: 'cardBgOpacity',
          ava_left: 'avaLeft',
          my_avatar: 'myAvatar',
          partner_avatar: 'partnerAvatar',
          my_name: 'myName',
          partner_name: 'partnerName',
          ann_id: 'annId',
          play_mode: 'playMode',
          sync_chat_avatar: 'syncChatAvatar'
        }
        for (const [src, dest] of Object.entries(map)) {
          const v = raw[src]
          if (v !== undefined && v !== null) d[dest] = v
        }
        if (raw.sign !== undefined && raw.sign !== null) d.sign = raw.sign
        if (raw.love !== undefined && raw.love !== null) d.love = Number(raw.love) || 0
      }
      if (!d.playMode) d.playMode = 'list'
      d.love = Number(d.love) || 0
      d.listenHours = Number(d.listenHours) || 0
      d.annId = Number(d.annId) || 0
      d.cardBgOpacity = Number(d.cardBgOpacity) || 100
      d.syncChatAvatar = !!d.syncChatAvatar
      return d
    },
    /* 主题色来自全局设置（不再按联系人独立） */
    applyTheme() {
      if (typeof document === 'undefined') return
      try {
        const s = useSettingsStore()
        const accent = s.global?.theme?.accent || '#c5a47e'
        const root = document.documentElement
        root.style.setProperty('--accent', accent)
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(accent).trim())
        if (m) {
          const rgb = [m[1], m[2], m[3]].map((x) => parseInt(x, 16)).join(',')
          root.style.setProperty('--accent-soft', `rgba(${rgb}, 0.12)`)
        }
      } catch (e) {
        /* settings 未就绪时忽略 */
      }
    },
    async load(id) {
      const cid = Number(id ?? this.currentContactId)
      if (!cid) return this.d
      this.loading = true
      try {
        const res = await getDesktop(cid)
        this.d = this.normalize(res)
        this.currentContactId = cid
      } catch (e) {
        this.d = JSON.parse(JSON.stringify(DEFAULT_DESKTOP))
      } finally {
        this.loading = false
      }
      return this.d
    },
    async save() {
      this.saving = true
      try {
        /* 前端 camelCase → 后端 snake_case（后端只认 snake_case 列名） */
        const d = this.d
        const payload = {
          sign: d.sign,
          love: d.love,
          listen_hours: d.listenHours,
          memo: d.memo,
          period: d.period,
          card_bg: d.cardBg,
          card_bg_opacity: Number(d.cardBgOpacity) || 100,
          ava_left: d.avaLeft,
          my_avatar: d.myAvatar,
          partner_avatar: d.partnerAvatar,
          my_name: d.myName,
          partner_name: d.partnerName,
          ann_id: d.annId,
          play_mode: d.playMode,
          sync_chat_avatar: d.syncChatAvatar ? 1 : 0
        }
        const res = await updateDesktop(this.currentContactId, payload)
        this.d = this.normalize(res)
        return this.d
      } finally {
        this.saving = false
      }
    },
    /* 确保当前联系人有效（列表为空/不存在时回退第一个） */
    async ensureValid() {
      const contacts = useContactsStore()
      if (!contacts.list.length) {
        await contacts.load()
      }
      const exists = contacts.getById(this.currentContactId)
      if (!exists && contacts.list.length) {
        this.setCurrent(contacts.list[0].id)
        await this.load()
      }
    }
  }
})

export { DEFAULT_DESKTOP }