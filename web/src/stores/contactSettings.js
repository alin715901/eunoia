import { defineStore } from 'pinia'

const LS_KEY = 'contact_settings_cache_v1'

function loadLS() {
  try {
    const v = localStorage.getItem(LS_KEY)
    return v ? JSON.parse(v) : {}
  } catch (e) {
    return {}
  }
}

/* 联系人设置缓存：进入聊天时预热并持久化到 localStorage，进入设置/二级页时直接读取，
   任何进入路径下都直接显示已设置的值，避免「默认占位值 → 接口返回真实值」的跳变 */
export const useContactSettingsStore = defineStore('contactSettings', {
  state: () => ({
    cache: loadLS()
  }),
  actions: {
    get(id) {
      return this.cache[String(id)] || null
    },
    set(id, s) {
      if (!s) return
      this.cache[String(id)] = s
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.cache)) } catch (e) { /* ignore */ }
    },
    update(id, patch) {
      const k = String(id)
      this.cache[k] = { ...(this.cache[k] || {}), ...patch }
      try { localStorage.setItem(LS_KEY, JSON.stringify(this.cache)) } catch (e) { /* ignore */ }
    }
  }
})
