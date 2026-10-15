import { defineStore } from 'pinia'
import { getContactSettings } from '@/api/contacts'
import { sendCallRecord } from '@/api/chat'
import { useChatStore } from './chat'
import { useNotificationsStore } from './notifications'
import router from '@/router'

/* 全局通话状态：独立于路由，挂在任何页面都会保持（挂断前的悬浮窗跨页面可见、可拖动）。
   状态机：ringing(我方呼叫,等待接听) / incoming(对方来电,可接听拒绝) / connected(通话中)。
   对方主动来电：
     · 正在该联系人的聊天页 → 直接弹出通话界面（接听/拒绝按钮）
     · 在其他页面 → 消息通知弹窗「×××来电」，点击通知跳转该联系人聊天页并弹出通话界面 */
export const useCallStore = defineStore('call', {
  state: () => ({
    active: false,
    phase: null, // 'ringing' | 'incoming' | 'connected'
    minimized: false,
    seconds: 0,
    connectStart: 0, // 接通时刻（ms），用于精确计算通话时长，避免 1 秒粒度导致"已取消"
    contactId: null,
    name: '',
    avatar: '',
    avatarShape: 'circle',
    avatarRadius: 12,
    hangupProb: 10,
    // 谁发起的通话：'outgoing'=我拨打（气泡在我这边）/ 'incoming'=对方来电（气泡在对方那边）
    direction: 'outgoing',
    // 群聊通话：isGroup=true 时不显示群头像，改为显示陆续加入的成员（头像+备注）
    isGroup: false,
    groupJoined: [], // 已加入的成员 [{name, avatar}]
    // 群聊通话的全部成员花名册（含尚未加入的），用于「继续加入 / 退出」动态调度
    groupMembers: [], // [{name, avatar}]
    // 群聊通话里的「我」：等待与通话中都和小伙伴一起显示（头像+我的备注）
    selfPart: null, // {name, avatar}
    pending: null, // 暂存的来电邀请 {contactId, name, avatar, groupId, memberName, isGroup}（非聊天页时先弹通知）
    // 发起人：'me'=我拨打 / 'contact'=对方（单人）来电 / 'member'=群聊成员来电。
    // 只有 initiator==='me' 才能挂断/结束，被邀请方（含我被成员/对方邀请时）中途不能退出
    initiator: 'me',
    initiatorMemberId: null,
    initiatorName: '' // 群聊来电：发起成员的名字（用于来电提示「××邀请群聊通话」）
  }),
  getters: {
    isActive: (s) => s.active,
    isConnected: (s) => s.phase === 'connected'
  },
  actions: {
    /* 我方主动呼叫：进入「等待对方接听…」，按设置的概率决定对方接听/拒绝。
       群聊通话（members 传入成员列表）：不显示群头像，成员陆续加入（可不加入），
       状态显示「等待成员加入…」，首位成员加入即接通 */
    async startOutgoing({ contactId, name, avatar, avatarShape, avatarRadius, members, self }) {
      if (this.active) return
      this.contactId = contactId
      this.name = name || '对方'
      this.avatar = avatar || ''
      this.avatarShape = avatarShape || 'circle'
      this.avatarRadius = avatarRadius ?? 12
      this.phase = 'ringing'
      this.seconds = 0
      this.connectStart = 0
      this.minimized = false
      this.active = true
      this.direction = 'outgoing'
      this.initiator = 'me'
      this.initiatorMemberId = null
      this.isGroup = !!(members && members.length)
      this.groupJoined = []
      /* 群聊通话：我也算通话里的一员 —— 等待成员加入时和通话中都显示我的头像与备注 */
      /* 群聊成员花名册：保存全部成员（含尚未加入的），供通话中「继续加入 / 退出」动态调度 */
      this.groupMembers = (members || []).map((m) => ({ name: m.name, avatar: m.avatar || '' }))
      this.selfPart = this.isGroup ? { name: self?.name || '我', avatar: self?.avatar || '' } : null

      // 拉取通话设置的概率
      let answerProb = 85
      let rejectProb = 10
      try {
        const s = await getContactSettings(contactId)
        answerProb = Number(s.call_answer_prob ?? 85)
        rejectProb = Number(s.call_reject_prob ?? 10)
        this.hangupProb = Number(s.call_hangup_prob ?? 10)
      } catch (e) { /* ignore */ }

      if (this.isGroup) {
        /* 群聊：每位成员独立掷骰（55% 愿意接），愿意的人在 1.5~9 秒内陆续加入；
           12 秒过去一个人都没来 → 自动取消（记一条未接听） */
        clearJoinTimers()
        for (const m of members) {
          if (!m || !m.name) continue
          if (Math.random() < 0.55) {
            const delay = 1500 + Math.random() * 7500
            joinTimers.push(setTimeout(() => this.joinMember(m), delay))
          }
        }
        clearTimeout(noJoinTimer)
        noJoinTimer = setTimeout(() => {
          if (this.active && this.isGroup && this.phase === 'ringing' && !this.groupJoined.length) {
            this.end('missed')
          }
        }, 12000)
        return
      }

      const ringTime = 3000 + Math.random() * 2000 // 3~5 秒振铃
      decideTimer = setTimeout(() => {
        const r = Math.random() * 100
        if (r < answerProb) this.connect()
        else this.end('rejected')
      }, ringTime)
    },

    /* 群聊通话：一位成员加入（接通后仍可有新成员继续加入） */
    joinMember(m) {
      if (!this.active || !this.isGroup || this.phase === 'incoming') return
      if (!m || !m.name || this.groupJoined.some((x) => x.name === m.name)) return
      this.groupJoined.push({ name: m.name, avatar: m.avatar || '' })
      // 第一位成员加入 → 接通开始计时
      if (this.phase === 'ringing') this.connect()
    },

    /* 群聊通话：一位成员退出（接通后也可退出；仅移除头像，不影响其他人） */
    leaveMember(name) {
      if (!this.active || !this.isGroup || !name) return
      const idx = this.groupJoined.findIndex((x) => x.name === name)
      if (idx >= 0) this.groupJoined.splice(idx, 1)
    },

    /* 对方/群聊成员主动来电（SSE call_invite 触发）：按当前页面分流。
       groupId/memberName/isGroup 存在时表示群聊来电（由某成员发起，会话落在群聊） */
    startIncoming({ groupId, contactId, name, avatar, memberName, isGroup }) {
      if (this.active || this.pending) return
      const sessionId = isGroup ? groupId : contactId
      const r = router.currentRoute.value
      const inChat = !!(r && r.name === 'contact-chat' && String(r.params.id) === String(sessionId))
      const invite = { groupId, contactId, name, avatar, memberName, isGroup }
      if (inChat) {
        // 就在该会话的聊天页：直接弹出通话界面（接听/拒绝）
        this.activateIncoming(invite)
      } else {
        // 其他页面：先弹通知，点击后跳转该聊天页并弹出通话界面
        this.pending = invite
        const notifications = useNotificationsStore()
        notifications.pushToast({
          title: isGroup ? `${memberName || name || '群聊'}邀请群聊通话` : `${name || '对方'}来电`,
          text: isGroup ? '邀请你群聊语音通话，点击查看' : '邀请你语音通话，点击查看',
          avatar,
          type: 'message',
          duration: 10000,
          route: `/contacts/${sessionId}/chat`
        })
      }
      // 15 秒没人接也没拒：来电作废，落库「未接听」
      clearTimeout(inviteTimer)
      inviteTimer = setTimeout(() => { this.missIncoming(invite) }, 15000)
    },

    /* 来电超时未响应：取消来电，并记一条「未接听」的通话记录 */
    missIncoming(invite) {
      clearTimeout(inviteTimer)
      inviteTimer = null
      const { groupId, contactId, name, avatar, memberName, isGroup } = invite || {}
      const sessionId = isGroup ? groupId : contactId
      this.pending = null
      // 兜底：如果已经接通或结束，不再写未接听记录
      if (!this.active || this.phase === 'connected') return
      const stillRinging =
        this.active && this.phase === 'incoming' && String(this.contactId) === String(sessionId)
      if (stillRinging) {
        // 通话界面还开着 → 走正常结束流程落库（对方/成员来电，气泡在他/该成员那边）
        this.end('missed')
        return
      }
      // 只是通知没人点：静默写一条未接听
      sendCallRecord(sessionId, {
        duration: 0,
        result: 'missed',
        sender: 'contact',
        initiatorMemberId: isGroup ? Number(contactId) : null
      })
        .then((msg) => { useChatStore().push(sessionId, msg) })
        .catch(() => {})
    },

    /* 弹出来电界面（接听/拒绝按钮） */
    activateIncoming(invite) {
      clearTimeout(inviteTimer)
      inviteTimer = null
      this.pending = null
      const { groupId, contactId, name, avatar, memberName, isGroup } = invite || {}
      this.contactId = isGroup ? groupId : contactId
      this.name = isGroup ? (name || '群聊') : (name || '对方')
      this.avatar = avatar || ''
      this.phase = 'incoming'
      this.seconds = 0
      this.connectStart = 0
      this.minimized = false
      this.active = true
      this.direction = 'incoming'
      // 群聊来电由成员发起（initiator='member'）；单人来电由对方发起（initiator='contact'）。
      // 二者都是「我」被邀请，我中途不能挂断/退出
      this.isGroup = !!isGroup
      this.initiator = isGroup ? 'member' : 'contact'
      this.initiatorMemberId = isGroup ? Number(contactId) : null
      this.initiatorName = isGroup ? (memberName || '') : ''
      // 界面弹出后重新开始计时：15 秒不接不拒自动作废为「未接听」
      clearTimeout(inviteTimer)
      inviteTimer = setTimeout(() => { this.missIncoming(invite) }, 15000)
    },

    /* 路由变化（点通知进入该联系人的聊天页）时：弹出暂存的来电界面 */
    checkPending() {
      const p = this.pending
      if (!p) return
      const r = router.currentRoute.value
      if (r && r.name === 'contact-chat' && String(r.params.id) === String(p.contactId)) {
        this.activateIncoming(p)
      }
    },

    /* 接听（仅 incoming 时由用户触发）：进入通话中 */
    answerIncoming() {
      if (this.phase !== 'incoming') return
      this.connect()
    },

    /* 拒绝来电（仅 incoming，用户挂断） */
    declineIncoming() {
      if (this.phase !== 'incoming') return
      this.end('declined')
    },

    /* 接通：进入通话中，启动计时 + 对方挂断调度 */
    connect() {
      // 接听/接通时立即清掉来电超时器，避免 15 秒后被误标为“未接听”
      clearTimeout(inviteTimer)
      inviteTimer = null
      this.phase = 'connected'
      this.seconds = 0
      this.connectStart = Date.now()
      clearInterval(tickTimer)
      clearTimeout(hangupTimer)
      tickTimer = setInterval(() => {
        this.seconds += 1
      }, 1000)
      /* 对方挂断调度：先按「挂断概率」决定这通电话对方会不会挂；
       * 若会，挂断时刻在 [3 秒, 2 小时] 上均匀随机 —— 只接几秒 / 十几秒 /
       * 几分钟 / 几小时都可能挂，各时长概率均等。
       * 不用每秒评估的指数分布：那种分布内存无记忆性，将近一半的通话活不过
       * 1 分钟，体验上就是「经常不到一分钟就挂」 */
      if (Math.random() < this.hangupProb / 100) {
        const minMs = 3 * 1000
        const maxMs = 2 * 60 * 60 * 1000
        const at = minMs + Math.random() * (maxMs - minMs)
        hangupTimer = setTimeout(() => {
          hangupTimer = null
          this.end('hangup_by_them')
        }, at)
      }
      // 群聊：接通后启动「成员继续加入 / 退出」动态调度
      if (this.isGroup) startGroupTick(this)
    },

    /* 我方手动挂断（connected 或 ringing 均可） */
    hangup() {
      if (!this.active) return
      // 已接通（有 connectStart）→ 挂断；振铃中未接通 → 取消
      this.end(this.connectStart ? 'hangup_by_me' : 'cancelled')
    },

    minimize() { this.minimized = true },
    restore() { this.minimized = false },

    /* 结束通话并落库通话记录 */
    async end(reason) {
      clearTimeout(decideTimer)
      clearInterval(tickTimer)
      clearTimeout(hangupTimer)
      clearTimeout(inviteTimer)
      clearJoinTimers()
      decideTimer = null
      tickTimer = null
      hangupTimer = null
      inviteTimer = null
      this.pending = null
      const contactId = this.contactId
      const connected = !!this.connectStart
      // 发起方：对方打来的通话，记录气泡落在对方那边（左侧）
      const byThem = this.direction === 'incoming'
      // 通话时长按接通时刻精确计算（毫秒 → 秒），避免 1 秒粒度导致刚接通就挂断显示"已取消"
      const duration = this.connectStart
        ? Math.max(0, Math.floor((Date.now() - this.connectStart) / 1000))
        : 0
      const resultMap = {
        rejected: 'rejected', // 我打过去，对方拒绝
        declined: 'declined', // 对方打来，我拒绝
        hangup_by_them: 'hangup_by_them', // 通话中对方挂断
        hangup_by_me: connected ? 'answered' : 'cancelled', // 我挂断（已接通=通话时长；未接通=取消）
        cancelled: 'cancelled', // 振铃中我取消
        missed: 'missed' // 对方来电 15 秒无人接听/拒绝
      }
      const result = resultMap[reason] || 'answered'
      // 复位状态（先于网络请求，避免悬浮窗残留）
      this.active = false
      this.phase = null
      this.minimized = false
      this.seconds = 0
      this.connectStart = 0
      this.isGroup = false
      this.groupJoined = []
      this.groupMembers = []
      this.selfPart = null
      this.initiator = 'me'
      this.initiatorMemberId = null
      if (!contactId) return
      try {
        const msg = await sendCallRecord(contactId, {
          duration,
          result,
          sender: byThem ? 'contact' : 'me',
          // 群聊成员发起的来电：气泡归属该成员（author_member_id）
          initiatorMemberId: this.initiator === 'member' ? this.initiatorMemberId : null
        })
        const chat = useChatStore()
        chat.push(contactId, msg)
      } catch (e) { /* ignore */ }
    }
  }
})

