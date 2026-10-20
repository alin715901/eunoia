<template>
  <div class="home">
    <!-- ═══ 左右翻页容器：第1页=卡片A+应用网格，第2页=卡片B ═══ -->
    <div class="pager" ref="pager" @scroll="onScroll">
      <!-- ─── 第 1 页：大卡片 A + 灵魂链接/纪念日 + 应用网格 ─── -->
      <section class="page">
        <!-- 大卡片A：只展示当前选中联系人（单人）。点击进设置页可切换联系人 -->
        <div class="card-a" :style="cardBgStyle">
          <div v-if="curCard" class="card-single" @click="go('/home-card-settings')">
            <div class="ca-main">
              <div class="ca-avatars">
                <div class="ca-ava-item">
                  <AppAvatar :avatar="curCard.left.avatar" :name="curCard.left.name" :size="52" class="ca-ava" />
                  <span class="ca-name">{{ curCard.left.name }}</span>
                </div>
                <div class="ca-ava-item ca-ava-overlap">
                  <AppAvatar v-if="curCard.hasPartner" :avatar="curCard.right.avatar" :name="curCard.right.name" :size="52" class="ca-ava" />
                  <span v-else class="ca-add ca-ava"><AppIcon name="plus" :size="22" color="var(--accent)" /></span>
                  <span class="ca-name">{{ curCard.hasPartner ? curCard.right.name : '添加' }}</span>
                </div>
              </div>

              <div class="ca-right">
                <span class="ca-time">{{ timeStr }}</span>
                <span class="ca-date">{{ dateStr }}</span>
              </div>
            </div>

            <!-- 签名：头像下方 -->
            <div class="ca-sign">
              <span class="ca-sign-text" :class="{ empty: !curCard.sign }">{{ curCard.sign || '写一句签名…' }}</span>
            </div>
          </div>
          <div v-else class="card-single card-none">
            <span class="cn-text">还没有联系人</span>
            <button class="cn-btn" @click="go('/home-card-settings')">去添加</button>
          </div>
        </div>

        <!-- 灵魂链接 / 纪念日：都按当前主体独立保存 -->
        <div class="ca-boxes">
          <!-- 灵魂链接：固定 5 个槽位，激活的（随机 1~5）实心一起呼吸，其余极淡 -->
          <div class="ca-box">
            <span class="cb-label">灵魂链接</span>
            <span class="love-row">
              <AppIcon
                v-for="i in 5"
                :key="i"
                name="heart-solid"
                :size="22"
                filled
                class="love-heart"
                :class="{ on: i <= loveCount }"
              />
            </span>
          </div>
          <button class="ca-box" @click="openAnnPicker">
            <span class="cb-label">{{ annTitle }}<span v-if="annPrefix" class="cb-haiyou">{{ annPrefix }}</span></span>
            <span class="cb-value ann-days">{{ annNum }}</span>
          </button>
        </div>

        <!-- 应用网格：4 列，图标 + 文字标签 -->
        <div class="app-grid">
          <DesktopIcon
            v-for="a in apps"
            :key="a.label"
            :icon="a.icon"
            :name="a.label"
            :img="iconBg(a.icon)"
            :badge="a.badgeKey ? badges[a.badgeKey] : 0"
            @click="go(a.path)"
          />
        </div>
      </section>

      <!-- ─── 第 2 页：大卡片 B（一起听）+ 备忘录/经期 + 迷你应用 ─── -->
      <section class="page">
        <!-- 大卡片 B（按手绘图1）：音乐播放器，胶片带歌曲封面 -->
        <div class="card-b" :style="musicCardBgStyle" @click="onMusicCardTap">
          <div class="player">
            <!-- 胶片：点击弹出播放表（酷狗式）；自定义唱片优先显示在中心 -->
            <div class="disc" :class="{ spin: playing }" @click.stop="openMusicSheet">
              <img v-if="music.vinyl" :src="music.vinyl" alt="" class="disc-cover" />
              <img v-else-if="curSong.cover" :src="curSong.cover" :alt="curSong.title" class="disc-cover" />
              <span v-else class="disc-fallback"><AppIcon name="music" :size="34" color="#fff" /></span>
            </div>
            <div class="player-right">
              <div class="song-row">
                <AppIcon name="music" :size="16" color="var(--accent)" />
                <span class="song-name">{{ curSong.title }}</span>
              </div>
              <span class="song-artist">{{ curSong.artist }}</span>

              <div class="ctrl-row">
                <button class="ctrl-btn" @click.stop="prevSong"><AppIcon name="prev" :size="20" /></button>
                <button class="ctrl-btn ctrl-main" @click.stop="togglePlay">
                  <AppIcon :name="playing ? 'pause' : 'play'" :size="26" />
                </button>
                <button class="ctrl-btn" @click.stop="nextSong"><AppIcon name="next" :size="20" /></button>
                <!-- 播放模式：单击循环切换 顺序 → 随机 → 单曲 -->
                <span class="ctrl-spacer"></span>
                <button class="mode-btn mode-cycle" :title="curMode.label" @click.stop="cycleLoop">
                  <AppIcon :name="curMode.icon" :size="14" />
                  <span class="mode-txt">{{ curMode.short }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 累计收听时长：按真实播放进度实时累计，满 1 分钟即刷新显示 -->
          <div class="listen-row" @click.stop>
            <span class="cb-label">一起听已经</span>
            <span class="listen-val">{{ fmtListenMin(music.listenMinutes) }}</span>
          </div>
        </div>

        <!-- ═══ 音乐卡背景：更换图片 / 清空图片 / 图片透明度 ═══ -->
    <div v-if="mBgMenu" class="modal-mask" @click.self="mBgMenu = false">
      <div class="modal">
        <h3 class="mo-title">音乐卡背景</h3>
        <div class="m-bg-ops">
          <button class="m-bg-btn" @click="pickMusicBg">更换图片</button>
          <button class="m-bg-btn danger" @click="clearMusicBg">清空图片</button>
        </div>
        <div class="m-bg-slider">
          <span class="m-bg-label">背景透明度</span>
          <span class="m-bg-val">{{ music.musicBgOpacity }}%</span>
          <input
            type="range" min="10" max="100" step="1"
            :value="music.musicBgOpacity"
            @input="onMusicBgOpacity"
            class="m-bg-range"
          />
        </div>
        <button class="m-bg-btn ok" @click="mBgMenu = false">完成</button>
      </div>
    </div>

    <!-- 背景图裁剪 -->
    <ImageCropper
      v-if="mCropSrc"
      :src="mCropSrc"
      title="裁剪背景图"
      :ratio="2"
      @cancel="mCropSrc = ''"
      @done="onMusicBgCropped"
      @error="mCropSrc = ''"
    />
    <input ref="mFileEl" type="file" accept="image/*" hidden @change="onMusicBgFile" />

    <!-- 备忘录 / 经期：独立卡片，不再塞进卡片 B -->
        <div class="cb-boxes">
          <button class="cb-box" :class="{ 'is-todo': memoPin && memoPin.type === 'todo' && (memoPin.title || memoPin.todos.length) }" @click="onMemoCardClick">
            <span class="cb-label">备忘录<span v-if="memoPin" class="cb-memo-type" :class="{ todo: memoPin.type === 'todo' }">{{ memoPin.type === 'todo' ? '待办' : '便签' }}</span></span>
            <!-- 待办：标题 + 方框事项（无标题直接列事项），超量淡出省略，卡片大小恒定 -->
            <template v-if="memoPin && memoPin.type === 'todo' && (memoPin.title || memoPin.todos.length)">
              <span class="cb-todos" :class="{ faded: memoTodosMore }">
                <span v-if="memoPin.title" class="cb-todo-title">{{ memoPin.title }}</span>
                <span v-for="t in memoPinTodos" :key="t.text" class="cb-todo-item" :class="{ done: t.done }">
                  <i class="cb-todo-box" /><span class="cb-todo-txt">{{ t.text }}</span>
                </span>
              </span>
            </template>
            <span v-else class="cb-text" :class="{ empty: !memoPinnedText }">{{ memoPinnedText || '记点什么…' }}</span>
          </button>
          <button class="cb-box cb-period" @click="cyclePeriodCard">
            <span class="cb-label">{{ periodCard.title }}</span>
            <span class="cb-period-big">{{ periodCard.big }}</span>
          </button>
        </div>

        <!-- 4×2 迷你应用（不在卡片里，单独拿出） -->
        <div class="cb-mini">
          <DesktopIcon
            v-for="m in miniApps"
            :key="m.label"
            :icon="m.icon"
            :name="m.label"
            :img="iconBg(m.icon)"
            @click="go(m.path)"
          />
        </div>
      </section>
    </div>

    <!-- 页码圆点（只表示两页桌面，不显示联系人信息） -->
    <div class="dots-row">
      <button
        v-for="i in 2"
        :key="i"
        class="dot"
        :class="{ on: activePage === i - 1 }"
        @click="goPage(i - 1)"
      ></button>
    </div>

    <!-- 纪念日选择弹窗 -->
    <AnniversaryPicker
      v-if="showAnnPicker"
      :current-id="Number(home.annId) || 0"
      :contact-id="desktop.currentContactId"
      :contact-name="contactsStore.getById(desktop.currentContactId)?.name"
      @close="showAnnPicker = false"
      @select="onPickAnniversary"
    />

    <!-- 编辑弹层 -->
    <div v-if="editKey" class="modal-mask" @click.self="editKey = null">
      <div class="modal">
        <h3 class="mo-title">{{ EDIT_META[editKey]?.title }}</h3>
        <textarea
          v-model="draft"
          class="mo-input mo-textarea"
          :placeholder="EDIT_META[editKey]?.ph"
          :maxlength="signMaxlength"
          rows="3"
        ></textarea>
        <div class="mo-actions">
          <button class="mo-btn" @click="editKey = null">取消</button>
          <button class="mo-btn mo-primary" @click="saveEdit">保存</button>
        </div>
      </div>
    </div>

    <!-- ═══ 音乐播放表：点「音乐」从底部弹出（酷狗式） ═══ -->
    <div v-if="musicSheet" class="ms-mask" @click.self="musicSheet = false">
      <div class="ms-sheet">
        <div class="ms-grabber"></div>
        <div class="ms-head">
          <span class="ms-title">播放列表</span>
          <span class="ms-count">{{ music.songs.length }} 首</span>
          <span class="ms-spacer"></span>
          <button class="ms-lib" @click="musicSheet = false; router.push('/music')"><AppIcon name="grid" :size="15" /> 曲库</button>
        </div>

        <div class="ms-list">
          <div
            v-for="s in music.songs"
            :key="s.id"
            class="ms-row"
            :class="{ on: music.current?.id === s.id, flash: sheetFlashId === s.id }"
            :data-sid="s.id"
            @click="music.playSong(s, music.songs, '全部音乐')"
          >
            <span class="ms-cover">
              <img v-if="s.cover" :src="s.cover" alt="" loading="lazy" />
              <AppIcon v-else name="music" :size="16" color="var(--accent)" />
            </span>
            <span class="ms-main">
              <span class="ms-name">{{ s.title }}</span>
              <span class="ms-artist">{{ s.artist || '未知歌手' }}</span>
            </span>
            <button class="ms-act" :class="{ on: music.myFavSet.has(s.id) }" @click.stop="music.toggleFav(s)" :aria-label="music.myFavSet.has(s.id) ? '取消收藏' : '收藏'">
              <AppIcon :name="music.myFavSet.has(s.id) ? 'heart-solid' : 'heart'" :size="15" :filled="music.myFavSet.has(s.id)" :color="music.myFavSet.has(s.id) ? 'var(--accent)' : 'var(--text-soft)'" />
            </button>
            <button class="ms-act" @click.stop="music.playNext(s)" aria-label="下一首播放"><AppIcon name="playNext" :size="16" color="var(--text-soft)" /></button>
            <span v-if="music.current?.id === s.id && music.playing" class="ms-playing"><AppIcon name="music" :size="13" color="var(--accent)" /></span>
          </div>
          <p v-if="!music.songs.length" class="ms-empty">曲库还是空的<br /><span class="ms-empty-sub">去「曲库 → 设置」导入网易云/酷狗歌曲</span></p>
        </div>

        <!-- 底部播放条 -->
        <div class="ms-bar">
          <!-- 进度光亮条 -->
          <div class="ms-prog" @click="msSeek($event)">
            <div class="ms-prog-on" :style="{ width: msProg + '%' }"></div>
          </div>
          <template v-if="music.current">
            <span class="ms-bar-cover" @click="music.showLyrics = true">
              <img v-if="music.current.cover" :src="music.current.cover" alt="" />
              <AppIcon v-else name="music" :size="16" color="var(--accent)" />
            </span>
            <span class="ms-bar-main">
              <span class="ms-bar-title">{{ music.current.title }}</span>
              <span class="ms-bar-artist">{{ music.current.artist || '' }}</span>
            </span>
            <span class="ms-ctrl">
              <button class="ms-bar-btn" @click="music.prev()" aria-label="上一首"><AppIcon name="prev" :size="20" /></button>
              <button class="ms-bar-btn" @click="music.toggle()" aria-label="播放暂停"><AppIcon :name="music.playing ? 'pause' : 'play'" :size="28" /></button>
              <button class="ms-bar-btn" @click="music.next()" aria-label="下一首"><AppIcon name="next" :size="20" /></button>
            </span>
          </template>
          <span v-else class="ms-bar-empty">还没有在听的歌</span>
        </div>

        <!-- 右下角锚点：定位正在播放 -->
        <button v-if="music.current" class="ms-jump" aria-label="定位正在播放" @click="jumpInSheet">
          <AppIcon name="music" :size="15" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 显式命名，配合 App.vue 的 <keep-alive>：
// 从子页面返回主页时组件不重建，保留当前所在页（第1页/第2页）与滚动位置
defineOptions({ name: 'HomeView' })

import { onMounted, onActivated, onUnmounted, ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import DesktopIcon from '@/components/home/DesktopIcon.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import AnniversaryPicker from '@/components/common/AnniversaryPicker.vue'
import { getAnniversaries } from '@/api/anniversary'
import { listItems } from '@/api/items'
import { useBadgesStore } from '@/stores/badges'
import { useContactsStore } from '@/stores/contacts'
import { useDesktopStore } from '@/stores/desktop'
import { useHomeStore } from '@/stores/home'
import { useSettingsStore } from '@/stores/settings'
import { useMusicStore, bindAudioEvents } from '@/stores/music'
import { useNotificationsStore } from '@/stores/notifications'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { uploadFile } from '@/api/contacts'
import { useItems } from '@/composables/useItems'
import { cyclesFromItems, cycleOf, ovulationWindow, predictNext, fmtDate, dayDiff } from '@/utils/period'

const router = useRouter()
const badgesStore = useBadgesStore()
const contactsStore = useContactsStore()
const desktop = useDesktopStore()
const homeStore = useHomeStore()
const settingsStore = useSettingsStore()
const { chat, moments, letters } = storeToRefs(badgesStore)

/* 当前选中联系人（主页是共用的，卡片展示谁由 homeStore 决定） */
const curContact = computed(() => desktop.contact)
const isGroup = computed(() => curContact.value?.kind === 'group')

/* 首页数据（后端持久化在 contact_desktop，按联系人隔离） */
const home = reactive({ sign: '', love: 0, annId: 0, listenHours: 0, memo: '', period: '', myName: '', myAvatar: '', partnerName: '', partnerAvatar: '', avaLeft: 'me', cardBg: '', cardBgOpacity: 100 })

/* ═══ 经期卡片：状态大字展示（经期/排卵期/预测），点击在 排卵期 ↔ 预测 间切换 ═══ */
const { items: periodItems, load: loadPeriodItems } = useItems('period')
const periodCycles = computed(() => cyclesFromItems(periodItems.value))
/* auto：经期 > 排卵期 > 预测；ovu / pred：手动切换视图 */
const periodCardMode = ref('auto')
const periodCard = computed(() => {
  const cycles = periodCycles.value
  const t = fmtDate(new Date())
  const ovu = ovulationWindow(cycles)
  const pred = predictNext(cycles)
  if (periodCardMode.value === 'ovu' && ovu) {
    if (t < ovu.start) return { title: '排卵期', big: `${dayDiff(ovu.start, t)} 天后` }
    if (t <= ovu.end) return { title: '排卵期', big: `第 ${dayDiff(t, ovu.start) + 1} 天` }
    return { title: '排卵期', big: `已过 ${dayDiff(t, ovu.end)} 天` }
  }
  if (periodCardMode.value === 'pred' && pred) {
    const du = dayDiff(pred.start, t)
    return { title: '距离预测经期', big: du > 0 ? `${du} 天` : du === 0 ? '今天来' : `已过 ${-du} 天` }
  }
  const cyc = cycleOf(cycles, t)
  if (cyc) return { title: '经期', big: `第 ${dayDiff(t, cyc.start) + 1} 天` }
  if (ovu && t >= ovu.start && t <= ovu.end) {
    return { title: '排卵期', big: `第 ${dayDiff(t, ovu.start) + 1} 天` }
  }
  if (pred) {
    const du = dayDiff(pred.start, t)
    if (du > 0) return { title: '距离预测经期', big: `${du} 天` }
    if (du === 0) return { title: '距离预测经期', big: '今天来' }
    return { title: '距离预测经期', big: `已过 ${-du} 天` }
  }
  return { title: '经期', big: '记录经期' }
})
/* 点击卡片：auto → 排卵期 → 预测 → auto */
function cyclePeriodCard() {
  periodCardMode.value = periodCardMode.value === 'auto' ? 'ovu' : periodCardMode.value === 'ovu' ? 'pred' : 'auto'
}

/* ═══ 人物卡：只展示当前选中联系人（单人），切换在设置页里做 ═══ */
/* 桌面数据缓存，卡片直接显示当前联系人的头像/昵称/签名/背景 */
const deskCache = reactive({})
const curCard = computed(() => {
  const c = curContact.value
  /* 人物卡只与单人有关，群聊不参与 */
  if (!c || c.kind === 'group') return null
  const d = deskCache[c.id] || {}
  const my = { name: d.my_name || '我', avatar: d.my_avatar || '' }
  const you = {
    name: d.partner_name || c.name || '对方',
    avatar: d.partner_avatar || c.avatar || ''
  }
  const pair = d.ava_left === 'partner' ? [you, my] : [my, you]
  return {
    id: c.id,
    kind: c.kind,
    sign: d.sign || '',
    cardBg: d.card_bg || '',
    left: pair[0],
    right: pair[1],
    /* 有名字就算有 partner */
    hasPartner: !!(d.partner_name || d.partner_avatar || c.avatar || c.name)
  }
})

/* ═══ 主题（全局）：桌面图标的单独背景图 ═══
   主页背景图已上移到 App 的 rv-wrap 铺满全屏（底栏毛玻璃才能透出它） */
const theme = computed(() => settingsStore.global?.theme || {})
function iconBg(name) {
  return theme.value.icons?.[name] || ''
}

/* 卡片背景：取当前选中联系人的桌面背景，透明度由 cardBgOpacity 控制
   （数值越低，白色蒙层越厚，背景越淡；保留一点底纱保证文字可读） */
const cardBgStyle = computed(() => {
  const bg = curCard.value?.cardBg || home.cardBg
  if (!bg) return {}
  const op = Number(home.cardBgOpacity) || 100
  const k = 1 - op / 100
  /* 深色模式：蒙层换成黑色压暗图片；浅色模式保持白纱 */
  const dark = settingsStore.isDark
  const mask = (dark ? 0.5 + k * 0.35 : 0.12 + k * 0.75).toFixed(3)
  const rgb = dark ? '0,0,0' : '255,255,255'
  return {
    backgroundImage: `linear-gradient(rgba(${rgb},${mask}), rgba(${rgb},${mask})), url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})
function syncHome() {
  /* 同步当前联系人的桌面数据到 home，并刷新轨道缓存里的这一项 */
  const d = desktop.d || {}
  if (desktop.currentContactId) {
    deskCache[desktop.currentContactId] = {
      ...deskCache[desktop.currentContactId],
      sign: d.sign ?? '',
      card_bg: d.cardBg ?? '',
      my_name: d.myName ?? '',
      my_avatar: d.myAvatar ?? '',
      partner_name: d.partnerName ?? '',
      partner_avatar: d.partnerAvatar ?? '',
      ava_left: d.avaLeft ?? 'me'
    }
  }
  Object.assign(home, {
    sign: d.sign ?? '',
    love: d.love ?? 0,
    annId: d.annId ?? 0,
    listenHours: d.listenHours ?? 0,
    memo: d.memo ?? '',
    period: d.period ?? '',
    myName: d.myName ?? '',
    myAvatar: d.myAvatar ?? '',
    partnerName: d.partnerName ?? '',
    partnerAvatar: d.partnerAvatar ?? '',
    avaLeft: d.avaLeft ?? 'me',
    cardBg: d.cardBg ?? '',
    cardBgOpacity: Number(d.cardBgOpacity) || 100
  })
}

/* 时间 / 日期 */
const timeStr = ref('')
const dateStr = ref('')
function tick() {
  const d = new Date()
  timeStr.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  dateStr.value = `${d.getMonth() + 1}月${d.getDate()}日 周${'日一二三四五六'[d.getDay()]}`
}

/* 纪念日：从已添加的纪念日列表中选一个显示 */
const anniversaries = ref([])
const showAnnPicker = ref(false)

/* 纪念日：优先显示当前主体手动选中的那张；没选过就回落到该主体的第一张专属纪念日
   （接口已按 contactId 过滤，列表 = 本主体专属 + 通用，所以每个主体显示的都不同） */
const curAnn = computed(
  () =>
    anniversaries.value.find((a) => a.id === Number(home.annId)) ||
    anniversaries.value[0] ||
    null
)
const annTitle = computed(() => curAnn.value?.title || '未设置')
/* 天数文案随类型变化：
   - 纪念日：只显示天数（如「967 天」）
   - 倒数日：名称后跟小号「还有」，下方大号显示「N 天」（当天则「就是今天」） */
const annNum = computed(() => {
  const a = curAnn.value
  if (!a || a.days_passed == null) return ''
  if (a.type === 'countdown') {
    if (a.days_until === 0) return '就是今天'
    const days = a.days_until > 0 ? a.days_until : Math.abs(a.days_until || 0)
    return `${days} 天`
  }
  /* 纪念日：只显示累计天数；若日期还没到（还没开始累计），回落到「还有 N 天」，避免出现 0 天 */
  if (a.days_passed > 0) return `${a.days_passed} 天`
  if (a.days_until > 0) return `${a.days_until} 天`
  return `${a.days_passed} 天`
})
/* 「还有 / 已过」这类前缀：只在倒数（未到/已过期）时出现，且以小号跟在名称后面，不与天数同大 */
const annPrefix = computed(() => {
  const a = curAnn.value
  if (!a) return ''
  if (a.type === 'countdown') {
    if (a.days_until === 0) return ''
    return a.days_until > 0 ? '还有' : '已过'
  }
  if (a.days_passed > 0) return ''
  if (a.days_until > 0) return '还有'
  return ''
})

async function loadAnniversaries() {
  try {
    anniversaries.value = await getAnniversaries({ contactId: desktop.currentContactId })
  } catch (e) {
    anniversaries.value = []
  }
}
function openAnnPicker() {
  showAnnPicker.value = true
}
function onPickAnniversary(a) {
  home.annId = a.id
  showAnnPicker.value = false
  persistHome()
}

/* 灵魂链接：心数随机 1~5，实心且微微忽亮忽暗，不做人为点击改变。
   每次切到新主体时重新随机，所以每个主体显示的心数都不一样 */
const loveCount = ref(3)
let loveForId = null
function rollLove() {
  const id = Number(homeStore.selectedId) || 0
  if (loveForId === id) return
  loveForId = id
  loveCount.value = 1 + Math.floor(Math.random() * 5)
}

/* 编辑弹层 */
const EDIT_META = {
  sign: { title: '签名', ph: '写一句只属于你们的话…' },
  period: { title: '经期记录', ph: '例如：10/1 - 10/5' }
}
const editKey = ref(null)
const draft = ref('')
/* 签名最多 20 字；备忘录/经期不设上限 */
const signMaxlength = computed(() => (editKey.value === 'sign' ? 20 : null))
function openEdit(key) {
  editKey.value = key
  draft.value = home[key] || ''
}

/* ═══ 桌面备忘录卡：展示已置顶的待办/便签，多个置顶时点击来回切换 ═══ */
const memoPins = ref([])
const memoPinIdx = ref(0)
const memoPin = computed(() => {
  const pins = memoPins.value
  if (!pins.length) return null
  return pins[memoPinIdx.value % pins.length]
})
/* 便签：首行文本；待办无标题时兜底取第一条未完成事项 */
const memoPinnedText = computed(() => {
  const m = memoPin.value
  if (!m) return ''
  if (m.type === 'todo') return m.title || m.todos.find((t) => !t.done)?.text || '已完成'
  return String(m.note || '').split('\n')[0]
})
/* 待办事项展示：有标题显 2 条、无标题显 3 条，超出的收进「…」，卡片大小不变 */
const memoPinTodos = computed(() => {
  const m = memoPin.value
  if (!m || m.type !== 'todo') return []
  return m.todos.slice(0, m.title ? 2 : 3)
})
const memoTodosMore = computed(() => {
  const m = memoPin.value
  if (!m || m.type !== 'todo') return false
  return m.todos.length > (m.title ? 2 : 3)
})
async function loadMemoPins() {
  try {
    const rows = await listItems('memo')
    memoPins.value = rows
      .map((it) => {
        const ex = it.extra || {}
        let type = ex.type
        let todos = ex.todos || []
        if (!type) {
          type = 'todo'
          todos = it.title ? [{ text: it.title, done: !!Number(it.done) }] : []
        }
        return { ...it, type, todos, pinned: !!Number(ex.pinned), note: it.body || '' }
      })
      .filter((m) => m.pinned)
    if (memoPinIdx.value >= memoPins.value.length) memoPinIdx.value = 0
  } catch (e) {
    memoPins.value = []
  }
}
function onMemoCardClick() {
  if (!memoPins.value.length) {
    router.push('/memo')
    return
  }
  /* 多个置顶：点击切换到下一个（循环来回） */
  memoPinIdx.value = (memoPinIdx.value + 1) % memoPins.value.length
}
/* 一起听时长展示：满一小时显示「几小时几分钟」 */
function fmtListenMin(m) {
  m = Math.max(0, Number(m) || 0)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} 小时 ${r} 分钟` : `${h} 小时`
}
async function saveEdit() {
  const v = draft.value
  home[editKey.value] = v
  editKey.value = null
  persistHome()
}
async function persistHome() {
  desktop.d = {
    ...desktop.d,
    sign: home.sign,
    love: home.love,
    annId: home.annId,
    memo: home.memo,
    period: home.period,
    myName: home.myName,
    myAvatar: home.myAvatar,
    partnerName: home.partnerName,
    partnerAvatar: home.partnerAvatar,
    avaLeft: home.avaLeft,
    cardBg: home.cardBg,
    cardBgOpacity: Number(home.cardBgOpacity) || 100
  }
  try { await desktop.save() } catch (e) { /* 静默 */ }
}

/* 卡片 B 音乐播放器：接入全局音乐 store（真实播放，曲库来自音乐页导入） */
const music = useMusicStore()
const toast = useNotificationsStore()
const playing = computed(() => music.playing)
const curSong = computed(
  () =>
    music.current || {
      title: '还没有在听的歌',
      artist: '去「音乐」导入一首吧',
      cover: ''
    }
)

/* 循环模式：list 歌单循环 / random 随机播放 / one 单曲循环（每个联系人独立保存） */
const MODES = [
  { key: 'list', short: '顺序', label: '顺序播放', icon: 'order' },
  { key: 'one', short: '循环', label: '单曲循环', icon: 'loopOne' },
  { key: 'random', short: '随机', label: '随机播放', icon: 'shuffle' }
]
const loopMode = computed(() => music.mode)
const curMode = computed(() => MODES.find((m) => m.key === loopMode.value) || MODES[0])
/* 单击循环切换：歌单循环 → 随机 → 单曲 → 歌单循环 */
function cycleLoop() {
  music.cycleMode()
}

function togglePlay() {
  music.toggle()
}
const msProg = computed(() => (music.duration ? (music.currentTime / music.duration) * 100 : 0))
function msSeek(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  music.seek((e.clientX - rect.left) / rect.width)
}
function prevSong() {
  music.prev()
}
function nextSong() {
  music.next()
}

/* 卡片 B 迷你应用（与第一页一致的应用图标） */const miniApps = computed(() => [
  { label: '音乐', icon: 'music', path: '/music' },
  { label: '影院', icon: 'film', path: '/cinema' },
  { label: '游戏', icon: 'game', path: '/game' },
  { label: '心情', icon: 'mood', path: '/mood' },
  { label: '备忘录', icon: 'memo', path: '/memo' },
  { label: '经期', icon: 'drop', path: '/period' },
  { label: '相册', icon: 'image', path: '/album' },
  { label: '统计', icon: 'chart', path: '/stats' }
])

/* 应用网格（4 列，统一的简约纯色图标底，不再用马卡龙色系） */
const apps = computed(() => [
  { label: '聊天', icon: 'chat', path: '/contacts', badgeKey: 'chat' },
  { label: '朋友圈', icon: 'moments', path: '/moments', badgeKey: 'moments' },
  { label: '信件', icon: 'letter', path: '/letters', badgeKey: 'letters' },
  { label: '感知', icon: 'diary', path: '/diary' },
  { label: '纪念', icon: 'calendar', path: '/anniversary' },
  { label: '陪伴', icon: 'archive', path: '/archive' },
  { label: '占卜', icon: 'divination', path: '/divination' },
  { label: '心迹', icon: 'trace', path: '/workspace' }
])
const badges = computed(() => ({ chat: chat.value, moments: moments.value, letters: letters.value }))

function go(path) {
  // 聊天图标：进入微信式聊天列表（列表内再分联系人）
  if (path === '/contacts') {
    router.push('/chats')
    return
  }
  // 字卡：进入该联系人的专属 + 通用字卡
  if (path === '/cards') {
    router.push(`/contacts/${desktop.currentContactId}/cards`)
    return
  }
  router.push(path)
}

/* 左右翻页 */
const pager = ref(null)
/* 音乐播放表弹层：点卡片 B 的胶片弹出 */
/* 播放列表右下角锚点：跳到正在播放的那首 */
const sheetFlashId = ref(null)
function jumpInSheet() {
  const cur = music.current
  if (!cur) return
  const el = document.querySelector(`.ms-row[data-sid="${cur.id}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  sheetFlashId.value = cur.id
  setTimeout(() => { if (sheetFlashId.value === cur.id) sheetFlashId.value = null }, 1400)
}

/* ═══ 音乐卡背景 ═══ */
const mBgMenu = ref(false)
const mCropSrc = ref('')
const mFileEl = ref(null)
const musicCardBgStyle = computed(() => {
  const bg = music.musicBg
  if (!bg) return {}
  const op = Number(music.musicBgOpacity) || 100
  const k = 1 - op / 100
  const dark = settingsStore.isDark
  const mask = (dark ? 0.5 + k * 0.35 : 0.12 + k * 0.75).toFixed(3)
  const rgb = dark ? '0,0,0' : '255,255,255'
  return {
    backgroundImage: `linear-gradient(rgba(${rgb},${mask}), rgba(${rgb},${mask})), url(${bg})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  }
})
function onMusicCardTap() {
  /* 点卡片空白处：没设置过背景就直接选图；已有背景则弹出操作菜单 */
  if (music.musicBg) { mBgMenu.value = true; return }
  pickMusicBg()
}
function pickMusicBg() {
  mBgMenu.value = false
  mFileEl.value?.click()
}
function onMusicBgFile(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  mCropSrc.value = URL.createObjectURL(f)
}
async function onMusicBgCropped(blob) {
  mCropSrc.value = ''
  if (!blob) return
  try {
    const file = new File([blob], `mbg-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const res = await uploadFile(file)
    const path = res?.path
    if (!path) throw new Error('上传返回为空')
    await music.saveSettings({ musicBg: path })
    toast.pushToast({ title: '背景已更新', text: '可以再点卡片调整透明度' })
  } catch (err) {
    toast.pushToast({ title: '上传失败', text: err.message })
  }
}
async function clearMusicBg() {
  await music.saveSettings({ musicBg: '' })
  mBgMenu.value = false
  toast.pushToast({ title: '已清空背景图' })
}
let mBgOpTimer = null
function onMusicBgOpacity(e) {
  const v = Math.max(10, Math.min(100, Number(e.target.value) || 100))
  music.musicBgOpacity = v
  clearTimeout(mBgOpTimer)
  mBgOpTimer = setTimeout(() => {
    music.saveSettings({ musicBgOpacity: v }).catch(() => {})
  }, 400)
}

function openMusicSheet() {
  bindAudioEvents()
  music.init(desktop.currentContactId)
  musicSheet.value = true
}
const musicSheet = ref(false)
const activePage = ref(0)
/* 恢复页码期间抑制 scroll 事件同步，避免 scrollLeft 归零把圆点拉回第1页 */
let restoring = false
function onScroll() {
  const el = pager.value
  if (!el || restoring) return
  const idx = Math.round(el.scrollLeft / el.clientWidth)
  if (idx !== activePage.value) activePage.value = idx
}
function goPage(i) {
  const el = pager.value
  if (!el) return
  activePage.value = i
  el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' })
}

async function bootHome() {
  try { await contactsStore.load() } catch (e) {}
  await desktop.ensureValid()
  /* 主页共用：算出最近互动顺序，并默认选中最近的一位 */
  await homeStore.loadRecents(contactsStore.list)
  /* 人物卡只与单人有关：当前选中的是群聊时，自动落到最近的一位单人 */
  const persons = contactsStore.list.filter((c) => c.kind !== 'group')
  const cur = contactsStore.getById(homeStore.selectedId)
  const needPick = !homeStore.selectedId || !cur || cur.kind === 'group'
  if (needPick) {
    const nextId = homeStore.trackIds.find((id) => Number(id) !== Number(cur?.id)) || persons[0]?.id
    if (nextId) {
      homeStore.select(nextId)
      desktop.setCurrent(nextId)
    }
  }
  await desktop.load(homeStore.selectedId)
  syncHome()
  rollLove()
  loadAnniversaries()
  loadMemoPins()
}

onMounted(async () => {
  tick()
  const clockTimer = setInterval(tick, 30000)
  onUnmountedClear(clockTimer)
  await bootHome()
  loadPeriodItems()
  bindAudioEvents()
  music.init(desktop.currentContactId)
  try { await badgesStore.load() } catch (e) {}
})

/* 从子页面返回时：静默刷新数据，但保留所在页码、不重播入场动画 */
onActivated(async () => {
  tick()
  // keep-alive 复用缓存实例，但DOM重新挂载时 pager.scrollLeft 会被浏览器重置为 0，
  // 导致"圆点显示第2页、内容却回到第1页"的错位。这里恢复到上次所在页。
  restorePage()
  await bootHome()
  loadPeriodItems()
  music.init(desktop.currentContactId)
  try { await badgesStore.load() } catch (e) {}
})

/* 兜底：其他入口（如设置页切换器）改动 currentContactId 时，同步主页选中态 */
watch(
  () => desktop.currentContactId,
  async (id) => {
    if (Number(id) === Number(homeStore.selectedId)) return
    homeStore.select(id)
  }
)

/* 把 pager 恢复到当前 activePage 对应的位置 */
function restorePage() {
  const el = pager.value
  if (!el) return
  const target = activePage.value * el.clientWidth
  if (Math.abs(el.scrollLeft - target) > 2) {
    restoring = true
    el.scrollLeft = target
    // 下一帧再解除抑制，避开挂载期的 scroll 事件
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { restoring = false })
    })
  }
}

function onUnmountedClear(t) {
  if (t) clearInterval(t)
}
</script>

<style scoped>
.home {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 背景图铺在外层 rv-wrap 上，这里保持透明才能透出背景图与底栏毛玻璃 */
  background: transparent;
}

/* ═══ 翻页容器 ═══ */
.pager {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.pager::-webkit-scrollbar { display: none; }

.page {
  flex: 0 0 100%;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  scroll-snap-align: start;
  padding: 22px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ═══ 大卡片 A / B：统一样式与高度 ═══ */
.card-a, .card-b {
  background: var(--card-bg-screen);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 16px 14px;
  /* 两张卡片视觉高度协调：人物卡签名可换行，故用 min-height 让其自适应 */
  min-height: 168px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
}
/* 两张卡片默认都跟随全局「卡片透明度」（与卡片 B 一致）。
   人物卡 A 若单独设了背景图，则由 cardBgStyle 内联覆盖（用卡片自己的背景透明度），
   没有背景图时自然回落到全局卡片透明度 */
/* 人物卡内容整体下移一点：加大上内边距，卡片自身高度不变 */
.card-a { padding-top: 30px; }
/* ═══ 人物卡：单卡展示，点击进设置页切换 ═══ */
.card-single {
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  cursor: pointer;
}
.card-none {
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: default;
}
.cn-text { font-size: 13px; color: var(--text-soft); }
.cn-btn {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 999px;
}
/* 大卡片 A 布局（按手绘图2）：交叠头像 + 昵称在头像下 + 时间/日期；签名在卡片下方 */
.ca-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ca-avatars {
  display: flex;
  align-items: flex-start;
  flex: 0 0 auto;
}
/* 单个「头像 + 昵称」竖排单元 */
.ca-ava-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 58px;
}
.ca-ava-overlap { margin-left: -20px; }
.ca-ava {
  box-shadow: 0 0 0 2.5px var(--bg-screen), var(--shadow);
}
.ca-name {
  font-size: 11px;
  line-height: 1.2;
  color: var(--text);
  max-width: 66px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ca-add {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--bg-soft);
  border: 1.5px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 2.5px var(--bg-screen);
}
/* 签名：头像下方独立一行，居中 */
.ca-sign {
  margin-top: 10px;
  min-width: 0;
  text-align: center;
}
/* 签名：过长时自动换行显示（最多两行），不隐藏内容 */
.ca-sign-text {
  font-family: var(--font-serif);
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-soft);
  word-break: break-word;
  overflow-wrap: anywhere;
  max-height: 2.9em;
  overflow: hidden;
}
/* 签名：固定文字色，不跟随主题色变化 */
.ca-sign-text:not(.empty) { color: var(--text); }
.ca-right {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.ca-time {
  font-family: var(--font-serif);
  font-size: 26px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 1px;
  line-height: 1.1;
}
.ca-date { font-size: 12px; color: var(--text-soft); }

.ca-boxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ca-box {
  border: 1px solid var(--border);
  background: var(--card-bg-soft);
  border-radius: var(--radius-sm);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  /* 与第 2 页的备忘录 / 经期卡片保持一致 */
  min-height: 96px;
}
.cb-label {
  font-size: 11px;
  color: var(--text-soft);
  letter-spacing: 1px;
}
/* 倒数前缀「还有 / 已过」：小号，跟在纪念日名称后面，不与天数同大 */
.cb-haiyou {
  font-size: 11px;
  color: var(--text-soft);
  letter-spacing: 1px;
  margin-left: 4px;
}
/* 灵魂链接爱心：参考站实现 —— 5 个槽位，fas 实心心形；
   点亮的是满色主题色，未点亮的只有约 20% 透明度的主题色（很淡）；
   所有点亮的心同频呼吸（无 animation-delay，不交错），幅度微弱 */
.love-row { display: flex; gap: 7px; align-items: center; justify-content: center; margin: 2px 0; }
.love-heart {
  color: var(--accent);
  opacity: 0.2;
  transition: opacity 0.3s ease, color 0.3s ease;
}
.love-heart.on {
  opacity: 1;
  animation: heart-glow 1.5s ease-in-out infinite;
}
@keyframes heart-glow {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.87); }
}
.cb-value {
  font-family: var(--font-serif);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
/* 纪念日卡片的天数：跟随主题色，并比其它卡片数值更大一点 */
.cb-value.ann-days {
  color: var(--accent);
  font-size: 30px;
  line-height: 1.15;
  letter-spacing: 0.5px;
}
/* 纪念日卡片：名称 + 天数两行 */
.cb-sub {
  font-size: 11px;
  color: var(--text-soft);
}

/* ═══ 应用网格 ═══ */
.app-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px 4px;
  justify-items: center;
  padding: 4px 0 8px;
}

/* ─── 音乐卡背景设置 ─── */
.m-bg-ops { display: flex; gap: 10px; margin: 6px 0 14px; }
.m-bg-btn {
  flex: 1; padding: 11px 0; border-radius: 12px; border: none;
  background: var(--bg-soft); color: var(--text); font-size: 14px;
}
.m-bg-btn.danger { color: #c0576b; }
.m-bg-btn.ok { width: 100%; background: var(--accent); color: #fff; font-weight: 600; }
.m-bg-slider { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: center; margin-bottom: 12px; }
.m-bg-label { font-size: 13px; color: var(--text-soft); }
.m-bg-val { font-size: 13px; color: var(--accent); font-weight: 600; text-align: right; }
.m-bg-range { grid-column: 1 / -1; width: 100%; accent-color: var(--accent); }

/* ═══ 大卡片 B（共享 .card-b 统一样式） ═══ */
/* 音乐播放器（按手绘图1）：唱片 + 歌名 + 控制 + 一起听 */
.player {
  display: flex;
  align-items: center;
  gap: 16px;
}
/* 唱片（胶片）：黑胶纹理 + 中心歌曲封面 + 中心孔 */
.disc {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: 50%;
  flex: 0 0 auto;
  cursor: pointer;
  background:
    radial-gradient(circle, rgba(255,255,255,0.16) 0 1.5px, transparent 1.5px),
    repeating-radial-gradient(circle, #43403a 0 3px, #524e46 3px 6px);
  box-shadow: var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
/* 中心封面 */
.disc-cover {
  position: absolute;
  inset: 13px;
  width: calc(100% - 26px);
  height: calc(100% - 26px);
  border-radius: 50%;
  object-fit: cover;
  z-index: 1;
}
/* 无封面时的占位图标 */
.disc-fallback {
  position: relative;
  z-index: 1;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* 中心孔 */
.disc::after {
  content: '';
  position: absolute;
  z-index: 2;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bg-screen);
  box-shadow: 0 0 0 1.5px rgba(0,0,0,0.25);
}
.disc.spin { animation: disc-spin 5s linear infinite; }
@keyframes disc-spin { to { transform: rotate(360deg); } }
.player-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.song-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.song-artist {
  font-size: 12px;
  color: var(--text-soft);
  margin-top: -8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-name {
  font-family: var(--font-serif);
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ctrl-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
/* 播放模式切换按钮：与播放键同一行，右侧对齐 */
.mode-cycle {
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 10px;
  line-height: 1;
  color: var(--accent);
  font-weight: 600;
  flex: 0 0 auto;
  white-space: nowrap;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.15s ease;
}
.mode-cycle:active { transform: scale(0.92); }
.mode-txt { letter-spacing: 0.02em; }
.ctrl-btn {
  border: none;
  background: transparent;
  padding: 2px;
  display: flex;
  align-items: center;
  color: var(--text);
  transition: transform 0.15s ease, color 0.2s ease;
}
.ctrl-btn:active { transform: scale(0.88); }
.ctrl-main { color: var(--accent); }
.ctrl-spacer { flex: 1 1 auto; }
/* 播放方式按钮向中间靠近一点 */
.mode-btn.mode-cycle { margin-right: 26px; }
.listen-row {
  margin-top: 12px;
  padding: 10px 2px 0;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}
.listen-val {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-soft);
  letter-spacing: 1px;
}
.cb-boxes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cb-box {
  border: 1px solid var(--border);
  background: var(--card-bg-soft);
  border-radius: var(--radius-sm);
  padding: 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 与第 1 页的灵魂链接 / 纪念日卡片保持一致 */
  min-height: 96px;
  text-align: left;
}
.cb-text {
  font-size: 12px;
  color: var(--text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cb-text.empty { color: var(--text-soft); }
/* 经期卡片：小字标题上方居中 + 状态大字（点击在 排卵期/预测 间切换） */
.cb-period { align-items: center; justify-content: center; text-align: center; gap: 6px; padding: 12px; }
.cb-period .cb-label { text-align: center; }
.cb-period-big { font-size: 22px; font-weight: 700; color: var(--accent); font-family: var(--font-serif); line-height: 1.15; }
/* 备忘录卡类型角标：标签右侧纯文字标注「待办/便签」（无外框） */
.cb-memo-type {
  margin-left: 6px; font-size: 10px; letter-spacing: 1px; vertical-align: 1px;
  color: var(--text-soft);
}
.cb-memo-type.todo { color: #5b8def; }
/* 待办卡内容：标题 + 方框事项；卡片高度与普通状态恒定（96px），放不下淡出省略 */
.cb-box.is-todo { height: 96px; padding-top: 10px; padding-bottom: 10px; gap: 6px; }
.cb-todos { display: flex; flex-direction: column; gap: 3px; flex: 1; min-height: 0; overflow: hidden; }
.cb-todos.faded { -webkit-mask-image: linear-gradient(to bottom, #000 62%, transparent 96%); mask-image: linear-gradient(to bottom, #000 62%, transparent 96%); }
.cb-todo-title { font-size: 11px; line-height: 1.35; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-todo-item { display: flex; align-items: center; gap: 6px; font-size: 11px; line-height: 1.35; color: var(--text); min-height: 0; flex: none; }
.cb-todo-item .cb-todo-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cb-todo-item.done .cb-todo-txt { color: var(--text-soft); text-decoration: line-through; }
/* 事项前的方框：完成后填充主题色打勾感 */
.cb-todo-box { flex: none; width: 11px; height: 11px; border: 1.5px solid var(--text-soft); border-radius: 3px; box-sizing: border-box; }
.cb-todo-item.done .cb-todo-box { background: var(--accent); border-color: var(--accent); }

/* 4×2 迷你应用（与第一页一致的应用图标） */
.cb-mini {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* 与第 1 页 .app-grid 完全一致：统一图标与上方卡片的间距、行距 */
  gap: 16px 4px;
  justify-items: center;
  padding: 4px 0 8px;
}

/* ═══ 页码圆点 ═══ */
.dots-row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 0 6px;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: none;
  background: var(--border);
  padding: 0;
  transition: width 0.2s ease, background 0.2s ease;
}
.dot.on {
  width: 18px;
  border-radius: 4px;
  background: var(--accent);
}

/* ═══ 编辑弹层 ═══ */
.modal-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30;
}
.modal {
  width: 78%;
  max-width: 300px;
  background: var(--bg-screen);
  border-radius: var(--radius);
  box-shadow: var(--shadow-strong);
  padding: 18px 16px 14px;
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.mo-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
}
.mo-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 9px 10px;
  font-size: 14px;
  font-family: inherit;
  color: var(--text);
  background: var(--bg-soft);
  outline: none;
}
.mo-input:focus { border-color: var(--accent); }
.mo-textarea { resize: none; }
.mo-actions { display: flex; gap: 10px; margin-top: 14px; position: sticky; bottom: calc(-1 * (14px)); margin-left: -16px; margin-right: -16px; padding: 10px 16px 14px; background: var(--bg-screen); z-index: 2; }
.mo-btn {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 8px 0;
  font-size: 14px;
  color: var(--text);
}
.mo-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}

/* ═══ 音乐播放表弹层（酷狗式） ═══ */
.ms-mask {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: flex-end;
}
.ms-sheet {
  position: relative;
  width: 100%; max-height: 78vh; display: flex; flex-direction: column;
  background: var(--bg-screen); border-radius: 22px 22px 0 0;
  animation: msUp 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}
.ms-jump {
  position: absolute; right: 14px; bottom: 84px; z-index: 3;
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-screen) 62%, transparent);
  backdrop-filter: blur(6px);
  color: var(--accent); opacity: 0.6;
}
.ms-jump:active { opacity: 1; transform: scale(0.92); }
.ms-row.flash { animation: msFlash 1.4s ease; }
@keyframes msFlash { 0%, 100% { background: transparent; } 20% { background: var(--accent-soft); } }
@keyframes msUp { from { transform: translateY(60%); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
.ms-grabber { width: 38px; height: 4px; border-radius: 2px; background: var(--border); margin: 10px auto 2px; flex: 0 0 auto; }
.ms-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px 8px; flex: 0 0 auto; }
.ms-title { font-size: 16px; font-weight: 800; }
.ms-count { font-size: 12px; color: var(--text-soft); }
.ms-spacer { flex: 1; }
.ms-lib {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px;
  border-radius: 999px; border: 1px solid var(--border); background: var(--bg-soft);
  font-size: 12px; color: var(--text-soft);
}
.ms-list { flex: 1; overflow-y: auto; padding: 0 16px 12px; -webkit-overflow-scrolling: touch; }
.ms-row {
  display: flex; align-items: center; gap: 12px; padding: 9px 2px; cursor: pointer;
}
.ms-row.on .ms-name { color: var(--accent); }
.ms-cover {
  flex: 0 0 auto; width: 42px; height: 42px; border-radius: 10px; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.ms-cover img { width: 100%; height: 100%; object-fit: cover; }
.ms-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ms-name { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-artist { font-size: 11px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-playing { flex: 0 0 auto; display: flex; animation: msBlink 1.2s ease-in-out infinite; }
@keyframes msBlink { 50% { opacity: 0.35; } }
.ms-empty { text-align: center; padding: 46px 0 26px; font-size: 14px; color: var(--text-soft); }
.ms-empty-sub { font-size: 12px; opacity: 0.7; }

.ms-bar {
  position: relative; flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
  padding: 14px 16px calc(22px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-screen) 94%, transparent);
}
/* 进度光亮条（抬高，避开手机圆角遮挡） */
.ms-prog {
  position: absolute; left: 0; right: 0; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); height: 3px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
  cursor: pointer; z-index: 1;
}
.ms-prog-on {
  position: relative; height: 100%;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 65%, #fff), var(--accent));
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
}
.ms-prog-on::after {
  content: ''; position: absolute; right: -4px; top: 50%; transform: translateY(-50%);
  width: 9px; height: 9px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 70%, transparent);
}
.ms-bar-cover {
  flex: 0 0 auto; width: 48px; height: 48px; border-radius: 10px; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.ms-bar-cover img { width: 100%; height: 100%; object-fit: cover; }
.ms-bar-cover.spin img { animation: msSpin 6s linear infinite; }
@keyframes msSpin { to { transform: rotate(360deg); } }
.ms-bar-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ms-bar-title { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-bar-artist { font-size: 11px; color: var(--text-soft); }
.ms-bar-btn { padding: 8px; display: flex; background: transparent; border: none; color: var(--text); flex: 0 0 auto; }
.ms-bar-btn:active { transform: scale(0.9); }
.ms-ctrl { display: flex; align-items: center; gap: 0; }
.ms-ctrl .ms-bar-btn { padding: 8px 5px; }
.ms-bar-empty { flex: 1; text-align: center; font-size: 13px; color: var(--text-soft); padding: 8px 0; }
/* 列表行操作：收藏 / 下一首播放 */
.ms-act {
  flex: 0 0 auto; padding: 3px; display: flex; background: transparent; border: none; color: var(--text-soft);
}
.ms-act.on { color: var(--accent); }
.ms-act:active { transform: scale(0.9); }
</style>
