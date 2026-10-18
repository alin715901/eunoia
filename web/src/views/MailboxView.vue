<template>
  <div class="mailbox-view">
    <AppHeader :title="headerTitle" back @back="onBack" />

    <div class="mb-body">
      <!-- 三个胶囊页签：收到的信 / 寄出的信 / 写封信 -->
      <div class="mb-tabs">
        <button class="mb-tab" :class="{ on: view === 'inbox' }" @click="view = 'inbox'">收到的信</button>
        <button class="mb-tab" :class="{ on: view === 'sent' }" @click="view = 'sent'">寄出的信</button>
        <button class="mb-tab" :class="{ on: view === 'write' }" @click="openWrite">写封信</button>
      </div>

      <!-- 收到的信 / 寄出的信：分组卡片列表 -->
      <div v-if="view === 'inbox' || view === 'sent'" class="mb-wrap">
        <div v-if="!groupedList.length" class="mb-empty">
          {{ view === 'inbox' ? 'TA 还没来信，等 TA 写第一封吧。' : '你还没寄出过信。' }}
        </div>
        <template v-for="g in groupedList" :key="g.key">
          <div class="grp-head">
            <span>{{ g.label }}</span>
            <span v-if="g.count" class="grp-count">{{ g.count }} 封 ⌄</span>
          </div>
          <div
            v-for="l in g.items"
            :key="l.id"
            class="letter-card"
            :class="{ 'is-open': expandedId === l.id }"
            @click="toggleLetter(l)"
          >
            <div class="lc-ava"><AppIcon name="letter" :size="20" /></div>
            <div class="lc-main">
              <div class="lc-row1">
                <span class="lc-title">{{ titleText(l) }}</span>
                <span v-if="l.favorite" class="lc-star" title="已收藏"><AppIcon name="star" :size="14" filled color="#f5b301" /></span>
                <span v-if="l.hasReply" class="lc-replied">已回信</span>
                <span v-if="view === 'inbox' && !l.is_read" class="lc-new">新来信</span>
                <span class="lc-date">{{ fmtDate(l.created_at) }}</span>
              </div>
              <div class="lc-prev">{{ preview(l) }}</div>
            </div>

            <!-- 展开全文 -->
            <div v-if="expandedId === l.id" class="lc-full" @click.stop>
              <div class="lc-scroll">
                <div v-if="l.opening" class="l-open">{{ l.opening }}</div>
                <!-- 对方来信：多张字卡拼成一段（拼字卡格式），不分行 -->
                <p v-if="l.sender !== 'contact' && l.sentences && l.sentences.length" v-for="(s, i) in l.sentences" :key="i" class="l-line">{{ s }}</p>
                <p v-else-if="l.sentences && l.sentences.length" class="l-line">{{ l.sentences.join(' ') }}</p>
                <div v-if="l.closing" class="l-close">{{ l.closing }}</div>
                <!-- 这是一封回信：显示回复的原信，点击可跳转查看 -->
                <div v-if="l.replyOrig" class="l-orig" @click.stop="viewOriginal(l)">
                  <span class="lo-label">原信</span>
                  <span class="lo-text">{{ l.replyOrig.excerpt || '（无正文）' }}</span>
                  <AppIcon name="chevron-right" :size="14" color="var(--text-soft)" />
                </div>
                <!-- 这封信收到了回信：逐条列出（我回 TA 的 / TA 回我的），点击可跳转查看 -->
                <div v-if="l.replyList && l.replyList.length" class="l-replies">
                  <span class="lr-label">回信</span>
                  <span
                    v-for="r in l.replyList"
                    :key="r.id"
                    class="lr-item"
                    @click.stop="viewReply(r)"
                  >
                    <span class="lr-text">{{ r.excerpt || '（无正文）' }}</span>
                    <AppIcon name="chevron-right" :size="14" color="var(--text-soft)" />
                  </span>
                </div>
              </div>
              <div class="lc-actions">
                <template v-if="view === 'inbox'">
                  <button class="lca-btn" @click.stop="onFavorite(l)">{{ l.favorite ? '取消收藏' : '收藏' }}</button>
                  <button class="lca-btn" @click.stop="replyTo(l)">回信</button>
                </template>
                <button class="lca-btn danger" @click.stop="onDelete(l)">删除</button>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 写封信：整页信纸 -->
      <div v-else-if="view === 'write'" class="write-view">
        <!-- 回信时显示正在回复的那一封信 -->
        <div v-if="replyTarget" class="wv-reply" @click.stop="clearReply">
          <span class="wvr-label">回复</span>
          <span class="wvr-text">{{ replyPreview }}</span>
          <span class="wvr-close"><AppIcon name="close" :size="13" /></span>
        </div>
        <div class="wv-card">
          <input v-model="form.opening" class="wv-input" placeholder="亲爱的，" />
          <textarea
            v-model="form.body"
            class="wv-area"
            placeholder="今天想跟你说…"
            rows="4"
          ></textarea>
          <input v-model="form.closing" class="wv-input wv-closing" placeholder="——落款（可留空）" />
        </div>

        <label class="wv-check">
          <input type="checkbox" v-model="sendToChat" />
          <span>同时发送到聊天记录</span>
        </label>

        <div class="wv-hint">
          <span class="wv-hint-reply">你寄出的信，对方将会在48小时内随时回复。</span>
          <template v-if="cfg.letter_enabled">对方会按 TA 的信件设置主动来信：每周 {{ cfg.letter_week_min }}~{{ cfg.letter_week_max }} 封，每封 {{ cfg.letter_sentences_min }}~{{ cfg.letter_sentences_max }} 句话</template>
          <template v-else>对方未开启主动来信（可在 TA 的信件设置中开启）</template>
        </div>
      </div>
    </div>

    <!-- 写信底部固定寄出条 -->
    <div v-if="view === 'write'" class="write-bar">
      <button class="wb-btn" @click="send" :disabled="sending">寄出</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { getLetters, createLetter, markLetterRead, markContactLettersRead, deleteLetter, favoriteLetter } from '@/api/content'
