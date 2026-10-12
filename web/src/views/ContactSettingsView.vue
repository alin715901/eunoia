<template>
  <div class="cs-view">
    <AppHeader title="联系人设置" back />
    <div class="cs-body" ref="scrollBody" @scroll.passive="saveScroll">
      <!-- ═══ 群聊：群头像 + 我的头像 + 群成员（参考微信/QQ，显示成员头像 + 昵称，可添加/移除） ═══ -->
      <div v-if="isGroup" class="panel info-card">
        <div class="info-row" @click="editName">
          <span class="info-label">群聊名称</span>
          <span class="row-end">
            <span class="info-val">{{ contact?.name || '未设置' }}</span>
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="openAvatarSheet('group')">
          <span class="info-label">群聊头像</span>
          <span class="row-end">
            <AppAvatar :name="contact?.name" :avatar="contact?.avatar" :size="44" :style="avatarBoxStyle" />
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="openAvatarSheet('mygroup')">
          <span class="info-label">我的头像</span>
          <span class="row-end">
            <AppAvatar :name="settings?.my_name || '我'" :avatar="settings?.my_avatar || ''" :size="44" :style="avatarBoxStyle" />
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="editMyName">
          <span class="info-label">我的备注</span>
          <span class="row-end">
            <span class="info-val">{{ settings?.my_name || '未设置' }}</span>
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row head-row">
          <span class="info-label">群成员（{{ memberRows.length }}）</span>
          <button class="mini-btn primary" @click="showAddMember = true">＋ 添加成员</button>
        </div>
        <div v-if="!memberRows.length" class="ms-empty">这个群还没有成员</div>
        <div v-else class="member-list" :class="{ scroll: memberRows.length > 3 }">
          <div
            v-for="m in memberRows"
            :key="m.id"
            class="member-row"
          >
            <AppAvatar :name="m.name" :avatar="m.chat_avatar || m.avatar" :size="36" />
            <span class="m-name">{{ m.name }}</span>
            <button class="m-remove" @click="removeMember(m)">移出</button>
          </div>
        </div>
      </div>

      <!-- ═══ 基本信息：头像与备注（仅单人） ═══ -->
      <div v-else class="panel info-card">
        <div class="info-row" @click="openAvatarSheet('them')">
          <span class="info-label">对方头像</span>
          <span class="row-end">
            <AppAvatar :name="contact?.name" :avatar="displayThemAvatar" :size="44" :style="avatarBoxStyle" />
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="editName">
          <span class="info-label">对方备注</span>
          <span class="row-end">
            <span class="info-val">{{ contact?.name || '未设置' }}</span>
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="openAvatarSheet('me')">
          <span class="info-label">我的头像</span>
          <span class="row-end">
            <AppAvatar :name="settings?.my_name || '我'" :avatar="displayMyAvatar" :size="44" :style="avatarBoxStyle" />
            <span class="chev">›</span>
          </span>
        </div>
        <div class="info-row" @click="editMyName">
          <span class="info-label">我的备注</span>
          <span class="row-end">
            <span class="info-val">{{ settings?.my_name || '未设置' }}</span>
            <span class="chev">›</span>
          </span>
        </div>
      </div>

      <!-- ═══ 开关：置顶 / 免打扰 / 拉黑（拉黑仅单人） ═══ -->
      <div class="panel sec">
        <div class="switch-row">
          <div class="row-main">
            <div class="row-title">置顶聊天</div>
          </div>
          <ToggleSwitch v-model="pinned" @update:modelValue="savePinned" />
        </div>
        <div class="switch-row">
          <div class="row-main">
            <div class="row-title">免打扰</div>
            <p class="hint">开启后消息不弹通知</p>
          </div>
          <ToggleSwitch v-model="muted" @update:modelValue="saveMuted" />
        </div>
        <div v-if="!isGroup" class="switch-row">
          <div class="row-main">
            <div class="row-title">拉黑</div>
            <p class="hint">开启后收不到对方的消息</p>
          </div>
          <ToggleSwitch v-model="blocked" @update:modelValue="saveBlocked" />
        </div>
        <div class="switch-row">
          <div class="row-main">
            <div class="row-title">显示昵称</div>
            <p class="hint">开启后在聊天里显示对方/群成员昵称</p>
          </div>
          <ToggleSwitch v-model="showNames" @update:modelValue="saveShowNames" />
        </div>
      </div>

      <!-- ═══ 背景 / 字体 / 气泡 / 头像形状：群聊与单人一致 ═══ -->
      <div class="panel nav-panel">
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/bg')">
          <span class="nav-label">聊天背景</span>
          <span class="nav-val">
            <span v-if="chatBg && !chatBg.startsWith('#')" class="bg-dot" :style="{ backgroundImage: `url(${chatBg})` }"></span>
            <span v-else-if="chatBg" class="bg-dot" :style="{ background: chatBg }"></span>
            {{ chatBg ? '已设置' : '默认' }}
          </span>
          <span class="chev">›</span>
        </button>
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/font')">
          <span class="nav-label">聊天字体</span>
          <span class="nav-val">{{ fontName }}</span>
          <span class="chev">›</span>
        </button>
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/bubble')">
          <span class="nav-label">聊天气泡样式</span>
          <span class="nav-val">{{ bubbleName }}</span>
          <span class="chev">›</span>
        </button>
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/avatar')">
          <span class="nav-label">头像形状</span>
          <span class="nav-val">{{ avatarShapeName }}</span>
          <span class="chev">›</span>
        </button>
      </div>

      <!-- ═══ 功能入口 ═══ -->
      <div class="panel nav-panel">
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/reply')">
          <span class="nav-label">回复设置</span>
          <span class="nav-val">{{ replySummary }}</span>
          <span class="chev">›</span>
        </button>
        <button class="nav-row" @click="go('/contacts/' + id + '/settings/proactive')">
          <span class="nav-label">主动消息</span>
          <span class="nav-val">{{ proactiveSummary }}</span>
          <span class="chev">›</span>
        </button>
        <button v-if="!isGroup" class="nav-row" @click="go('/contacts/' + id + '/settings/moments')">
          <span class="nav-label">朋友圈设置</span>
          <span class="nav-val">{{ momentSummary }}</span>
          <span class="chev">›</span>
        </button>
        <button v-if="!isGroup" class="nav-row" @click="go('/contacts/' + id + '/settings/letters')">
          <span class="nav-label">信件设置</span>
          <span class="nav-val">{{ letterSummary }}</span>
          <span class="chev">›</span>
        </button>
        <button v-if="!isGroup" class="nav-row" @click="go('/contacts/' + id + '/settings/call')">
          <span class="nav-label">通话设置</span>
          <span class="nav-val">{{ callSummary }}</span>
          <span class="chev">›</span>
        </button>
        <button v-if="!isGroup" class="nav-row" @click="go('/contacts/' + id + '/cards')">
          <span class="nav-label">专属字卡库</span>
          <span class="chev">›</span>
        </button>
      </div>

      <!-- ═══ 删除 ═══ -->
      <button class="delete-btn" @click="confirmDelete">删除联系人</button>

      <!-- ═══ 清空聊天记录（所有聊天设置的最后） ═══ -->
      <button class="delete-btn" @click="confirmClearMessages">清空聊天记录</button>
    </div>

    <!-- 名称编辑 -->
    <Modal :show="editOpen" :title="editTitle" @close="editOpen = false">
      <input v-model="editValue" class="field" :placeholder="editPlaceholder" />
      <template #footer>
        <button class="btn btn-ghost" @click="editOpen = false">取消</button>
        <button class="btn btn-primary" @click="submitEdit">确定</button>
      </template>
    </Modal>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />

    <!-- 头像操作弹窗：更换 / 清空 -->
    <div v-if="avatarSheet.show" class="as-mask" @click="avatarSheet.show = false">
      <div class="as-sheet" @click.stop>
        <div class="as-title">{{ avatarSheetTitle }}</div>
        <button class="as-btn" @click="chooseChange">更换头像</button>
        <button v-if="avatarSheet.canClear" class="as-btn danger" @click="chooseClear">清空头像</button>
        <button class="as-btn cancel" @click="avatarSheet.show = false">取消</button>
      </div>
    </div>

    <!-- 头像裁剪弹窗：可拖动移动、缩放，确认后才上传 -->
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      title="裁剪头像"
      :ratio="1"
      @cancel="cropSrc = ''"
      @done="onCropped"
      @error="cropSrc = ''"
    />

    <!-- 添加成员（群聊）：多选联系人，一键添加 -->
    <Modal :show="showAddMember" title="添加成员" @close="showAddMember = false">
      <div class="ac-members">
        <button
          v-for="c in addableContacts"
          :key="c.id"
          class="ac-member"
          :class="{ on: pickMemberIds.has(String(c.id)) }"
          @click="togglePick(String(c.id))"
        >
          <AppAvatar :name="c.name" :avatar="c.avatar" :size="30" />
          <span class="ac-member-name">{{ c.name }}</span>
          <AppIcon v-if="pickMemberIds.has(String(c.id))" name="check" :size="14" color="var(--accent)" />
        </button>
      </div>
      <p v-if="!addableContacts.length" class="ac-hint">没有可添加的联系人了</p>
      <template #footer>
        <button class="btn btn-ghost" @click="showAddMember = false">取消</button>
        <button class="btn btn-primary" :disabled="!pickMemberIds.size" @click="submitAddMember">
          添加{{ pickMemberIds.size ? `（${pickMemberIds.size}）` : '' }}
        </button>
      </template>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onActivated, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import Modal from '@/components/common/Modal.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import {
  getContact, getContactSettings, getContactMembers, updateContact, updateContactSettings,
  uploadAvatar, uploadFile, deleteContact, getDesktop, updateDesktop,
  addGroupMember, addGroupMembers, removeGroupMember
} from '@/api/contacts'
import { useContactsStore } from '@/stores/contacts'
import { useChatStore } from '@/stores/chat'
import { useContactSettingsStore } from '@/stores/contactSettings'
import { useDeskCacheStore } from '@/stores/deskCache'
import { clearMessages } from '@/api/chat'
import { FONTS } from '@/stores/settings'
import { bubblePresetName } from '@/utils/bubbleStyle'
import { confirmDialog, notify } from '@/utils/dialog'

