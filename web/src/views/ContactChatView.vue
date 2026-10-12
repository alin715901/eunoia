<template>
  <div class="chat-view">
    <div class="cv-header">
      <button class="cv-back" @click="goHome" aria-label="返回主页">
        <AppIcon name="back" :size="24" />
      </button>
      <div class="cv-title">
        <span class="cv-name">{{ contact?.name || '…' }}</span>
      </div>
      <button class="cv-more" @click="goSettings" aria-label="联系人设置">
        <AppIcon name="more" :size="22" />
      </button>
    </div>

    <ChatWindow
      :contact-id="id"
      :name="contact?.name"
      :avatar="finalAvatar"
      :my-name="settings?.my_name"
      :my-avatar="finalMyAvatar"
      :chat-bg="settings?.chat_bg"
      :chat-blur="Number(settings?.chat_bg_blur) || 0"
      :chat-font-style="chatFontStyle"
      :bubble-style="parsedBubbleStyle"
      :avatar-shape="settings?.avatar_shape"
      :avatar-radius="settings?.avatar_radius"
      :avatar-size="Number(settings?.avatar_size) || 36"
      :avatar-pos="settings?.avatar_pos || 'bottom'"
      :show-read-receipt="showReadReceipt"
      :read-receipt-style="readReceiptStyle"
      :show-names="showNames"
      :member-map="memberMap"
      :search-query="searchQuery"
      @close-search="onCloseSearch"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useContactsStore } from '@/stores/contacts'
import { useChatStore } from '@/stores/chat'
import { FONTS } from '@/stores/settings'
import { getContactSettings, getContactMembers, getDesktop } from '@/api/contacts'
import { parseBubbleStyle } from '@/utils/bubbleStyle'
import { fontCssToStyle } from '@/utils/fontCss'
import { useContactSettingsStore } from '@/stores/contactSettings'
import { useDeskCacheStore } from '@/stores/deskCache'
import ChatWindow from '@/components/chat/ChatWindow.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  id: { type: [String, Number], required: true }
})

const router = useRouter()
const route = useRoute()
const contactsStore = useContactsStore()
const chat = useChatStore()
const settingsCache = useContactSettingsStore()

/* 从聊天列表搜索进入时携带 ?q=关键字，用于在会话内筛选相关聊天记录 */
const searchQuery = ref('')
watch(
  () => route.query.q,
  (v) => { searchQuery.value = (v && String(v)) || '' },
  { immediate: true }
)
function onCloseSearch() {
  router.replace({ path: `/contacts/${props.id}/chat` })
}

const contact = computed(() => contactsStore.getById(props.id))
/* 同步初始值：settings/desk 缓存命中则首屏直接显示已设置的头像等，避免「默认 → 设置后」跳动 */
const deskCache = useDeskCacheStore()
const settings = ref(settingsCache.get(props.id) || null)
/* 备注/设置在别处被改（含 SSE 同步回写缓存）时，聊天页的顶部与我的备注即时跟随更新 */
watch(
  () => settingsCache.get(props.id),
  (v) => { if (v) settings.value = { ...v } },
  { deep: false }
)
/* 人物卡桌面配置：用于「应用到聊天」开关——开启时把人物卡头像同步进聊天 */
const desk = ref(deskCache.get(props.id))
/* 群聊：成员 id → {name, avatar}，用于气泡上显示发言人 */
const memberMap = ref(null)

/* 最终头像：开启「应用到聊天」且有设置值时，用人物卡头像，否则沿用各自原值 */
const finalAvatar = computed(() => {
  if (desk.value?.sync_chat_avatar && desk.value?.partner_avatar) return desk.value.partner_avatar
  return contact.value?.avatar || ''
})
const finalMyAvatar = computed(() => {
  if (desk.value?.sync_chat_avatar && desk.value?.my_avatar) return desk.value.my_avatar
  return settings.value?.my_avatar || ''
})

