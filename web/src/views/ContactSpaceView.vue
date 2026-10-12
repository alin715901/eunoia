<template>
  <div class="space-view">
    <AppHeader :title="contact?.name || '联系人空间'" back />

    <div class="sp-scroll">

    <div v-if="!contact" class="sp-empty">联系人不存在或已删除。</div>

    <div v-else class="sp-body">
      <!-- 名片 -->
      <div class="sp-hero panel">
        <AppAvatar :name="contact.name" :avatar="contact.avatar" :size="60" />
        <div class="sp-hero-meta">
          <div class="sp-name">
            {{ contact.name }}
            <span v-if="contact.kind === 'group'" class="sp-kind">群聊</span>
          </div>
          <div class="sp-sign">{{ sign || '这个人还没写签名' }}</div>
        </div>
      </div>

      <!-- 快捷入口 -->
      <div class="sp-grid">
        <button class="sp-tile" @click="go(`/contacts/${id}/chat`)">
          <span class="tile-ico" style="background: color-mix(in srgb, var(--accent) 12%, #fff); color: var(--accent)">
            <AppIcon name="chat" :size="19" />
          </span>
          <span class="tile-t">聊天</span>
        </button>
        <button v-if="contact.kind !== 'group'" class="sp-tile" @click="go(`/contacts/${id}/cards`)">
          <span class="tile-ico" style="background: #eef4ff; color: #5a86d6">
            <AppIcon name="cards" :size="19" />
          </span>
          <span class="tile-t">专属字卡</span>
          <span class="tile-n">{{ cardStat.groups }} 组 / {{ cardStat.cards }} 张</span>
        </button>
        <button class="sp-tile" @click="goMoments">
          <span class="tile-ico" style="background: #fdeef3; color: #d46a86">
            <AppIcon name="moments" :size="19" />
          </span>
          <span class="tile-t">朋友圈</span>
          <span class="tile-n">{{ moments.length }} 条可见</span>
        </button>
        <button class="sp-tile" @click="go(`/contacts/${id}/mailbox`)">
          <span class="tile-ico" style="background: #fff5e6; color: #d99b3f">
            <AppIcon name="letter" :size="19" />
          </span>
          <span class="tile-t">信箱</span>
          <span class="tile-n">
            {{ letterStat.total }} 封<template v-if="letterStat.unread"> · {{ letterStat.unread }} 未读</template>
          </span>
        </button>
      </div>

      <!-- TA 的规则摘要 -->
      <div class="panel sp-sec">
        <div class="sp-sec-head">
          <span class="sp-sec-title">TA 的回复规则</span>
          <button class="sp-link" @click="go(`/contacts/${id}/settings`)">去修改</button>
        </div>
        <div v-if="rules" class="rule-grid">
          <div class="rule-cell">
            <span class="rc-k">回复条数</span>
            <span class="rc-v">{{ rules.reply_min }} ~ {{ rules.reply_max }} 条</span>
          </div>
          <div class="rule-cell">
            <span class="rc-k">回复间隔</span>
            <span class="rc-v">{{ rules.reply_delay_min }} ~ {{ rules.reply_delay_max }} 分钟</span>
          </div>
          <div class="rule-cell">
            <span class="rc-k">通用库占比</span>
            <span class="rc-v">{{ rules.gen_ratio }}%</span>
          </div>
          <div class="rule-cell">
            <span class="rc-k">主动消息</span>
            <span class="rc-v">{{ rules.proactive_enabled ? `每 ${rules.proactive_interval_min} 分钟 · ${rules.proactive_count} 条` : '已关闭' }}</span>
          </div>
        </div>
        <div v-else class="sp-none">还没有读取到规则</div>
        <p class="rule-tip">
          抽卡时按「专属库 + 通用库」两层混抽，通用库占比 {{ rules?.gen_ratio ?? 70 }}%
        </p>
      </div>

      <!-- 最近动态 -->
      <div class="panel sp-sec">
        <div class="sp-sec-head">
          <span class="sp-sec-title">发给 TA 的动态</span>
          <button class="sp-link" @click="goMoments">全部</button>
        </div>
        <div v-if="moments.length" class="mo-list">
          <div v-for="m in moments.slice(0, 3)" :key="m.id" class="mo-item">
            <span class="mo-txt">{{ m.text || '[图片动态]' }}</span>
            <span class="mo-time">{{ fmt(m.created_at) }}</span>
          </div>
        </div>
        <div v-else class="sp-none">还没有发给 TA 的动态</div>
      </div>

      <!-- 信箱摘要 -->
      <div class="panel sp-sec">
        <div class="sp-sec-head">
          <span class="sp-sec-title">信箱</span>
          <button class="sp-link" @click="go(`/contacts/${id}/mailbox`)">进入</button>
        </div>
        <div v-if="letterStat.total" class="lt-sum">
          共 {{ letterStat.total }} 封<template v-if="letterStat.unread">，{{ letterStat.unread }} 封未读</template>
          <div v-if="letterStat.lastOpening" class="lt-last">最近：{{ letterStat.lastOpening }}</div>
        </div>
        <div v-else class="sp-none">信箱还是空的</div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useContactsStore } from '@/stores/contacts'