const props = defineProps({ id: { type: [String, Number], required: true } })
const router = useRouter()
const contactsStore = useContactsStore()
const settingsCache = useContactSettingsStore()
const deskCache = useDeskCacheStore()

/* 同步初始值：联系人/桌面配置直接取缓存 store（含同步头像），
   首屏即显示设置好的头像，不出现「首字母 → 头像」跳动 */
function contactFromStore() {
  const c = contactsStore.getById(props.id)
  return c ? { ...c, avatar: c.chat_avatar || c.avatar || '' } : null
}
const contact = ref(contactFromStore())
/* 同步初始值：缓存命中则直接显示真实设置，避免「默认占位 → 接口返回」的跳变 */
const settings = ref(settingsCache.get(props.id) || null)
const desk = ref(deskCache.get(props.id))
const fileInput = ref(null)
let avatarTarget = 'them'
/* 头像裁剪弹窗的临时图片源 */
const cropSrc = ref('')

const isGroup = computed(() => contact.value?.kind === 'group')

/* ═══ 群成员列表（仅展示成员头像 + 昵称；增删走接口） ═══ */
const memberRows = ref([])
const showAddMember = ref(false)
const pickMemberIds = ref(new Set())

const addableContacts = computed(() => {
  const inGroup = new Set(memberRows.value.map((m) => String(m.id)))
  return (contactsStore.list || [])
    .filter((c) => c.kind !== 'group' && !inGroup.has(String(c.id)))
    .map((c) => ({ id: c.id, name: c.name, avatar: c.avatar }))
})