/* 聊天字体样式：自定义 CSS 优先，其次预设；「跟随全局」返回空对象即沿用全站字体 */
const chatFontStyle = computed(() => {
  const s = settings.value
  if (s?.chat_font_css && String(s.chat_font_css).trim()) {
    return fontCssToStyle(s.chat_font_css)
  }
  const preset = FONTS.find((f) => f.k === (s?.chat_font || ''))
  return preset?.css ? { fontFamily: preset.css } : {}
})
/* 气泡样式：统一解析成对象（含自定义 CSS 字段） */
const parsedBubbleStyle = computed(() => parseBubbleStyle(settings.value?.bubble_style))
/* 我的消息是否显示「已读」（默认开）；样式：text=已读文字 check=对勾 */
const showReadReceipt = computed(() => Number(settings.value?.show_read_receipt ?? 1) !== 0)
const readReceiptStyle = computed(() => (settings.value?.read_receipt_style === 'check' ? 'check' : 'text'))
/* 聊天里是否显示昵称（群成员昵称等；默认显示） */
const showNames = computed(() => Number(settings.value?.show_names ?? 1) !== 0)

async function loadMembers() {
  if (contact.value?.kind !== 'group') {
    memberMap.value = null
    return
  }
  try {
    const members = await getContactMembers(props.id)
    const map = {}
    // chat_avatar：服务端已合并"人物卡同步头像（sync 开启时）→ 本体头像"
    for (const m of members || []) map[String(m.id)] = { name: m.name, avatar: m.chat_avatar || m.avatar }
    memberMap.value = map
  } catch (e) {
    memberMap.value = null
  }
}

function goHome() {
  // 聊天页左上角返回微信式聊天列表
  router.push('/chats')
}
function goSettings() {
  router.push(`/contacts/${props.id}/settings`)
}

onMounted(async () => {
  if (!contact.value) {
    try { await contactsStore.refreshOne(props.id) } catch (e) { /* ignore */ }
  }
  await Promise.allSettled([
    // 设置 / 人物卡 / 群成员：并行取，不再串行排队等待（首帧已用缓存渲染）
    getContactSettings(props.id).then((s) => { if (s) { settings.value = s; settingsCache.set(props.id, s) } }),
    getDesktop(props.id).then((d) => { if (d) { desk.value = d; deskCache.set(props.id, d) } }),
    contact.value ? Promise.resolve() : contactsStore.refreshOne(props.id),
    loadMembers()
  ])
  // 进入会话：标记已读并刷新角标
  await chat.markRead(props.id)
})

/* 从设置页返回聊天时（keep-alive 复用实例），重新拉取设置即时生效，
   无需离开/刷新页面。仅刷新样式相关配置，不重新标记已读 */
onActivated(async () => {
  /* 从设置页返回聊天时：并行取最新设置即时生效，不用离开/刷新页面。
     首帧本来就用缓存渲染，这里只做静默校正，不重新标记滚动位置 */
  await Promise.allSettled([
    getContactSettings(props.id).then((s) => { if (s) { settings.value = s; settingsCache.set(props.id, s) } }),
    getDesktop(props.id).then((d) => { if (d) { desk.value = d; deskCache.set(props.id, d) } }),
    loadMembers()
  ])
  /* keep-alive 复用：再次进入同一聊天（从列表重进 / 从设置返回）时
     onMounted 不会重新执行，必须在这里补标已读，
     否则"列表有角标 → 进聊天 → 返回列表角标还在" */
  await chat.markRead(props.id)
})
</script>

<style scoped>
.chat-view { flex: 1; display: flex; flex-direction: column; position: relative; }
.cv-header {
  flex: 0 0 auto;
  height: 50px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 5;
}
.cv-back { border: none; background: transparent; font-size: 28px; line-height: 1; color: var(--text); width: 32px; }
.cv-title { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; }
.cv-name { font-size: 16px; font-weight: 700; }
.cv-more {
  border: none;
  background: transparent;
  font-size: 22px;
  color: var(--text);
  width: 32px;
}
.cv-menu {
  position: absolute;
  top: 50px;
  right: 10px;
  width: 160px;
  z-index: 50;
  padding: 6px;
  animation: pop-in 0.2s ease;
}
.cv-menu-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.cv-menu-item:active { background: var(--bg-soft); }
.cv-menu-item:disabled { color: var(--text-soft); }
</style>
