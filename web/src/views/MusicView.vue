<template>
  <div class="md-page">
    <AppHeader title="音乐" back>
      <template #right>
        <button class="md-op" @click="openRemoval" aria-label="移除会员付费歌曲" title="移除会员付费歌曲"><AppIcon name="trash" :size="18" /></button>
        <button class="md-op" @click="goSettings" aria-label="设置"><AppIcon name="more" :size="20" /></button>
      </template>
    </AppHeader>

    <div class="md-body">
      <!-- 顶部 tab -->
      <div class="mu-tabs">
        <button class="mu-tab" :class="{ on: tab === 'lib' }" @click="tab = 'lib'">音乐库<span class="mu-tab-n">{{ store.songs.length }}</span></button>
        <button class="mu-tab" :class="{ on: tab === 'plist' }" @click="tab = 'plist'">歌单<span class="mu-tab-n">{{ plList.length }}</span></button>
        <button class="mu-tab" :class="{ on: tab === 'fav' }" @click="tab = 'fav'">我的收藏<span class="mu-tab-n">{{ store.favIds.length }}</span></button>
        <!-- 每个单人联系人各有一份自己的收藏，和音乐库/歌单在同一行 -->
        <button
          v-for="c in favContacts"
          :key="c.id"
          class="mu-tab"
          :class="{ on: tab === 'fav:' + c.id }"
          @click="tab = 'fav:' + c.id"
        >{{ c.name }}的收藏<span class="mu-tab-n">{{ (favIdsMap[c.id] || []).length }}</span></button>
      </div>

      <!-- 歌单多选操作条：长按歌单进入，修改名称/删除/取消 -->
      <div v-if="plSelectMode" class="mu-selbar">
        <div class="mu-selbar-top">
          <span class="mu-selbar-num">已选 {{ selPls.size }} 个歌单</span>
          <button class="mu-selbar-btn all" @click="toggleAllPl">{{ allPlSelected ? '取消全选' : '全选' }}</button>
        </div>
        <div class="mu-selbar-ops">
          <button class="mu-selbar-btn" :disabled="selPls.size !== 1" @click="openPlRename">修改名称</button>
          <button class="mu-selbar-btn danger" :disabled="!selPls.size" @click="doDeletePls">删除</button>
          <button class="mu-selbar-btn cancel" @click="exitPlSelect">取消</button>
        </div>
      </div>
      <!-- 多选操作条：长按歌曲进入，全选/收藏/移动到歌单/删除/取消 -->
      <div v-if="selectMode" class="mu-selbar">
        <div class="mu-selbar-top">
          <span class="mu-selbar-num">已选 {{ selIds.size }} 首</span>
          <button class="mu-selbar-btn all" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        </div>
        <div class="mu-selbar-ops">
          <button class="mu-selbar-btn" :disabled="!selIds.size" @click="doSelFav">收藏</button>
          <button class="mu-selbar-btn" :disabled="!selIds.size" @click="openPlPicker">移动到歌单</button>
          <button class="mu-selbar-btn danger" :disabled="!selIds.size" @click="doSelDelete">删除</button>
          <button class="mu-selbar-btn cancel" @click="exitSelect">取消</button>
        </div>
      </div>

      <div class="mu-panel">
        <!-- ═══ 我的音乐库 ═══ -->
        <template v-if="tab === 'lib'">
          <p v-if="store.loading" class="mu-tip">加载中…</p>
          <div
            v-for="s in store.songs"
            :key="s.id"
            class="mu-row"
            :class="{ on: !selectMode && store.current?.id === s.id, sel: selIds.has(s.id), flash: flashId === s.id }"
            :data-sid="s.id"
            @click="rowTap(s, store.songs, '全部音乐')"
            @touchstart.passive="lpStart(s)"
            @touchend.passive="lpCancel"
            @touchmove.passive="lpCancel"
            @touchcancel.passive="lpCancel"
            @contextmenu.prevent="enterSelect(s)"
          >
            <span class="mu-check" v-if="selectMode" :class="{ on: selIds.has(s.id) }">
              <AppIcon v-if="selIds.has(s.id)" name="check" :size="13" color="#fff" />
            </span>
            <span class="mu-cover">
              <img v-if="s.cover" :src="s.cover" alt="" loading="lazy" />
              <AppIcon v-else name="music" :size="18" color="var(--accent)" />
            </span>
            <span class="mu-main">
              <span class="mu-title">{{ s.title }}</span>
              <span class="mu-sub">
                <span class="mu-artist">{{ s.artist || '未知歌手' }}</span>
                <span v-if="s.vip || !s.audio" class="mu-chip warn">不可播</span>
              </span>
            </span>
            <template v-if="!selectMode">
              <button class="mu-act" :class="{ on: store.favSet.has(s.id) }" @click.stop="toggleFavRow(s)" :aria-label="store.favSet.has(s.id) ? '取消收藏' : '收藏'">
                <AppIcon :name="store.favSet.has(s.id) ? 'heart-solid' : 'heart'" :size="17" :filled="store.favSet.has(s.id)" :color="store.favSet.has(s.id) ? 'var(--accent)' : 'var(--text-soft)'" />
              </button>
              <button class="mu-act" @click.stop="store.playNext(s)" aria-label="下一首播放"><AppIcon name="playNext" :size="17" color="var(--text-soft)" /></button>
            </template>
            <span class="mu-dur">{{ fmtDur(s.duration) }}</span>
          </div>
          <p v-if="!store.loading && !store.songs.length" class="mu-empty">
            曲库还是空的<br />
            <span class="mu-empty-sub">到右上角「设置」里导入网易云/酷狗歌曲</span>
          </p>
        </template>

        <!-- ═══ 歌单（酷狗式：歌单列 + 右侧＋新建；点歌单展开/收起） ═══ -->
        <template v-else-if="tab === 'plist'">
          <div class="mu-pl-top">
            <span class="mu-pl-title">歌单 <em>{{ plList.length }}</em></span>
            <button class="mu-pl-add" @click="openNewPl" aria-label="添加歌单"><AppIcon name="plus" :size="20" /></button>
          </div>
          <div v-for="g in plList" :key="g.name" class="mu-pl">
            <div
              class="mu-pl-head"
              @click="plRowTap(g)"
              @touchstart.passive="plLpStart(g)"
              @touchend.passive="plLpCancel"
              @touchmove.passive="plLpCancel"
              @touchcancel.passive="plLpCancel"
              @contextmenu.prevent="enterPlSelect(g.name)"
            >
              <span v-if="plSelectMode" class="mu-check" :class="{ on: selPls.has(g.name) }">
                <AppIcon v-if="selPls.has(g.name)" name="check" :size="13" color="#fff" />
              </span>
              <span class="mu-pl-cover">
                <img v-if="g.songs[0]?.cover" :src="g.songs[0].cover" alt="" loading="lazy" />
                <AppIcon v-else name="music" :size="18" color="var(--accent)" />
              </span>
              <span class="mu-pl-info">
                <span class="mu-pl-name">{{ g.name }}</span>
                <span class="mu-pl-num">{{ g.songs.length }} 首</span>
              </span>
              <span v-if="!plSelectMode" class="mu-pl-play" aria-label="播放该歌单" @click.stop="store.playSong(g.songs[0], g.songs, g.name)"><AppIcon name="play" :size="15" /></span>
              <AppIcon v-if="!plSelectMode" class="mu-pl-arrow" :class="{ up: openPls.has(g.name) }" name="chevron-down" :size="16" />
            </div>
            <div v-if="openPls.has(g.name) && !plSelectMode" class="mu-pl-body">
              <div
                v-for="s in g.songs"
                :key="s.id"
                class="mu-row"
                :class="{ on: !selectMode && store.current?.id === s.id, sel: selIds.has(s.id), flash: flashId === s.id }"
                :data-sid="s.id"
                @click="rowTap(s, g.songs, g.name)"
                @touchstart.passive="lpStart(s)"
                @touchend.passive="lpCancel"
                @touchmove.passive="lpCancel"
                @touchcancel.passive="lpCancel"
                @contextmenu.prevent="enterSelect(s)"
              >
                <span v-if="selectMode" class="mu-check" :class="{ on: selIds.has(s.id) }">
                  <AppIcon v-if="selIds.has(s.id)" name="check" :size="13" color="#fff" />
                </span>
                <span class="mu-cover">
                  <img v-if="s.cover" :src="s.cover" alt="" loading="lazy" />
                  <AppIcon v-else name="music" :size="18" color="var(--accent)" />
                </span>
                <span class="mu-main">
                  <span class="mu-title">{{ s.title }}</span>
                  <span class="mu-sub"><span class="mu-artist">{{ s.artist || '未知歌手' }}</span><span v-if="s.vip || !s.audio" class="mu-chip warn">不可播</span></span>
                </span>
                <template v-if="!selectMode">
                  <button class="mu-act" :class="{ on: store.favSet.has(s.id) }" @click.stop="toggleFavRow(s)" :aria-label="store.favSet.has(s.id) ? '取消收藏' : '收藏'">
                    <AppIcon :name="store.favSet.has(s.id) ? 'heart-solid' : 'heart'" :size="17" :filled="store.favSet.has(s.id)" :color="store.favSet.has(s.id) ? 'var(--accent)' : 'var(--text-soft)'" />
                  </button>
                  <button class="mu-act" @click.stop="store.playNext(s)" aria-label="下一首播放"><AppIcon name="playNext" :size="17" color="var(--text-soft)" /></button>
                </template>
                <span class="mu-dur">{{ fmtDur(s.duration) }}</span>
              </div>
              <p v-if="!g.songs.length" class="mu-pl-empty">这个歌单还空着<br /><span>到「音乐库」长按歌曲 → 移动到歌单</span></p>
            </div>
          </div>
          <p v-if="!plList.length" class="mu-empty">还没有歌单<br /><span class="mu-empty-sub">点「歌单」右侧的 ＋ 新建一个</span></p>
        </template>

        <!-- ═══ 我的收藏 / TA的收藏 ═══ -->
        <template v-else>
          <div
            v-for="s in favList"
            :key="s.id"
            class="mu-row"
            :class="{ on: !selectMode && store.current?.id === s.id, sel: selIds.has(s.id), flash: flashId === s.id }"
            :data-sid="s.id"
            @click="rowTap(s, favList, `${favTabName}的收藏`)"
            @touchstart.passive="lpStart(s)"
            @touchend.passive="lpCancel"
            @touchmove.passive="lpCancel"
            @touchcancel.passive="lpCancel"
            @contextmenu.prevent="enterSelect(s)"
          >
            <span v-if="selectMode" class="mu-check" :class="{ on: selIds.has(s.id) }">
              <AppIcon v-if="selIds.has(s.id)" name="check" :size="13" color="#fff" />
            </span>
            <span class="mu-cover">
              <img v-if="s.cover" :src="s.cover" alt="" loading="lazy" />
              <AppIcon v-else name="music" :size="18" color="var(--accent)" />
            </span>
            <span class="mu-main">
              <span class="mu-title">{{ s.title }}</span>
              <span class="mu-sub"><span class="mu-artist">{{ s.artist || '未知歌手' }}</span></span>
            </span>
            <template v-if="!selectMode">
              <button class="mu-act" :class="{ on: store.favSet.has(s.id) }" @click.stop="toggleFavRow(s)" :aria-label="store.favSet.has(s.id) ? '取消收藏' : '收藏'">
                <AppIcon :name="store.favSet.has(s.id) ? 'heart-solid' : 'heart'" :size="17" :filled="store.favSet.has(s.id)" :color="store.favSet.has(s.id) ? 'var(--accent)' : 'var(--text-soft)'" />
              </button>
              <button class="mu-act" @click.stop="store.playNext(s)" aria-label="下一首播放"><AppIcon name="playNext" :size="17" color="var(--text-soft)" /></button>
            </template>
            <span class="mu-dur">{{ fmtDur(s.duration) }}</span>
          </div>
          <p v-if="!favList.length" class="mu-empty">
            {{ favIsMine ? '还没有收藏歌曲' : `${favTabName}还没有收藏歌曲` }}<br />
            <span class="mu-empty-sub">长按歌曲即可收藏</span>
          </p>
        </template>
      </div>
    </div>

    <!-- 底部播放条（贴底常驻；播放键无背景，最右为播放方式切换） -->
    <div v-if="store.current" class="mu-mini">
      <!-- 底部进度光亮条：展示播放进度，按住可拖动跳转 -->
      <div
        class="mu-prog"
        :class="{ dragging: dragPct >= 0 }"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <div class="mu-prog-on" :style="{ width: shownPct + '%' }"></div>
      </div>
      <span class="mu-mini-cover" @click="store.showLyrics = true">
        <img v-if="store.current.cover" :src="store.current.cover" alt="" />
        <AppIcon v-else name="music" :size="16" color="var(--accent)" />
      </span>
      <span class="mu-mini-main">
        <span class="mu-mini-title">{{ store.current.title }}</span>
        <span class="mu-mini-sub">{{ store.current.artist || '' }}</span>
      </span>
      <button class="mu-mini-btn" @click="store.toggle()" aria-label="播放暂停"><AppIcon :name="store.playing ? 'pause' : 'play'" :size="26" /></button>
      <button class="mu-mini-btn" @click="showQueue = true" aria-label="播放列表"><AppIcon name="order" :size="20" /></button>
      <button class="mu-mini-btn mu-mode" :title="curMode.label" @click="store.cycleMode()">
        <AppIcon :name="curMode.icon" :size="17" />
        <span class="mu-mode-txt">{{ curMode.short }}</span>
      </button>
    </div>

    <!-- 当前播放列表弹窗 -->
    <div v-if="showQueue" class="mu-mask" @click.self="showQueue = false">
      <div class="mu-menu mu-queue">
        <p class="mu-menu-title">当前播放 · {{ store.queueLabel || '播放列表' }}<span class="mu-queue-num">{{ store.queue.length }}首</span></p>
        <div class="mu-queue-list">
          <div
            v-for="(s, i) in store.queue"
            :key="s.id + '-' + i"
            class="mu-queue-row"
            :class="{ on: store.current?.id === s.id, flash: flashId === s.id }"
            :data-qid="s.id"
            @click="store.playSong(s, store.queue, store.queueLabel)"
          >
            <span class="mu-queue-idx">{{ i + 1 }}</span>
            <span class="mu-queue-name">{{ s.title }}<em>{{ s.artist || '未知歌手' }}</em></span>
            <AppIcon v-if="store.current?.id === s.id" name="music" :size="13" color="var(--accent)" />
          </div>
          <p v-if="!store.queue.length" class="mu-queue-empty">还没有正在播放的歌曲</p>
        </div>
        <button class="mu-menu-btn cancel" @click="showQueue = false">关闭</button>
      </div>
      <!-- 播放列表里的锚点：跳到正在播放 -->
      <button v-if="store.current" class="mu-queue-jump" aria-label="定位正在播放" @click="jumpInQueue">
        <AppIcon name="music" :size="15" />
      </button>
    </div>

    <!-- 选择歌单弹窗（多选批量移动） -->
    <div v-if="showPlPicker" class="mu-mask" @click.self="showPlPicker = false">
      <div class="mu-menu">
        <p class="mu-menu-title">移动到哪个歌单？</p>
        <div class="mu-menu-list">
          <button v-for="g in plList" :key="g.name" class="mu-menu-btn pl" @click="doJoinPlaylist(g.name)">
            {{ g.name }} <span class="mu-menu-num">{{ g.songs.length }} 首</span>
          </button>
        </div>
        <div class="mu-menu-new">
          <input v-model="newPlName" class="md-input" placeholder="或新建歌单名" />
          <button class="mu-menu-btn primary" @click="doJoinPlaylist(newPlName.trim())">加入</button>
        </div>
        <button class="mu-menu-btn cancel" @click="showPlPicker = false">取消</button>
      </div>
    </div>

    <!-- 重命名歌单弹窗 -->
    <div v-if="showPlRename" class="mu-mask" @click.self="showPlRename = false">
      <div class="mu-menu">
        <p class="mu-menu-title">修改歌单名称</p>
        <input v-model="plRenameName" class="md-input" placeholder="新的歌单名" @keyup.enter="doRenamePl" />
        <div class="mu-menu-row">
          <button class="mu-menu-btn" @click="showPlRename = false">取消</button>
          <button class="mu-menu-btn primary" @click="doRenamePl">确定</button>
        </div>
      </div>
    </div>

    <!-- 新建歌单弹窗 -->
    <div v-if="showNewPl" class="mu-mask" @click.self="showNewPl = false">
      <div class="mu-menu">
        <p class="mu-menu-title">新建歌单</p>
        <input v-model="plCreateName" class="md-input" placeholder="给歌单取个名字" @keyup.enter="createPl" />
        <div class="mu-menu-row">
          <button class="mu-menu-btn" @click="showNewPl = false">取消</button>
          <button class="mu-menu-btn primary" @click="createPl">确定</button>
        </div>
      </div>
    </div>
    <!-- 右下角锚点：跳到正在播放的歌曲 -->
    <button
      v-if="store.current && !selectMode"
      class="mu-jump"
      :title="`正在播放：${store.current.title}`"
      aria-label="跳到正在播放"
      @click="jumpToCurrent"
    >
      <AppIcon name="music" :size="16" />
    </button>

    <!-- 移除歌曲弹窗：第一行「移除会员 / 移除不可播」，第二行「取消」 -->
    <div v-if="showRemoval" class="mu-mask" @click.self="showRemoval = false">
      <div class="mu-menu mu-removal">
        <p class="mu-menu-title">清理歌曲</p>
        <p class="mu-menu-sub">会员歌曲可试听 30 秒，按需选择移除</p>
        <div class="mu-menu-row2">
          <button class="mu-menu-btn danger" :disabled="!removalVip" @click="doRemoval('vip')">
            移除会员<em>{{ removalVip }}</em>
          </button>
          <button class="mu-menu-btn danger" :disabled="!removalUnplay" @click="doRemoval('unplayable')">
            移除不可播<em>{{ removalUnplay }}</em>
          </button>
        </div>
        <button class="mu-menu-btn cancel" @click="showRemoval = false">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useMusicStore, bindAudioEvents } from '@/stores/music'
