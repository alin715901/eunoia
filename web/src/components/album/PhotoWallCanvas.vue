<template>
  <div class="pwc">
    <!-- 横向无缝长卷 -->
    <div
      ref="scrollEl"
      class="pwc-scroll"
      :class="{ locked: !editable }"
      @pointerdown="onStripDown"
    >
      <div class="pwc-strip" :style="{ width: contentWidth + 'px', height: pageHeight + 'px' }">
        <template v-for="(el, i) in elements" :key="el._k">
          <WallElement
            :el="el"
            :editable="editable"
            :selected="selectedId === el._k"
            @select="selectedId = el._k"
            @change="scheduleSave"
            @edit-text="editText"
          />
        </template>

        <!-- 分页参考线：每页一条极淡竖线，装饰模式可见 -->
        <div
          v-if="editable && pageWidth"
          v-for="p in pageCount - 1"
          :key="'sep' + p"
          class="pwc-sep"
          :style="{ left: p * pageWidth + 'px' }"
        ></div>
      </div>
    </div>

    <!-- 装饰模式：底部工具栏 -->
    <transition name="slideup">
      <div v-if="editable" class="pwc-tools">
        <button class="pt-btn" @click="openImageSheet"><AppIcon name="image" :size="20" /><span>图片</span></button>
        <button class="pt-btn" @click="stickerSheet = true"><AppIcon name="sticker" :size="20" /><span>贴纸</span></button>
        <button class="pt-btn" @click="addText"><AppIcon name="edit" :size="20" /><span>文字</span></button>
        <button class="pt-btn" @click="addPage"><AppIcon name="plus" :size="20" /><span>增加页数</span></button>
      </div>
    </transition>

    <!-- 图片来源选择 -->
    <div v-if="imageSheet" class="sheet-mask" @click="imageSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">添加图片</div>
        <button class="sheet-item" @click="pickLocalImage">从手机上传</button>
        <button class="sheet-item" @click="openCardImages">从字卡库选择</button>
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

    <!-- 贴纸选择 -->
    <div v-if="stickerSheet" class="sheet-mask" @click="stickerSheet = false">
      <div class="sheet sheet-wide" @click.stop>
        <div class="sheet-title">添加贴纸</div>
        <div class="sticker-grid">
          <div
            v-for="(s, i) in builtinStickers"
            :key="i"
            class="sticker-thumb"
            @click="addSticker(s.data)"
          >
            <img :src="s.data" alt="" />
          </div>
        </div>
        <button class="sheet-item" @click="pickCustomSticker">上传自定义贴纸（透明 PNG）</button>
        <button class="sheet-cancel" @click="stickerSheet = false">取消</button>
      </div>
    </div>

    <input ref="imgFileEl" type="file" accept="image/*" hidden @change="onLocalImagePick" />
    <input ref="stFileEl" type="file" accept="image/*" hidden @change="onCustomStickerPick" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import WallElement from './WallElement.vue'
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

const wall = ref({ page_count: 1, width: 0 })
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
const cardImages = ref([])
let pendingPick = null // 'image' | 'sticker'

/* 系统内置贴纸（线条胶带 / 图钉 / 爱心 / 星星 / 小花） */
const builtinStickers = [
  { name: 'tape', data: svgData(`<rect x="3" y="9" width="18" height="6" rx="1" transform="rotate(-18 12 12)" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.7)" stroke-width="0.6"/>`) },
  { name: 'pin', data: svgData(`<circle cx="12" cy="8" r="5" fill="#e2554f"/><path d="M12 13l-2.4 8 2.4-3 2.4 3z" fill="#b83b36"/>`) },
  { name: 'heart', data: svgData(`<path d="M12 21s-7-4.6-9.2-9C1.3 8.7 3 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3 0 4.7 3.2 3.2 6.5C19 16.4 12 21 12 21z" fill="#ff7a8a"/>`) },
  { name: 'star', data: svgData(`<path d="M12 3l2.6 5.6 6 .7-4.4 4 1.3 6L12 16.6 6.5 19.3l1.3-6-4.4-4 6-.7z" fill="#f6c453"/>`) },
  { name: 'flower', data: svgData(`<g fill="#c79be0"><circle cx="12" cy="7" r="3"/><circle cx="17" cy="12" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="7" cy="12" r="3"/></g><circle cx="12" cy="12" r="2.4" fill="#fff"/>`) }
]

