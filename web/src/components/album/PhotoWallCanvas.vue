<template>
  <div class="pwc">
    <!-- 横向无缝长卷（底纸铺满整卷） -->
    <div
      ref="scrollEl"
      class="pwc-scroll"
      :class="{ locked: !editable }"
      @pointerdown="onStripDown"
    >
      <div
        class="pwc-strip"
        :style="{ width: contentWidth + 'px', height: pageHeight + 'px', background: paperBg(wall.bg) }"
      >
        <template v-for="(el, i) in elements" :key="el._k">
          <WallElement
            :el="el"
            :editable="editable"
            :selected="selectedId === el._k"
            @select="selectEl(el._k)"
            @change="scheduleSave"
            @edit-text="editText"
          />
        </template>
      </div>
    </div>

    <!-- 选中元素的上下文操作栏：图层顺序 / 字体 / 相框 / 删除 -->
    <div v-if="editable && selEl" class="pwc-ctx">
      <span class="ctx-tag">{{ selLabel }}</span>
      <button class="ctx-btn" @click="zOp('front')">置顶</button>
      <button class="ctx-btn" @click="zOp('up')">上移</button>
      <button class="ctx-btn" @click="zOp('down')">下移</button>
      <button class="ctx-btn" @click="zOp('back')">置底</button>
      <button v-if="selEl.type === 'text'" class="ctx-btn" @click="togglePanel('font')">字体</button>
      <button v-if="selEl.type === 'text' || selEl.type === 'image'" class="ctx-btn" @click="togglePanel('frame')">相框</button>
      <button class="ctx-btn danger" @click="removeSelected">删除</button>
    </div>

    <!-- 上下文弹出小面板（字体 / 便利贴色 / 相框） -->
    <div v-if="ctxPanel && selEl" class="pwc-pop" @click.stop>
      <template v-if="ctxPanel === 'font'">
        <button
          v-for="f in FONTS"
          :key="f.key"
          class="pop-item"
          :class="{ on: selEl.font === f.key }"
          :style="{ fontFamily: f.css }"
          @click="setFont(f.key)"
        >{{ f.name }}</button>
      </template>
      <template v-else-if="ctxPanel === 'frame'">
        <template v-if="selEl.type === 'image'">
          <button class="pop-item" :class="{ on: !selEl.frame }" @click="setFrame('')">原图</button>
          <button class="pop-item" :class="{ on: selEl.frame === 'polaroid' }" @click="setFrame('polaroid')">拍立得白边</button>
          <button class="pop-item" :class="{ on: selEl.frame === 'tape' }" @click="setFrame('tape')">电子胶带</button>
        </template>
        <template v-else>
          <button class="pop-item" :class="{ on: !selEl.frame }" @click="setFrame('')">普通文字</button>
          <button
            v-for="c in STICKY_COLORS"
            :key="c"
            class="pop-item"
            :class="{ on: selEl.frame === 'sticky:' + c }"
            @click="setFrame('sticky:' + c)"
          ><span class="pop-dot" :style="{ background: c }"></span>便利贴</button>
        </template>
      </template>
    </div>

    <!-- 装饰模式：底部工具栏 -->
    <transition name="slideup">
      <div v-if="editable" class="pwc-tools">
        <button class="pt-btn" @click="imageSheet = true"><AppIcon name="image" :size="19" /><span>图片</span></button>
        <button class="pt-btn" @click="stickerSheet = true"><AppIcon name="sticker" :size="19" /><span>贴纸</span></button>
        <button class="pt-btn" @click="textSheet = true"><AppIcon name="edit" :size="19" /><span>文字</span></button>
        <button class="pt-btn" @click="paperSheet = true"><AppIcon name="grid" :size="19" /><span>底纸</span></button>
        <button class="pt-btn" @click="addPage"><AppIcon name="plus" :size="19" /><span>增加页数</span></button>
      </div>
    </transition>

    <!-- 图片来源选择 -->
    <div v-if="imageSheet" class="sheet-mask" @click="imageSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">添加图片</div>
        <button class="sheet-item" @click="pickLocalImage">从手机上传（默认拍立得）</button>
        <button class="sheet-item" @click="openCardImages">从字卡库导入（默认拍立得）</button>
        <button class="sheet-cancel" @click="imageSheet = false">取消</button>
      </div>
    </div>

    <!-- 字卡库图片选择 -->
    <div v-if="cardSheet" class="sheet-mask" @click="cardSheet = false">
      <div class="sheet sheet-wide" @click.stop>
        <div class="sheet-title">从字卡库选择</div>
        <div class="card-grid">
          <div
            v-for="c in cardImages"
            :key="c.id"
            class="card-thumb"
            :style="c.asset_path ? {} : { background: 'var(--bg-soft)' }"
            @click="addImageFromCard(c)"
          >
            <img v-if="c.asset_path" :src="c.asset_path" alt="" />
            <AppIcon v-else name="image" :size="22" color="var(--text-soft)" />
          </div>
          <p v-if="!cardImages.length" class="sheet-empty">字卡库还没有图片</p>
        </div>
        <button class="sheet-cancel" @click="cardSheet = false">取消</button>
      </div>
    </div>

    <!-- 贴纸选择（分类导航 + 内置库 + 自定义上传；顶部固定，仅宫格滚动） -->
    <div v-if="stickerSheet" class="sheet-mask" @click="stickerSheet = false">
      <div class="sheet sheet-sticker" @click.stop>
        <div class="sh-head">
          <div class="sheet-title">添加贴纸</div>
          <button class="sh-close" aria-label="关闭" @click="stickerSheet = false"><AppIcon name="close" :size="18" color="var(--text-soft)" /></button>
        </div>
        <div class="st-cat-row">
          <button
            v-for="c in allCats"
            :key="c"
            class="st-cat"
            :class="{ on: curCat === c }"
            @click="curCat = c"
          >{{ c }}</button>
          <button class="st-cat st-cat-add" aria-label="添加分类" @click="addCat"><AppIcon name="plus" :size="13" /></button>
        </div>
        <div class="sticker-grid st-scroll">
          <div
            v-for="(s, i) in curStickers"
            :key="i"
            class="sticker-thumb"
            @click="addSticker(s.data)"
          >
            <img :src="s.data" alt="" />
          </div>
          <button class="sticker-thumb st-upload" @click="pickCustomSticker">
            <AppIcon name="plus" :size="24" color="var(--text-soft)" />
            <span>上传贴纸</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 添加文字：先选样式（普通文字字体 / 便利贴色），再输入内容 -->
    <div v-if="textSheet" class="sheet-mask" @click="textSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">添加文字</div>
        <div class="ts-label">普通文字</div>
        <div class="ts-row">
          <button
            v-for="f in FONTS"
            :key="f.key"
            class="ts-font"
            :style="{ fontFamily: f.css }"
            @click="addTextWith('', f.key)"
          >{{ f.name }}</button>
        </div>
        <div class="ts-label">便利贴</div>
        <div class="ts-row">
          <button
            v-for="c in STICKY_COLORS"
            :key="c"
            class="ts-color"
            :style="{ background: c }"
            aria-label="便利贴"
            @click="addTextWith('sticky:' + c, 'hand')"
          ></button>
        </div>
        <button class="sheet-cancel" @click="textSheet = false">取消</button>
      </div>
    </div>

    <!-- 更换底纸 -->
    <div v-if="paperSheet" class="sheet-mask" @click="paperSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">更换底纸</div>
        <div class="paper-grid">
          <button
            v-for="p in PAPERS"
            :key="p.key"
            class="paper-cell"
            :class="{ on: (wall.bg || 'cream') === p.key }"
            :style="{ background: p.thumb }"
            @click="setPaper(p.key)"
          >
            <span class="paper-name">{{ p.name }}</span>
            <AppIcon v-if="(wall.bg || 'cream') === p.key" name="check" :size="15" color="#4a4036" class="paper-check" />
          </button>
        </div>
      </div>
    </div>

    <input ref="imgFileEl" type="file" accept="image/*" hidden @change="onLocalImagePick" />
    <input ref="stFileEl" type="file" accept="image/*" hidden @change="onCustomStickerPick" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import WallElement from './WallElement.vue'
