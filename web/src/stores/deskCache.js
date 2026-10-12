import { defineStore } from 'pinia'

const LS_KEY = 'desk_cache_v1'

function loadLS() {
  try {
    const v = localStorage.getItem(LS_KEY)
    return v ? JSON.parse(v) : {}
  } catch (e) {
    return {}
  }
}

/* 桌面人物卡配置缓存（raw snake_case）：进入聊天时预热并持久化到 localStorage，
   设置页/二级页打开时同步读取，任何进入路径下头像首屏即正确，
   不出现「首字母 → 头像」或「默认 → 设置后」的跳动 */
export const useDeskCacheStore = defineStore('deskCache', {
  state: () => ({
    cache: loadLS()
  }),
  actions: {
    get(id) {
      return this.cache[String(id)] || null
    },
    set(id, d) {
      if (!d) return
      this.cache[String(id)] = d
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.cache)) } catch (e) { /* ignore */ }
    }
  }
})
