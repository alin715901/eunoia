import { useChatStore } from '@/stores/chat'
import { useBadgesStore } from '@/stores/badges'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { useCallStore } from '@/stores/call'
import { useSettingsStore } from '@/stores/settings'
import { useContactSettingsStore } from '@/stores/contactSettings'
import { useChatListStore } from '@/stores/chatList'
import { useCompanionStore } from '@/stores/companion'
import { useMusicStore } from '@/stores/music'
import { useCinemaStore } from '@/stores/cinema'
import { getContactSettings } from '@/api/contacts'
import { notify, notificationPermission } from './useNotification'
import router from '@/router'

let source = null
/* 每个联系人的"延迟已读"定时器：对方正在输入后稍等片刻再变已读，
   避免"发送即已读"太快（仍在对方回复时间内完成过渡） */
const readTimers = {}

/* 通知预览摘要：红包/通话/提问等类型 text 是 JSON 元数据，需转成可读文案，避免弹出原始 JSON */
function previewOf(m) {
  const t = m.content_type
  if (t === 'redpacket') {
    try {
      const meta = JSON.parse(m.text || '{}')
      return m.sender === 'contact' ? `「对方发来一个红包 ¥${meta.amount ?? ''}」` : '[红包]'
    } catch (e) { return '[红包]' }
  }
  if (t === 'call') return '[通话]'
  if (t === 'question') {
    try { const q = JSON.parse(m.text || '{}'); return '[提问] ' + (q.question || '') } catch (e) { return '[提问]' }
  }
  if (t === 'image') return '[图片]'
  if (t === 'sticker') return '[表情包]'
  if (t === 'voice') return '[语音]'
  if (t === 'companion_invite') {
    try { const mm = JSON.parse(m.text || '{}'); return `[陪伴邀请] 一起${mm.name || '陪伴'}` } catch (e) { return '[陪伴邀请]' }
  }
  if (t === 'listen_invite') {
    try { const mm = JSON.parse(m.text || '{}'); return mm.from === 'contact' ? `[一起听歌] 邀请你听《${mm.songTitle || ''}》` : '[一起听歌]' } catch (e) { return '[一起听歌]' }
  }
  if (t === 'cinema_invite') {
    try { const mm = JSON.parse(m.text || '{}'); return mm.from === 'contact' ? `[一起观影] 邀你看《${mm.filmTitle || ''}》` : '[一起观影]' } catch (e) { return '[一起观影]' }
  }
  if (t === 'game_invite') {
    try { const mm = JSON.parse(m.text || '{}'); return mm.from === 'contact' ? `[游戏邀请] 邀你玩${mm.gameName || '小游戏'}` : '[游戏邀请]' } catch (e) { return '[游戏邀请]' }
  }
  if (t === 'poke') return m.text || '拍了拍你'
  return m.text || '（一条卡片消息）'
}

function currentOpenContactId() {
  const r = router.currentRoute.value
  if (r && r.name === 'contact-chat') return String(r.params.id)
  return null
}

function isPageFocused() {
  return typeof document === 'undefined' ? true : document.hasFocus()
}

/* 本地版：没有服务端 SSE，改用 window 自定义事件总线（notification.service 广播）。
 * 垫片暴露与 EventSource 相同的 addEventListener/close 接口，
 * 处理器里继续用 JSON.parse(e.data) 即可，业务代码零改动。 */
function createLocalBus() {
  const listeners = []
  return {
    addEventListener(event, handler) {
      const wrapped = (e) => {
        try {
          handler({ data: JSON.stringify(e.detail ?? {}) })
        } catch (err) { /* ignore */ }
      }
      listeners.push([event, wrapped])
      window.addEventListener(`eunoia:${event}`, wrapped)
    },
    close() {
      for (const [event, wrapped] of listeners) {
        window.removeEventListener(`eunoia:${event}`, wrapped)
      }
      listeners.length = 0
    },
  }
}

