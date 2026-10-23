<template>
  <div class="stats-view">
    <!-- 联系人切换放到顶部导航栏最右侧（与心情手账同款交互） -->
    <AppHeader title="统计" back>
      <template #right>
        <div class="st-select">
          <button class="st-select-btn" type="button" aria-label="切换联系人" @click="contactOpen = !contactOpen">
            <AppAvatar v-if="curContact" :name="curContact.name" :avatar="curContact.chat_avatar || curContact.avatar" :size="24" />
            <AppIcon v-else name="user" :size="18" color="var(--text-soft)" />
            <AppIcon name="chevron-down" :size="11" color="var(--text-soft)" />
          </button>
          <div v-if="contactOpen" class="st-select-pop">
            <button
              v-for="c in contacts"
              :key="c.id"
              class="st-select-opt"
              type="button"
              @click="pickContact(c)"
            >
              <AppAvatar :name="c.name" :avatar="c.chat_avatar || c.avatar" :size="22" />
              <span class="st-select-name">{{ c.name }}</span>
              <AppIcon v-if="curContact && String(c.id) === String(curContact.id)" name="check" :size="14" color="var(--accent)" />
            </button>
            <div v-if="!contacts.length" class="st-select-empty">还没有联系人，先去添加一个吧</div>
          </div>
        </div>
      </template>
    </AppHeader>

    <!-- 页签：统计 / 消息收藏 / 提问 / 红包 / 邀请 -->
    <div class="st-tabs">
      <button
        v-for="t in TABS"
        :key="t.key"
        class="st-tab"
        :class="{ on: curTab === t.key }"
        type="button"
        @click="curTab = t.key"
      >
        <AppIcon v-if="t.icon" :name="t.icon" :size="13" />
        <span>{{ t.name }}</span>
      </button>
    </div>

    <div class="sv-body" @click="contactOpen = false">
      <div v-if="loading" class="sv-loading">加载中…</div>

      <template v-else>
        <!-- ── 相处记录 ── -->
        <template v-if="curTab === 'days'">
          <div v-if="!total" class="sv-empty">
            <div class="sv-empty-emoji">📊</div>
            <div class="sv-empty-title">还没有聊天数据</div>
            <div class="sv-empty-sub">去和 TA 聊几句，这里就会长出你们的相处记录</div>
          </div>
          <template v-else>
        <!-- 总消息数大卡 -->
        <div class="st-card st-total">
          <div class="st-total-num">{{ total }}</div>
          <div class="st-total-label">总消息数</div>
        </div>
        <!-- 我 / TA 双栏 -->
        <div class="st-pair">
          <div class="st-card st-mini">
            <div class="st-mini-num">{{ stat.meCount }}</div>
            <div class="st-mini-sub">{{ pctMe }}%</div>
            <div class="st-mini-label">我发送的</div>
          </div>
          <div class="st-card st-mini">
            <div class="st-mini-num">{{ stat.taCount }}</div>
            <div class="st-mini-sub">{{ pctTa }}%</div>
            <div class="st-mini-label">{{ curContact ? curContact.name : '对方' }}发送的</div>
          </div>
        </div>
        <!-- 初次相遇 / 最近联络 双栏 -->
        <div class="st-pair">
          <div class="st-card st-mini st-mini-ico">
            <span class="st-mini-badge"><AppIcon name="flower" :size="13" color="#fff" /></span>
            <div class="st-mini-date">{{ fmtDate(stat.firstAt) }}</div>
            <div class="st-mini-sub">{{ fmtTime(stat.firstAt) }}</div>
            <div class="st-mini-label">初次相遇</div>
          </div>
          <div class="st-card st-mini st-mini-ico">
            <span class="st-mini-badge st-mini-badge-hot"><AppIcon name="heart" :size="13" color="#fff" /></span>
            <div class="st-mini-date">{{ fmtDate(stat.lastAt) }}</div>
            <div class="st-mini-sub">{{ fmtTime(stat.lastAt) }}</div>
            <div class="st-mini-label">最近联络</div>
          </div>
        </div>
        <!-- 明细行 -->
        <div class="st-card">
          <div class="st-row">
            <span class="st-row-label">相处天数</span>
            <span class="st-row-val">{{ stat.days }} 天</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">文字数量</span>
            <span class="st-row-val">{{ stat.chars }} 字</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">最常聊天时间</span>
            <span class="st-row-val">{{ stat.bestHour }}</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">最常聊天日期</span>
            <span class="st-row-val">{{ stat.bestWeekday }}</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">平均每日消息</span>
            <span class="st-row-val">{{ stat.avgDaily }} 条</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">最长连续聊天</span>
            <span class="st-row-val">{{ stat.streak }} 天</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">单日最高消息</span>
            <span class="st-row-val">{{ stat.maxDay }} 条</span>
          </div>
          <div class="st-row">
            <span class="st-row-label">收藏记录</span>
            <span class="st-row-val">{{ stat.favs }} 条</span>
          </div>
        </div>
      </template>
      </template>

        <!-- ── 消息收藏 ── -->
        <template v-else-if="curTab === 'fav'">
          <div v-if="!curFavs.length" class="sv-empty">
            <div class="sv-empty-emoji">⭐</div>
            <div class="sv-empty-title">还没有收藏</div>
            <div class="sv-empty-sub">长按聊天里的气泡，点「收藏」即可把消息存到这里</div>
          </div>
          <div v-else class="st-favs">
            <div v-for="it in curFavs" :key="it.id" class="st-card st-fav-card">
              <AppAvatar
                class="st-fav-avatar"
                :name="it.sender === 'me' ? '我' : (curContact ? curContact.name : '对方')"
                :avatar="it.sender === 'me' ? '' : (curContact ? curContact.chat_avatar || curContact.avatar : '')"
                :size="40"
              />
              <div class="st-fav-main">
                <div class="st-fav-head">
                  <span class="st-fav-name">{{ it.sender === 'me' ? '我' : (curContact ? curContact.name : '对方') }}</span>
                  <span class="st-fav-time">{{ fmtFull(it.created_at) }}</span>
                </div>
                <template v-if="it.content_type === 'question' && parseJSON(it.text)">
                  <div class="st-q">
                    <span class="st-q-tag">{{ qLabel(parseJSON(it.text).type) }}</span>
                    <div class="st-q-text">{{ parseJSON(it.text).question }}</div>
                    <div v-if="parseJSON(it.text).options?.length" class="st-q-opts">
                      <div v-for="(o, i) in parseJSON(it.text).options" :key="i" class="st-q-opt">
                        {{ ['A','B','C','D','E','F'][i] || i + 1 }}. {{ o }}
                      </div>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <img v-if="it.asset_path" :src="it.asset_path" class="st-fav-img" />
                  <div class="st-fav-text">{{ it.text || (it.asset_path ? '[图片]' : '') }}</div>
                </template>
              </div>
              <AppIcon class="st-fav-star" name="star" :size="16" color="#e8b94e" filled />
            </div>
          </div>
        </template>

        <!-- ── 提问 ── -->
        <template v-else-if="curTab === 'q'">
          <div v-if="!questions.length" class="sv-empty">
            <div class="sv-empty-emoji">❓</div>
            <div class="sv-empty-title">还没有提问</div>
            <div class="sv-empty-sub">聊天里发出提问后，这里会记录每一次发起</div>
          </div>
          <template v-else>
            <div class="st-hero st-hero-sm">
              <div class="st-hero-num">{{ questions.length }}</div>
              <div class="st-hero-label">累计提问</div>
            </div>
            <div class="st-favs">
              <div v-for="(q, i) in questions" :key="i" class="st-card st-fav-card">
                <AppAvatar
                  class="st-fav-avatar"
                  :name="q.sender === 'me' ? '我' : (curContact ? curContact.name : '对方')"
                  :avatar="q.sender === 'me' ? '' : (curContact ? curContact.chat_avatar || curContact.avatar : '')"
                  :size="40"
                />
                <div class="st-fav-main">
                  <div class="st-fav-head">
                    <span class="st-fav-name">{{ q.sender === 'me' ? '我' : (curContact ? curContact.name : '对方') }}发起</span>
                    <span class="st-fav-time">{{ fmtFull(q.time) }}</span>
                  </div>
                  <div class="st-q">
                    <span class="st-q-tag">{{ qLabel(q.type) }}</span>
                    <div class="st-q-text">{{ q.question }}</div>
                    <div v-if="q.options?.length" class="st-q-opts">
                      <div v-for="(o, j) in q.options" :key="j" class="st-q-opt">
                        {{ ['A','B','C','D','E','F'][j] || j + 1 }}. {{ o }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </template>

        <!-- ── 红包 ── -->
        <template v-else-if="curTab === 'rp'">
          <div v-if="!stat.rpMe.count && !stat.rpTa.count" class="sv-empty">
            <div class="sv-empty-emoji">🧧</div>
            <div class="sv-empty-title">还没有红包往来</div>
            <div class="sv-empty-sub">聊天里发出第一个红包，这里就开始记账</div>
          </div>
          <template v-else>
            <div class="st-card st-rp-card">
              <div class="st-rp-head">
                <AppIcon name="redpacket" :size="16" color="#e05a4e" />
                <span class="st-rp-title">我 发红包</span>
                <span class="st-rp-badge">{{ stat.rpMe.count }} 笔</span>
              </div>
              <div class="st-rp-amount">
                <span class="st-rp-tag">累计心意币</span>
                <span class="st-rp-num">¥{{ fmtMoney(stat.rpMe.sum) }}</span>
                <span class="st-rp-times">共 {{ stat.rpMe.count }} 次</span>
              </div>
            </div>
            <div class="st-card st-rp-card">
              <div class="st-rp-head">
                <AppIcon name="redpacket" :size="16" color="#e05a4e" />
                <span class="st-rp-title">{{ curContact ? curContact.name : 'TA' }} 发红包</span>
                <span class="st-rp-badge">{{ stat.rpTa.count }} 笔</span>
              </div>
              <div class="st-rp-amount">
                <span class="st-rp-tag">累计心意币</span>
                <span class="st-rp-num">¥{{ fmtMoney(stat.rpTa.sum) }}</span>
                <span class="st-rp-times">共 {{ stat.rpTa.count }} 次</span>
              </div>
            </div>
          </template>
        </template>

        <!-- ── 邀请 ── -->
        <template v-else>
          <div v-if="!stat.invGame.me && !stat.invGame.ta && !stat.invCinema.me && !stat.invCinema.ta" class="sv-empty">
            <div class="sv-empty-emoji">🎮</div>
            <div class="sv-empty-title">还没有邀请记录</div>
            <div class="sv-empty-sub">发起游戏或一起观影邀请后，这里会记下来</div>
          </div>
          <template v-else>
            <div class="st-card">
              <div class="st-sec st-sec-icon"><AppIcon name="game" :size="16" color="var(--accent)" />游戏邀请</div>
              <div class="st-row">
                <span class="st-row-label">我发出</span>
                <span class="st-row-val">{{ stat.invGame.me }} 次</span>
              </div>
              <div class="st-row">
                <span class="st-row-label">{{ curContact ? curContact.name : 'TA' }}发出</span>
                <span class="st-row-val">{{ stat.invGame.ta }} 次</span>
              </div>
            </div>
            <div class="st-card">
              <div class="st-sec st-sec-icon"><AppIcon name="film" :size="16" color="var(--accent)" />观影邀请</div>
              <div class="st-row">
                <span class="st-row-label">我发出</span>
                <span class="st-row-val">{{ stat.invCinema.me }} 次</span>
              </div>
              <div class="st-row">
                <span class="st-row-label">{{ curContact ? curContact.name : 'TA' }}发出</span>
                <span class="st-row-val">{{ stat.invCinema.ta }} 次</span>
              </div>
            </div>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useContactsStore } from '@/stores/contacts'