import { FONTS, PAPERS, STICKERS, STICKER_CATEGORIES, STICKY_COLORS, paperBg } from './presets'
import {
  getPhotoWall, listWallElements, saveWallElements, updatePhotoWall, listCardImages
} from '@/api/album'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'
import { promptDialog } from '@/utils/dialog'
import { useNotificationsStore } from '@/stores/notifications'

const props = defineProps({
  wallId: { type: Number, required: true },
  editable: { type: Boolean, default: false }
})

const toast = useNotificationsStore()
const scrollEl = ref(null)
const imgFileEl = ref(null)
const stFileEl = ref(null)

const wall = ref({ page_count: 1, width: 0, bg: 'cream' })
const elements = ref([])
const selectedId = ref(null)
const pageWidth = ref(0)
const pageHeight = ref(0)
let seq = 1

const contentWidth = computed(() => Math.max(1, (wall.value.page_count || 1) * (pageWidth.value || 360)))
const pageCount = computed(() => wall.value.page_count || 1)

const imageSheet = ref(false)
const cardSheet = ref(false)
const stickerSheet = ref(false)
const textSheet = ref(false)
const paperSheet = ref(false)
const cardImages = ref([])
const ctxPanel = ref(null) // 'font' | 'frame'

/* ── 选中元素 & 上下文操作 ── */
const selEl = computed(() => elements.value.find((e) => e._k === selectedId.value) || null)
const selLabel = computed(() => {
  const t = selEl.value && selEl.value.type
  if (t === 'image') return '图片'
  if (t === 'sticker') return '贴纸'
  return '文字'
})
function selectEl(k) {
  selectedId.value = k
  ctxPanel.value = null
}
watch(selectedId, () => { ctxPanel.value = null })