export function connect() {
  if (source) return source
  source = createLocalBus()

  // 本地总线立即触发一次 connected（原 SSE 首条事件）
  setTimeout(() => {
    try { window.dispatchEvent(new CustomEvent('eunoia:connected', { detail: {} })) } catch (e) { /* ignore */ }
  }, 0)

  source.addEventListener('typing', (e) => {
    try {
      const { contactId, typing } = JSON.parse(e.data)
      const chat = useChatStore()
      chat.setTyping(contactId, !!typing)
      // 对方开始输入 = 处于回复时间内。但不要立刻标已读（发送即已读太快），
      // 延迟 2~4 秒（模拟"看完消息再回"）后再把我的消息变为已读；
      // 若对方更快发出消息，appendFromSSE 会兜底标已读
      if (typing) {
        clearTimeout(readTimers[contactId])
        readTimers[contactId] = setTimeout(() => {
          chat.markMyRead(contactId)
          delete readTimers[contactId]
        }, 2000 + Math.random() * 2000)
      } else {
        // 对方停止输入：不要取消「延迟已读」定时器。
        // 已读是“对方开始输入后迟早会发生”的事（即便已读不回，后端也会把我的消息标为已读），
        // 让它自然触发即可，否则 read_no_reply 联系人会因为 typing:false 提前清掉定时器而永远停在「已送达」
      }
    } catch (err) {
      /* ignore */
    }
  })

  source.addEventListener('new_messages', (e) => {
    try {
      const { contactId, messages, avatar: sseAvatar, name: sseName } = JSON.parse(e.data)
      const chat = useChatStore()
      chat.appendFromSSE(contactId, messages || [])

      const contacts = useContactsStore()
      const contact = contacts.list.find((c) => String(c.id) === String(contactId))
      const kind = contact?.kind
      const muted = kind === 'group' ? contact?.muted_group : contact?.muted_chat

      const isOpen = currentOpenContactId() === String(contactId)
      const name = contact?.name || '对方'

      if (isOpen) {
        // 正在该会话内接收：直接视为已读，不显示角标、不弹窗
        chat.markRead(contactId).catch(() => {})
      } else if (!muted) {
        // 不在该会话内接收：累加未读角标（列表红点实时更新），并弹窗
        const inc = (messages || []).filter((m) => m.sender === 'contact').length
        if (inc && contact) contact.unread = (Number(contact.unread) || 0) + inc
        // 非当前会话且未免打扰 → 消息弹窗（头像 + 名称 + 内容）
        const notifications = useNotificationsStore()
        const last = (messages || []).slice(-1)[0]
        let title = sseName || name
        // 有效头像：优先后端带出的「同步到聊天」人物卡头像，与聊天界面一致；
        // 否则用联系人的合并头像 chat_avatar（人物卡同步开启时=人物卡头像），再退本体头像
        let avatar = sseAvatar || contact?.chat_avatar || contact?.avatar || ''
        // 群聊：弹窗标题显示群名称（头像仍取实际发言成员，便于识别是谁在说）
        if (kind === 'group' && last?.author_member_id) {
          const mem = contacts.list.find((c) => String(c.id) === String(last.author_member_id))
          title = contact?.name || sseName || name
          if (mem) {
            avatar = sseAvatar || mem.chat_avatar || mem.avatar || ''
          }
        }
        const preview = last ? previewOf(last) : ''
        /* 影院播放器打开中：消息已在播放器聊天室里实时可见，
           不再从屏幕顶部弹消息提示（浅色弹条会盖住视频顶部，即"白带"） */
        if (!useCinemaStore().playerOpen) {
          notifications.pushToast({
            title,
            text: preview,
            avatar,
            type: 'message',
            duration: 4000,
            route: `/contacts/${contactId}/chat`
          })
        }

        // 即时刷新聊天列表该会话的「最后一条内容 + 时间」，避免弹窗已到、列表预览却没同步
        useChatListStore().applyMessage(contactId, last)

        // 页面非聚焦、全局通知开启、未免打扰、且浏览器已授权 → 系统通知
        const settings = useSettingsStore()
        const notifyOn = settings.global?.notifications?.browser !== false
        if (!isPageFocused() && notifyOn && notificationPermission() === 'granted') {
          notify(title, { body: preview, route: `/contacts/${contactId}/chat` })
        }

        // 刷新角标
        const badges = useBadgesStore()
        badges.load().catch(() => {})
      }
    } catch (err) {
      /* ignore */
    }
  })

  source.addEventListener('message_update', (e) => {
    try {
      const { contactId, message } = JSON.parse(e.data)
      const chat = useChatStore()
      chat.updateFromSSE(contactId, message)
      // 撤回等原位更新：同步刷新聊天列表预览（显示「X 撤回了一条消息」，而非「（一条卡片消息）」）
      useChatListStore().applyMessage(contactId, message)
    } catch (err) {
      /* ignore */
    }
  })

  /* 备注变更（我的 / 对方的）：服务端已同步历史引用摘要，
     这里刷新联系人、设置与聊天消息，让聊天顶部、列表行、引用里的名字即时更新，无需手动刷新 */
  source.addEventListener('contact_updated', (e) => {
    try {
      const { contactId } = JSON.parse(e.data)
      if (!contactId) return
      // 联系人名/头像 → 聊天顶部备注、聊天列表行
      useContactsStore().refreshOne(contactId).catch(() => {})
      // 我的备注（my_name）→ 传给聊天页的值，以及此后新引用用到的前缀
      getContactSettings(contactId)
        .then((s) => { if (s) useContactSettingsStore().set(contactId, s) })
        .catch(() => {})
      // 已加载过的会话：用服务端最新数据刷新（引用摘要的前缀、撤回状态等）
      const chat = useChatStore()
      if (chat.messagesByContact[contactId]) chat.syncFromServer(contactId)
    } catch (err) { /* ignore */ }
  })

  /* 已读不回等场景：对方不显示"正在输入"，但已读标识仍要变化（专用事件，不触发输入状态） */
  source.addEventListener('messages_read', (e) => {
    try {
      const { contactId } = JSON.parse(e.data)
      useChatStore().markMyRead(contactId)
    } catch (err) {
      /* ignore */
    }
  })

  /* 对方收藏了我的消息 → 弹窗提示 */
  source.addEventListener('contact_favorite', (e) => {
    try {
      const { contactId, name, avatar, text } = JSON.parse(e.data)
      useNotificationsStore().pushToast({
        title: `${name || '对方'}收藏了你的消息`,
        text: text || '',
        avatar: avatar || '',
        type: 'message',
        duration: 4000,
        route: `/contacts/${contactId}/chat`
      })
    } catch (err) {
      /* ignore */
    }
  })

  /* 联系人自己收藏了一首歌：弹窗提示 */
  source.addEventListener('music_fav', (e) => {
    try {
      const d = JSON.parse(e.data)
      useNotificationsStore().pushToast({
        title: `${d.name || '对方'}收藏了歌曲`,
        text: d.song?.title ? `《${d.song.title}》` : '',
        avatar: d.avatar || '',
        type: 'message',
        duration: 4500,
        route: '/music'
      })
      /* 曲库已加载时同步刷新收藏标记 */
      try {
        const music = useMusicStore()
        if (music.loaded) music.init(d.contactId || music.contactId)
      } catch (err) { /* ignore */ }
    } catch (err) {
      /* ignore */
    }
  })

  /* 备忘录待办提醒不再走这里：无论提醒人选「无」还是联系人，
     统一由全局组件 MemoReminderDialog 监听 eunoia:memo_reminder 弹中间系统弹窗呈现 */

  source.addEventListener('call_invite', (e) => {
    try {
      const { groupId, contactId, name, avatar, memberName, isGroup } = JSON.parse(e.data)
      const call = useCallStore()
      call.startIncoming({ groupId, contactId, name, avatar, memberName, isGroup })
    } catch (err) {
      /* ignore */
    }
  })

  /* 对方发朋友圈（或回评论）：在朋友圈页就静默刷新，否则弹个提示可点进去看 */
  source.addEventListener('moment_new', (e) => {
    try {
      const data = JSON.parse(e.data)
      const r = router.currentRoute.value
      if (r && (r.name === 'moments' || r.name === 'moment-compose')) {
        window.dispatchEvent(new CustomEvent('moments:refresh'))
        return
      }
      /* 按互动类型区分文案：发动态 / 评论 / 回复评论 / 点赞 */
      const ACT = { comment: '评论了我的朋友圈', reply: '回复了我的评论', like: '赞了我的朋友圈' }
      const act = ACT[data.kind]
      useNotificationsStore().pushToast({
        title: act ? `${data.name || '对方'}${act}` : `${data.name || '对方'}发了一条朋友圈`,
        /* 纯图动态没有正文，提示里显示「[图片]」；评论 / 回复显示评论内容 */
        text: act ? data.content || '' : data.moment?.text || (data.moment?.images?.length ? '[图片]' : ''),
        avatar: data.avatar || '',
        type: 'message',
        duration: 4000,
        route: '/moments'
      })
    } catch (err) {
      /* ignore */
    }
  })

  /* 陪伴邀请：TA 邀我 / TA 对我的邀请做出响应 → 陪伴 store 统一处理（含开始计时、toast） */
  source.addEventListener('companion_invite', (e) => {
    try {
      const data = JSON.parse(e.data)
      useCompanionStore().onSSE(data)
    } catch (err) {
      /* ignore */
    }
  })

  /* 一起听歌：TA 邀我 / TA 对我的邀请做出响应 → 音乐 store 统一处理（含进入/退出会话、toast） */
  source.addEventListener('listen_together', (e) => {
    try {
      const data = JSON.parse(e.data)
      useMusicStore().onListenSSE(data)
    } catch (err) {
      /* ignore */
    }
  })

  /* 一起观影：TA 邀我 / TA 对我的邀请做出响应 → 影院 store 统一处理 */
  source.addEventListener('cinema_together', (e) => {
    try {
      const data = JSON.parse(e.data)
      useCinemaStore().onCinemaSSE(data)
    } catch (err) {
      /* ignore */
    }
  })

  source.addEventListener('badge_update', (e) => {
    try {
      const data = JSON.parse(e.data)
      const badges = useBadgesStore()
      badges.setFromSSE(data)
    } catch (err) {
      /* ignore */
    }
  })

  /* 从后台回到前台：浏览器挂起期间会错过 SSE 推送（服务端照常落库，
     对方到点的回复/提问回答不会丢），回到前台立即补拉当前会话最新消息、
     刷新联系人列表与角标 —— 保证"回到聊天就能看到他发的消息"，后台计时不冻结 */
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return
      const chat = useChatStore()
      const id = currentOpenContactId()
      if (id) {
        // 正开着这个会话：补拉最新消息并视为已读
        const apply = () => { chat.markRead(id).catch(() => {}) }
        if (chat.messagesByContact[id]) {
          chat.syncFromServer(id).then(apply).catch(apply)
        } else {
          chat.load(id).then(apply).catch(apply)
        }
      }
      useBadgesStore().load().catch(() => {})
      useContactsStore().load().catch(() => {})
    })
  }

  source.onerror = () => {
    // 本地总线无重连概念；此处保留以防调用方检查
  }

  return source
}

export function disconnect() {
  if (source) {
    source.close()
    source = null
  }
}