import * as api from '@/api/chat'

/* 页签定义 */
const TABS = [
  { key: 'days', name: '统计', icon: 'chart' },
  { key: 'fav', name: '消息收藏', icon: 'star' },
  { key: 'q', name: '提问', icon: 'question' },
  { key: 'rp', name: '红包', icon: 'redpacket' },
  { key: 'inv', name: '邀请', icon: 'game' }
]

const LAST_CID_KEY = 'stats_last_contact'
const LAST_TAB_KEY = 'stats_last_tab'

const loading = ref(true)
const msgs = ref([])
const favorites = ref([])
const curCid = ref(null)
const curTab = ref(LAST_TAB_KEY)
const contactOpen = ref(false)

const contactsStore = useContactsStore()
const contacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const curContact = computed(
  () => contacts.value.find((c) => String(c.id) === String(curCid.value)) || contacts.value[0] || null
)

/* ── 数据加载：切联系人重取全量消息；收藏一次取全后本地过滤 ── */
async function load() {
  loading.value = true
  try {
    msgs.value = curCid.value == null ? [] : ((await api.getAllMessages(curCid.value)) || [])
    if (!favorites.value.length) {
      const res = await api.getFavorites()
      favorites.value = res.favorites || res || []
    }
  } catch (e) {
    msgs.value = []
  } finally {
    loading.value = false
  }
}