import { useCardsStore } from '@/stores/cards'
import { getContactSettings, getDesktop } from '@/api/contacts'
import { getMoments, getLettersHub } from '@/api/content'

defineOptions({ name: 'ContactSpaceView' })

const props = defineProps({ id: { type: [String, Number], required: true } })

const router = useRouter()
const contactsStore = useContactsStore()
const cardsStore = useCardsStore()

const contact = computed(() => contactsStore.getById(props.id))
const sign = ref('')
const rules = ref(null)
const moments = ref([])
const letterStat = ref({ total: 0, unread: 0, lastOpening: '' })

const cardStat = computed(() => cardsStore.statOf('contact', props.id))

function go(path) {
  router.push(path)
}

/*朋友圈：带上联系人参数，进去就自动切到"查看 TA" */
function goMoments() {
  router.push({ path: '/moments', query: { contact: String(props.id) } })
}

function fmt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

onMounted(async () => {
  if (!contact.value) await contactsStore.refreshOne(props.id).catch(() => {})
  if (!contact.value) return

  cardsStore.loadStats().catch(() => {})
  getDesktop(props.id).then((d) => { sign.value = d?.sign || '' }).catch(() => {})
  getContactSettings(props.id).then((s) => { rules.value = s || null }).catch(() => {})

  /* 以 TA 的身份看发给 TA 的动态 */
  getMoments(props.id, Number(props.id), 'contact')
    .then((l) => { moments.value = l || [] })
    .catch(() => {})

  getLettersHub()
    .then((hub) => {
      const row = (hub || []).find((r) => String(r.id) === String(props.id))
      if (row) letterStat.value = row
    })
    .catch(() => {})
})
</script>

<style scoped>
/* 头部固定铺满全宽，内容区独立滚动（与其他页面 AppHeader 结构一致） */
.space-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 14px; -webkit-overflow-scrolling: touch; }
.sp-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 60px 20px; }

.sp-hero { display: flex; align-items: center; gap: 12px; padding: 16px; margin-bottom: 14px; }
.sp-hero-meta { flex: 1; min-width: 0; }
.sp-name { font-size: 18px; font-weight: 700; color: var(--text); display: flex; align-items: center; gap: 6px; }
.sp-kind { font-size: 11px; background: var(--accent); color: #fff; border-radius: 4px; padding: 1px 5px; font-weight: 400; }
.sp-sign { font-size: 12px; color: var(--text-soft); margin-top: 5px; line-height: 1.6; }

.sp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
.sp-tile {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 14px; padding: 11px 4px 9px;
  font-family: var(--font-serif); transition: all .2s ease;
}
.sp-tile:active { transform: scale(0.97); }
.tile-ico { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.tile-t { font-size: 12px; font-weight: 600; color: var(--text); }
.tile-n { font-size: 10px; color: var(--text-soft); }

.sp-sec { padding: 14px; margin-bottom: 12px; }
.sp-sec-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.sp-sec-title { font-size: 14px; font-weight: 700; color: var(--text); }
.sp-link { border: none; background: transparent; color: var(--accent); font-size: 12px; font-weight: 600; padding: 0; }
.sp-none { font-size: 12px; color: var(--text-soft); padding: 6px 0; }

.rule-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rule-cell { background: var(--bg-soft); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.rc-k { font-size: 11px; color: var(--text-soft); }
.rc-v { font-size: 13px; font-weight: 600; color: var(--text); }
.rule-tip { margin: 10px 0 0; font-size: 11px; color: var(--text-soft); line-height: 1.6; }

.ms-list { display: flex; flex-direction: column; gap: 8px; }
.ms-item { display: flex; align-items: center; gap: 8px; }
.ms-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ms-name { font-size: 13px; font-weight: 600; color: var(--text); }
.ms-sum { font-size: 11px; color: var(--text-soft); }
.ms-own, .ms-inh { font-size: 10px; border-radius: 4px; padding: 1px 5px; flex-shrink: 0; }
.ms-own { background: var(--accent); color: #fff; }
.ms-inh { border: 1px solid var(--border); color: var(--text-soft); }

.mo-list { display: flex; flex-direction: column; gap: 8px; }
.mo-item { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.mo-txt {
  flex: 1; min-width: 0; font-size: 13px; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mo-time { font-size: 11px; color: var(--text-soft); flex-shrink: 0; }
.lt-sum { font-size: 13px; color: var(--text); line-height: 1.7; }
.lt-last { font-size: 12px; color: var(--text-soft); margin-top: 4px; }
</style>