function togglePanel(p) {
  ctxPanel.value = ctxPanel.value === p ? null : p
}

function zOp(op) {
  const list = [...elements.value].sort((a, b) => (a.z || 0) - (b.z || 0))
  const idx = list.findIndex((e) => e._k === selectedId.value)
  if (idx < 0) return
  const el = list[idx]
  if (op === 'front') {
    el.z = (list[list.length - 1].z || 0) + 1
  } else if (op === 'back') {
    el.z = (list[0].z || 0) - 1
  } else if (op === 'up' && idx < list.length - 1) {
    const o = list[idx + 1]
    const t = el.z || 0
    el.z = o.z || 0
    o.z = t
  } else if (op === 'down' && idx > 0) {
    const o = list[idx - 1]
    const t = el.z || 0
    el.z = o.z || 0
    o.z = t
  }
  scheduleSave()
}

function setFont(key) {
  if (selEl.value) selEl.value.font = key
  ctxPanel.value = null
  scheduleSave()
}
function setFrame(f) {
  if (selEl.value) selEl.value.frame = f
  ctxPanel.value = null
  scheduleSave()
}

function removeSelected() {
  elements.value = elements.value.filter((e) => e._k !== selectedId.value)
  selectedId.value = null
  ctxPanel.value = null
  scheduleSave()
}

async function load() {
  const w = await getPhotoWall(props.wallId)
  if (w) wall.value = { ...wall.value, ...w }
  const rows = await listWallElements(props.wallId)
  elements.value = rows.map((r) => ({
    ...r,
    font: r.font || '',
    frame: r.frame || '',
    _k: seq++
  }))
}

