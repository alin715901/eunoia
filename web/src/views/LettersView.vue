<template>
  <div class="letters-hub">
    <AppHeader title="信箱" back />

    <div class="hub-list">
      <div v-if="!rows.length" class="hub-empty">还没有联系人</div>
      <button v-for="r in rows" :key="r.id" class="hub-item" @click="open(r)">
        <div class="hi-ava">
          <AppAvatar :name="r.name" :avatar="r.avatar" :size="44" />
          <span v-if="r.unread > 0" class="hi-badge">{{ r.unread > 99 ? '99+' : r.unread }}</span>
          <span v-if="r.kind === 'group'" class="hi-kind">群</span>
        </div>
        <div class="hi-main">
          <div class="hi-row1">
            <span class="hi-name">{{ r.name }}</span>
            <span class="hi-total">{{ r.total }} 封</span>
          </div>
        </div>
        <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { getLettersHub } from '@/api/content'

defineOptions({ name: 'LettersView' })

const router = useRouter()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()

const rows = ref([])

async function load() {
  try {
    rows.value = ((await getLettersHub()) || []).filter((r) => r.kind !== 'group')
  } catch (e) {
    toast.pushToast({ title: '加载失败', text: e.message })
  }
}

function open(r) {
  router.push(`/contacts/${r.id}/mailbox`)
}

onMounted(async () => {
  if (!contactsStore.list.length) await contactsStore.load().catch(() => {})
  await load()
})
/* keep-alive 缓存复用实例，回到本页需重拉（信箱数量/未读会变） */
onActivated(load)
</script>

<style scoped>
.letters-hub { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-body); }
.hub-list {
  flex: 1 1 auto;
  overflow-y: auto;
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
}
.hub-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.hub-item:active { background: var(--bg-soft); }
.hi-ava { position: relative; flex: 0 0 auto; }
.hi-badge {
  position: absolute;
  top: -3px;
  right: -5px;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  background: #fa5151;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hi-kind {
  position: absolute;
  bottom: -2px;
  right: -3px;
  font-size: 9px;
  background: var(--accent);
  color: #fff;
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 700;
}
.hi-main { flex: 1; min-width: 0; }
.hi-row1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.hi-name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hi-total { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.hub-empty { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--text-soft); }
</style>