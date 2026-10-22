import { ref, onMounted } from 'vue'
import { getContact, getContactSettings, updateContactSettings } from '@/api/contacts'
import { useContactSettingsStore } from '@/stores/contactSettings'
import { useContactsStore } from '@/stores/contacts'

/* 联系人信息直接取自已加载的联系人 store（含服务端合并的 chat_avatar 同步头像），
   首屏即正确，不出现「首字母 → 头像」的跳动 */
function contactFromStore(id) {
  try {
    const contacts = useContactsStore()
    const c = contacts.getById(id)
    if (c) return { ...c, avatar: c.chat_avatar || c.avatar || '' }
  } catch (e) { /* store 未就绪时忽略 */ }
  return null
}

/**
 * 联系人设置二级页通用逻辑：
 * 加载联系人 + 设置，patch() 保存部分字段（自动回写 settings）
 * 设置值优先读缓存（进入聊天时已预热），打开页即直接显示已设置的值，不跳变
 */
export function useContactSettingsPage(id) {
  const store = useContactSettingsStore()
  // 同步初始值：缓存命中则直接显示真实设置，避免「默认占位 → 接口返回」的跳变
  const contact = ref(contactFromStore(id))
  const settings = ref(store.get(id) || null)
  const saving = ref(false)

  async function load(force) {
    const cached = store.get(id)
    if (!force && cached) {
      // 秒开：先用缓存渲染，再在后台静默校正（不等请求返回，页面不会迟滞或闪一下）
      settings.value = cached
      getContact(id).then((c) => { if (c) contact.value = withAvatarFallback(c) }).catch(() => {})
      setTimeout(() => {
        getContactSettings(id)
          .then((s) => { if (s) { settings.value = s; store.set(id, s) } })
          .catch(() => {})
      }, 0)
      return settings.value
    }
    return loadNow()
  }

  /* 首次加载（或强制刷新）：并行取联系人与设置，避免串行造成的等待感 */
  async function loadNow() {
    const [contactRes, settingsRes] = await Promise.allSettled([getContact(id), getContactSettings(id)])
    contact.value = contactRes.status === 'fulfilled' && contactRes.value
      ? withAvatarFallback(contactRes.value)
      : contactFromStore(id)
    if (settingsRes.status === 'fulfilled' && settingsRes.value) {
      settings.value = settingsRes.value
      store.set(id, settingsRes.value)
    } else {
      settings.value = store.get(id) || null
    }
    return settings.value
  }

  /* 服务端返回的 contact 用 chat_avatar（人物卡同步头像）兜底，与聊天页一致 */
  function withAvatarFallback(c) {
    return c ? { ...c, avatar: c.chat_avatar || c.avatar || '' } : c
  }

  /* 重新拉取联系人（头像可能在别的页面被换过）：keep-alive 页面返回时刷新预览用 */
  async function refreshContact() {
    try {
      const c = await getContact(id)
      if (c) contact.value = withAvatarFallback(c)
    } catch (e) { /* ignore */ }
  }

  async function patch(fields) {
    saving.value = true
    try {
      settings.value = await updateContactSettings(id, fields)
      if (settings.value) store.set(id, settings.value)
      return settings.value
    } finally {
      saving.value = false
    }
  }

  /* 防抖保存：滑块/输入连续变化时只在停顿后提交一次 */
  let timer = null
  function queueSave(fields) {
    clearTimeout(timer)
    timer = setTimeout(() => patch(fields), 450)
  }

  onMounted(load)

  return { contact, settings, load, patch, queueSave, saving, refreshContact }
}