/* 多选切换：点选/取消某个联系人 */
function togglePick(id) {
  const s = new Set(pickMemberIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  pickMemberIds.value = s
}

async function loadMembers() {
  if (!isGroup.value) {
    memberRows.value = []
    return
  }
  try {
    memberRows.value = await getContactMembers(props.id)
  } catch (e) {
    memberRows.value = []
  }
}

async function submitAddMember() {
  const ids = [...pickMemberIds.value]
  if (!ids.length) return
  try {
    await addGroupMembers(props.id, ids.map(Number))
    pickMemberIds.value = new Set()
    showAddMember.value = false
    await loadMembers()
    notify(`已加入 ${ids.length} 位成员`)
  } catch (e) {
    notify('加入失败：' + e.message)
  }
}

async function removeMember(m) {
  const ok = await confirmDialog({
    title: '移出群聊',
    text: `把「${m.name}」移出这个群？`,
    okText: '移出',
    danger: true
  })
  if (!ok) return
  try {
    await removeGroupMember(props.id, m.id)
    await loadMembers()
    notify(`已把 ${m.name} 移出群聊`)
  } catch (e) {
    notify('移出失败：' + e.message)
  }
}

/* ═══ 状态 ═══ */
const shape = ref('circle')
const radius = ref(12)
const pinned = ref(false)
const muted = ref(false)
const blocked = ref(false)
const showNames = ref(true)
const chatBg = ref('')

const avatarBoxStyle = computed(() => ({
  borderRadius: shape.value === 'circle' ? '50%' : radius.value + 'px'
}))

/* ═══ 头像显示：同步开启时显示人物卡头像（与聊天一致），否则显示本地头像 ═══ */
const displayThemAvatar = computed(() => {
  if (desk.value?.sync_chat_avatar && desk.value?.partner_avatar) return desk.value.partner_avatar
  return contact.value?.avatar || desk.value?.partner_avatar || ''
})
const displayMyAvatar = computed(() => {
  if (desk.value?.sync_chat_avatar && desk.value?.my_avatar) return desk.value.my_avatar
  return settings.value?.my_avatar || desk.value?.my_avatar || ''
})

/* 摘要 */
const fontName = computed(() => FONTS.find((f) => f.k === (settings.value?.chat_font || ''))?.n || '默认')
const bubbleName = computed(() => (settings.value ? bubblePresetName(settings.value.bubble_style) : '默认'))
const avatarShapeName = computed(() => {
  const s = settings.value
  if (!s) return '默认'
  const sz = s.avatar_size ?? 36
  return s.avatar_shape === 'square'
    ? `方形 ${s.avatar_radius ?? 12}px · ${sz}px`
    : `圆形 · ${sz}px`
})
const replySummary = computed(() =>
  settings.value ? `${settings.value.reply_min ?? 1}~${settings.value.reply_max ?? 3} 条` : ''
)
const proactiveSummary = computed(() => {
  const s = settings.value
  if (!s || !Number(s.proactive_enabled)) return '未开启'
  const lo = s.proactive_count_min ?? s.proactive_count ?? 1
  const hi = s.proactive_count_max ?? s.proactive_count ?? 3
  return `已开启 · ${lo}~${hi} 条`
})
const momentSummary = computed(() => (Number(settings.value?.moment_enabled) ? '已开启' : '未开启'))
const letterSummary = computed(() => (Number(settings.value?.letter_enabled) ? '已开启' : '未开启'))
const callSummary = computed(() => (Number(settings.value?.call_enabled) ? '已开启' : '未开启'))

async function load() {
  try {
    contact.value = await getContact(props.id)
    const s = await getContactSettings(props.id)
    settings.value = s
    if (s) settingsCache.set(props.id, s)
  } catch (e) { /* ignore */ }
  try {
    desk.value = await getDesktop(props.id)
    deskCache.set(props.id, desk.value)
  } catch (e) { /* ignore */ }
  syncLocal()
  await loadMembers()
}

/* 把 contact/settings 同步到本页的开关与展示值（头像形状/圆角/聊天背景/各开关） */
function syncLocal() {
  shape.value = settings.value?.avatar_shape || 'circle'
  radius.value = settings.value?.avatar_radius ?? 12
  chatBg.value = settings.value?.chat_bg || ''
  pinned.value = !!Number(contact.value?.pinned)
  muted.value = isGroup.value
    ? !!Number(contact.value?.muted_group)
    : !!Number(contact.value?.muted_chat)
  blocked.value = !!Number(settings.value?.blocked)
  showNames.value = Number(settings.value?.show_names ?? 1) !== 0
}

/* ═══ 返回本页时：不重新挂载、不从头滑 ═══
   keep-alive 会缓存实例，但 DOM 摘下再挂回时滚动位置会归零；
   滚动时实时记住 scrollTop，回来时先同步恢复（避免先到顶再跳回的闪烁/延迟感），
   再静默刷新数据后校正一次 */
const scrollBody = ref(null)
const scrollMem = new Map()
const memKey = String(props.id)
function saveScroll() {
  const el = scrollBody.value
  if (el) scrollMem.set(memKey, el.scrollTop)
}
onBeforeUnmount(saveScroll)
onActivated(async () => {
  /* 先用缓存同步还原本页状态：子设置页保存时已写入 settingsCache / contactsStore，
     不做这步的话，重进会先显示上次停留时的内存旧值，等接口回来才"跳"成最新（闪一下） */
  contact.value = contactFromStore()
  const cs = settingsCache.get(props.id)
  if (cs) settings.value = cs
  const dk = deskCache.get(props.id)
  if (dk) desk.value = dk
  syncLocal()
  const el = scrollBody.value
  if (el) el.scrollTop = scrollMem.get(memKey) || 0
  try { await load() } catch (e) { /* ignore */ }
  await nextTick()
  if (el) el.scrollTop = scrollMem.get(memKey) || 0
})

function go(path) {
  router.push(path)
}

/* 头像操作：点击头像先弹出「更换 / 清空」选择 */
const avatarSheet = ref({ show: false, target: '', canClear: false })
const avatarSheetTitle = computed(() => {
  const t = avatarSheet.value.target
  if (t === 'group') return '群聊头像'
  if (t === 'mygroup' || t === 'me') return '我的头像'
  return '对方头像'
})
function openAvatarSheet(target) {
  avatarTarget = target
  let has = false
  if (target === 'them') has = !!(displayThemAvatar.value)
  else if (target === 'me') has = !!(displayMyAvatar.value)
  else if (target === 'group') has = !!(contact.value?.avatar)
  else if (target === 'mygroup') has = !!(settings.value?.my_avatar)
  avatarSheet.value = { show: true, target, canClear: has }
}
function chooseChange() {
  avatarSheet.value.show = false
  fileInput.value && fileInput.value.click()
}
async function chooseClear() {
  const target = avatarSheet.value.target
  avatarSheet.value.show = false
  const synced = !!desk.value?.sync_chat_avatar
  try {
    if (target === 'group' || target === 'mygroup') {
      if (target === 'group') {
        await contactsStore.update(props.id, { avatar: '' })
        contact.value = await getContact(props.id)
      } else {
        await updateContactSettings(props.id, { my_avatar: '' })
        settings.value = { ...settings.value, my_avatar: '' }
      }
    } else if (target === 'them') {
      if (synced) {
        await updateDesktop(props.id, { partnerAvatar: '' })
        desk.value = { ...desk.value, partnerAvatar: '' }
      } else {
        await contactsStore.update(props.id, { avatar: '' })
        contact.value = await getContact(props.id)
      }
    } else { // me
      if (synced) {
        await updateDesktop(props.id, { myAvatar: '' })
        desk.value = { ...desk.value, myAvatar: '' }
      } else {
        await updateContactSettings(props.id, { my_avatar: '' })
        settings.value = { ...settings.value, my_avatar: '' }
      }
    }
    notify('已清空头像')
  } catch (e) {
    notify('清空失败：' + (e?.message || '请重试'))
  }
}
/* 头像更换：先进入裁剪弹窗（拖动移动 + 缩放），确认后才上传。
   同步开启时写入人物卡（桌面）头像，否则写本地；群聊头像始终写联系人本体 */
function pickAvatar(target) {
  avatarTarget = target
  fileInput.value && fileInput.value.click()
}
/* 选好文件后先打开裁剪弹窗，不直接上传 */
function onFile(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  cropSrc.value = URL.createObjectURL(file)
}
/* 裁剪确认：拿到裁剪后的图片（正方形），再按目标类型上传 */
async function onCropped(blob) {
  cropSrc.value = ''
  if (!blob) return
  const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  await applyAvatar(file)
}
async function applyAvatar(file) {
  const synced = !!desk.value?.sync_chat_avatar
  try {
    if (avatarTarget === 'group') {
      const r = await uploadAvatar(props.id, file)
      await contactsStore.update(props.id, { avatar: r.avatar })
      contact.value = await getContact(props.id)
    } else if (avatarTarget === 'mygroup') {
      /* 群聊里我的头像：写本群设置（不走人物卡同步） */
      const r = await uploadFile(file)
      await updateContactSettings(props.id, { my_avatar: r.path })
      settings.value = { ...settings.value, my_avatar: r.path }
    } else if (avatarTarget === 'them') {
      if (synced) {
        const r = await uploadFile(file)
        await updateDesktop(props.id, { partnerAvatar: r.path })
        desk.value = { ...desk.value, partnerAvatar: r.path }
      } else {
        const r = await uploadAvatar(props.id, file)
        await contactsStore.update(props.id, { avatar: r.avatar })
        contact.value = await getContact(props.id)
      }
    } else {
      if (synced) {
        const r = await uploadFile(file)
        await updateDesktop(props.id, { myAvatar: r.path })
        desk.value = { ...desk.value, myAvatar: r.path }
      } else {
        const r = await uploadFile(file)
        await updateContactSettings(props.id, { my_avatar: r.path })
        settings.value = { ...settings.value, my_avatar: r.path }
      }
    }
    notify('头像已更新')
  } catch (err) {
    notify('上传失败：' + (err?.message || '请重试'))
  }
}

/* 名称编辑 */
const editOpen = ref(false)
const editTitle = ref('')
const editPlaceholder = ref('')
const editValue = ref('')
let editTarget = 'name'
function editName() {
  editTarget = 'name'
  editTitle.value = isGroup.value ? '修改群聊名称' : '修改对方备注'
  editPlaceholder.value = isGroup.value ? '输入群聊名称' : '输入备注名'
  editValue.value = contact.value?.name || ''
  editOpen.value = true
}
function editMyName() { editTarget = 'myName'; editTitle.value = '修改我的备注'; editPlaceholder.value = '输入我的备注名'; editValue.value = settings.value?.my_name || ''; editOpen.value = true }
async function submitEdit() {
  const v = editValue.value.trim()
  /* 先关弹窗再保存：不等接口返回，避免"点了确定弹窗还停一会儿"；
     本地状态乐观更新，保存失败再提示 */
  editOpen.value = false
  try {
    if (editTarget === 'name') {
      await updateContact(props.id, { name: v })
      contactsStore.update(props.id, { name: v })
      contact.value = { ...contact.value, name: v }
    } else {
      const s = await updateContactSettings(props.id, { my_name: v })
      settings.value = { ...(settings.value || {}), ...(s || {}), my_name: v }
      settingsCache.update(props.id, { my_name: v })
    }
    notify('已保存')
  } catch (e) { notify('保存失败：' + e.message) }
}

/* 开关保存 */
async function savePinned() {
  try {
    await updateContact(props.id, { pinned: pinned.value ? 1 : 0 })
    await contactsStore.update(props.id, { pinned: pinned.value ? 1 : 0 })
  } catch (e) { /* ignore */ }
}
async function saveMuted() {
  const field = isGroup.value ? 'muted_group' : 'muted_chat'
  try {
    await updateContact(props.id, { [field]: muted.value ? 1 : 0 })
    await contactsStore.update(props.id, { [field]: muted.value ? 1 : 0 })
    notify(muted.value ? '已开启免打扰' : '已关闭免打扰')
  } catch (e) { /* ignore */ }
}
async function saveBlocked() {
  try {
    await updateContactSettings(props.id, { blocked: blocked.value ? 1 : 0 })
    notify(blocked.value ? '已拉黑：不再收到对方的消息' : '已取消拉黑')
  } catch (e) { /* ignore */ }
}
async function saveShowNames() {
  try {
    await updateContactSettings(props.id, { show_names: showNames.value ? 1 : 0 })
  } catch (e) { /* ignore */ }
}

/* 删除 */
async function confirmDelete() {
  const ok = await confirmDialog({
    title: '删除联系人',
    text: '删除后，与该联系人相关的聊天记录、朋友圈、信件、专属字卡库将一并删除，确定吗？',
    okText: '删除',
    danger: true
  })
  if (!ok) return
  deleteContact(props.id)
    .then(() => router.replace('/chats'))
    .catch((e) => notify('删除失败：' + e.message))
}

/* 清空聊天记录：只删该聊天的全部消息，联系人本身保留 */
const chatStore = useChatStore()
async function confirmClearMessages() {
  const ok = await confirmDialog({
    title: '清空聊天记录',
    text: '将删除与该聊天的全部聊天记录，且不可恢复，确定吗？',
    okText: '清空',
    danger: true
  })
  if (!ok) return
  try {
    await clearMessages(props.id)
    // 本地同步清空内存中的消息与角标
    chatStore.messagesByContact[String(props.id)] = []
    const c = contactsStore.list.find((x) => String(x.id) === String(props.id))
    if (c) c.unread = 0
    notify('已清空聊天记录')
  } catch (e) {
    notify('清空失败：' + e.message)
  }
}
</script>

<style scoped>
.cs-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cs-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; scrollbar-width: none; -ms-overflow-style: none; }
.cs-body::-webkit-scrollbar { display: none; }