/* 测量视口尺寸，驱动长卷宽度 */
function measure() {
  if (!scrollEl.value) return
  pageWidth.value = scrollEl.value.clientWidth
  pageHeight.value = scrollEl.value.clientHeight
}
let ro = null
onMounted(async () => {
  await load()
  await nextTick()
  measure()
  ro = new ResizeObserver(() => measure())
  if (scrollEl.value) ro.observe(scrollEl.value)
})
onBeforeUnmount(() => {
  ro && ro.disconnect()
  flushSave()
})

function onStripDown() {
  selectedId.value = null
  ctxPanel.value = null
}

/* ── 新增元素（落在当前可视区中央） ── */
function viewCenter() {
  const sl = scrollEl.value ? scrollEl.value.scrollLeft : 0
  return {
    x: sl + (pageWidth.value || 360) / 2,
    y: (pageHeight.value || 600) / 2
  }
}
function addElement(type, content, meta = {}) {
  const c = viewCenter()
  const base = type === 'image' ? 150 : type === 'sticker' ? 96 : 120
  const h = type === 'text' ? 40 : base * 0.7
  // 连续添加时沿对角线错开，避免完美重叠难分辨
  const off = (elements.value.length % 6) * 20
  const el = {
    _k: seq++,
    type,
    x: Math.round(c.x - base / 2 + off),
    y: Math.round(c.y - h / 2 + off),
    scale: 1,
    rotation: 0,
    z: elements.value.length + 1,
    content: content || '',
    font: meta.font || '',
    frame: meta.frame || ''
  }
  elements.value.push(el)
  selectedId.value = el._k
  ctxPanel.value = null
  scheduleSave()
}

/* ── 文字：先选样式再输入（普通文字按字体 / 便利贴按颜色） ── */
async function addTextWith(frame, font) {
  textSheet.value = false
  const text = await promptDialog({ title: frame ? '写便利贴' : '添加文字', text: '写下想留在墙上的话', placeholder: '如：今天也很想你', okText: '添加' })
  if (text === null) return
  addElement('text', text.trim() || '新留言', { font, frame })
}

async function editText(el) {
  const text = await promptDialog({ title: '编辑文字', text: '', value: el.content, placeholder: '文字内容', okText: '保存' })
  if (text === null) return
  el.content = text
  scheduleSave()
}

/* ── 图片：本地上传 / 字卡库（默认拍立得相框，可在上下文栏切换原图/胶带） ── */
function pickLocalImage() {
  imageSheet.value = false
  imgFileEl.value && imgFileEl.value.click()
}
async function openCardImages() {
  imageSheet.value = false
  cardImages.value = await listCardImages()
  cardSheet.value = true
}
function addImageFromCard(c) {
  cardSheet.value = false
  addElement('image', c.asset_path, { frame: 'polaroid' })
}
async function onLocalImagePick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const small = await compressImage(file)
    const res = await uploadFile(small)
    addElement('image', res.path, { frame: 'polaroid' })
  } catch (err) {
    toast.pushToast({ type: 'error', title: '图片上传失败', text: err.message })
  }
}

/* ── 贴纸：内置 / 自定义上传 ──
   自定义分类保存在 localStorage（设备级偏好） */
const CAT_KEY = 'eunoia_album_sticker_cats'
function loadCustomCats() {
  try {
    const v = JSON.parse(localStorage.getItem(CAT_KEY))
    return v && Array.isArray(v.names) ? v : { names: [], stickers: {} }
  } catch (_) {
    return { names: [], stickers: {} }
  }
}
const customCats = ref(loadCustomCats())
function saveCustomCats() {
  try { localStorage.setItem(CAT_KEY, JSON.stringify(customCats.value)) } catch (_) {}
}
const allCats = computed(() => [...STICKER_CATEGORIES.map((c) => c.name), ...customCats.value.names])
const curCat = ref(STICKER_CATEGORIES[0].name)
const curStickers = computed(() => {
  const builtin = STICKERS.filter((s) => s.cat === curCat.value).map((s) => ({ data: s.data }))
  const custom = customCats.value.stickers[curCat.value] || []
  return [...builtin, ...custom]
})

