import { defineStore } from 'pinia'
import * as api from '@/api/settings'

export const useBadgesStore = defineStore('badges', {
  state: () => ({
    chat: 0,
    moments: 0,
    letters: 0
  }),
  actions: {
    async load() {
      try {
        const data = await api.getBadges()
        this.chat = data.chat || 0
        this.moments = data.moments || 0
        this.letters = data.letters || 0
      } catch (e) {
        /* ignore */
      }
      return this.$state
    },
    setFromSSE(data) {
      if (!data) return
      if (data.chat != null) this.chat = data.chat
      if (data.moments != null) this.moments = data.moments
      if (data.letters != null) this.letters = data.letters
    }
  }
})
