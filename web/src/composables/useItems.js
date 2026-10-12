import { ref } from 'vue'
import * as itemsApi from '@/api/items'

/**
 * 通用模块数据（日记 / 备忘录 / 心情 / 经期 / 相册 / 音乐 / 影视 / 游戏 / 档案）
 * 一套 CRUD 复用给九个模块：列表拉取 + 新建 + 修改 + 删除，改完即时刷新。
 */
export function useItems(module, contactId = null) {
  const items = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      // http 拦截器已拆掉信封，这里拿到的就是数组
      const res = await itemsApi.listItems(module, contactId)
      items.value = (Array.isArray(res) ? res : []).map((it) => ({
        ...it,
        extra: typeof it.extra === 'string' ? safeJson(it.extra) : it.extra || {}
      }))
    } catch (e) {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  async function add(payload) {
    const res = await itemsApi.createItem({ module, contactId, ...payload })
    await load()
    return res
  }

  async function update(id, payload) {
    const res = await itemsApi.updateItem(id, payload)
    await load()
    return res
  }

  async function remove(id) {
    await itemsApi.removeItem(id)
    // 本地先移除，避免等待网络造成「点了没反应」的延迟感
    items.value = items.value.filter((x) => x.id !== id)
  }

  return { items, loading, load, add, update, remove }
}

function safeJson(s) {
  try {
    return JSON.parse(s)
  } catch (e) {
    return {}
  }
}
