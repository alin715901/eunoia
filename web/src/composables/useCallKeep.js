/**
 * 通话前台保活（仅 Android 原生壳生效；Web / iOS 全部 no-op）。
 *
 * 背景：模拟通话（无真实媒体流）的全部状态与计时器都在 WebView 的内存里。
 * 安卓上切后台后，若系统回收内存把进程杀掉，返回时 WebView 重建 → 页面“自动刷新”，
 * 通话与计时随之丢失。前台服务（Foreground Service）能把进程优先级抬高到“前台级”，
 * 系统几乎不会在通话期间杀进程，从而做到“切后台不刷新、通话与计时照常”。
 *
 * 使用 dataSync 类型（Android 14+ 前台服务必须声明类型；phoneCall 类型受限且本通话
 * 无真实电话音频，故用中性的 dataSync）。该类型与对应权限均为 normal 权限，无需运行时申请。
 *
 * 网页端（含 iOS Safari）没有前台服务概念：靠 stores/call.js 的本地快照在重载后恢复通话。
 */

import { registerPlugin } from '@capacitor/core'
import { isNativePlatform } from './useLocalNotification'

const CallKeep = registerPlugin('CallKeep')

function isAndroid() {
  return (
    isNativePlatform() &&
    typeof window !== 'undefined' &&
    window.Capacitor &&
    typeof window.Capacitor.getPlatform === 'function' &&
    window.Capacitor.getPlatform() === 'android'
  )
}

/** 通话开始：拉起前台保活服务（显示常驻通知）。非 Android 直接跳过。 */
export function startCallKeep(name) {
  if (!isAndroid()) return
  try {
    CallKeep.start({ name: name || '' })
  } catch (e) { /* 插件未就绪等异常静默忽略，不影响通话逻辑 */ }
}

/** 通话结束：停止前台保活服务（撤销通知）。对已停止的服务幂等，非 Android 跳过。 */
export function stopCallKeep() {
  if (!isAndroid()) return
  try {
    CallKeep.stop()
  } catch (e) { /* ignore */ }
}