/* 计时与决策定时器不进 state（避免无谓响应式开销） */
let decideTimer = null
let tickTimer = null
let hangupTimer = null // 对方挂断的一次性调度器（均匀随机时刻）
let inviteTimer = null
let joinTimers = [] // 群聊：各成员加入的延时器
let noJoinTimer = null // 群聊：12 秒无人加入的看门狗
let groupTick = null // 群聊：接通后「成员继续加入 / 退出」的动态调度
function clearJoinTimers() {
  for (const t of joinTimers) clearTimeout(t)
  joinTimers = []
  clearTimeout(noJoinTimer)
  noJoinTimer = null
  clearGroupTick()
}
function clearGroupTick() {
  clearInterval(groupTick)
  groupTick = null
}
/* 群聊通话中：每隔几秒评估一次 —— 仍有成员没进来则小概率继续加入。
   已加入的成员不自动退出（中途不能退出，保持到发起人结束） */
function startGroupTick(store) {
  clearGroupTick()
  groupTick = setInterval(() => {
    if (!store.active || !store.isGroup || store.phase !== 'connected') {
      clearGroupTick()
      return
    }
    // 还有人没进来 → 小概率再拉一位进来
    const notJoined = store.groupMembers.filter(
      (m) => !store.groupJoined.some((g) => g.name === m.name)
    )
    if (notJoined.length && Math.random() < 0.5) {
      store.joinMember(notJoined[Math.floor(Math.random() * notJoined.length)])
    }
  }, 4500)
}