.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.group-title { font-size: 12px; font-weight: 700; color: var(--text-soft); letter-spacing: 2px; margin: 2px 4px -4px; }

/* 基本信息 / 群成员 */
.info-card { padding: 2px 14px; display: flex; flex-direction: column; }
.info-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; cursor: pointer; }
.info-row + .info-row { border-top: 1px solid var(--border); }
.head-row { cursor: default; }
.head-row + .member-row { border-top: 1px solid var(--border); }
.info-label { font-size: 15px; font-weight: 600; color: var(--text); flex: 0 0 auto; }
.row-end { display: flex; align-items: center; gap: 8px; min-width: 0; }
.info-val { font-size: 14px; color: var(--text-soft); max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { color: var(--text-soft); font-size: 20px; flex: 0 0 auto; }

/* 群成员 */
.member-list { /* 默认直接平铺；超过 3 人时加 scroll 类限制高度、可上下滑动查看 */
  max-height: 100%;
}
.member-list.scroll {
  /* 正好显示 3 行（每行约 52px），第 4 个起上下滑动查看 */
  max-height: 158px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 4px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.member-list.scroll::-webkit-scrollbar { display: none; }
.member-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; }
.member-row + .member-row { border-top: 1px solid var(--border); }
.m-name { flex: 1 1 auto; font-size: 14px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.m-remove { flex: 0 0 auto; border: 1px solid var(--border); background: var(--bg-soft); color: var(--text-soft); border-radius: 999px; padding: 5px 12px; font-size: 12px; }
.m-remove:active { color: #e0687a; border-color: #e0687a; }
.ms-empty { font-size: 12px; color: var(--text-soft); padding: 8px 0; }

/* 开关行 */
.sec { padding: 6px 14px; }
.switch-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; }
.switch-row + .switch-row { border-top: 1px solid var(--border); }
.row-main { flex: 1 1 auto; min-width: 0; }
.row-title { font-size: 15px; font-weight: 600; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 3px 0 0; }

/* 导航行 */
.nav-panel { padding: 2px 14px; display: flex; flex-direction: column; }
.nav-row {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 0;
  border: none; background: transparent;
  text-align: left; cursor: pointer;
}
.nav-row + .nav-row { border-top: 1px solid var(--border); }
.nav-label { flex: 1 1 auto; font-size: 15px; font-weight: 600; color: var(--text); }
.nav-val { font-size: 12px; color: var(--text-soft); display: flex; align-items: center; gap: 6px; }
.bg-dot { width: 16px; height: 16px; border-radius: 5px; border: 1px solid var(--border); background-size: cover; background-position: center; display: inline-block; }

.mini-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 7px 16px; font-size: 12px; color: var(--text); }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }

