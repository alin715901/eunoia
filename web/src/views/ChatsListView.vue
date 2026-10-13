<template>
  <div class="chats-view">
    <!-- 顶部：标题 + 搜索 -->
    <header class="cl-header">
      <button class="cl-back" @click="go('/')" aria-label="返回主页">
        <AppIcon name="back" :size="22" />
      </button>
      <h1 class="cl-title">聊天</h1>
      <!-- 右上角「＋」：新建主体（单人联系人或群聊），主体只能在这里创建 -->
      <button class="cl-add" @click="showAddChoice = true" aria-label="新建主体">
        <AppIcon name="plus" :size="22" color="var(--text)" />
      </button>
    </header>

    <div class="cl-search">
      <AppIcon name="search" :size="15" color="var(--text-soft)" />
      <input v-model="q" type="search" placeholder="搜索联系人、群聊或聊天记录" class="cl-q" />
    </div>

    <!-- 搜索态：联系人/群聊 + 聊天记录 两段结果 -->
    <div v-if="q.trim()" class="cl-list">
      <template v-if="filtered.length">
        <div class="cl-sec-title">联系人 / 群聊</div>
        <button
          v-for="row in filtered"
          :key="'c' + row.id"
          class="cl-item"
          :class="{ pinned: row.pinned }"
          @click="openChat(row)"
        >
          <div class="cl-ava">
            <AppAvatar :name="row.name" :avatar="row.avatar" :size="44" />
            <span v-if="row.unread > 0" class="cl-badge">{{ row.unread > 99 ? '99+' : row.unread }}</span>
          </div>
          <div class="cl-main">
            <div class="cl-row1">
              <span class="cl-name">{{ row.name }}</span>
              <span class="cl-time">{{ timeText(row.lastAt) }}</span>
            </div>
            <div class="cl-row2">
              <span class="cl-last" :class="{ empty: !row.lastText && !row.lastRecalled }">{{ preview(row) }}</span>
            </div>
          </div>
        </button>
      </template>

      <template v-if="searchGroups.length">
        <div class="cl-sec-title">聊天记录</div>
        <button
          v-for="g in searchGroups"
          :key="'g' + g.contactId"
          class="cl-item"
          @click="openSearchChat(g)"
        >
          <div class="cl-ava">
            <AppAvatar :name="g.contactName" :avatar="g.avatar || deskAvatars[g.contactId] || ''" :size="44" />
          </div>
          <div class="cl-main">
            <div class="cl-row1">
              <span class="cl-name">{{ g.contactName }}</span>
              <span class="cl-count">{{ g.count }} 条相关</span>
            </div>
            <div class="cl-row2">
              <span class="cl-last">{{ g.preview }}</span>
            </div>
          </div>
        </button>
      </template>

      <div v-if="!filtered.length && !msgHits.length" class="cl-empty">没有匹配的结果</div>
    </div>

    <!-- 列表：所有联系人 + 群聊，按最后互动排序 -->
    <div v-else class="cl-list">
      <button
        v-for="row in filtered"
        :key="row.id"
        class="cl-item"
        :class="{ pinned: row.pinned }"
        @click="openChat(row)"
      >
        <div class="cl-ava">
          <AppAvatar :name="row.name" :avatar="row.avatar" :size="44" />
          <span v-if="row.unread > 0" class="cl-badge">{{ row.unread > 99 ? '99+' : row.unread }}</span>
        </div>
        <div class="cl-main">
          <div class="cl-row1">
            <span class="cl-name">{{ row.name }}</span>
            <span class="cl-time">{{ timeText(row.lastAt) }}</span>
          </div>
          <div class="cl-row2">
            <span class="cl-last" :class="{ empty: !row.lastText }">{{ preview(row) }}</span>
          </div>
        </div>
      </button>

      <div v-if="!filtered.length" class="cl-empty">
        {{ '还没有联系人，点右上角「＋」添加一个吧' }}
      </div>
    </div>

    <!-- 新建主体：先选类型 -->
    <Modal :show="showAddChoice" title="新建主体" @close="showAddChoice = false">
      <div class="ac-choices">
        <button class="ac-choice" @click="openPerson">
          <AppIcon name="user" :size="18" color="var(--accent)" />
          <span>新建联系人</span>
        </button>
        <button class="ac-choice" @click="openGroup">
          <AppIcon name="chat" :size="18" color="var(--accent)" />
          <span>新建群聊（≥2 位成员）</span>
        </button>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="showAddChoice = false">取消</button>
      </template>
    </Modal>

    <!-- 新建单人联系人 -->
    <Modal :show="showPerson" title="新建联系人" @close="showPerson = false">
      <div class="ac-form">
        <span class="ac-lbl">头像（可选）</span>
        <div class="ac-ava">
          <AppAvatar :name="personForm.name || '新'" :avatar="personForm.avatar" :size="56" />
          <label class="ac-upload">
            选择图片
            <input type="file" accept="image/*" hidden @change="onPersonAvatar" />
          </label>
          <span v-if="personForm.avatar" class="ac-clear" @click="personForm.avatar = ''">移除</span>
        </div>
        <span class="ac-lbl">昵称</span>
        <input v-model="personForm.name" class="ac-input" placeholder="给 TA 起个名字" />
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="showPerson = false">取消</button>
        <button class="btn btn-primary" :disabled="!personForm.name.trim() || creating" @click="submitPerson">创建</button>
      </template>
    </Modal>

    <!-- 新建群聊 -->
    <Modal :show="showGroup" title="新建群聊" @close="showGroup = false">
      <div class="ac-form">
        <span class="ac-lbl">群名称</span>
        <input v-model="groupForm.name" class="ac-input" placeholder="例如：我们的小群" />
        <span class="ac-lbl">选择成员（至少 2 位）</span>
        <div class="ac-members">
          <button
            v-for="c in personContacts"
            :key="c.id"
            class="ac-member"
            :class="{ on: groupForm.memberIds.includes(c.id) }"
            @click="toggleMember(c.id)"
          >
            <AppAvatar :name="c.name" :avatar="c.avatar" :size="30" />
            <span class="ac-member-name">{{ c.name }}</span>
            <AppIcon v-if="groupForm.memberIds.includes(c.id)" name="check" :size="14" color="var(--accent)" />
          </button>
        </div>
        <p v-if="groupForm.memberIds.length < 2" class="ac-hint">还差 {{ 2 - groupForm.memberIds.length }} 位成员</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="showGroup = false">取消</button>
        <button class="btn btn-primary" :disabled="!canCreateGroup() || creating" @click="submitGroup">创建</button>
      </template>
    </Modal>

    <!-- 新建联系人头像裁剪 -->
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      title="裁剪头像"
      :ratio="1"
      @cancel="cropSrc = ''"
      @done="onPersonCropped"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import Modal from '@/components/common/Modal.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { getChatList, searchMessages } from '@/api/chat'