function svgData(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

async function load() {
  const w = await getPhotoWall(props.wallId)
  if (w) wall.value = w
  const rows = await listWallElements(props.wallId)
  elements.value = rows.map((r) => ({ ...r, _k: seq++ }))
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
}

/* ── 新增元素（落在当前可视区中央） ── */
function viewCenter() {
  const sl = scrollEl.value ? scrollEl.value.scrollLeft : 0
  return {
    x: sl + (pageWidth.value || 360) / 2,
    y: (pageHeight.value || 600) / 2
  }
}
function addElement(type, content) {
  const c = viewCenter()
  const base = type === 'image' ? 150 : type === 'sticker' ? 96 : 120
  const h = type === 'text' ? 40 : base * 0.7
  // 连续添加时沿对角线错开，避免完美重叠难分辨
  const off = (elements.value.length % 6) * 20
  elements.value.push({
    _k: seq++,
    type,
    x: Math.round(c.x - base / 2 + off),
    y: Math.round(c.y - h / 2 + off),
    scale: 1,
    rotation: 0,
    z: elements.value.length + 1,
    content: content || ''
  })
  selectedId.value = elements.value[elements.value.length - 1]._k
  scheduleSave()
}

async function addText() {
  const text = await promptDialog({ title: '添加文字', text: '写下想留在墙上的话', placeholder: '如：今天也很想你', okText: '添加' })
  if (text === null) return
  addElement('text', text.trim() || '新留言')
}

async function editText(el) {
  const text = await promptDialog({ title: '编辑文字', text: '', value: el.content, placeholder: '文字内容', okText: '保存' })
  if (text === null) return
  el.content = text
  scheduleSave()
}

/* ── 图片：本地上传 / 字卡库 ── */
function openImageSheet() { imageSheet.value = true }
function pickLocalImage() {
  imageSheet.value = false
  pendingPick = 'image'
  imgFileEl.value && imgFileEl.value.click()
}
async function openCardImages() {
  imageSheet.value = false
  cardImages.value = await listCardImages()
  cardSheet.value = true
}
function addImageFromCard(c) {
  cardSheet.value = false
  addElement('image', c.asset_path)
}
async function onLocalImagePick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const small = await compressImage(file)
    const res = await uploadFile(small)
    addElement('image', res.path)
  } catch (err) {
    toast.pushToast({ type: 'error', title: '图片上传失败', text: err.message })
  }
}

/* ── 贴纸：内置 / 自定义上传 ── */
function addSticker(data) {
  stickerSheet.value = false
  addElement('sticker', data)
}
function pickCustomSticker() {
  stickerSheet.value = false
  pendingPick = 'sticker'
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
  } catch (err) {
    toast.pushToast({ type: 'error', title: '贴纸上传失败', text: err.message })
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
    content: e.content || ''
  }))
  try {
    await saveWallElements(props.wallId, payload)
    // 封面：取最靠左的一张图片元素，让列表页显示真实封面
    const firstImg = [...elements.value].sort((a, b) => a.x - b.x).find((e) => e.type === 'image' && e.content)
    await updatePhotoWall(props.wallId, {
      page_count: wall.value.page_count,
      width: contentWidth.value,
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
}
.pwc-sep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--divider);
  pointer-events: none;
}

/* 底部工具栏 */
.pwc-tools {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 6px;
  padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
  background: var(--bg-screen);
  border-top: 1px solid var(--border);
}
.pt-btn {
  flex: 1;
  border: none;
  background: var(--bg-soft);
  border-radius: 12px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  color: var(--text);
  font-size: 11px;
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
</style>
