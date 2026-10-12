import { defineStore } from 'pinia'
import * as api from '@/api/cards'

export const useCardsStore = defineStore('cards', {
  state: () => ({
    groups: [],
    cards: [],
    stats: [],
    filter: { scope: 'general', contactId: null, category: 'main' }
  }),
  getters: {
    groupsOfCategory: (state) => (category) =>
      state.groups.filter((g) => (category ? g.category === category : true)),
    cardsOfGroup: (state) => (groupId) =>
      state.cards.filter((c) => (groupId ? String(c.group_id) === String(groupId) : true))
  },
  actions: {
    async loadStats() {
      this.stats = await api.getCardGroupStats()
      return this.stats
    },
    /** 某库规模：scope=general 或 scope=contact + ownerId */
    statOf(scope, ownerId = null) {
      const row = this.stats.find(
        (s) =>
          s.scope === scope &&
          ((ownerId == null && s.owner_contact_id == null) ||
            (ownerId != null && String(s.owner_contact_id) === String(ownerId)))
      )
      return { groups: row?.group_count || 0, cards: row?.card_count || 0, poke: row?.poke_count || 0, pokeGroups: row?.poke_group_count || 0 }
    },
    async loadGroups({ scope, contactId, category } = {}) {
      const f = { scope, contactId, category }
      if (scope) this.filter.scope = scope
      if (contactId !== undefined) this.filter.contactId = contactId
      if (category) this.filter.category = category
      this.groups = await api.getCardGroups(f)
      return this.groups
    },
    async loadCards({ scope, contactId, category, groupId, includeBlocked } = {}) {
      const f = { scope, contactId, category, groupId, includeBlocked }
      if (scope) this.filter.scope = scope
      if (contactId !== undefined) this.filter.contactId = contactId
      if (category) this.filter.category = category
      this.cards = await api.getCards(f)
      return this.cards
    },
    async addGroup(payload) {
      const g = await api.createCardGroup(payload)
      this.groups.push(g)
      return g
    },
    async renameGroup(id, fields) {
      const updated = await api.updateCardGroup(id, typeof fields === 'string' ? { name: fields } : fields)
      const idx = this.groups.findIndex((g) => String(g.id) === String(id))
      if (idx !== -1) this.groups[idx] = { ...this.groups[idx], ...updated }
    },
    async toggleGroupBlocked(id, blocked) {
      /* 服务端已用单条 SQL 级联更新组内全部字卡，这里一次请求 + 本地立即同步，无逐卡延迟 */
      const updated = await api.updateCardGroup(id, { blocked })
      const idx = this.groups.findIndex((g) => String(g.id) === String(id))
      if (idx !== -1) this.groups[idx] = { ...this.groups[idx], ...updated }
      for (let i = 0; i < this.cards.length; i++) {
        if (String(this.cards[i].group_id) === String(id)) {
          this.cards[i] = { ...this.cards[i], blocked }
        }
      }
    },
    async deleteGroup(id) {
      await api.deleteCardGroup(id)
      this.groups = this.groups.filter((g) => String(g.id) !== String(id))
      // 级联删卡
      this.cards = this.cards.filter((c) => String(c.group_id) !== String(id))
    },
    async addCard(payload) {
      const c = await api.createCard(payload)
      this.cards.push(c)
      return c
    },
    async deleteCard(id) {
      await api.deleteCard(id)
      this.cards = this.cards.filter((c) => String(c.id) !== String(id))
    },
    async toggleCardBlocked(id, blocked) {
      return this.updateCard(id, { blocked })
    },
    /** 通用更新（内容 / 图片 / 所属分组 / 屏蔽等），并同步内存列表 */
    async updateCard(id, fields) {
      const updated = await api.updateCard(id, fields)
      const idx = this.cards.findIndex((c) => String(c.id) === String(id))
      if (idx !== -1) this.cards[idx] = { ...this.cards[idx], ...updated }
      return updated
    }
  }
})
