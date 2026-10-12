import { reactive } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'

/**
 * 应用内弹窗状态（单例）。
 * 全站的确认 / 删除 / 保存提示都走这里，不再用浏览器的 alert / confirm，
 * 避免被浏览器拦截或弹出系统级对话框。
 */
const state = reactive({
  open: false,
  title: '',
  text: '',
  okText: '确定',
  cancelText: '取消',
  danger: false,
  /* 输入弹窗（替掉浏览器 prompt） */
  isInput: false,
  placeholder: '',
  inputValue: '',
  _resolve: null
})

export function useDialogState() {
  return state
}

/** 确认弹窗：返回 Promise<boolean>，点确定 true，取消 false（text/message 均可） */
export function confirmDialog(opts) {
  const o = typeof opts === 'string' ? { text: opts } : opts || {}
  state.title = o.title || ''
  state.text = o.text || o.message || ''
  state.okText = o.okText || '确定'
  state.cancelText = o.cancelText || '取消'
  state.danger = !!o.danger
  state.isInput = false
  state.open = true
  return new Promise((resolve) => {
    state._resolve = resolve
  })
}

/** 输入弹窗：替掉浏览器 prompt。点确定返回输入文本（去首尾空白），取消返回 null */
export function promptDialog(opts) {
  const o = typeof opts === 'string' ? { text: opts } : opts || {}
  state.title = o.title || ''
  state.text = o.text || ''
  state.okText = o.okText || '确定'
  state.cancelText = o.cancelText || '取消'
  state.danger = false
  state.isInput = true
  state.placeholder = o.placeholder || ''
  state.inputValue = o.value || ''
  state.open = true
  return new Promise((resolve) => {
    state._resolve = resolve
  })
}

/** 内容里点「确定」/「取消」时调用 */
export function closeDialog(value) {
  state.open = false
  const r = state._resolve
  state._resolve = null
  if (!r) return
  if (state.isInput) r(value ? String(state.inputValue || '').trim() : null)
  else r(!!value)
}

/** 轻提示：替掉 alert，用应用内的 toast 显示 */
export function notify(text, extra) {
  try {
    const toast = useNotificationsStore()
    toast.pushToast({ title: String(text || ''), text: extra || '' })
  } catch (e) {
    /* pinia 未就绪时忽略 */
  }
}
