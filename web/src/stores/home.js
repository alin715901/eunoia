import { defineStore } from 'pinia'
import { getRecentContacts, getDesktop } from '@/api/contacts'

const LS_KEY = 'zika_home_contact'

function loadSelected() {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v) return Number(v)
  } catch (e) {
    /* ignore */
  }
  return null
}

/**
 * 主页的「当前选中联系人」。
 * 主页（仿手机桌面）是所有联系人共用的：人物卡展示谁由这里决定，
 * 应用网格与底部导航保持不变。其余功能（聊天/朋友圈/信件/字卡）各自内部再分联系人。
 */
export const useHomeStore = defineStore('home', {
  state: () => ({
    selectedId: loadSelected(),
    /* 最近互动的联系人 id 顺序（后端算好，前端只做切换轨道） */
    recentIds: [],
    loading: false
  }),
  getters: {
    selectedIndex: (state) => state.recentIds.indexOf(state.selectedId),
    trackIds: (state) => state.recentIds,
    hasPrev: (state) => state.recentIds.indexOf(state.selectedId) > 0,
    hasNext: (state) => {
      const i = state.recentIds.indexOf(state.selectedId)
      return i !== -1 && i < state.recentIds.length - 1
    }
  },
  actions: {
    /* 载入最近互动顺序；已选中的联系人不在最近列表里时补到最前 */
    async loadRecents(contactsList = []) {
      this.loading = true
      try {
        const recents = await getRecentContacts(20)
        /* 人物卡只与单人有关：群聊不进入主页切换轨道 */
        this.recentIds = (recents || [])
          .filter((c) => c.kind !== 'group')
          .map((c) => Number(c.id))
        const list = contactsList || []
        if (this.selectedId && list.length) {
          const exists = list.some(
            (c) => Number(c.id) === Number(this.selectedId) && c.kind !== 'group'
          )
          if (!exists && this.selectedId) {
            this.recentIds = [Number(this.selectedId), ...this.recentIds]
          }
        }
      } catch (e) {
        this.recentIds = []
      } finally {
        this.loading = false
      }
      return this.recentIds
    },
    /* 切换到某位联系人：主页人物卡与全局「当前联系人」一起切到TA */
    select(id) {
      const cid = Number(id)
      if (!cid) return
      this.selectedId = cid
      try {
        localStorage.setItem(LS_KEY, String(cid))
      } catch (e) {
        /* ignore */
      }
    },
    prev() {
      const i = this.recentIds.indexOf(this.selectedId)
      if (i > 0) this.select(this.recentIds[i - 1])
    },
    next() {
      const i = this.recentIds.indexOf(this.selectedId)
      if (i !== -1 && i < this.recentIds.length - 1) this.select(this.recentIds[i + 1])
    },
    /* 预取某人的桌面配置（人物卡签名/头像等），供主页展示 */
    async fetchDesktop(id) {
      try {
        return await getDesktop(id)
      } catch (e) {
        return null
      }
    }
  }
})

export default useHomeStore