import { createContact, uploadAvatar, getDesktop } from '@/api/contacts'
import { useContactsStore } from '@/stores/contacts'
import { useChatListStore } from '@/stores/chatList'
import { useBadgesStore } from '@/stores/badges'
import { useDesktopStore } from '@/stores/desktop'
import { notify } from '@/utils/dialog'
import { useHomeStore } from '@/stores/home'

defineOptions({ name: 'ChatsListView' })

const router = useRouter()
const contactsStore = useContactsStore()
const chatListStore = useChatListStore()
const badgesStore = useBadgesStore()
const desktop = useDesktopStore()
const homeStore = useHomeStore()

const q = ref('')
/* 列表数据来自 /chats（含最后一条摘要），存进 chatList store，便于 SSE 到达时即时更新 */
/* 人物卡头像兜底：联系人本体没传头像、但人物卡开了「同步头像到聊天」时，列表也显示该头像 */
const deskAvatars = ref({})
const selectedId = computed(() => homeStore.selectedId || desktop.currentContactId)
const currentContact = computed(() => contactsStore.getById(selectedId.value))

const merged = computed(() => {
  const list = chatListStore.rows.length ? chatListStore.rows : (contactsStore.list || [])
  const arr = list.map((r) => {
    const c = contactsStore.getById(r.id)
    return {
      ...(c || {}),
      ...r,
      /* 名字：优先取联系人 store 的实时值，改备注后（SSE 已回写 store）列表即时同步，不用重新进页面 */
      name: c?.name || r.name || '联系人',
      /* 头像：本地 > 服务端合并好的 chat_avatar（含人物卡同步） > 桌面缓存，首屏即正确不跳变 */
      avatar: r.avatar || r.chat_avatar || c?.avatar || c?.chat_avatar || deskAvatars.value[r.id] || '',
      pinned: Number(r.pinned ?? c?.pinned ?? 0),
      // 优先用联系人 store 的实时未读（SSE 到达时累加），否则回落 /chats 快照
      unread: Number(c?.unread ?? r.unread ?? 0)
    }
  })
  /* 置顶聊天排在最前，其余保持原顺序 */
  return [...arr.filter((r) => r.pinned), ...arr.filter((r) => !r.pinned)]
})

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase()
  if (!kw) return merged.value
  return merged.value.filter((r) => String(r.name || '').toLowerCase().includes(kw))
})