/* 添加成员弹窗 */
.ac-members { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
.ac-members::-webkit-scrollbar { display: none; }
.ac-member {
  display: flex; align-items: center; gap: 10px;
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: var(--radius-sm); padding: 7px 10px; text-align: left;
}
.ac-member.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--bg-screen)); }
.ac-member-name { flex: 1 1 auto; font-size: 14px; color: var(--text); }
.ac-hint { font-size: 12px; color: var(--text-soft); margin: 2px 0 0; }

.delete-btn { border: none; background: var(--bg-screen); color: #e5484d; font-size: 15px; font-weight: 700; padding: 14px; border-radius: var(--radius); box-shadow: var(--shadow); }
.delete-btn:active { background: rgba(229, 72, 77, 0.08); }

/* ═══ 头像操作弹窗（底部 action sheet） ═══ */
.as-mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 60;
  animation: as-fade 0.18s ease;
}
@keyframes as-fade { from { opacity: 0; } to { opacity: 1; } }
.as-sheet {
  width: 100%;
  max-width: 520px;
  background: var(--bg-screen);
  border-radius: 16px 16px 0 0;
  padding: 8px 10px calc(10px + env(safe-area-inset-bottom));
  animation: as-up 0.22s ease;
}
@keyframes as-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.as-title { text-align: center; font-size: 12px; color: var(--text-soft); padding: 12px 0 8px; }
.as-btn {
  display: block;
  width: 100%;
  border: none;
  background: var(--card-bg-soft, var(--bg-screen));
  color: var(--text);
  font-size: 16px;
  padding: 15px 0;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 8px;
}
.as-btn:active { background: var(--bg-soft); }
.as-btn.danger { color: #e5484d; }
.as-btn.cancel { color: var(--text-soft); font-weight: 600; }
</style>