watch(curCid, (cid) => {
  if (cid != null) localStorage.setItem(LAST_CID_KEY, String(cid))
  load()
})
watch(curTab, (t) => localStorage.setItem(LAST_TAB_KEY, t))

function pickContact(c) {
  curCid.value = c.id
  contactOpen.value = false
}
function onDocClick(e) {
  if (!e.target.closest('.st-select')) contactOpen.value = false
}

/* ── 统计计算（全部由全量消息派生） ── */
function parseJSON(s) {
  try { return JSON.parse(s || '{}') } catch (e) { return {} }
}
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const valid = computed(() => msgs.value.filter((m) => !m.recalled))
const total = computed(() => valid.value.length)

const stat = computed(() => {
  const list = valid.value
  const out = {
    days: 0, firstAt: 0, lastAt: 0, chars: 0, favs: 0,
    meCount: 0, taCount: 0,
    bestHour: '—', bestWeekday: '—', avgDaily: 0, streak: 0, maxDay: 0,
    rpMe: { count: 0, sum: 0 }, rpTa: { count: 0, sum: 0 },
    invGame: { me: 0, ta: 0 }, invCinema: { me: 0, ta: 0 }
  }
  if (!list.length) return out

  /* 首末消息按时间戳取（不依赖 id 序） */
  const times = list.map((m) => Number(m.created_at) || 0).filter(Boolean)
  out.firstAt = times.length ? Math.min(...times) : 0
  out.lastAt = times.length ? Math.max(...times) : 0
  out.days = Math.max(1, Math.floor((Date.now() - out.firstAt * 1000) / 86400000) + 1)
  out.chars = list.reduce((s, m) => s + (m.content_type === 'text' && m.text ? String(m.text).length : 0), 0)
  out.favs = favorites.value.filter((f) => String(f.contact_id) === String(curCid.value)).length

  /* 消息比例 */
  for (const m of list) (m.sender === 'me' ? out.meCount++ : out.taCount++)

  /* 时段 / 星期 / 每日分布 */
  const hourHist = new Array(24).fill(0)
  const wdHist = new Array(7).fill(0)
  const dayMap = new Map() // 本地日 serial -> 条数
  for (const m of list) {
    const d = new Date(m.created_at * 1000)
    hourHist[d.getHours()]++
    wdHist[d.getDay()]++
    const serial = Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000)
    dayMap.set(serial, (dayMap.get(serial) || 0) + 1)
  }
  const argmax = (arr) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0)
  out.bestHour = `${argmax(hourHist)}:00 - ${argmax(hourHist) + 1}:00`
  out.bestWeekday = WEEKDAYS[argmax(wdHist)]

  const dayArr = [...dayMap.values()]
  const nDays = dayArr.length
  out.avgDaily = nDays ? Math.round(total.value / nDays) : 0
  out.maxDay = nDays ? Math.max(...dayArr) : 0
  /* 最长连续聊天：本地日 serial 排序后找最长 +1 连续段 */
  const serials = [...dayMap.keys()].sort((a, b) => a - b)
  let cur = 1, best = serials.length ? 1 : 0
  for (let i = 1; i < serials.length; i++) {
    if (serials[i] === serials[i - 1] + 1) { cur++; best = Math.max(best, cur) }
    else cur = 1
  }
  out.streak = best

  /* 红包：content_type='redpacket'，text JSON { amount } */
  for (const m of list) {
    if (m.content_type !== 'redpacket') continue
    const amt = Number(parseJSON(m.text).amount) || 0
    if (m.sender === 'me') { out.rpMe.count++; out.rpMe.sum += amt }
    else { out.rpTa.count++; out.rpTa.sum += amt }
  }

  /* 邀请：game_invite / cinema_invite，sender 即发起方 */
  for (const m of list) {
    if (m.content_type === 'game_invite') (m.sender === 'me' ? out.invGame.me++ : out.invGame.ta++)
    else if (m.content_type === 'cinema_invite') (m.sender === 'me' ? out.invCinema.me++ : out.invCinema.ta++)
  }
  return out
})