async function addCat() {
  const name = await promptDialog({ title: '自定义分类', text: '输入分类名称', placeholder: '如：旅行', okText: '添加' })
  if (name === null) return
  const n = name.trim()
  if (!n || allCats.value.includes(n)) return
  customCats.value.names.push(n)
  customCats.value.stickers[n] = customCats.value.stickers[n] || []
  saveCustomCats()
  curCat.value = n
}

function addSticker(data) {
  stickerSheet.value = false
  addElement('sticker', data)
}
function pickCustomSticker() {
  stFileEl.value && stFileEl.value.click()
}
async function onCustomStickerPick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const small = await compressImage(file)
    const res = await uploadFile(small)
    addElement('sticker', res.path)
    // 当前在自定义分类时，把上传的贴纸同时存入该分类，方便复用
    if (!STICKER_CATEGORIES.some((c) => c.name === curCat.value)) {
      customCats.value.stickers[curCat.value] = [...(customCats.value.stickers[curCat.value] || []), { name: 'custom-' + Date.now(), data: res.path }]
      saveCustomCats()
    }
  } catch (err) {
    toast.pushToast({ type: 'error', title: '贴纸上传失败', text: err.message })
  }
}

/* ── 底纸 ── */
async function setPaper(key) {
  paperSheet.value = false
  wall.value.bg = key
  try {
    await updatePhotoWall(props.wallId, { bg: key })
  } catch (e) {
    console.error('[album] 底纸保存失败', e)
  }
}

/* ── 增加页数：无缝延长长卷 ── */
async function addPage() {
  wall.value.page_count = (wall.value.page_count || 1) + 1
  // 滚到新扩展的尾部，方便继续装饰
  await nextTick()
  if (scrollEl.value) scrollEl.value.scrollLeft = scrollEl.value.scrollWidth
  await flushSave()
}

/* ── 实时保存（防抖） ── */
let saveTimer = null
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushSave, 400)
}
async function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (!elements.value.length && !wall.value.page_count) return
  const payload = elements.value.map((e) => ({
    id: e.id,
    type: e.type,
    x: Math.round(e.x),
    y: Math.round(e.y),
    scale: Number(e.scale) || 1,
    rotation: Number(e.rotation) || 0,
    z: Number(e.z) || 0,
    content: e.content || '',
    font: e.font || '',
    frame: e.frame || ''
  }))
  try {
    await saveWallElements(props.wallId, payload)
    // 封面：取最靠左的一张图片元素，让列表页显示真实封面
    const firstImg = [...elements.value].sort((a, b) => a.x - b.x).find((e) => e.type === 'image' && e.content)
    await updatePhotoWall(props.wallId, {
      page_count: wall.value.page_count,
      width: contentWidth.value,
      bg: wall.value.bg || 'cream',
      cover: firstImg ? firstImg.content : (wall.value.cover || '')
    })
  } catch (e) {
    console.error('[album] 保存失败', e)
  }
}

defineExpose({ save: flushSave })
</script>

<style scoped>
.pwc { position: relative; flex: 1; display: flex; flex-direction: column; min-height: 0; }
.pwc-scroll {
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
  background: var(--bg-body);
}
.pwc-scroll.locked { touch-action: pan-x; }
.pwc-strip {
  position: relative;
  height: 100%;
  transition: background 0.3s ease;
}