import { useDesktopStore } from '@/stores/desktop'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { getFavIds } from '@/api/music'
import { confirmDialog } from '@/utils/dialog'
import { useSeekDrag } from '@/composables/useSeekDrag'

const store = useMusicStore()
const desktop = useDesktopStore()
const contacts = useContactsStore()
const toast = useNotificationsStore()
const router = useRouter()

const tab = ref('lib')
const showQueue = ref(false)

const progressPct = computed(() => (store.duration ? (store.currentTime / store.duration) * 100 : 0))

/* 底部进度条按住拖动跳转：拖动中展示拖动位置，未拖动展示真实进度 */
const { dragPct, onDown, onMove, onUp } = useSeekDrag(
  computed(() => store.duration || 0),
  (frac) => store.seek(frac)
)
const shownPct = computed(() => (dragPct.value >= 0 ? dragPct.value * 100 : progressPct.value))
function goSettings() {
  router.push('/music/settings')
}

/* ═══ 移除歌曲：弹窗分两类（会员可试听30秒 / 完全不可播） ═══ */
const showRemoval = ref(false)
const removalVip = ref(0)
const removalUnplay = ref(0)
function openRemoval() {
  const vip = store.songs.filter((s) => s.vip).length
  const unplay = store.songs.filter((s) => !s.audio && !s.vip).length
  if (!vip && !unplay) {
    toast.pushToast({ title: '没有需要移除的歌曲', text: '当前没有会员付费或不可播放的歌曲' })
    return
  }
  removalVip.value = vip
  removalUnplay.value = unplay
  showRemoval.value = true
}
async function doRemoval(kind) {
  showRemoval.value = false
  try {
    const n = kind === 'vip' ? await store.removeVipSongs() : await store.clearUnplayable()
    toast.pushToast({ title: `已移除 ${n} 首`, text: kind === 'vip' ? '会员付费歌曲已清理' : '不可播放歌曲已清理' })
  } catch (e) {
    toast.pushToast({ title: '移除失败', text: e.message })
  }
}

