import { defineStore } from 'pinia'
import { ref } from 'vue'

/* 全局 UI 状态：目前只管「底部 tab 栏是否隐藏」。
   字卡库进入某个库的管理态时置 true（同一路由内部状态，路由无法感知），
   离开管理态 / 离开页面时复位。 */
export const useUiStore = defineStore('ui', () => {
  const tabbarHidden = ref(false)
  function setTabbarHidden(v) {
    tabbarHidden.value = !!v
  }
  return { tabbarHidden, setTabbarHidden }
})