async function load() {
  /* 已有列表数据：后台静默刷新，不阻塞渲染（避免每次进入页面读条/重排的刷新感） */
  if (chatListStore.rows.length) {
    getChatList().then((r) => { chatListStore.setRows(r) }).catch(() => {})
    badgesStore.load().catch(() => {})
    loadDeskAvatars()
    return
  }
  try {
    chatListStore.setRows(await getChatList())
  } catch (e) {
    chatListStore.setRows([])
  }
  try { await badgesStore.load() } catch (e) {}
  loadDeskAvatars()
}

/* 为没有本地上传头像的联系人取人物卡同步头像（sync_chat_avatar + partner_avatar） */
async function loadDeskAvatars() {
  const list = (contactsStore.list || []).filter((c) => c.kind !== 'group' && !c.avatar)
  if (!list.length) return
  await Promise.all(
    list.map(async (c) => {
      try {
        const d = await getDesktop(c.id)
        if (d?.sync_chat_avatar && d?.partner_avatar) {
          deskAvatars.value = { ...deskAvatars.value, [c.id]: d.partner_avatar }
        }
      } catch (e) { /* ignore */ }
    })
  )
}

/* ───────── 聊天记录搜索（防抖 250ms） ───────── */
const msgHits = ref([])
let searchTimer = null
watch(q, (v) => {
  clearTimeout(searchTimer)
  const kw = String(v || '').trim()
  if (!kw) {
    msgHits.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      msgHits.value = await searchMessages(kw)
    } catch (e) {
      msgHits.value = []
    }
  }, 250)
})

/* 搜索结果按联系人/群聊分组：每个主体一行，显示命中条数 + 最近一条摘要 */
const searchGroups = computed(() => {
  const map = new Map()
  for (const h of msgHits.value) {
    if (!map.has(h.contactId)) {
      map.set(h.contactId, {
        contactId: h.contactId,
        contactName: h.contactName || '聊天',
        avatar: h.avatar || '',
        count: 0,
        preview: ''
      })
    }
    const g = map.get(h.contactId)
    g.count += 1
    /* 取时间最新（数组按 id 倒序，靠前即最新）的一条作为预览 */
    if (!g.preview) g.preview = h.text || '（一条卡片消息）'
  }
  return [...map.values()]
})

function openChat(row) {
  /* 只进入会话，不动主页人物卡的选中主体——聊天归聊天，人物卡归人物卡 */
  router.push(`/contacts/${row.id}/chat`)
}

/* 从搜索结果进入会话，并带上关键字 ?q=，会话内筛选相关聊天记录 */
function openSearchChat(g) {
  router.push({ path: `/contacts/${g.contactId}/chat`, query: { q: q.value.trim() } })
}

/* ───────── 新建主体：唯一的新增入口（右上角「＋」） ───────── */
const showAddChoice = ref(false)
const showPerson = ref(false)
const showGroup = ref(false)
const creating = ref(false)
const personForm = reactive({ name: '', avatar: '' })
let personFile = null
/* 新建联系人头像也走裁剪弹窗（拖动移动 + 缩放），确认后再上传 */
const cropSrc = ref('')
const groupForm = reactive({ name: '', memberIds: [] })
const personContacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))

function openPerson() {
  showAddChoice.value = false
  personForm.name = ''
  personForm.avatar = ''
  personFile = null
  showPerson.value = true
}
function openGroup() {
  showAddChoice.value = false
  groupForm.name = ''
  groupForm.memberIds = []
  showGroup.value = true
}
function onPersonAvatar(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  cropSrc.value = URL.createObjectURL(f)
}
async function onPersonCropped(blob) {
  cropSrc.value = ''
  if (!blob) return
  personFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
  personForm.avatar = URL.createObjectURL(blob)
}
function toggleMember(id) {
  const arr = groupForm.memberIds
  const i = arr.indexOf(id)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(id)
}
function canCreateGroup() {
  return groupForm.name.trim() && groupForm.memberIds.length >= 2
}

/* 创建成功后刷新列表；不切换主页人物卡（切换只走人物卡设置页） */
async function submitPerson() {
  const name = personForm.name.trim()
  if (!name) return
  creating.value = true
  try {
    const c = await createContact({ name, kind: 'person' })
    if (personFile) {
      try { await uploadAvatar(c.id, personFile) } catch (e) { /* ignore */ }
      await contactsStore.refreshOne(c.id)
    }
    await contactsStore.load()
    showPerson.value = false
    await load()
  } catch (e) {
    notify('创建失败：' + (e?.message || '请重试'))
  } finally {
    creating.value = false
  }
}
async function submitGroup() {
  if (!canCreateGroup()) return
  creating.value = true
  try {
    await createContact({
      name: groupForm.name.trim(),
      kind: 'group',
      memberIds: groupForm.memberIds
    })
    await contactsStore.load()
    showGroup.value = false
    await load()
  } catch (e) {
    notify('创建失败：' + (e?.message || '请重试'))
  } finally {
    creating.value = false
  }
}

