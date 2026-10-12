import { defineStore } from 'pinia'
import * as api from '@/api/contacts'

export const useContactsStore = defineStore('contacts', {
  state: () => ({
    list: []
  }),
  getters: {
    getUnreadSum: (state) => state.list.reduce((sum, c) => sum + (c.unread || 0), 0),
    getById: (state) => (id) => state.list.find((c) => String(c.id) === String(id))
  },
  actions: {
    async load() {
      this.list = await api.getContacts()
      return this.list
    },
    async add(payload) {
      const contact = await api.createContact(payload)
      this.list.push(contact)
      return contact
    },
    async update(id, payload) {
      const updated = await api.updateContact(id, payload)
      const idx = this.list.findIndex((c) => String(c.id) === String(id))
      if (idx !== -1) this.list[idx] = { ...this.list[idx], ...updated }
      return updated
    },
    async remove(id) {
      await api.deleteContact(id)
      this.list = this.list.filter((c) => String(c.id) !== String(id))
    },
    async refreshOne(id) {
      const contact = await api.getContact(id)
      const idx = this.list.findIndex((c) => String(c.id) === String(id))
      if (idx !== -1) this.list[idx] = contact
      else this.list.push(contact)
    },
    setUnread(id, value) {
      const c = this.list.find((x) => String(x.id) === String(id))
      if (c) c.unread = value
    }
  }
})
