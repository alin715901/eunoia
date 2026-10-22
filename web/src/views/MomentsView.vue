<template>
  <div class="moments">
    <div class="mo-body">
      <!-- ═══ 封面：透明导航（返回 / ＋ / ⋯）+ 右下角我的头像压边 ═══ -->
      <div class="cover" :style="profile.bg ? { backgroundImage: `url(${profile.bg})` } : {}">
        <header class="cov-head">
          <button class="hd-btn" @click="goBack"><AppIcon name="back" :size="22" /></button>
          <div class="hd-right">
            <button class="hd-btn" @click="router.push('/moments/compose')"><AppIcon name="plus" :size="22" /></button>
            <button class="hd-btn" @click="openSettings"><AppIcon name="more" :size="22" /></button>
          </div>
        </header>
        <div class="cov-id">
          <span class="cov-name">{{ myName }}</span>
          <AppAvatar class="cov-avatar" :name="myName" :avatar="profile.avatar" :size="64" />
        </div>
      </div>

      <!-- ═══ 只看某人的动态时：过滤提示条（封面仍是我的） ═══ -->
      <div v-if="viewAuthor !== null" class="filter-bar">
        <span>正在看 <b>{{ viewAuthorName }}</b> 的朋友圈</span>
        <button class="fb-all" @click="clearAuthorFilter">查看全部</button>
      </div>

      <!-- ═══ 时间线（微信朋友圈式：头像左，内容右） ═══ -->
      <div class="timeline">
        <div v-if="!list.length" class="tl-empty">还没有动态，点右上角 ＋ 发布第一条吧。</div>
        <article v-for="m in list" :key="m.id" class="post">
          <AppAvatar
            class="p-avatar"
            :avatar="authorAvatar(m)"
            :name="authorName(m)"
            :size="44"
            @click="openAuthor(m)"
          />
          <div class="p-main">
            <div class="p-name">
              {{ authorName(m) }}
              <!-- 收藏标识：收藏过的朋友圈在发布者名字旁显示实心星星 -->
              <AppIcon v-if="m.favorited" name="star" :size="13" color="#f0b429" :filled="true" class="p-fav-star" />
            </div>
            <div class="p-text" v-if="m.text">{{ m.text }}</div>
            <div class="p-imgs" v-if="m.images && m.images.length">
              <img
                v-for="(img, i) in m.images"
                :key="i"
                :src="imgFull(img)"
                alt=""
                @click="preview(m.images, i)"
              />
            </div>

            <!-- 时间（我发的可删除） + ··· 操作 -->
            <div class="p-meta">
              <span class="p-time">
                {{ fmt(m.created_at) }}
                <button v-if="m.author === 'me'" class="p-del" @click="removeMoment(m)">删除</button>
              </span>
              <button class="p-more" :class="{ on: menuOn === m.id }" @click="toggleMenu(m)">
                <i></i><i></i>
              </button>
            </div>
            <div v-if="menuOn === m.id" class="p-menu">
              <button class="pm-item" @click="toggleLike(m)">
                <AppIcon name="heart" :size="15" :color="m.liked ? '#e0687a' : 'var(--text)'" />
                <span>{{ m.liked ? '取消赞' : '赞' }}</span>
              </button>
              <span class="pm-div"></span>
              <button class="pm-item" @click="toggleFavorite(m)">
                <AppIcon name="star" :size="15" :color="m.favorited ? '#f0b429' : 'var(--text)'" />
                <span>{{ m.favorited ? '取消收藏' : '收藏' }}</span>
              </button>
              <span class="pm-div"></span>
              <button class="pm-item" @click="openComment(m)">
                <AppIcon name="chat" :size="15" color="var(--text)" />
                <span>评论</span>
              </button>
            </div>

            <!-- 赞 + 评论（灰色圆角块） -->
            <div v-if="(m.likeNames && m.likeNames.length) || (m.comments && m.comments.length)" class="p-panel">
              <div v-if="m.likeNames && m.likeNames.length" class="p-likes">
                <AppIcon name="heart" :size="16" color="var(--accent)" />
                <span class="p-like-names">{{ shownLikeNames(m.likeNames) }}</span>
              </div>
              <div v-if="(m.likeNames && m.likeNames.length) && (m.comments && m.comments.length)" class="p-panel-div"></div>
              <div v-if="m.comments && m.comments.length" class="p-cmts">
                <button
                  v-for="c in m.comments"
                  :key="c.id"
                  class="p-cmt"
                  @click="openComment(m, c)"
                  @pointerdown="startPress(c, $event)"
                  @pointerup="cancelPress"
                  @pointerleave="cancelPress"
                  @contextmenu.prevent
                >
                  <b>{{ displayName(c.contact_id, c.authorName) }}</b><span v-if="c.replyToName"> 回复 <b>{{ shownName(c.reply_to, c.replyToName) }}</b></span>：{{ c.content }}
                  <img
                    v-for="(im, i) in c.images || []"
                    :key="i"
                    class="p-cmt-img"
                    :src="im"
                    alt=""
                    @click.stop="preview(c.images, i)"
                  />
                </button>
              </div>
            </div>

            <!-- 评论 / 回复输入：文字 + 图片 + 表情包 -->
            <div v-if="commentOn === m.id" class="c-box">
              <div class="c-input">
                <input
                  v-model="commentText"
                  class="c-text"
                  :placeholder="replyToName ? `回复 ${replyToName}…` : '评论'"
                  @keyup.enter="submitComment(m)"
                />
                <button class="c-pick" @click="pickCommentImage">
                  <AppIcon name="image" :size="18" color="var(--accent)" />
                </button>
                <button class="c-pick" @click="openStickers">
                  <AppIcon name="sticker" :size="18" color="var(--accent)" />
                </button>
                <button class="c-cancel" @click="cancelComment">取消</button>
                <button class="btn btn-primary c-send-btn" @click="submitComment(m)">发送</button>
              </div>
              <div v-if="commentImages.length" class="c-thumbs">
                <div v-for="(img, i) in commentImages" :key="i" class="c-thumb">
                  <img :src="img" alt="" />
                  <button class="c-thumb-del" @click="commentImages.splice(i, 1)">×</button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
      <div class="tl-pad"></div>
    </div>

    <!-- ═══ ⋯ 朋友圈资料设置弹窗：我的头像 / 名称 / 封面背景图 ═══ -->
    <Modal :show="showSettings" title="朋友圈设置" @close="showSettings = false">
      <div class="st-row">
        <span class="st-label">我的头像</span>
        <div class="st-side">
          <AppAvatar :name="myName" :avatar="profile.avatar" :size="52" class="st-avatar" />
          <button class="mini-btn" @click="pickProfile('avatar')">{{ profile.avatar ? '更换' : '上传' }}</button>
        </div>
      </div>
      <div class="st-row">
        <span class="st-label">名字</span>
        <input v-model="draftName" class="st-input" maxlength="20" placeholder="我" />
      </div>
      <div class="st-row">
        <span class="st-label">封面背景</span>
        <div class="st-side">
          <span class="st-bg" :style="profile.bg ? { backgroundImage: `url(${profile.bg})` } : {}"></span>
          <button class="mini-btn" @click="pickProfile('bg')">{{ profile.bg ? '更换' : '上传' }}</button>
          <button v-if="profile.bg" class="mini-btn danger" @click="clearBg">移除</button>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="closeSettings">取消</button>
        <button class="btn btn-primary" @click="saveSettings">保存</button>
      </template>
    </Modal>

    <!-- 图片查看：点开大图，点任意处关闭 -->
    <div v-if="viewerImgs.length" class="img-viewer" @click="viewerImgs = []">
      <img class="iv-img" :src="viewerImgs[viewerIdx]" alt="" @click.stop />
      <button class="iv-close" @click="viewerImgs = []">✕</button>
      <div v-if="viewerImgs.length > 1" class="iv-dots">
        <span
          v-for="(im, i) in viewerImgs"
          :key="i"
          class="iv-dot"
          :class="{ on: i === viewerIdx }"
        ></span>
      </div>
      <button v-if="viewerImgs.length > 1" class="iv-prev" @click.stop="viewerStep(-1)">‹</button>
      <button v-if="viewerImgs.length > 1" class="iv-next" @click.stop="viewerStep(1)">›</button>
    </div>

    <!-- 评论配图（直接上传，不裁剪） -->
    <input ref="commentFileInput" type="file" accept="image/*" hidden @change="onCommentImage" />

    <!-- 表情包选择：从字卡库的表情包板块挑一张发 -->
    <Modal :show="showStickers" title="选择表情包" @close="showStickers = false">
      <div class="sk-grid">
        <button
          v-for="s in stickers"
          :key="s.id"
          class="sk-item"
          @click="pickSticker(s)"
        >
          <img :src="s.asset_path" alt="" />
        </button>
      </div>
      <p v-if="!stickers.length" class="sk-empty">字卡库里还没有表情包</p>
    </Modal>

    <!-- 图片裁剪：头像 / 封面共用 -->
    <input ref="profileFileInput" type="file" accept="image/*" hidden @change="onProfileFile" />
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      :title="cropTitle"
      :ratio="cropRatio"
      @cancel="onCropped(null)"
      @done="onCropped"
      @error="onCropped(null)"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Modal from '@/components/common/Modal.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'