function preview(row) {
  if (!row.lastAt) return '还没有消息，去说点什么吧'
  /* 撤回的消息：显示撤回提示，不显示「（一条卡片消息）」等占位 */
  if (row.lastRecalled) {
    /* 群聊里显示撤回的成员名，单聊显示对方名 */
    const who = row.lastSender === 'me' ? '我' : (row.lastAuthorName || row.name || '对方')
    return `${who}撤回了一条消息`
  }
  /* 群聊：带上是谁说的（我：/ 成员名：）；单人聊天只显示内容本身 */
  let prefix = ''
  if (row.kind === 'group') {
    if (row.lastSender === 'me') prefix = '我：'
    else if (row.lastAuthorName) prefix = `${row.lastAuthorName}：`
  }
  return prefix + (row.lastText || '（一条卡片消息）')
}

function timeText(ts) {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  const sameDay = new Date().toDateString() === d.toDateString()
  if (sameDay) return hm
  const yesterday = new Date(Date.now() - 86400 * 1000).toDateString() === d.toDateString()
  if (yesterday) return '昨天'
  const md = `${d.getMonth() + 1}/${d.getDate()}`
  if (d.getFullYear() === new Date().getFullYear()) return md
  return `${d.getFullYear()}/${md}`
}

function go(path) {
  router.push(path)
}

onMounted(async () => {
  if (!contactsStore.list.length) {
    try { await contactsStore.load() } catch (e) {}
  }
  await load()
})
onActivated(load)
</script>

<style scoped>
.chats-view {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-body);
}
.cl-header {
  flex: 0 0 auto;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.cl-back { border: none; background: transparent; color: var(--text); padding: 4px; display: flex; }
.cl-title { flex: 1; margin: 0; font-size: 17px; font-weight: 700; text-align: center; }
.cl-add { border: none; background: transparent; padding: 0; display: flex; }

.cl-search {
  flex: 0 0 auto;
  margin: 8px 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 7px 12px;
}
.cl-q {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--text);
  min-width: 0;
}

.cl-list {
  flex: 1 1 auto;
  overflow-y: auto;
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
}
.cl-sec-title {
  padding: 8px 14px 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-soft);
  background: var(--bg-body);
  position: sticky;
  top: 0;
  z-index: 1;
}
.cl-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  border: none;
  background: transparent;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.cl-item:active { background: var(--bg-soft); }
/* 置顶聊天：背景比普通行浅浅深一点点，与未置顶区分（深浅主题均适用） */
.cl-item.pinned { background: color-mix(in srgb, var(--bg-screen) 97%, #000); }
.cl-item.pinned:active { background: color-mix(in srgb, var(--bg-screen) 93%, #000); }
.cl-ava { position: relative; flex: 0 0 auto; }
.cl-badge {
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
.cl-main { flex: 1; min-width: 0; }
.cl-row1 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.cl-name { font-size: 15px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cl-time { font-size: 11px; color: var(--text-soft); flex: 0 0 auto; }
.cl-count { font-size: 11px; color: var(--accent); flex: 0 0 auto; font-weight: 600; }
.cl-row2 { margin-top: 3px; }
.cl-last {
  font-size: 12px;
  color: var(--text-soft);
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cl-last.empty { color: var(--border); }
.cl-empty { padding: 40px 20px; text-align: center; font-size: 13px; color: var(--text-soft); }
/* 新建主体弹窗 */
.ac-choices { display: flex; flex-direction: column; gap: 8px; }
.ac-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 13px 12px;
  font-size: 14px;
  color: var(--text);
  text-align: left;
}
.ac-form { display: flex; flex-direction: column; gap: 8px; }
.ac-lbl { font-size: 12px; color: var(--text-soft); margin-top: 4px; }
.ac-ava { display: flex; align-items: center; gap: 12px; }
.ac-upload {
  display: inline-block;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-screen);
}
.ac-clear { font-size: 11px; color: var(--accent); cursor: pointer; }
.ac-input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px;
  font-size: 14px;
  background: var(--bg-screen);
  color: var(--text);
}
.ac-members {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}
.ac-member {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  text-align: left;
}
.ac-member.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--bg-screen)); }
.ac-member-name { flex: 1 1 auto; font-size: 14px; color: var(--text); }
.ac-hint { font-size: 12px; color: #c0576b; margin: 2px 0 0; }
.btn { border: none; border-radius: 999px; padding: 9px 18px; font-size: 14px; font-weight: 600; }
.btn-ghost { background: var(--bg-soft); color: var(--text); }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:disabled { opacity: 0.5; }
</style>