/* 选中元素上下文操作栏 */
.pwc-ctx {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
  overflow-x: auto;
  z-index: 30;
}
.ctx-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-soft);
  padding-right: 2px;
}
.ctx-btn {
  flex-shrink: 0;
  border: none;
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.ctx-btn:active { background: var(--accent-soft); }
.ctx-btn.danger { color: #d2554f; }

/* 上下文弹出小面板 */
.pwc-pop {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: calc(106px + env(safe-area-inset-bottom));
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px;
  background: var(--bg-screen);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  z-index: 31;
}
.pop-item {
  border: 1.5px solid var(--border);
  background: var(--bg-screen);
  border-radius: 10px;
  padding: 7px 12px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.pop-item.on { border-color: var(--accent); color: var(--accent); }
.pop-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.12);
}

/* 底部工具栏 */
.pwc-tools {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 5px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
  z-index: 30;
}
.pt-btn {
  flex: 1;
  border: none;
  background: var(--bg-soft);
  border-radius: 12px;
  padding: 7px 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text);
  font-size: 10px;
  cursor: pointer;
}
.pt-btn:active { background: var(--accent-soft); }
.slideup-enter-active, .slideup-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.slideup-enter-from, .slideup-leave-to { transform: translateY(100%); opacity: 0; }

/* 底部抽屉 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}
.sheet {
  width: 100%;
  background: var(--bg-screen);
  border-radius: 16px 16px 0 0;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
}
.sheet-wide { max-height: 70vh; overflow-y: auto; }
.sheet-title { font-size: 14px; color: var(--text-soft); text-align: center; margin-bottom: 10px; }
.sheet-item, .sheet-cancel {
  width: 100%;
  border: none;
  background: var(--bg-soft);
  border-radius: 12px;
  padding: 13px;
  font-size: 15px;
  color: var(--text);
  margin-bottom: 8px;
  cursor: pointer;
}
.sheet-cancel { background: transparent; color: var(--text-soft); margin-bottom: 0; }
.sheet-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 12px; }

.card-grid, .sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.card-thumb, .sticker-thumb {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.card-thumb img, .sticker-thumb img { width: 100%; height: 100%; object-fit: cover; }
.sticker-thumb { background: transparent; }
.sticker-thumb img { object-fit: contain; }

/* 贴纸弹窗：顶部固定、宫格独立滚动 */
.sheet-sticker {
  height: 64vh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
}
.sh-head { position: relative; flex: 0 0 auto; }
.sh-close {
  position: absolute;
  right: -2px;
  top: -4px;
  border: none;
  background: transparent;
  padding: 6px;
  display: inline-flex;
  cursor: pointer;
}
.st-cat-row {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 2px 10px;
  -webkit-overflow-scrolling: touch;
}
.st-cat {
  flex-shrink: 0;
  border: 1.5px solid var(--border);
  background: transparent;
  border-radius: 999px;
  padding: 5px 13px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.st-cat.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.st-cat-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  color: var(--text-soft);
}
.st-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  align-content: start;
  margin-bottom: 0;
}
.st-upload {
  flex-direction: column;
  gap: 3px;
  background: transparent;
  border: 1.5px dashed var(--border);
  font-size: 11px;
  color: var(--text-soft);
  padding: 0;
}

/* 添加文字：样式选择 */
.ts-label { font-size: 12px; color: var(--text-soft); margin: 8px 2px 6px; }
.ts-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.ts-font {
  border: 1.5px solid var(--border);
  background: var(--bg-screen);
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 15px;
  color: var(--text);
  cursor: pointer;
}
.ts-font:active { border-color: var(--accent); }
.ts-color {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1.5px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  cursor: pointer;
}

/* 底纸选择 */
.paper-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.paper-cell {
  position: relative;
  aspect-ratio: 4 / 3;
  border: 2px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 5px;
}
.paper-cell.on { border-color: var(--accent); }
.paper-name {
  font-size: 11px;
  color: #4a4036;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  padding: 2px 8px;
}
.paper-check {
  position: absolute;
  top: 5px;
  right: 5px;
  background: #fff;
  border-radius: 50%;
  padding: 2px;
  box-sizing: content-box;
}
</style>