import { confirmDialog } from '@/utils/dialog'
import { sendMessage } from '@/api/chat'
import { getContactSettings } from '@/api/contacts'

const props = defineProps({ id: { type: [String, Number], required: true } })

const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const contact = computed(() => contactsStore.getById(props.id))

const list = ref([])
const sending = ref(false)
const form = ref({ opening: '', body: '', closing: '' })

/* 页签状态：收到的信 / 寄出的信 / 写封信 */
const view = ref('inbox')
const expandedId = ref(null)
const sendToChat = ref(false)
/* 回信时记录正在回复的那一封信 */
const replyTarget = ref(null)

/* 该联系人的信件设置（仅用于回信时间提示，无设置 UI） */
const cfg = ref({
  letter_enabled: 0,
  letter_week_min: 0,
  letter_week_max: 0,
  letter_sentences_min: 3,
  letter_sentences_max: 6
})

const headerTitle = computed(() =>
  view.value === 'write'
    ? (replyTarget.value ? `回复 · 给 ${contact.value?.name || 'TA'}` : `写信 · 给 ${contact.value?.name || 'TA'}`)
    : `${contact.value?.name || 'TA'}的信箱`
)

/* 回信横幅的摘要文案 */
const replyPreview = computed(() => {
  const t = replyTarget.value
  if (!t) return ''
  const who = t.sender === 'me' ? `我寄给 ${contact.value?.name || 'TA'}` : `${contact.value?.name || 'TA'} 寄来`
  const excerpt = (t.sentences && t.sentences[0]) || t.opening || t.closing || ''
  return `${who}的信：${excerpt}`
})

const inList = computed(() => list.value.filter((l) => l.sender !== 'me'))
const outList = computed(() => list.value.filter((l) => l.sender === 'me'))

