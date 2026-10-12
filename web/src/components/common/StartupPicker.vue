<template>
  <div class="startup-picker">
    <div class="sp-inner">
      <div class="sp-head">
        <h2 class="sp-title">选择联系人</h2>
        <p class="sp-sub">主页会展示这位联系人，打开后人物卡就是TA</p>
      </div>

      <div class="sp-list">
        <button
          v-for="c in contacts"
          :key="c.id"
          class="sp-item"
          :class="{ on: c.id === currentId }"
          @click="enter(c.id)"
        >
          <AppAvatar :name="displayName(c)" :avatar="c.avatar" :size="48" />
          <div class="sp-meta">
            <div class="sp-name">
              {{ displayName(c) }}
              <span v-if="c.kind === 'group'" class="kind-tag">群</span>
              <span v-if="c.id === currentId" class="cur-tag">当前</span>
            </div>
            <div class="sp-sub2">{{ c.kind === 'group' ? '群聊' : '单人' }}</div>
          </div>
          <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
        </button>
      </div>

      <button class="sp-settings" @click="goSettings">去设置 · 关闭此开屏</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { useDesktopStore } from '@/stores/desktop'
import { useHomeStore } from '@/stores/home'

const emit = defineEmits(['enter'])
const router = useRouter()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()
const homeStore = useHomeStore()

/* 人物卡只与单人有关：开屏选择器不列群聊 */
const contacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const currentId = computed(() => homeStore.selectedId || desktop.currentContactId)

function displayName(c) {
  return c?.name || (c?.kind === 'group' ? '群聊' : '联系人')
}

async function enter(id) {
  homeStore.select(id)
  desktop.setCurrent(id)
  await desktop.load()
  emit('enter')
}

function goSettings() {
  router.push('/settings')
}
</script>

<style scoped>
.startup-picker {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: var(--bg-body, #f6f6f8);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sp-inner {
  width: 100%;
  max-width: 420px;
  background: var(--bg-screen, #fff);
  border-radius: var(--radius-lg, 26px);
  box-shadow: var(--shadow-strong, 0 12px 36px rgba(0, 0, 0, 0.12));
  padding: 22px 18px 18px;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sp-head { padding: 4px 6px 14px; border-bottom: 1px solid var(--border, #ececef); }
.sp-title { font-size: 20px; font-weight: 700; margin: 0; }
.sp-sub { font-size: 12px; color: var(--text-soft, #8e8e93); margin: 6px 0 0; }
.sp-list { flex: 1 1 auto; overflow-y: auto; margin: 6px 0; display: flex; flex-direction: column; }
.sp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 6px;
  border: none;
  background: transparent;
  text-align: left;
  border-bottom: 1px solid var(--border, #ececef);
}
.sp-item:active { background: var(--bg-soft, #f1f1f4); }
.sp-meta { flex: 1 1 auto; min-width: 0; }
.sp-name { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.sp-sub2 { font-size: 11px; color: var(--text-soft, #8e8e93); margin-top: 2px; }
.kind-tag { font-size: 10px; background: var(--accent, #c5a47e); color: #fff; border-radius: 6px; padding: 1px 6px; font-weight: 600; }
.cur-tag { font-size: 10px; background: var(--bg-soft, #f1f1f4); color: var(--text-soft, #8e8e93); border: 1px solid var(--border, #ececef); border-radius: 6px; padding: 1px 6px; }
.sp-settings {
  margin-top: 8px;
  border: none;
  background: transparent;
  color: var(--text-soft, #8e8e93);
  font-size: 12px;
  padding: 10px;
}
</style>