const pctMe = computed(() => (total.value ? Math.round((stat.value.meCount / total.value) * 100) : 0))
const pctTa = computed(() => (total.value ? 100 - pctMe.value : 0))

/* 收藏（当前联系人） */
const curFavs = computed(() =>
  favorites.value.filter((f) => String(f.contact_id) === String(curCid.value))
)

/* 提问列表 */
const questions = computed(() =>
  valid.value
    .filter((m) => m.content_type === 'question')
    .map((m) => ({ ...parseJSON(m.text), sender: m.sender, time: m.created_at }))
    .filter((q) => q.question)
    .reverse()
)
function qLabel(t) {
  return t === 'single' ? '提问 · 单选' : t === 'multi' ? '提问 · 多选' : '提问 · 问答'
}

/* ── 格式化（兼容秒级消息时间戳与毫秒级信件收藏时间戳） ── */
function pad(n) { return String(n).padStart(2, '0') }
function toMs(sec) {
  const n = Number(sec) || 0
  return n > 1e12 ? n : n * 1000
}
function fmtFull(sec) {
  if (!sec) return '—'
  const d = new Date(toMs(sec))
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtDate(sec) {
  if (!sec) return '—'
  const d = new Date(toMs(sec))
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}
function fmtTime(sec) {
  if (!sec) return '—'
  const d = new Date(toMs(sec))
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmtMoney(n) {
  return String(Math.round(n * 100) / 100)
}

onMounted(async () => {
  document.addEventListener('click', onDocClick)
  const saved = localStorage.getItem(LAST_CID_KEY)
  const init = contacts.value.find((c) => String(c.id) === saved) || contacts.value[0]
  curCid.value = init ? init.id : null
  if (!curTab.value || !TABS.some((t) => t.key === curTab.value)) curTab.value = 'days'
  await load()
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<style scoped>
.stats-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-screen);
}
/* 内容区独立滚动 */
.sv-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 24px;
}
.sv-loading, .sv-empty { padding: 60px 20px; text-align: center; color: var(--text-soft); font-size: 14px; }
.sv-empty-emoji { font-size: 40px; margin-bottom: 12px; }
.sv-empty-title { font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.sv-empty-sub { font-size: 13px; line-height: 1.5; max-width: 260px; margin: 0 auto; }

/* 联系人切换（与心情页同款） */
.st-select { position: relative; }
.st-select-btn {
  display: flex; align-items: center; gap: 3px; padding: 5px 6px;
  border: none; border-radius: 10px; background: transparent;
}
.st-select-btn:active { background: var(--bg-soft); }
.st-select-pop {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 30;
  min-width: 150px;
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14); padding: 6px; max-height: 260px; overflow-y: auto;
}
.st-select-opt {
  width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 10px;
  border: none; background: transparent; border-radius: 8px; font-size: 14px; color: var(--text);
}
.st-select-opt:hover { background: var(--bg-soft); }
.st-select-empty { padding: 12px; text-align: center; font-size: 12px; color: var(--text-soft); }
.st-select-name { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 页签（胶囊行，可横向滑动） */
.st-tabs {
  display: flex; gap: 8px; padding: 8px 12px 10px;
  overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex: 0 0 auto;
}
.st-tabs::-webkit-scrollbar { display: none; }
.st-tab {
  flex: 0 0 auto;
  display: inline-flex; align-items: center; gap: 5px;
  border: 1px solid var(--border); background: var(--bg-screen);
  color: var(--text-soft); font-size: 13px;
  padding: 7px 14px; border-radius: 999px;
}
.st-tab.on { background: var(--text); color: var(--bg-screen); border-color: var(--text); font-weight: 600; }

/* 大数字（相处天数 / 累计提问） */
.st-hero { text-align: center; padding: 26px 0 18px; }
.st-hero-sm { padding: 18px 0 14px; }
.st-hero-num { font-size: 56px; font-weight: 700; color: var(--text); line-height: 1.1; }
.st-hero-label { margin-top: 6px; font-size: 13px; color: var(--text-soft); }

/* 卡片与行 */
.st-card {
  margin: 0 12px 12px;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 4px 14px;
}
.st-sec { font-size: 14px; font-weight: 600; color: var(--text); padding: 10px 0 4px; }
.st-sec-icon { display: flex; align-items: center; gap: 6px; }
.st-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--border);
}
.st-row:last-child { border-bottom: none; }
.st-row-label { font-size: 14px; color: var(--text-soft); flex: 0 0 auto; }
.st-row-val { font-size: 15px; font-weight: 600; color: var(--text); text-align: right; }