import { useDeskCacheStore } from '@/stores/deskCache'
import { getMoments, likeMoment, favoriteMoment, commentMoment, deleteMoment, deleteMomentComment, uploadImage } from '@/api/content'
import { getCards } from '@/api/cards'
import { compressImage } from '@/utils/image'
import { confirmDialog } from '@/utils/dialog'

const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const settingsStore = useSettingsStore()
const router = useRouter()

const contacts = computed(() => contactsStore.list || [])
const deskCache = useDeskCacheStore()

/* ═══ 朋友圈我的资料（全局设置：头像 / 名称 / 封面背景图） ═══ */
const profile = computed(() => settingsStore.global.moments || { name: '', avatar: '', bg: '' })
/* 我在朋友圈里的名字：设置里填了就用它，动态、评论、点赞名单都用它 */
const myName = computed(() => (profile.value.name || '').trim() || '我')

const list = ref([])

/* ··· 操作菜单 / 评论输入 */
const menuOn = ref(null)
const commentOn = ref(null)
const commentText = ref('')
const commentImages = ref([])
const replyTo = ref(null) // null=直接评论，0=回复「我」，>0=回复该联系人
const replyToName = computed(() => {
  if (replyTo.value === null) return ''
  if (replyTo.value === 0) return '我'
  return contacts.value.find((c) => String(c.id) === String(replyTo.value))?.name || 'TA'
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function imgFull(p) {
  return p || ''
}

function authorName(m) {
  if (m.author === 'me' || !m.author_contact_id) return myName.value
  /* 与聊天设置同步：优先用联系人的备注名 */
  return contacts.value.find((c) => String(c.id) === String(m.author_contact_id))?.name || 'TA'
}
/* 头像与聊天设置同步：开了「同步到聊天」的人物卡头像优先，否则用联系人本地头像 */
function authorAvatar(m) {
  if (m.author === 'me' || !m.author_contact_id) return profile.value.avatar || ''
  const c = contacts.value.find((x) => String(x.id) === String(m.author_contact_id))
  const desk = deskCache.get(m.author_contact_id)
  if (desk?.sync_chat_avatar && desk?.partner_avatar) return desk.partner_avatar
  return c?.avatar || desk?.partner_avatar || ''
}

/* ═══ 只看某人的朋友圈（点头像进入；封面仍是我的） ═══ */
const viewAuthor = ref(null) // null=全部，>0=联系人 id，0=我
const viewAuthorName = computed(() => {
  if (viewAuthor.value === 0) return myName.value
  return contacts.value.find((c) => String(c.id) === String(viewAuthor.value))?.name || 'TA'
})
function openAuthor(m) {
  const id = m.author === 'me' || !m.author_contact_id ? 0 : Number(m.author_contact_id)
  viewAuthor.value = viewAuthor.value === id ? null : id
  load()
}
function clearAuthorFilter() {
  viewAuthor.value = null
  load()
}

/* 图片查看 */
const viewerImgs = ref([])
const viewerIdx = ref(0)
function preview(imgs, i = 0) {
  if (!imgs || !imgs.length) return
  viewerImgs.value = imgs
  viewerIdx.value = i || 0
}
function viewerStep(d) {
  const n = viewerImgs.value.length
  if (!n) return
  viewerIdx.value = (viewerIdx.value + d + n) % n
}

/* 取消评论 / 回复 */
function cancelComment() {
  commentOn.value = null
  commentText.value = ''
  commentImages.value = []
  replyTo.value = null
}

/* 长按评论 → 删除该评论（500ms 触发，触发后本次点击不再当作回复） */
const pressTimer = ref(null)
const pressed = ref(false)
function startPress(c, e) {
  pressed.value = false
  clearTimeout(pressTimer.value)
  pressTimer.value = setTimeout(() => {
    pressed.value = true
    if (navigator.vibrate) navigator.vibrate(15)
    removeComment(c)
  }, 500)
}
function cancelPress() {
  clearTimeout(pressTimer.value)
}
async function removeComment(c) {
  if (Number(c.contact_id) !== 0) {
    toast.pushToast({ title: '只能删除自己的评论' })
    return
  }
  const ok = await confirmDialog({
    title: '删除评论',
    text: '删除这条评论？',
    okText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteMomentComment(c.id)
    await load()
    toast.pushToast({ title: '已删除' })
  } catch (err) {
    toast.pushToast({ title: '删除失败', text: err.message })
  }
}

/* 删除我发布的动态（连同点赞、评论） */
async function removeMoment(m) {
  const ok = await confirmDialog({
    title: '删除动态',
    text: '删除后这条朋友圈的点赞和评论也会一并删除，确定吗？',
    okText: '删除',
    danger: true
  })
  if (!ok) return
  try {
    await deleteMoment(m.id)
    await load()
    toast.pushToast({ title: '已删除' })
  } catch (err) {
    toast.pushToast({ title: '删除失败', text: err.message })
  }
}

/* 相对时间：刚刚 / N分钟前 / N小时前 / 昨天 / M月D日 */
function fmt(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const MIN = 60 * 1000
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)}分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}小时前`
  if (diff < 2 * DAY) return '昨天'
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/* ═══ ··· 菜单：赞 / 评论 ═══ */
function toggleMenu(m) {
  menuOn.value = menuOn.value === m.id ? null : m.id
}

/* 裁剪仅用于 ⋯ 资料设置：头像 / 封面背景 */
const cropSrc = ref('')
let cropMode = 'avatar'
const cropTitle = ref('裁剪头像')
const cropRatio = ref(1)

/* ⋯ 资料设置弹窗 */
const showSettings = ref(false)
const draftName = ref('')
function openSettings() {
  draftName.value = profile.value.name || ''
  showSettings.value = true
}
function pickProfile(kind) {
  cropMode = kind
  cropTitle.value = kind === 'avatar' ? '裁剪头像' : '裁剪封面背景'
  cropRatio.value = kind === 'avatar' ? 1 : 16 / 9
  profileFileInput.value?.click()
}
/* 头像 / 封面背景：选完文件先裁剪，确认后在 onCropped 里上传保存 */
const profileFileInput = ref(null)
function onProfileFile(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  cropSrc.value = URL.createObjectURL(file)
}

async function onCropped(blob) {
  cropSrc.value = ''
  if (blob) {
    const file = new File([blob], 'moment.jpg', { type: 'image/jpeg' })
    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await uploadImage(fd)
      if (cropMode === 'avatar') {
        settingsStore.global.moments = { ...profile.value, avatar: r.path }
        await saveProfile(true)
      } else {
        settingsStore.global.moments = { ...profile.value, bg: r.path }
        await saveProfile(true)
      }
    } catch (err) {
      toast.pushToast({ title: '上传失败', text: err.message })
    }
  }
}

async function clearBg() {
  settingsStore.global.moments = { ...profile.value, bg: '' }
  await saveProfile(true)
}

async function saveProfile(silent = false) {
  try {
    settingsStore.global.moments = { ...profile.value, name: (draftName.value || '').trim() }
    await settingsStore.save()
    if (!silent) {
      toast.pushToast({ title: '已保存' })
    }
  } catch (err) {
    toast.pushToast({ title: '保存失败', text: err.message })
  }
}
/* 弹窗按钮：先关弹窗再后台保存，点击立刻有反馈 */
function closeSettings() {
  showSettings.value = false
}
function saveSettings() {
  showSettings.value = false
  saveProfile()
}

async function toggleLike(m) {
  try {
    const r = await likeMoment(m.id, 0)
    m.likes = r.likes
    m.liked = r.liked
    menuOn.value = null
    await load()
  } catch (err) {
    toast.pushToast({ title: '操作失败', text: err.message })
  }
}

/* 收藏/取消收藏朋友圈：与点赞同列，收藏后发布者名字旁显示星星 */
async function toggleFavorite(m) {
  try {
    const r = await favoriteMoment(m.id, 0)
    m.favorited = r.favorited
    menuOn.value = null
    await load()
  } catch (err) {
    toast.pushToast({ title: '操作失败', text: err.message })
  }
}

/* 打开评论框：点了某条评论就是回复那个人，没点就是直接评论 */
/* 名字显示统一：我一律用朋友圈设置里的名字（没填就是「我」） */
function displayName(contactId, fallback) {
  return Number(contactId) === 0 ? myName.value : fallback || 'TA'
}
function shownName(contactId, fallback) {
  return Number(contactId) === 0 ? myName.value : fallback || 'TA'
}
function shownLikeNames(names) {
  return (names || []).map((n) => (n === '我' ? myName.value : n)).join('，')
}

function openComment(m, c = null) {
  menuOn.value = null
  const reopen = commentOn.value === m.id && !!c
  commentOn.value = commentOn.value === m.id && !c ? null : m.id
  commentText.value = ''
  commentImages.value = []
  if (c) {
    replyTo.value = c.contact_id === 0 || c.contact_id === null ? 0 : Number(c.contact_id)
  } else {
    replyTo.value = null
  }
  if (reopen) return
}

/* 评论配图：直接上传，不裁剪 */
const commentFileInput = ref(null)
function pickCommentImage() {
  commentFileInput.value?.click()
}
async function onCommentImage(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const small = await compressImage(file)
    const fd = new FormData()
    fd.append('file', small)
    const r = await uploadImage(fd)
    commentImages.value.push(r.path)
  } catch (err) {
    toast.pushToast({ title: '上传失败', text: err.message })
  }
}

/* 表情包：从字卡库表情包板块选一张，作为图片发出 */
const showStickers = ref(false)
const stickers = ref([])
async function openStickers() {
  showStickers.value = true
  if (stickers.value.length) return
  try {
    const list = await getCards({ category: 'sticker' })
    stickers.value = (list || []).filter((c) => !!c.asset_path)
  } catch (err) {
    toast.pushToast({ title: '加载失败', text: err.message })
  }
}
function pickSticker(s) {
  commentImages.value.push(s.asset_path)
  showStickers.value = false
}

async function submitComment(m) {
  const c = commentText.value.trim()
  if (!c && !commentImages.value.length) return
  try {
    await commentMoment(m.id, {
      viewer: 0,
      content: c,
      images: commentImages.value,
      replyTo: replyTo.value
    })
    commentOn.value = null
    commentText.value = ''
    commentImages.value = []
    replyTo.value = null
    await load()
  } catch (err) {
    toast.pushToast({ title: '评论失败', text: err.message })
  }
}

async function load() {
  try {
    list.value = await getMoments(null, 0, 'all', viewAuthor.value)
  } catch (e) {
    toast.pushToast({ title: '加载失败', text: e.message })
  }
}

/* 对方主动发来朋友圈：SSE 推来时静默刷新列表 */
function onMomentsRefresh() {
  load()
}
onMounted(async () => {
  await contactsStore.load().catch(() => {})
  await settingsStore.load().catch(() => {})
  await load()
  window.addEventListener('moments:refresh', onMomentsRefresh)
})
onBeforeUnmount(() => {
  window.removeEventListener('moments:refresh', onMomentsRefresh)
})
/* keep-alive 复用实例时也要重拉，并重新按 ?contact= 定位（保留外部入口参数兼容） */
onActivated(async () => {
  await settingsStore.load().catch(() => {})
  await load()
})
</script>

<style scoped>
/* 整页独立滚动，滚动条隐藏（与聊天页一致） */
.moments { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg-soft); }
.mo-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.mo-body::-webkit-scrollbar { display: none; }

/* ═══ 封面 ═══ */
.cover {
  position: relative;
  height: 264px;
  background-color: color-mix(in srgb, var(--accent) 34%, var(--bg-screen));
  background-size: cover;
  background-position: center;
  background-image:
    radial-gradient(120% 90% at 85% 10%, color-mix(in srgb, var(--accent) 38%, var(--bg-screen)) 0%, transparent 60%),
    linear-gradient(165deg, color-mix(in srgb, var(--accent) 56%, var(--bg-screen)) 0%, color-mix(in srgb, var(--accent) 22%, var(--bg-screen)) 100%);
}
/* 深色模式：给封面图压一层暗色蒙层（只压背景，不影响头像/名字/按钮） */
.cover::before {
  content: '';
  position: absolute;
  inset: 0;
  background: transparent;
  pointer-events: none;
}
html[data-theme='dark'] .cover::before { background: rgba(0, 0, 0, 0.4); }
/* 有背景图时：内联 style 的 background-image 会覆盖上面的渐变 */
/* 透明导航：返回靠左，＋ / ⋯ 靠右 */
.cov-head {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  z-index: 2;
}
.hd-btn {
  border: none;
  background: transparent;
  color: #fff;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.25));
}
.hd-btn:active { opacity: 0.7; }
.hd-right { margin-left: auto; display: flex; gap: 2px; }

/* 身份：右下角头像压住封面下边缘，名字在头像左侧（白色） */
.cov-id {
  position: absolute;
  right: 16px;
  bottom: -26px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  z-index: 2;
}
.cov-name {
  /* 名字整体抬到头像上沿附近，不压在封面边缘线上 */
  margin-bottom: 34px;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cov-id :deep(.cov-avatar) {
  border-radius: 14px !important;
  border: 3px solid #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
  background: var(--bg-screen);
}

/* ═══ 只看某人的过滤提示条 ═══ */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 44px 16px 0;
  padding: 8px 12px;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  font-size: 13px;
  color: var(--text-soft);
}
.filter-bar b { color: var(--accent); }
.fb-all {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  padding: 2px 4px;
}

/* ═══ 时间线（微信式：头像左 / 内容右） ═══ */
.timeline {
  padding: 44px 16px 0;
  display: flex;
  flex-direction: column;
}
/* 上面有过滤条时，封面的留白由过滤条负责 */
.filter-bar + .timeline { padding-top: 10px; }
.tl-pad { height: 24px; }
.tl-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 28px 0 8px; }

.post { display: flex; gap: 11px; padding: 16px 0; }
/* 每条动态之间用横线分割（浅色下用更深的分隔色，避免几乎看不见） */
.post + .post { border-top: 1px solid var(--divider, var(--border)); }
.post .p-avatar { border-radius: 10px; border: 1px solid var(--border); cursor: pointer; }
.p-main { flex: 1 1 auto; min-width: 0; }
.p-name { font-size: 15px; font-weight: 700; color: var(--accent); margin-bottom: 4px; }
/* 收藏标识：发布者名字旁的星星，与文字基线对齐 */
.p-fav-star { display: inline-block; vertical-align: -1px; margin-left: 3px; }
.p-text { font-family: var(--font-serif); font-size: 14px; line-height: 1.7; margin-bottom: 8px; }
.p-imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px; }
.p-imgs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; }

/* 时间 + 删除 + ··· */
.p-meta { display: flex; align-items: center; justify-content: space-between; margin-top: 2px; }
.p-time { font-size: 12px; color: var(--text-soft); display: inline-flex; align-items: center; gap: 8px; }
.p-del {
  border: none;
  background: transparent;
  color: #c0576b;
  font-size: 12px;
  padding: 0;
}
.p-del:active { opacity: 0.6; }
.p-more {
  border: none;
  background: var(--bg-soft);
  border-radius: 6px;
  padding: 4px 8px;
  display: inline-flex;
  gap: 3px;
  align-items: center;
  justify-content: center;
}
.p-more i { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); display: block; }
.p-more:active, .p-more.on { background: color-mix(in srgb, var(--accent) 22%, var(--bg-screen)); }

/* ··· 弹出的小菜单：赞 / 评论 */
.p-menu {
  margin-top: 6px;
  /* 块级 flex + fit-content + auto 左距：内容收缩为紧凑胶囊并整体靠右。
     原先用 float:right 会让后续行内内容（点赞名单的名字）绕浮动盒排布，
     表现为「点赞后点 … 名字被挤压」，故弃用浮动 */
  display: flex;
  width: fit-content;
  margin-left: auto;
  align-items: center;
  gap: 4px;
  background: #4c4c52;
  border-radius: 8px;
  padding: 6px 10px;
}
.pm-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 13px;
  padding: 2px 6px;
}
.pm-div { width: 1px; height: 14px; background: rgba(255, 255, 255, 0.25); }

/* 赞 + 评论：用实底卡片块，看得见摸得着 */
.p-panel {
  margin-top: 10px;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
  padding: 10px 12px;
}
.p-likes { display: flex; align-items: flex-start; gap: 8px; padding: 2px 0; }
.p-likes :deep(svg) { flex: 0 0 auto; margin-top: 2px; }
.p-like-names { flex: 1; font-size: 13px; font-weight: 600; color: var(--accent); line-height: 1.6; word-break: break-all; }
.p-panel-div { height: 1px; background: var(--border); margin: 8px 0; }
.p-cmts { display: flex; flex-direction: column; gap: 6px; }
.p-cmt {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 0;
  font-size: 13px;
  color: var(--text);
  line-height: 1.6;
  font-family: inherit;
}
.p-cmt:active { color: var(--accent); }
.c-cancel {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 13px;
  padding: 4px 2px;
  white-space: nowrap;
}

/* 图片查看（点开大图） */
.img-viewer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}
.iv-img { max-width: 92%; max-height: 78%; object-fit: contain; border-radius: 6px; }
.iv-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 16px;
}
.iv-dots { position: absolute; bottom: 34px; display: flex; gap: 6px; }
.iv-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
.iv-dot.on { background: var(--bg-screen); }
.iv-prev, .iv-next {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 26px;
  line-height: 1;
}
.iv-prev { left: 10px; }
.iv-next { right: 10px; }
.p-cmt b { color: var(--accent); font-weight: 600; }

.c-box { margin-top: 10px; }
.c-input { display: flex; gap: 8px; align-items: center; }
.c-text {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 7px 12px;
  font-size: 13px;
  font-family: inherit;
  background: var(--bg-screen);
  color: var(--text);
  outline: none;
}
.c-text:focus { border-color: var(--accent); }
.c-pick {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.c-pick:active { background: var(--accent-soft); }
.c-send-btn {
  flex: 0 0 auto;
  padding: 7px 14px;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
}
/* 评论配图缩略图 */
.c-thumbs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.c-thumb { position: relative; width: 64px; height: 64px; border-radius: 8px; overflow: hidden; background: var(--bg-soft); }
.c-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.c-thumb-del { position: absolute; top: 2px; right: 2px; width: 18px; height: 18px; line-height: 16px; border: none; border-radius: 50%; background: rgba(0,0,0,.5); color: #fff; font-size: 12px; }

/* 评论里的图片 / 表情包 */
.p-cmt-img { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; margin-left: 4px; vertical-align: middle; }

/* 表情包选择 */
.sk-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.sk-item { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 10px; padding: 4px; aspect-ratio: 1; overflow: hidden; }
.sk-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.sk-item:active { border-color: var(--accent); }
.sk-empty { font-size: 12px; color: var(--text-soft); margin: 6px 0 0; text-align: center; }

/* ═══ 朋友圈资料设置弹窗 ═══ */
.st-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
.st-row + .st-row { border-top: 1px solid var(--border); }
.st-label { font-size: 14px; font-weight: 600; color: var(--text); flex: 0 0 auto; }
.st-side { display: flex; align-items: center; gap: 8px; }
.st-avatar { border-radius: 12px; }
.st-input {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  color: var(--text);
}
.st-input:focus { border-color: var(--accent); outline: none; }
.st-bg {
  width: 72px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background-color: var(--bg-soft);
  background-size: cover;
  background-position: center;
  display: inline-block;
}
.mini-btn {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text);
}
.mini-btn.danger { color: #c0576b; }
</style>