/* 分组：本周 + 更早按月份 */
const groupedList = computed(() => {
  const src = view.value === 'sent' ? outList.value : inList.value
  const now = new Date()
  const day = (now.getDay() + 6) % 7 // 周一为一周开始
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day).getTime()
  const week = []
  const months = {}
  for (const l of src) {
    if (l.created_at >= weekStart) week.push(l)
    else {
      const d = new Date(l.created_at)
      const k = `${d.getFullYear()}-${d.getMonth()}`
      ;(months[k] = months[k] || []).push(l)
    }
  }
  const res = []
  if (week.length) res.push({ key: 'week', label: '本周', items: week })
  for (const k of Object.keys(months).sort().reverse()) {
    const [y, m] = k.split('-')
    res.push({ key: k, label: `${y} 年 ${Number(m) + 1} 月`, count: months[k].length, items: months[k] })
  }
  return res
})

function preview(l) {
  const t = (l.sentences && l.sentences[0]) || l.opening || ''
  return t.length > 16 ? t.slice(0, 16) + '…' : t
}

/* 信件标题：回信显示「回复 XX」，普通信件显示「来自/寄给 XX」 */
function titleText(l) {
  if (l.reply_to) {
    return l.sender === 'me' ? `回复 ${contact.value?.name || 'TA'}` : '回复 我'
  }
  return `${view.value === 'inbox' ? '来自' : '寄给'} ${contact.value?.name || 'TA'}`
}

function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

function toggleLetter(l) {
  if (expandedId.value === l.id) {
    expandedId.value = null
    return
  }
  expandedId.value = l.id
  if (view.value === 'inbox' && !l.is_read) {
    l.is_read = 1
    markLetterRead(l.id).catch(() => {})
  }
}

function onBack(e) {
  /* 写信页返回先回到信箱，不直接退出板块 */
  if (view.value === 'write') {
    e.prevent()
    replyTarget.value = null
    view.value = 'inbox'
  }
}

/* 展开来信后的操作：收藏（可取消）/ 回信 / 删除 */
async function onFavorite(l) {
  try {
    const r = await favoriteLetter(l.id)
    l.favorite = r?.favorite ? 1 : 0
    toast.pushToast({ title: l.favorite ? '已收藏' : '已取消收藏', text: l.favorite ? '已收进收藏列表' : '' })
  } catch (e) {
    toast.pushToast({ title: '操作失败', text: e.message })
  }
}
async function onDelete(l) {
  const ok = await confirmDialog({
    title: '删除这封信',
    text: '删除后无法恢复，确定要删除吗？',
    okText: '删除',
    cancelText: '取消',
    danger: true
  })
  if (!ok) return
  try {
    await deleteLetter(l.id)
    list.value = list.value.filter((x) => x.id !== l.id)
    if (expandedId.value === l.id) expandedId.value = null
    if (replyTarget.value && replyTarget.value.id === l.id) replyTarget.value = null
    toast.pushToast({ title: '已删除', text: '' })
  } catch (e) {
    toast.pushToast({ title: '删除失败', text: e.message })
  }
}
function replyTo(l) {
  /* 跳到写信页，并显示正在回复的这一封 */
  replyTarget.value = l
  form.value = { opening: '亲爱的，', body: '', closing: '' }
  expandedId.value = null
  view.value = 'write'
}

function clearReply() {
  replyTarget.value = null
}