const mateName = computed(() => desktop.contact?.name || 'TA')

/* ═══ 收藏：我的收藏 + 每个单人联系人各一份（与「音乐库」同行） ═══ */
const favContacts = computed(() => (contacts.list || []).filter((c) => c.kind !== 'group'))
const favIdsMap = ref({})
/* tab = 'fav' 时看自己的收藏；'fav:<id>' 时看对应联系人的 */
const favTabId = computed(() => {
  if (tab.value === 'fav') return Number(store.contactId) || 0
  return String(tab.value).startsWith('fav:') ? Number(tab.value.slice(4)) : 0
})
const favIsMine = computed(() => tab.value === 'fav')
const favTabName = computed(() => {
  if (favIsMine.value) return '我'
  return favContacts.value.find((c) => c.id === favTabId.value)?.name || mateName.value
})
const favList = computed(() => {
  const cid = favTabId.value
  if (!cid) return []
  const ids = new Set(cid === Number(store.contactId) ? store.favIds : (favIdsMap.value[cid] || []))
  return store.songs.filter((s) => ids.has(s.id))
})
async function loadFavTabs() {
  if (!contacts.list?.length) await contacts.load().catch(() => {})
  for (const c of favContacts.value) {
    try {
      const r = await getFavIds(c.id)
      favIdsMap.value = { ...favIdsMap.value, [c.id]: r?.favIds || [] }
    } catch (e) { /* ignore */ }
  }
}
async function refreshFavIds(cid) {
  if (!cid) return
  try {
    const r = await getFavIds(cid)
    favIdsMap.value = { ...favIdsMap.value, [cid]: r?.favIds || [] }
  } catch (e) { /* ignore */ }
}
/* 歌单：曲库里带歌单名的分组 + 自定义新建的（可为空） */
const plList = computed(() => {
  const map = new Map()
  store.songs.filter((s) => s.plist).forEach((s) => {
    if (!map.has(s.plist)) map.set(s.plist, [])
    map.get(s.plist).push(s)
  })
  for (const n of store.playlists || []) if (!map.has(n)) map.set(n, [])
  return [...map.entries()]
    .map(([name, songs]) => ({ name, songs }))
    .sort((a, b) => b.songs.length - a.songs.length)
})
/* 歌单展开/收起 */
const openPls = ref(new Set())
function togglePl(name) {
  const next = new Set(openPls.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  openPls.value = next
}
/* 新建歌单 */
const showNewPl = ref(false)
const plCreateName = ref('')
function openNewPl() {
  plCreateName.value = ''
  showNewPl.value = true
}
async function createPl() {
  const n = plCreateName.value.trim()
  if (!n) return
  try {
    const added = await store.addPlaylist(n)
    if (!added) {
      toast.pushToast({ title: '歌单已存在', text: `「${n}」已经在列表里了` })
      return
    }
    openPls.value = new Set([...openPls.value, n])
    toast.pushToast({ title: '歌单已创建', text: `「${n}」` })
    showNewPl.value = false
  } catch (e) {
    toast.pushToast({ title: '创建失败', text: e.message })
  }
}

/* ═══ 歌单长按多选：修改名称 / 删除（连歌单里的歌一起删） ═══ */
const plSelectMode = ref(false)
const selPls = ref(new Set())
let plLpTimer = null
let plLpFired = false
const allPlSelected = computed(() => !!plList.value.length && plList.value.every((g) => selPls.value.has(g.name)))
function plLpStart(g) {
  plLpFired = false
  plLpCancel()
  plLpTimer = setTimeout(() => {
    plLpFired = true
    enterPlSelect(g.name)
    if (navigator.vibrate) navigator.vibrate(15)
  }, 450)
}
function plLpCancel() {
  if (plLpTimer) { clearTimeout(plLpTimer); plLpTimer = null }
}
function enterPlSelect(name) {
  plSelectMode.value = true
  selPls.value = new Set([name])
}
function exitPlSelect() {
  plSelectMode.value = false
  selPls.value = new Set()
}
function toggleAllPl() {
  if (allPlSelected.value) { selPls.value = new Set(); return }
  selPls.value = new Set(plList.value.map((g) => g.name))
}
function plRowTap(g) {
  if (plLpFired) { plLpFired = false; return }
  if (plSelectMode.value) {
    const next = new Set(selPls.value)
    if (next.has(g.name)) next.delete(g.name)
    else next.add(g.name)
    selPls.value = next
    return
  }
  togglePl(g.name)
}

/* 修改歌单名称 */
const showPlRename = ref(false)
const plRenameName = ref('')
function openPlRename() {
  const name = [...selPls.value][0]
  if (!name) return
  plRenameName.value = name
  showPlRename.value = true
}
async function doRenamePl() {
  const oldName = [...selPls.value][0]
  const n = plRenameName.value.trim()
  if (!oldName || !n || n === oldName) { showPlRename.value = false; return }
  const songs = (plList.value.find((g) => g.name === oldName)?.songs) || []
  try {
    for (const s of songs) await store.patchSong(s.id, { plist: n })
    const nextPls = (store.playlists || []).map((x) => (x === oldName ? n : x))
    if (!nextPls.includes(n)) nextPls.push(n)
    await store.saveSettings({ playlists: nextPls.filter((x) => x !== oldName || x === n) })
    const nextOpen = new Set([...openPls.value])
    if (nextOpen.has(oldName)) { nextOpen.delete(oldName); nextOpen.add(n) }
    openPls.value = nextOpen
    toast.pushToast({ title: '已重命名', text: `「${oldName}」→「${n}」` })
    showPlRename.value = false
    exitPlSelect()
  } catch (e) {
    toast.pushToast({ title: '重命名失败', text: e.message })
  }
}

/* 删除歌单（连同歌单里的全部歌曲） */
async function doDeletePls() {
  const names = [...selPls.value]
  if (!names.length) return
  const totalSongs = names.reduce((n, name) => n + ((plList.value.find((g) => g.name === name)?.songs) || []).length, 0)
  const title = names.length === 1 ? `删除歌单「${names[0]}」？` : `删除 ${names.length} 个歌单？`
  const text = totalSongs ? `同时会删除里面的 ${totalSongs} 首歌曲` : '这些歌单目前是空的'
  if (!(await confirmDialog({ title, text, danger: true }))) return
  try {
    for (const name of names) {
      const g = plList.value.find((x) => x.name === name)
      for (const s of g?.songs || []) await store.removeSong(s.id)
    }
    await store.saveSettings({ playlists: (store.playlists || []).filter((x) => !names.includes(x)) })
    const nextOpen = new Set([...openPls.value].filter((x) => !names.includes(x)))
    openPls.value = nextOpen
    toast.pushToast({ title: '已删除', text: `${names.length} 个歌单${totalSongs ? `、${totalSongs} 首歌曲` : ''}` })
    exitPlSelect()
  } catch (e) {
    toast.pushToast({ title: '删除失败', text: e.message })
  }
}

/* 播放方式切换（与首页一致）：顺序 → 循环(单曲) → 随机 */
const MODES = [
  { key: 'list', short: '顺序', label: '顺序播放', icon: 'order' },
  { key: 'one', short: '循环', label: '单曲循环', icon: 'loopOne' },
  { key: 'random', short: '随机', label: '随机播放', icon: 'shuffle' }
]
const curMode = computed(() => MODES.find((m) => m.key === store.mode) || MODES[0])

function fmtDur(sec) {
  if (!sec) return '--:--'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ═══ 长按多选（替代每行的「⋯」菜单） ═══ */
const selectMode = ref(false)
const selIds = ref(new Set())
let lpTimer = null
let lpFired = false

function lpStart(s) {
  lpFired = false
  lpCancel()
  lpTimer = setTimeout(() => {
    lpFired = true
    enterSelect(s)
    if (navigator.vibrate) navigator.vibrate(15)
  }, 450)
}
function lpCancel() {
  if (lpTimer) { clearTimeout(lpTimer); lpTimer = null }
}
function enterSelect(s) {
  selectMode.value = true
  selIds.value = new Set([s.id])
}
function exitSelect() {
  selectMode.value = false
  selIds.value = new Set()
}
watch(tab, () => exitSelect())

function rowTap(s, list, label) {
  if (lpFired) { lpFired = false; return }
  if (selectMode.value) {
    const next = new Set(selIds.value)
    if (next.has(s.id)) next.delete(s.id)
    else next.add(s.id)
    selIds.value = next
    return
  }
  store.playSong(s, list, label)
}

const selSongs = computed(() => {
  const pool = new Map()
  for (const s of store.songs) pool.set(s.id, s)
  for (const s of store.favSongs) if (!pool.has(s.id)) pool.set(s.id, s)
  return [...selIds.value].map((id) => pool.get(id)).filter(Boolean)
})

/* 当前列表（用于全选）：音乐库 / 我的收藏 / 各联系人的收藏；歌单页不支持多选 */
const curRows = computed(() => {
  if (tab.value === 'lib') return store.songs
  if (tab.value === 'fav' || String(tab.value).startsWith('fav:')) return favList.value
  return []
})
const allSelected = computed(() => !!curRows.value.length && curRows.value.every((s) => selIds.value.has(s.id)))
function toggleAll() {
  if (allSelected.value) { selIds.value = new Set(); return }
  selIds.value = new Set(curRows.value.map((s) => s.id))
}

/* 播放列表弹窗里的小锚点：定位正在播放 */
function jumpInQueue() {
  const cur = store.current
  if (!cur) return
  nextTick(() => {
    setTimeout(() => {
      const el = document.querySelector(`.mu-queue-row[data-qid="${cur.id}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      flashId.value = cur.id
      setTimeout(() => { if (flashId.value === cur.id) flashId.value = null }, 1400)
    }, 60)
  })
}
/* 右下角锚点：跳到正在播放的歌曲并短暂高亮 */
const flashId = ref(null)
function jumpToCurrent() {
  const cur = store.current
  if (!cur) return
  const inList = (list) => !!list.find((s) => s.id === cur.id)
  if (!inList(curRows.value)) tab.value = inList(store.favSongs) ? 'fav' : 'lib'
  nextTick(() => {
    setTimeout(() => {
      const el = document.querySelector(`.mu-row[data-sid="${cur.id}"]`)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      flashId.value = cur.id
      setTimeout(() => { if (flashId.value === cur.id) flashId.value = null }, 1400)
    }, 60)
  })
}

/* 批量收藏：有未收藏的 → 全部收藏；都已收藏 → 全部取消 */
async function doSelFav() {
  const items = selSongs.value
  if (!items.length) return
  const add = items.some((s) => !store.favSet.has(s.id))
  try {
    for (const s of items) {
      const f = store.favSet.has(s.id)
      if ((add && !f) || (!add && f)) await store.toggleFav(s)
    }
    toast.pushToast({ title: add ? `已收藏 ${items.length} 首` : `已取消收藏 ${items.length} 首` })
    refreshFavIds(store.contactId)
    exitSelect()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

async function doSelDelete() {
  const items = selSongs.value
  if (!items.length) return
  const preview = items.slice(0, 3).map((s) => s.title).join('、') + (items.length > 3 ? ` 等 ${items.length} 首` : '')
  if (!(await confirmDialog({ title: `删除 ${items.length} 首歌曲？`, text: preview, danger: true }))) return
  try {
    for (const s of items) await store.removeSong(s.id)
    toast.pushToast({ title: `已删除 ${items.length} 首` })
    exitSelect()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* 批量移动到歌单 */
const showPlPicker = ref(false)
const newPlName = ref('')
function openPlPicker() {
  if (!selIds.value.size) return   // 注意：ref + Set 必须 .value
  newPlName.value = ''
  showPlPicker.value = true
}
async function doJoinPlaylist(name) {
  if (!name) return
  const items = selSongs.value
  if (!items.length) return
  try {
    for (const s of items) await store.patchSong(s.id, { plist: name })
    toast.pushToast({ title: `已把 ${items.length} 首移入「${name}」` })
    showPlPicker.value = false
    exitSelect()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

function toggleFavRow(s) {
  store.toggleFav(s).then((fav) => {
    toast.pushToast({ title: fav ? '已收藏' : '已取消收藏' })
    refreshFavIds(store.contactId)
  }).catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

onMounted(() => {
  bindAudioEvents()
  store.init(desktop.currentContactId)
  loadFavTabs()
})
</script>

<style scoped>
/* 头部右侧两个操作按钮（移除会员歌曲 + 设置）的间距 */
.md-op + .md-op { margin-left: 2px; }
.md-op.sm { padding: 4px; }

.md-body { padding-top: 0; }

/* 顶部 tab：铺满屏幕宽（负边距抵消 md-body 的 14px），一开始就吸附在顶部，滚动时纹丝不动 */
.mu-tabs {
  position: sticky; top: 0; z-index: 6;
  display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none;
  margin: 0 -14px;
  padding: 12px 14px;
  background: var(--bg-screen);
}
.mu-tabs::-webkit-scrollbar { display: none; }
.mu-tab {
  flex: 0 0 auto; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border);
  background: var(--bg-screen); font-size: 13px; color: var(--text); white-space: nowrap;
}
.mu-tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
/* tab 内的歌数小角标：更小更淡，不抢标题视觉 */
.mu-tab-n {
  margin-left: 5px; font-size: 11px; font-weight: 600; opacity: 0.55;
  font-variant-numeric: tabular-nums; vertical-align: baseline;
}
.mu-tab.on .mu-tab-n { opacity: 0.9; }

/* 多选操作条（在音乐库等 tab 按钮下方弹出） */
.mu-selbar {
  position: sticky; top: 44px; z-index: 5;
  display: flex; flex-direction: column; gap: 8px;
  margin-bottom: 12px; padding: 10px 12px;
  background: var(--bg-screen); border: 1px solid var(--border); border-radius: 14px;
  box-shadow: 0 6px 16px rgba(0,0,0,0.06);
  animation: muSelPop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes muSelPop { from { transform: translateY(-6px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.mu-selbar-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mu-selbar-num { font-size: 12px; font-weight: 600; color: var(--accent); white-space: nowrap; }
.mu-selbar-ops { display: flex; gap: 6px; }
.mu-selbar-btn {
  flex: 0 0 auto; padding: 6px 11px; border-radius: 999px; border: none;
  background: var(--bg-soft); font-size: 12px; color: var(--text);
}
.mu-selbar-btn:active { transform: scale(0.94); }
.mu-selbar-btn:disabled { opacity: 0.4; }
.mu-selbar-btn.danger { color: #c0576b; }
.mu-selbar-btn.cancel { color: var(--text-soft); }
.mu-selbar-btn.all { color: var(--accent); font-weight: 600; }

.mu-panel { padding-bottom: 120px; }

/* 歌曲行 */
.mu-row {
  display: flex; align-items: center; gap: 12px; padding: 10px 4px;
  border-radius: 12px; cursor: pointer;
  -webkit-touch-callout: none; user-select: none;
}
.mu-row.sel { background: var(--bg-soft); }
.mu-row.on .mu-title { color: var(--accent); }
.mu-row.on .mu-cover { box-shadow: 0 0 0 2px var(--accent); }
/* 右下角锚点：跳到正在播放的歌曲（半透明小圆） */
.mu-jump {
  position: fixed; right: 14px; bottom: calc(112px + env(safe-area-inset-bottom, 0px));
  z-index: 55; width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-screen) 55%, transparent);
  backdrop-filter: blur(6px);
  color: var(--accent); opacity: 0.55;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.08);
}
.mu-jump:active { opacity: 0.95; transform: scale(0.92); }
/* 跳转后短暂高亮 */
.mu-row.flash { animation: muFlash 1.4s ease; }
@keyframes muFlash {
  0%, 100% { background: transparent; }
  20% { background: var(--accent-soft); }
}
.mu-check {
  flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%;
  border: 1.5px solid var(--border); background: transparent;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.mu-check.on { background: var(--accent); border-color: var(--accent); }
.mu-cover {
  flex: 0 0 auto; width: 44px; height: 44px; border-radius: 10px; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.mu-cover.sm { width: 34px; height: 34px; border-radius: 8px; }
.mu-cover img { width: 100%; height: 100%; object-fit: cover; }
.mu-cover.spin img { animation: muSpin 6s linear infinite; }
@keyframes muSpin { to { transform: rotate(360deg); } }
.mu-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mu-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-sub { font-size: 11px; color: var(--text-soft); display: flex; align-items: center; gap: 5px; overflow: hidden; }
.mu-chip {
  padding: 1px 6px; border-radius: 6px; background: var(--bg-soft);
  font-size: 10px; color: var(--text-soft); flex: 0 0 auto;
}
.mu-chip.warn { color: #c0576b; background: rgba(192, 87, 107, 0.08); }
.mu-artist { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-dur { flex: 0 0 auto; font-size: 11px; color: var(--text-soft); opacity: 0.75; font-variant-numeric: tabular-nums; }

.mu-tip, .mu-empty { text-align: center; padding: 40px 0 20px; font-size: 14px; color: var(--text-soft); }
.mu-empty-sub { font-size: 12px; opacity: 0.7; }

/* 歌单页（酷狗式）：标题行 + ＋，歌单可展开收起 */
.mu-pl-top {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2px 2px 10px; margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.mu-pl-title { font-size: 15px; font-weight: 800; letter-spacing: 0.4px; }
.mu-pl-title em { font-style: normal; font-size: 12px; font-weight: 600; color: var(--text-soft); margin-left: 4px; }
.mu-pl-add {
  display: flex; padding: 4px; border: none; background: transparent; color: var(--accent);
}
.mu-pl-add:active { transform: scale(0.9); }

.mu-pl { margin-bottom: 8px; }
.mu-pl-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 4px;
  border-radius: 12px; cursor: pointer;
}
.mu-pl-head:active { background: var(--bg-soft); }
.mu-pl-cover {
  flex: 0 0 auto; width: 46px; height: 46px; border-radius: 10px; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.mu-pl-cover img { width: 100%; height: 100%; object-fit: cover; }
/* 歌单行里的「播放该歌单」按钮 */
.mu-pl-play {
  flex: 0 0 auto; display: flex; padding: 6px; margin-right: 2px;
  border-radius: 999px; background: var(--bg-soft); color: var(--accent);
}
.mu-pl-play:active { transform: scale(0.9); }
.mu-pl-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mu-pl-name {
  font-size: 14px; font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mu-pl-num {
  font-size: 11px; color: var(--text-soft); font-variant-numeric: tabular-nums;
}
.mu-pl-body { padding: 2px 0 6px 8px; border-left: 1px solid var(--border); margin-left: 22px; }
.mu-pl-empty { text-align: center; font-size: 12px; color: var(--text-soft); padding: 14px 0 10px; line-height: 1.6; }
.mu-pl-arrow { flex: 0 0 auto; color: var(--text-soft); transition: transform 0.22s ease; }
.mu-pl-arrow.up { transform: rotate(180deg); }

/* 底部播放条（贴底常驻，加高） */
.mu-mini {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
  display: flex; align-items: center; gap: 10px; padding: 14px 16px calc(26px + env(safe-area-inset-bottom, 0px));
  border-radius: 18px 18px 0 0;
  background: color-mix(in srgb, var(--bg-screen) 96%, transparent);
  backdrop-filter: blur(14px); box-shadow: 0 -4px 20px rgba(0,0,0,0.08);
  border-top: 1px solid var(--border);
}
/* 底部进度光亮条（抬高，避开手机圆角遮挡） */
.mu-prog {
  position: absolute; left: 0; right: 0; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); height: 3px;
  background: color-mix(in srgb, var(--text) 14%, transparent);
  cursor: pointer; z-index: 1;
  touch-action: none; /* 拖动进度条时禁止页面滚动/缩放手势 */
}
/* 透明热区：细条上下各扩 13px（仍在 mini 播放器 padding 内，不遮挡按钮） */
.mu-prog::before {
  content: ''; position: absolute; left: 0; right: 0; top: -13px; bottom: -13px;
}
.mu-prog-on {
  position: relative; height: 100%;
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 65%, #fff), var(--accent));
  box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 55%, transparent);
}
/* 拖动中：条加粗 */
.mu-prog.dragging { height: 5px; }
.mu-prog.dragging .mu-prog-on::after {
  width: 12px; height: 12px; right: -6px;
}
.mu-prog-on::after {
  content: ''; position: absolute; right: -4px; top: 50%; transform: translateY(-50%);
  width: 9px; height: 9px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 6px color-mix(in srgb, var(--accent) 70%, transparent);
}
.mu-mini-cover {
  flex: 0 0 auto; width: 48px; height: 48px; border-radius: 12px; overflow: hidden;
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.mu-mini-cover img { width: 100%; height: 100%; object-fit: cover; }
.mu-mini-cover.spin img { animation: muMiniSpin 6s linear infinite; }
@keyframes muMiniSpin { to { transform: rotate(360deg); } }
.mu-mini-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.mu-mini-title { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-mini-sub { font-size: 11px; color: var(--text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-mini-btn { padding: 8px; display: flex; background: transparent; border: none; color: var(--text); flex: 0 0 auto; }
.mu-mini-btn:active { transform: scale(0.9); }
/* 上一首/播放/下一首 紧贴成组 */
.mu-ctrl { display: flex; align-items: center; gap: 0; }
.mu-ctrl .mu-mini-btn { padding: 8px 5px; }
.mu-mode { color: var(--accent); gap: 4px; align-items: center; }
.mu-mode-txt { font-size: 11px; font-weight: 600; }

/* 歌曲行操作：收藏 / 下一首播放 */
.mu-act {
  flex: 0 0 auto; padding: 4px; display: flex; background: transparent; border: none; color: var(--text-soft);
}
.mu-act.on { color: var(--accent); }
.mu-act:active { transform: scale(0.9); }

/* 居中弹窗 */
.mu-mask {
  position: fixed; inset: 0; z-index: 70;
  background: rgba(60, 50, 56, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 0 32px;
}
.mu-menu {
  width: 100%; max-width: 320px;
  background: var(--bg-screen); border-radius: 18px;
  padding: 18px 16px 14px;
  display: flex; flex-direction: column; gap: 4px;
  animation: muMenuPop 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes muMenuPop { from { transform: scale(0.9); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }
.mu-menu-title { margin: 0 0 8px; font-size: 14px; font-weight: 700; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mu-menu-btn {
  border: none; background: transparent; text-align: center;
  padding: 12px 0; font-size: 14px; color: var(--text); border-radius: 10px;
}
.mu-menu-btn:active { background: var(--bg-soft); }
.mu-menu-btn.danger { color: #c0576b; }
.mu-menu-btn.cancel { color: var(--text-soft); border-top: 1px solid var(--border); border-radius: 0; }
.mu-menu-btn.pl { text-align: left; display: flex; align-items: center; justify-content: space-between; padding: 12px 8px; }
.mu-menu-num { font-size: 11px; color: var(--text-soft); }
.mu-menu-btn.primary { color: var(--accent); font-weight: 600; flex: 0 0 auto; padding: 8px 14px; }
.mu-menu-row { display: flex; gap: 10px; justify-content: center; margin-top: 10px; }
.mu-menu-row .mu-menu-btn { flex: 1; }
.mu-menu-list { max-height: 200px; overflow-y: auto; }
.mu-menu-new { display: flex; gap: 8px; align-items: center; margin: 6px 0 2px; }
.mu-menu-new .md-input { flex: 1; }

/* 清理歌曲弹窗：两按钮并排 + 取消 */
.mu-menu-sub { margin: -4px 0 12px; font-size: 12px; color: var(--text-soft); text-align: center; line-height: 1.5; }
.mu-menu-row2 { display: flex; gap: 8px; margin-bottom: 4px; }
.mu-menu-row2 .mu-menu-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 14px 6px; background: var(--bg-soft); border-radius: 12px;
  font-size: 14px; color: var(--text); border: none;
}
.mu-menu-row2 .mu-menu-btn:active { transform: scale(0.97); }
.mu-menu-row2 .mu-menu-btn:disabled { opacity: 0.38; }
.mu-menu-row2 .mu-menu-btn.danger { color: #c0576b; }
.mu-menu-row2 .mu-menu-btn em { font-style: normal; font-size: 11px; color: var(--text-soft); }

/* 当前播放列表弹窗 */
.mu-queue { max-width: 340px; }
.mu-queue-num { margin-left: 8px; font-size: 11px; font-weight: 400; color: var(--text-soft); }
.mu-queue-list { max-height: 46vh; overflow-y: auto; margin: 2px 0 6px; }
.mu-queue-row {
  display: flex; align-items: center; gap: 10px; padding: 10px 6px;
  border-radius: 10px; cursor: pointer;
}
.mu-queue-row:active { background: var(--bg-soft); }
.mu-queue-row.flash { animation: muFlash 1.4s ease; }
.mu-queue-jump {
  position: absolute; right: 22px; bottom: 14px; z-index: 2;
  width: 34px; height: 34px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-screen) 60%, transparent);
  color: var(--accent); opacity: 0.65;
}
.mu-queue-jump:active { opacity: 1; transform: scale(0.92); }
.mu-queue-row.on .mu-queue-name { color: var(--accent); font-weight: 600; }
.mu-queue-idx { flex: 0 0 auto; width: 20px; text-align: center; font-size: 11px; color: var(--text-soft); font-variant-numeric: tabular-nums; }
.mu-queue-name {
  flex: 1; min-width: 0; font-size: 13px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: baseline; gap: 8px;
}
.mu-queue-name em { font-style: normal; font-size: 11px; color: var(--text-soft); flex: 0 0 auto; }
.mu-queue-empty { text-align: center; font-size: 13px; color: var(--text-soft); padding: 24px 0; }
</style>