/* 总消息数大卡 */
.st-total { text-align: center; padding: 22px 14px 18px; }
.st-total-num { font-size: 44px; font-weight: 700; color: #d4a94e; line-height: 1.1; font-variant-numeric: tabular-nums; }
.st-total-label { margin-top: 6px; font-size: 13px; color: var(--text-soft); }

/* 双栏小卡 */
.st-pair {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  margin: 0 12px 12px;
}
.st-pair .st-card { margin: 0; }
.st-mini { padding: 14px 12px 12px; text-align: center; }
.st-mini-ico { padding-top: 16px; }
.st-mini-num {
  font-size: 26px; font-weight: 700; color: var(--text); line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.st-mini-sub { margin-top: 2px; font-size: 12px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.st-mini-label { margin-top: 6px; font-size: 12px; color: var(--text-soft); }
.st-mini-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: #8fbf6f; margin-bottom: 8px;
}
.st-mini-badge-hot { background: #e0758a; }

/* 红包卡 */
.st-rp-card { padding: 12px 14px; }
.st-rp-head { display: flex; align-items: center; gap: 7px; }
.st-rp-title { font-size: 14px; font-weight: 600; color: var(--text); flex: 1; }
.st-rp-badge { font-size: 12px; color: var(--text-soft); background: var(--bg-soft); border-radius: 999px; padding: 2px 9px; }
.st-rp-amount {
  margin-top: 10px;
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-soft); border-radius: 10px; padding: 10px 12px;
}
.st-rp-tag { font-size: 12px; color: var(--text-soft); border: 1px solid var(--border); border-radius: 8px; padding: 3px 8px; background: var(--bg-screen); }
.st-rp-num { flex: 1; font-size: 20px; font-weight: 700; color: var(--text); }
.st-rp-times { font-size: 12px; color: var(--text-soft); }

/* 收藏卡片（头像 + 昵称 + 时间 + 星标） */
.st-favs { display: flex; flex-direction: column; gap: 10px; margin: 0 12px; }
.st-fav-card { display: flex; align-items: flex-start; gap: 10px; padding: 12px; }
.st-fav-avatar { flex: 0 0 auto; }
.st-fav-main { flex: 1; min-width: 0; }
.st-fav-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.st-fav-name { font-size: 13px; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-fav-time { flex: 0 0 auto; font-size: 11px; color: var(--text-soft); }
.st-fav-text { font-size: 14px; color: var(--text); line-height: 1.55; word-break: break-word; white-space: pre-wrap; }
.st-fav-img { max-width: 180px; max-height: 180px; border-radius: 8px; display: block; }
.st-fav-star { flex: 0 0 auto; margin-top: 2px; }

/* 提问卡片 */
.st-q { display: flex; flex-direction: column; gap: 6px; }
.st-q-tag {
  align-self: flex-start;
  font-size: 11px; font-weight: 700;
  color: #d99a3d; background: #fdf6ea;
  border-radius: 999px; padding: 2px 8px;
}
.st-q-text { font-size: 15px; font-weight: 600; color: var(--text); line-height: 1.5; word-break: break-word; }
.st-q-opts { display: flex; flex-direction: column; gap: 3px; }
.st-q-opt { font-size: 13px; color: var(--text-soft); line-height: 1.5; }
</style>