/* 点击回信里挂着的原信：跳到原信所在页签并展开定位 */
function viewOriginal(l) {
  const o = list.value.find((x) => x.id === l.reply_to)
  if (!o) {
    toast.pushToast({ title: '原信不存在', text: '可能已被删除' })
    return
  }
  view.value = o.sender === 'me' ? 'sent' : 'inbox'
  expandedId.value = o.id
  nextTick(() => {
    document.querySelector('.letter-card.is-open')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

/* 点击原信里挂着的回信：跳到回信所在页签并展开定位 */
function viewReply(r) {
  const t = list.value.find((x) => x.id === r.id)
  if (!t) {
    toast.pushToast({ title: '回信不存在', text: '可能已被删除' })
    return
  }
  view.value = t.sender === 'me' ? 'sent' : 'inbox'
  expandedId.value = t.id
  nextTick(() => {
    document.querySelector('.letter-card.is-open')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function openWrite() {
  replyTarget.value = null
  form.value = { opening: '亲爱的，', body: '', closing: '' }
  expandedId.value = null
  view.value = 'write'
}

async function load() {
  try {
    list.value = await getLetters(props.id)
    /* 进入信箱即把 TA 的未读来信全部标记已读（像打开聊天一样），
       同步本地列表并清掉「新来信」标记，避免信箱角标残留 */
    await markContactLettersRead(props.id).catch(() => {})
    for (const l of list.value) {
      if (l.sender !== 'me' && !l.is_read) l.is_read = 1
    }
  } catch (e) {
    toast.pushToast({ title: '加载失败', text: e.message })
  }
}

async function loadCfg() {
  try {
    const s = await getContactSettings(props.id)
    if (!s) return
    cfg.value = {
      letter_enabled: Number(s.letter_enabled) || 0,
      letter_week_min: Number(s.letter_week_min) || 0,
      letter_week_max: Number(s.letter_week_max) || 0,
      letter_sentences_min: s.letter_sentences_min ?? 3,
      letter_sentences_max: s.letter_sentences_max ?? 6
    }
  } catch (e) {
    /* ignore */
  }
}

async function send() {
  const lines = form.value.body.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!form.value.opening && !lines.length && !form.value.closing) {
    toast.pushToast({ title: '提示', text: '写点什么再寄出吧' })
    return
  }
  sending.value = true
  try {
    await createLetter({
      contactId: props.id,
      sender: 'me',
      opening: form.value.opening,
      closing: form.value.closing,
      sentences: lines,
      replyTo: replyTarget.value?.id || null
    })
    /* 同时发送到聊天记录 */
    if (sendToChat.value) {
      const text = [form.value.opening, ...lines, form.value.closing].filter(Boolean).join('\n')
      await sendMessage(props.id, text).catch(() => {})
    }
    form.value = { opening: '', body: '', closing: '' }
    replyTarget.value = null
    view.value = 'sent'
    await load()
    toast.pushToast({ title: '已寄出', text: '对方将会在48小时内随时回复' })
  } catch (e) {
    toast.pushToast({ title: '寄出失败', text: e.message })
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  if (!contact.value) await contactsStore.refreshOne(props.id).catch(() => {})
  await loadCfg()
  await load()
})
</script>

<style scoped>
/* 头部固定铺满全宽，内容区独立滚动 */
.mailbox-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.mb-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px 14px 20px; }

/* 三个胶囊页签：等分铺满一行 */
.mb-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.mb-tab {
  flex: 1 1 0;
  min-width: 0;
  padding: 8px 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-screen);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}
.mb-tab.on { background: var(--text); color: var(--bg-screen); border-color: var(--text); }

/* 列表容器：去掉最外层边框，扁平化 */
.mb-wrap { background: transparent; border: none; border-radius: 0; padding: 0; }
.grp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-soft);
  padding: 4px 2px 10px;
}
.grp-count {
  font-size: 12px;
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 2px 10px;
}
.letter-card {
  display: flex;
  gap: 11px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  margin-bottom: 10px;
  background: var(--bg-screen);
  cursor: pointer;
  flex-wrap: wrap;
}
.letter-card:active { background: var(--bg-soft); }
.lc-ava {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--bg-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
.lc-main { flex: 1; min-width: 0; }
.lc-row1 { display: flex; align-items: center; gap: 6px; }
.lc-title { font-size: 14px; font-weight: 700; }
.lc-star { flex: 0 0 auto; display: inline-flex; align-items: center; margin-left: 2px; }
.lc-replied {
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 500;
  color: var(--text-soft);
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  line-height: 1.4;
}
.lc-new {
  font-size: 10px;
  background: var(--text);
  color: var(--bg-screen);
  border-radius: 999px;
  padding: 2px 7px;
  flex: 0 0 auto;
}
.lc-date { margin-left: auto; font-size: 11px; color: var(--text-soft); flex: 0 0 auto; }
.lc-prev {
  font-size: 13px;
  color: var(--text-soft);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 展开全文 */
.lc-full {
  flex-basis: 100%;
  min-width: 0; /* 关键：切断 flex item 的 min-width:auto 兜底——
     否则正文里出现不可断长串（英文单词/URL/emoji 串/符号串）时，
     本块会被撑到内容宽度，整段文字冲出卡片（复现：220 个 a 把
     402px 的卡片撑到 1837px，文字盖住回信区和按钮） */
  display: flex;
  flex-direction: column;
  border-top: 1px dashed var(--border);
  margin-top: 8px;
  padding-top: 10px;
}
/* 正文区域：内容过长时固定高度并内部滚动，操作按钮常驻底部 */
.lc-scroll {
  max-height: 50vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-right: 2px;
  min-width: 0;
}
.lc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  flex: 0 0 auto;
}
.lca-btn {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  color: var(--text);
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 16px;
  cursor: pointer;
}
.lca-btn:active { background: var(--bg-soft); }
.lca-btn.danger { color: #fa5151; border-color: #fa5151; }
/* 正文各行：长串（英文单词/URL/emoji/符号）强制在容器内断行，
   不冲出卡片；中文仍按正常断行规则 */
.l-open { font-family: var(--font-serif); font-size: 14px; margin-bottom: 6px; overflow-wrap: anywhere; word-break: break-word; }
.l-line { font-family: var(--font-serif); font-size: 15px; line-height: 1.8; margin: 4px 0; overflow-wrap: anywhere; word-break: break-word; }
.l-close { font-family: var(--font-serif); font-size: 14px; margin-top: 8px; text-align: right; color: var(--text-soft); overflow-wrap: anywhere; word-break: break-word; }
/* 回信中挂着的原信入口：点击跳转查看原信 */
.l-orig {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--bg-soft);
  border-radius: 10px;
  font-size: 12px;
  color: var(--text-soft);
  cursor: pointer;
}
.lo-label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}
.lo-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 原信下收到的回信入口列表：点击跳转查看那封回信 */
.l-replies {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.lr-label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
}
.lr-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-soft);
  border-radius: 10px;
  font-size: 12px;
  color: var(--text-soft);
  cursor: pointer;
}
.lr-item:active { background: var(--border); }
.lr-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 写信视图 */
.write-view { display: flex; flex-direction: column; }
/* 回信横幅：显示正在回复的那一封信，可点 × 取消 */
.wv-reply {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 9px 12px;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text);
}
.wvr-label {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 2px 9px;
}
.wvr-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wvr-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  cursor: pointer;
}
.wv-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-screen);
  padding: 14px;
}
.wv-input {
  width: 100%;
  border: none;
  border-bottom: 1px dashed var(--border);
  background: transparent;
  color: var(--text);
  font-family: var(--font-serif);
  font-size: 15px;
  padding: 12px 2px 8px;
  outline: none;
}
.wv-area {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 1.9;
  padding: 10px 2px;
  outline: none;
  resize: none;
  min-height: 200px;
  max-height: 280px;
  overflow-y: auto;
  box-sizing: border-box;
  display: block;
}
.wv-closing { border-bottom: none; text-align: right; }
.wv-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  margin: 14px 2px 10px;
}
.wv-check input { accent-color: var(--accent); }
.wv-hint {
  font-size: 12px;
  color: var(--text-soft);
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wv-hint-reply { font-weight: 600; color: var(--text); }

/* 底部寄出条 */
.write-bar { flex: 0 0 auto; padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); background: var(--bg-screen); border-top: 1px solid var(--border); }
.wb-btn {
  width: 100%;
  padding: 14px 0;
  border: none;
  border-radius: 14px;
  background: var(--text);
  color: var(--bg-screen);
  font-size: 16px;
  font-weight: 700;
  font-family: var(--font-serif);
  letter-spacing: 4px;
}
.wb-btn:disabled { opacity: 0.6; }

.mb-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 30px 20px; }
</style>
