import { defineStore } from 'pinia'
import * as api from '@/api/cinema'

/* 一起观影状态：
 *  - active：{inviteId, contactId, contactName, contactAvatar, myAvatar, film...} 我接受的 TA 的邀请（播放器自动打开）
 *  - watching：{inviteId, contactId, ...} 我发出的邀请被 TA 接受，正在陪看
 *  - pendingOut：我发出待接受的邀请 id（播放器顶栏显示"等待接受"）
 * SSE 事件 cinema_together 驱动状态变化，CinemaView / MessageBubble 消费。 */
export const useCinemaStore = defineStore('cinema', {
  state: () => ({
    active: null,
    watching: null,
    pendingOut: null,
    /* 我接受了 TA 的观影邀请（聊天卡片点「一起看」后）：同样解锁聊天 */
    myAccepted: null,
    /* TA 邀我待处理（SSE incoming）：{inviteId, contactId, film...}，聊天卡片也会渲染，
       这里只做"有新邀请"的提示用途 */
    incoming: null,
    /* TA 拒绝了我的观影邀请：{contactId, contactName, at}，播放器状态条显示「对方拒绝观影」 */
    rejected: null,
    /* 播放器是否打开中：打开时 SSE 消息弹窗不再从屏幕顶部弹出
       （白色消息弹条会盖住视频，消息在播放器聊天室里实时可见） */
    playerOpen: false
  }),
  actions: {
    /* SSE 统一入口：分发 TA 邀我 / TA 响应了我的邀请 */
    onCinemaSSE(data) {
      const t = data && data.type
      if (t === 'incoming') this.onIncoming(data)
      else if (t === 'accepted' || t === 'rejected') this.onContactResponded(data)
      else if (t === 'cancelled') this.clearPendingOut(data.invite && data.invite.id)
      else if (t === 'ended') this.clearWatching(data.invite && data.invite.id)
    },
    /* 我邀请 TA → 记 pendingOut（同时清掉上一次的拒绝提示） */
    onInviteSent(inviteId, contactId, film) {
      this.pendingOut = { inviteId, contactId, film }
      this.rejected = null
    },
    /* SSE：TA 对我的邀请做出响应 */
    onContactResponded(data) {
      const inv = data.invite || {}
      const accepted = data.type === 'accepted'
      if (this.pendingOut && this.pendingOut.inviteId === inv.id) {
        if (accepted) {
          this.watching = {
            inviteId: inv.id,
            contactId: inv.contact_id,
            contactName: inv.contact_name || '',
            contactAvatar: inv.contact_avatar || '',
            myAvatar: inv.my_avatar || '',
            isGroup: !!inv.is_group,
            groupMembers: inv.group_members || [],
            film: {
              title: inv.film_title,
              url: inv.film_url,
              playSrc: inv.play_src,
              playKind: inv.play_kind
            }
          }
          /* 已进入陪看：清掉待接受状态，避免结束观影后还显示「等待对方接受邀请」 */
          this.pendingOut = null
          this.rejected = null
        } else {
          /* TA 拒绝：记下是谁拒的，播放器状态条显示「对方拒绝观影」 */
          this.pendingOut = null
          this.rejected = {
            contactId: inv.contact_id,
            contactName: inv.contact_name || '',
            at: Date.now()
          }
        }
      }
    },
    /* SSE：TA 邀我 */
    onIncoming(data) {
      const inv = data.invite || {}
      this.incoming = {
        inviteId: inv.id,
        contactId: inv.contact_id,
        contactName: inv.contact_name || '',
        film: {
          title: inv.film_title,
          url: inv.film_url,
          playSrc: inv.play_src,
          playKind: inv.play_kind
        }
      }
    },
    /* 我在聊天卡片点"一起看" → 接受 TA 的邀请，返回影片信息供前端跳转播放 */
    async accept(inviteId) {
      const r = await api.respondCinemaInvite(inviteId, true)
      if (r && r.ok && r.film && r.film.url) {
        this.active = {
          inviteId: Number(inviteId),
          contactId: r.contactId,
          film: r.film
        }
        /* 我接受后同样进入"陪看中"：计时条、双人头像、结束按钮统一 */
        this.watching = {
          inviteId: Number(inviteId),
          contactId: r.contactId,
          contactName: r.contactName || '',
          contactAvatar: r.contactAvatar || '',
          myAvatar: r.myAvatar || '',
          isGroup: !!r.isGroup,
          groupMembers: r.groupMembers || [],
          film: r.film
        }
        /* 记录"我已接受"：播放器据此解锁聊天（含群） */
        this.myAccepted = {
          inviteId: Number(inviteId),
          contactId: r.contactId,
          isGroup: !!r.isGroup,
          groupMembers: r.groupMembers || []
        }
        this.incoming = null
      }
      return r
    },
    async reject(inviteId) {
      const r = await api.respondCinemaInvite(inviteId, false)
      if (this.incoming && this.incoming.inviteId === Number(inviteId)) this.incoming = null
      return r
    },
    /* 前端消费完 active（已打开播放器）后清除，避免重复触发 */
    consumeActive() {
      this.active = null
    },
    /* 结束一起观影 */
    async end(inviteId) {
      await api.endCinema(inviteId)
      this.watching = null
      /* 结束即回到未陪看状态：清掉对应的待接受 / 已接受标记，
         避免结束后还显示「等待对方接受邀请」或聊天输入框仍处于解锁态 */
      if (this.pendingOut && this.pendingOut.inviteId === inviteId) this.pendingOut = null
      if (this.myAccepted && this.myAccepted.inviteId === inviteId) this.myAccepted = null
    },
    clearWatching(inviteId) {
      if (!inviteId || (this.watching && this.watching.inviteId === inviteId)) {
        this.watching = null
        if (this.myAccepted && this.myAccepted.inviteId === inviteId) this.myAccepted = null
      }
    },
    clearPendingOut(inviteId) {
      if (!inviteId || (this.pendingOut && this.pendingOut.inviteId === inviteId)) this.pendingOut = null
    },
    /* 播放器打开 / 关闭：供全局消息弹窗判断是否要让位 */
    setPlayerOpen(v) {
      this.playerOpen = !!v
    }
  }
})
