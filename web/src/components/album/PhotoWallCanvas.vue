<template>
  <div class="pwc">
    <!-- 横向无缝长卷（底纸按「一页=一屏」逐页平铺；双指可缩放整个长卷） -->
      <div
        ref="scrollEl"
        class="pwc-scroll"
        :class="{ locked: !editable, zoomed: viewZoom !== 1 }"
        @pointerdown="onStripDown"
        @scroll="syncCurPage"
        @touchstart="onScrollTouchStart"
        @touchmove="onScrollTouchMove"
        @touchend="onScrollTouchEnd"
        @wheel="onScrollWheel"
      >
        <div class="pwc-strip" :style="stripStyle">
        <template v-for="(el, i) in elements" :key="el._k">
          <WallElement
            :el="el"
            :editable="editable"
            :selected="selectedId === el._k"
            :zoom="viewZoom"
            @select="selectEl(el._k)"
            @change="scheduleSave"
            @edit-text="editText"
          />
        </template>
      </div>
    </div>

    <!-- 缩放 HUD：装饰时缩小可看全被弹窗挡住的墙底，放大可精细摆放；点百分比复位 -->
    <div v-if="editable" class="pwc-zoomhud">
      <button class="zh-btn" type="button" aria-label="缩小" @click="zoomBy(1 / 1.25)">－</button>
      <button class="zh-val" type="button" @click="resetZoom">{{ Math.round(viewZoom * 100) }}%</button>
      <button class="zh-btn" type="button" aria-label="放大" @click="zoomBy(1.25)">＋</button>
    </div>

    <!-- 当前页指示：装饰时左上角标明「第几页 / 共几页」 -->
    <div v-if="editable" class="pwc-pageind">{{ curPage }} / {{ pageCount }}</div>

    <!-- 选中元素的上下文操作栏：图层顺序 / 设置（文字）/ 相框（图片）/ 删除 -->
    <div v-if="editable && selEl" class="pwc-ctx">
      <span class="ctx-tag">{{ selLabel }}</span>
      <button class="ctx-btn" @click="zOp('front')">置顶</button>
      <button class="ctx-btn" @click="zOp('up')">上移</button>
      <button class="ctx-btn" @click="zOp('down')">下移</button>
      <button class="ctx-btn" @click="zOp('back')">置底</button>
      <button v-if="selEl.type === 'text'" class="ctx-btn" @click="openTextSheet(true)">设置</button>
      <button v-else-if="selEl.type === 'image'" class="ctx-btn" @click="frameSheet = true">相框</button>
      <button class="ctx-btn danger" @click="removeSelected">删除</button>
    </div>

    <!-- 装饰模式：底部工具栏 -->
    <transition name="slideup">
      <div v-if="editable" class="pwc-tools">
        <button class="pt-btn" @click="imageSheet = true"><AppIcon name="image" :size="19" /><span>图片</span></button>
        <button class="pt-btn" @click="stickerSheet = true"><AppIcon name="sticker" :size="19" /><span>贴纸</span></button>
        <button class="pt-btn" @click="openTextSheet(false)"><AppIcon name="edit" :size="19" /><span>文字</span></button>
        <button class="pt-btn" @click="paperSheet = true"><AppIcon name="grid" :size="19" /><span>底纸</span></button>
        <button class="pt-btn" @click="pageSheet = true"><AppIcon name="cards" :size="19" /><span>页数</span></button>
      </div>
    </transition>

    <!-- 图片来源选择 -->
    <div v-if="imageSheet" class="sheet-mask" @click="imageSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">添加图片</div>
        <button class="sheet-item" @click="pickLocalImage">从手机上传</button>
        <button class="sheet-item" @click="openCardImages">从字卡库导入</button>
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
          >{{ c }}<span
              v-if="isCustomCat(c)"
              class="cat-del"
              role="button"
              tabindex="0"
              aria-label="删除这个分类"
              @click.stop="removeCat(c)"
              @keydown.enter.stop="removeCat(c)"
            >×</span></button>
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
            <!-- 自定义上传的贴纸可删除（内置贴纸不可删） -->
            <span
              v-if="s.custom"
              class="mine-del"
              role="button"
              tabindex="0"
              aria-label="删除这个贴纸"
              @click.stop="removeSticker(s)"
              @keydown.enter.stop="removeSticker(s)"
            >×</span>
          </div>
          <button class="sticker-thumb st-upload" @click="pickCustomSticker">
            <AppIcon name="plus" :size="24" color="var(--text-soft)" />
            <span>上传贴纸</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 相框：宫格选择（原图 / 拍立得竖·横 / 电子胶带 / 自定义上传预设），布局同贴纸 -->
    <div v-if="frameSheet" class="sheet-mask" @click="frameSheet = false">
      <div class="sheet sheet-frame" @click.stop>
        <div class="sh-head">
          <div class="sheet-title">相框</div>
          <button class="sh-close" aria-label="关闭" @click="frameSheet = false"><AppIcon name="close" :size="18" color="var(--text-soft)" /></button>
        </div>
        <div class="frame-grid">
          <button class="frame-cell" :class="{ on: !selEl.frame }" @click="setFrame('')">
            <span class="frame-thumb frame-thumb-none"><AppIcon name="image" :size="20" color="var(--text-soft)" /></span>
            <span class="frame-name">原图</span>
            <AppIcon v-if="!selEl.frame" name="check" :size="14" color="var(--accent)" class="frame-check" />
          </button>
          <button class="frame-cell" :class="{ on: selEl.frame === 'polaroid' }" @click="setFrame('polaroid')">
            <span class="frame-thumb ft-polaroid"></span>
            <span class="frame-name">拍立得·竖</span>
            <AppIcon v-if="selEl.frame === 'polaroid'" name="check" :size="14" color="var(--accent)" class="frame-check" />
          </button>
          <button class="frame-cell" :class="{ on: selEl.frame === 'polaroid-h' }" @click="setFrame('polaroid-h')">
            <span class="frame-thumb ft-polaroid-h"></span>
            <span class="frame-name">拍立得·横</span>
            <AppIcon v-if="selEl.frame === 'polaroid-h'" name="check" :size="14" color="var(--accent)" class="frame-check" />
          </button>
          <button class="frame-cell" :class="{ on: selEl.frame === 'tape' }" @click="setFrame('tape')">
            <span class="frame-thumb ft-tape"></span>
            <span class="frame-name">电子胶带</span>
            <AppIcon v-if="selEl.frame === 'tape'" name="check" :size="14" color="var(--accent)" class="frame-check" />
          </button>
          <!-- 我的相框：上传后自动存为预设（不限数量）；点缩略图应用，点右上角 × 删除 -->
          <button
            v-for="(p, i) in framePresets"
            :key="p.id"
            class="frame-cell"
            :class="{ on: currentCustomFrame === p.path }"
            @click="applyFramePreset(p)"
          >
            <span class="frame-thumb" :style="{ backgroundImage: 'url(' + p.path + ')' }"></span>
            <span class="frame-name">相框 {{ i + 1 }}</span>
            <AppIcon v-if="currentCustomFrame === p.path" name="check" :size="14" color="var(--accent)" class="frame-check frame-check-left" />
            <span
              class="mine-del"
              role="button"
              tabindex="0"
              aria-label="删除这个相框"
              @click.stop="removeFramePreset(p)"
              @keydown.enter.stop="removeFramePreset(p)"
            >×</span>
          </button>
          <!-- 上传相框：PNG 透明区会透出下面的照片；当前相框是预设外的旧自定义框时显示选中态 -->
          <button
            class="frame-cell frame-cell-upload"
            :class="{ on: showCustomFrameOnUpload }"
            @click="pickCustomFrame"
          >
            <span class="frame-thumb frame-thumb-none"><AppIcon name="plus" :size="20" color="var(--text-soft)" /></span>
            <span class="frame-name">上传相框</span>
            <AppIcon v-if="showCustomFrameOnUpload" name="check" :size="14" color="var(--accent)" class="frame-check" />
          </button>
        </div>
      </div>
    </div>

    <!-- 添加文字 / 文字设置：字体 / 便签 两个分类的宫格（布局同贴纸；便签可自定义上传，不限量）
         新增：从底部工具栏进入，点选后输入内容上墙
         设置：选中文字元素点上下文栏「设置」进入，点选直接应用到当前元素 -->
    <div v-if="textSheet" class="sheet-mask" @click="textSheet = false">
      <div class="sheet sheet-sticker" @click.stop>
        <div class="sh-head">
          <div class="sheet-title">{{ textEditMode ? '文字设置' : '添加文字' }}</div>
          <button class="sh-close" aria-label="关闭" @click="textSheet = false"><AppIcon name="close" :size="18" color="var(--text-soft)" /></button>
        </div>
        <div class="st-cat-row">
          <button class="st-cat" :class="{ on: textCat === 'font' }" @click="textCat = 'font'">字体</button>
          <button class="st-cat" :class="{ on: textCat === 'note' }" @click="textCat = 'note'">便签</button>
        </div>
        <div class="st-scroll">
          <!-- 字体：内置字体宫格，点选后输入文字（设置模式直接应用） -->
          <div v-if="textCat === 'font'" class="font-grid">
            <button
              v-for="f in FONTS"
              :key="f.key"
              class="font-cell"
              :style="{ fontFamily: f.css }"
              @click="pickFont(f.key)"
            >{{ f.name }}</button>
          </div>
          <!-- 便签：内置颜色 + 自定义上传便签纸（不限量；上传后自动存预设） -->
          <div v-else class="sticker-grid">
            <button
              v-if="textEditMode"
              class="note-cell note-none"
              aria-label="无便签"
              @click="pickNote('')"
            >无</button>
            <button
              v-for="c in STICKY_COLORS"
              :key="c"
              class="note-cell"
              :style="{ background: c }"
              aria-label="便利贴"
              @click="pickNote('sticky:' + c)"
            ></button>
            <button
              v-for="(p, i) in notePresets"
              :key="p.id"
              class="note-cell note-cell-img"
              :style="{ backgroundImage: 'url(' + p.path + ')' }"
              @click="pickNote('note:' + p.path)"
            >
              <span class="note-num">{{ i + 1 }}</span>
              <span
                class="mine-del"
                role="button"
                tabindex="0"
                aria-label="删除这个便签"
                @click.stop="removeNotePreset(p)"
                @keydown.enter.stop="removeNotePreset(p)"
              >×</span>
            </button>
            <button class="sticker-thumb st-upload" @click="pickCustomNote">
              <AppIcon name="plus" :size="24" color="var(--text-soft)" />
              <span>上传便签</span>
            </button>
          </div>
        </div>
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
            :class="{ on: !isCustomBg && (wall.bg || 'cream') === p.key }"
            :style="{ background: p.thumb }"
            @click="setPaper(p.key)"
          >
            <span class="paper-name">{{ p.name }}</span>
            <AppIcon v-if="!isCustomBg && (wall.bg || 'cream') === p.key" name="check" :size="15" color="#4a4036" class="paper-check" />
          </button>
        </div>

        <!-- 我的底纸：上传后自动存为预设（不限数量）；点缩略图应用，点右上角 × 删除 -->
        <div class="paper-mine">
          <div class="paper-mine-head">
            <span class="paper-mine-title">我的底纸</span>
            <span class="paper-mine-count">{{ bgPresets.length }}</span>
          </div>
          <div class="paper-grid">
            <button
              v-for="p in bgPresets"
              :key="p.id"
              class="paper-cell paper-cell-mine"
              :class="{ on: (wall.bg || '') === p.path }"
              :style="presetThumbStyle(p)"
              @click="applyBgPreset(p)"
            >
              <span
                class="mine-del"
                role="button"
                tabindex="0"
                aria-label="删除这张底纸"
                @click.stop="removeBgPreset(p)"
                @keydown.enter.stop="removeBgPreset(p)"
              >×</span>
            </button>
            <!-- 自定义底纸：上传照片；当前墙用的是预设外的旧自定义底纸时，这里显示缩略图与选中态 -->
            <button
              class="paper-cell paper-cell-upload"
              :class="{ on: showCustomBgOnUpload }"
              :style="customBgThumbStyle"
              @click="pickCustomBg"
            >
              <template v-if="!showCustomBgOnUpload">
                <AppIcon name="plus" :size="20" color="var(--text-soft)" />
                <span class="paper-name">上传底纸</span>
              </template>
              <AppIcon v-else name="check" :size="15" color="#4a4036" class="paper-check" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 页数：增加 / 减少（至少保留一页；减页会清掉被删页上的装饰） -->
    <div v-if="pageSheet" class="sheet-mask" @click="pageSheet = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">页数</div>
        <button class="sheet-item" @click="changePage(1)">增加页数</button>
        <button class="sheet-item" :class="{ off: pageCount <= 1 }" @click="changePage(-1)">减少页数</button>
        <button class="sheet-cancel" @click="pageSheet = false">取消</button>
      </div>
    </div>

    <input ref="imgFileEl" type="file" accept="image/*" hidden @change="onLocalImagePick" />
    <input ref="stFileEl" type="file" accept="image/*" hidden @change="onCustomStickerPick" />
    <input ref="bgFileEl" type="file" accept="image/*" hidden @change="onCustomBgPick" />
    <input ref="frFileEl" type="file" accept="image/*" hidden @change="onCustomFramePick" />
    <input ref="ntFileEl" type="file" accept="image/*" hidden @change="onCustomNotePick" />

    <!-- 自定义底纸裁剪：与聊天背景一致，先裁后传；比例跟随当前长卷，裁完即铺满 -->
    <ImageCropper
      v-if="bgCropSrc"
      :src="bgCropSrc"
      title="裁剪底纸"
      :ratio="bgCropRatio"
      :out-width="bgOutWidth"
      @cancel="bgCropSrc = ''"
      @done="onBgCropped"
      @error="onBgCropError"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import WallElement from './WallElement.vue'
import { FONTS, PAPERS, STICKERS, STICKER_CATEGORIES, STICKY_COLORS, paperBg } from './presets'
import {
  getPhotoWall, listWallElements, saveWallElements, updatePhotoWall, listCardImages
} from '@/api/album'
import { uploadFile, getWallBgPresets, saveWallBgPresets, getAlbumStickerCats, saveAlbumStickerCats, getWallFramePresets, saveWallFramePresets, getWallNotePresets, saveWallNotePresets } from '@/api/settings'
import { compressImage, prepareUpload } from '@/utils/image'
import { promptDialog, confirmDialog } from '@/utils/dialog'
import { useNotificationsStore } from '@/stores/notifications'

const props = defineProps({
  wallId: { type: Number, required: true },
  editable: { type: Boolean, default: false }
})

const toast = useNotificationsStore()
const scrollEl = ref(null)
const imgFileEl = ref(null)
const stFileEl = ref(null)
const bgFileEl = ref(null)
const frFileEl = ref(null)
const ntFileEl = ref(null)

const wall = ref({ page_count: 1, width: 0, bg: 'cream' })
const elements = ref([])
const selectedId = ref(null)
const pageWidth = ref(0)
const pageHeight = ref(0)
/* 长卷缩放：装饰时双指 / HUD 按钮 / Ctrl+滚轮 缩放，缩小时居中摆放，
   避免弹窗（贴纸/底纸面板）遮住墙底时无从下手 */
const viewZoom = ref(1)
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
let seq = 1

const contentWidth = computed(() => Math.max(1, (wall.value.page_count || 1) * (pageWidth.value || 360)))
const pageCount = computed(() => wall.value.page_count || 1)
/* 当前页：装饰时左上角显示「第几页 / 共几页」。滚动位置是屏幕像素，
   一页在屏幕上的宽度 = pageWidth × zoom，换算后取最近页 */
const curPage = ref(1)
function syncCurPage() {
  const el = scrollEl.value
  if (!el) return
  const pw = (pageWidth.value || 360) * (viewZoom.value || 1)
  const p = Math.round(el.scrollLeft / pw) + 1
  curPage.value = Math.max(1, Math.min(pageCount.value, p))
}
watch(viewZoom, () => syncCurPage())

/* 底纸：内置款是 CSS 背景值；自定义照片经裁剪窗按「一页=一屏」输出，
   以页为单位向左平铺（repeat-x）——每页都是完整的一张，不拉伸、不裁碎，
   也不会出现未裁剪直接 cover 时「照片被放大到只剩一屏取景框」的旧观感 */
const IMG_BG_RE = /^(data:|https?:|\/)/
const isCustomBg = computed(() => IMG_BG_RE.test(wall.value.bg || ''))
const customBgThumbStyle = computed(() => (isCustomBg.value
  ? { backgroundImage: `url("${wall.value.bg}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  : {}))
/* 自定义底纸预设（最多 4 张，上传即存） */
const bgPresets = ref([])
const customBgInPresets = computed(() => isCustomBg.value && bgPresets.value.some((p) => p.path === wall.value.bg))
/* 当前墙的自定义底纸不在预设里（旧数据/被淘汰）时，仍在上传格上显示缩略图与选中态 */
const showCustomBgOnUpload = computed(() => isCustomBg.value && !customBgInPresets.value)
const presetThumbStyle = (p) => ({ backgroundImage: `url("${p.path}")`, backgroundSize: 'cover', backgroundPosition: 'center' })

const stripStyle = computed(() => {
  const bg = wall.value.bg || 'cream'
  const base = { width: contentWidth.value + 'px', height: pageHeight.value + 'px' }
  if (IMG_BG_RE.test(bg)) {
    // 一页一屏：瓦片尺寸 = 屏宽 × 屏高，逐页平铺
    const pw = pageWidth.value || 390
    const ph = pageHeight.value || 844
    base.background = `url("${bg}") left top / ${pw}px ${ph}px repeat-x`
  } else {
    base.background = paperBg(bg)
  }
  /* 缩放：zoom 参与布局，滚动范围自动正确；自身 margin 会被 zoom 放大，
     故按「视觉偏移 / zoom」回填，把缩小后的长卷摆回视口正中 */
  const z = viewZoom.value
  if (z !== 1) {
    base.zoom = z
    const mt = Math.max(0, (pageHeight.value - pageHeight.value * z) / 2)
    const ml = Math.max(0, (pageWidth.value - contentWidth.value * z) / 2)
    if (mt > 0) base.marginTop = Math.round(mt / z) + 'px'
    if (ml > 0) base.marginLeft = Math.round(ml / z) + 'px'
  }
  return base
})

const imageSheet = ref(false)
const cardSheet = ref(false)
const stickerSheet = ref(false)
const textSheet = ref(false)
const paperSheet = ref(false)
const pageSheet = ref(false)
const frameSheet = ref(false)
/* 相框弹窗每次打开都重读预设：keep-alive 复用实例时列表不会陈旧 */
watch(frameSheet, (v) => {
  if (v) loadFramePresets()
})
/* 底纸弹窗每次打开都重读预设：keep-alive 复用实例时列表不会陈旧（别的墙新传的底纸也能看到） */
watch(paperSheet, (v) => {
  if (v) loadBgPresets()
})
const cardImages = ref([])

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

function setFrame(f) {
  if (selEl.value) selEl.value.frame = f
  frameSheet.value = false
  scheduleSave()
}

function removeSelected() {
  elements.value = elements.value.filter((e) => e._k !== selectedId.value)
  selectedId.value = null
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
  await loadBgPresets()
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

/* ── 长卷缩放：HUD 按钮 / 双指捏合 / Ctrl+滚轮 ── */
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
function setZoom(z) {
  viewZoom.value = clamp(Math.round(z * 100) / 100, ZOOM_MIN, ZOOM_MAX)
}
function zoomBy(f) {
  setZoom(viewZoom.value * f)
}
function resetZoom() {
  viewZoom.value = 1
}
/* 退出装饰态时复位缩放，避免下次进来停留在缩小态 */
watch(() => props.editable, (v) => {
  if (!v) resetZoom()
})
/* 双指都在同一个元素上时让位给元素自身的缩放手势 */
let wallPinch = null
function onScrollTouchStart(e) {
  if (e.touches.length !== 2) return
  const ts = [...e.touches]
  if (ts.every((t) => t.target.closest && t.target.closest('.we'))) return
  wallPinch = {
    d: Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY) || 1,
    z: viewZoom.value
  }
}
function onScrollTouchMove(e) {
  if (!wallPinch || e.touches.length !== 2) return
  e.preventDefault()
  const ts = [...e.touches]
  const d = Math.hypot(ts[0].clientX - ts[1].clientX, ts[0].clientY - ts[1].clientY)
  setZoom((wallPinch.z * d) / wallPinch.d)
}
function onScrollTouchEnd(e) {
  if (e.touches.length < 2) wallPinch = null
}
function onScrollWheel(e) {
  if (!e.ctrlKey) return
  e.preventDefault()
  zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
}

/* ── 新增元素（落在当前可视区中央；缩放时除以 zoom 换算回长卷坐标） ── */
function viewCenter() {
  const sl = scrollEl.value ? scrollEl.value.scrollLeft : 0
  const z = viewZoom.value || 1
  // 缩小时长卷居中摆放的视觉边距，换算时要先减掉
  const mt = z < 1 ? Math.max(0, (pageHeight.value * (1 - z)) / 2) : 0
  const ml = z < 1 ? Math.max(0, (pageWidth.value - contentWidth.value * z) / 2) : 0
  return {
    x: (sl + (pageWidth.value || 360) / 2 - ml) / z,
    y: ((pageHeight.value || 600) / 2 - mt) / z
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
  scheduleSave()
}

/* ── 文字：先选样式（字体 / 便签）再输入内容 ──
   textEditMode：false = 底部工具栏「文字」新增；true = 选中文字元素点「设置」修改样式 */
const textCat = ref('font') // 'font' 字体 | 'note' 便签
const textEditMode = ref(false)
function openTextSheet(edit) {
  textEditMode.value = edit
  textCat.value = 'font'
  textSheet.value = true
}
/* 文字弹窗每次打开重读便签预设：keep-alive 复用实例时不会拿到陈旧列表 */
watch(textSheet, (v) => {
  if (v) loadNotePresets()
})
/* 设置模式下点字体直接应用到选中元素并关闭 */
function pickFont(key) {
  if (!textEditMode.value) return addTextWith('', key)
  if (selEl.value) selEl.value.font = key
  textSheet.value = false
  scheduleSave()
}
/* 设置模式下点便签直接换底（'' = 去掉便签）并关闭 */
function pickNote(frame) {
  if (!textEditMode.value) return addTextWith(frame, 'hand')
  if (selEl.value) selEl.value.frame = frame
  textSheet.value = false
  scheduleSave()
}

/* ── 自定义便签纸：上传即存（按 path 去重），不限数量 ── */
const notePresets = ref([])
async function loadNotePresets() {
  try {
    notePresets.value = await getWallNotePresets()
  } catch (e) {
    console.error('[album] 便签预设读取失败', e)
  }
}
async function addNotePreset(path) {
  if (!path) return
  const list = notePresets.value.filter((p) => p.path !== path)
  list.unshift({ id: 'ntp' + Date.now(), path })
  notePresets.value = list
  try {
    await saveWallNotePresets(list)
  } catch (e) {
    console.error('[album] 便签预设保存失败', e)
  }
}
async function removeNotePreset(p) {
  const next = notePresets.value.filter((x) => x.id !== p.id)
  notePresets.value = next
  try {
    await saveWallNotePresets(next)
    toast.pushToast({ type: 'info', title: '已删除这个便签' })
  } catch (e) {
    toast.pushToast({ type: 'error', title: '删除失败', text: e.message })
  }
}
function pickCustomNote() {
  ntFileEl.value && ntFileEl.value.click()
}
async function onCustomNotePick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    // PNG 可能带透明底，跳过填白压缩，保留 alpha
    const small = await prepareUpload(file)
    const res = await uploadFile(small)
    await addNotePreset(res.path)
    toast.pushToast({ type: 'info', title: '便签已存入', text: '写文字时即可选用这张便签纸' })
  } catch (err) {
    toast.pushToast({ type: 'error', title: '便签上传失败', text: err.message })
  }
}

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
   分类名与各分类下上传的贴纸存在 global_settings KV（IndexedDB，贴纸是 PNG dataURL 体积大）。
   内置分类同样按分类名作 key——在哪个分类上传，就自动存到该分类，下次打开可直接复用。 */
const customCats = ref({ names: [], stickers: {} })
async function loadCustomCats() {
  try {
    customCats.value = await getAlbumStickerCats()
  } catch (e) {
    console.error('[album] 贴纸分类读取失败', e)
  }
}
async function saveCustomCats() {
  try {
    await saveAlbumStickerCats(customCats.value)
  } catch (e) {
    console.error('[album] 贴纸分类保存失败', e)
  }
}
/* 贴纸弹窗每次打开重读：keep-alive 复用实例时不会拿到陈旧列表 */
watch(stickerSheet, (v) => {
  if (v) loadCustomCats()
})
const allCats = computed(() => [...STICKER_CATEGORIES.map((c) => c.name), ...customCats.value.names])
/* 是否为用户自建的分类（可删除；内置分类不可删） */
const isCustomCat = (c) => customCats.value.names.includes(c)
const curCat = ref(STICKER_CATEGORIES[0].name)
const curStickers = computed(() => {
  const builtin = STICKERS.filter((s) => s.cat === curCat.value).map((s) => ({ data: s.data, custom: false }))
  const custom = (customCats.value.stickers[curCat.value] || []).map((s) => ({ data: s.data, custom: true }))
  return [...builtin, ...custom]
})

async function addCat() {
  const name = await promptDialog({ title: '自定义分类', text: '输入分类名称', placeholder: '如：旅行', okText: '添加' })
  if (name === null) return
  const n = name.trim()
  if (!n || allCats.value.includes(n)) return
  customCats.value.names.push(n)
  customCats.value.stickers[n] = customCats.value.stickers[n] || []
  await saveCustomCats()
  curCat.value = n
}

/* 删除自定义分类：分类连同里面上传的贴纸一并删除（需确认） */
async function removeCat(c) {
  const ok = await confirmDialog({
    title: '删除分类',
    text: `「${c}」分类及里面上传的贴纸会一并删除，确定删除吗？`,
    okText: '删除',
    danger: true
  })
  if (!ok) return
  customCats.value.names = customCats.value.names.filter((n) => n !== c)
  delete customCats.value.stickers[c]
  if (curCat.value === c) curCat.value = STICKER_CATEGORIES[0].name
  await saveCustomCats()
  toast.pushToast({ type: 'info', title: '已删除这个分类' })
}

/* 删除自定义上传的贴纸（内置贴纸不会带删除按钮） */
async function removeSticker(s) {
  const list = customCats.value.stickers[curCat.value] || []
  const next = list.filter((x) => x.data !== s.data)
  customCats.value.stickers[curCat.value] = next
  try {
    await saveCustomCats()
    toast.pushToast({ type: 'info', title: '已删除这个贴纸' })
  } catch (e) {
    toast.pushToast({ type: 'error', title: '删除失败', text: e.message })
  }
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
    // PNG 可能带透明底，跳过填白压缩，保留 alpha
    const small = await prepareUpload(file)
    const res = await uploadFile(small)
    addElement('sticker', res.path)
    // 在哪个分类上传就存到该分类（内置/自定义分类通用），方便复用；按 data 去重
    const list = customCats.value.stickers[curCat.value] || []
    if (!list.some((s) => s.data === res.path)) {
      customCats.value.stickers[curCat.value] = [...list, { name: 'st' + Date.now(), data: res.path }]
      await saveCustomCats()
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

/* 自定义底纸：选图后先弹裁剪窗（与聊天背景一致），按「一页=一屏」裁好再上传 */
function pickCustomBg() {
  bgFileEl.value && bgFileEl.value.click()
}
const bgCropSrc = ref('')
/* 裁剪比例 = 单页屏幕比（照片墙一页就是以屏幕大小为准），裁出来每页平铺一张 */
const bgCropRatio = computed(() => {
  const w = pageWidth.value || 390
  const h = pageHeight.value || 844
  return w / h
})
/* 输出宽度跟随屏宽（≥640 保证清晰，封顶 1080 避免体积失控） */
const bgOutWidth = computed(() => Math.round(Math.min(1080, Math.max(640, pageWidth.value || 390))))

function onCustomBgPick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (!file.type || !file.type.startsWith('image/')) {
    toast.pushToast({ type: 'error', title: '请选择图片文件' })
    return
  }
  bgCropSrc.value = URL.createObjectURL(file)
}

async function onBgCropped(blob) {
  bgCropSrc.value = ''
  if (!blob) {
    toast.pushToast({ type: 'error', title: '裁剪失败', text: '请重试' })
    return
  }
  try {
    const file = new File([blob], `wallbg-${Date.now()}.jpg`, { type: 'image/jpeg' })
    const small = await compressImage(file)
    const res = await uploadFile(small)
    if (!res || !res.path) throw new Error('上传返回为空')
    paperSheet.value = false
    wall.value.bg = res.path
    await updatePhotoWall(props.wallId, { bg: res.path })
    await addBgPreset(res.path)
    toast.pushToast({ type: 'info', title: '底纸已更换', text: '已存入我的底纸' })
  } catch (err) {
    toast.pushToast({ type: 'error', title: '底纸上传失败', text: err.message })
  }
}

function onBgCropError(msg) {
  bgCropSrc.value = ''
  toast.pushToast({ type: 'error', title: '底纸上传失败', text: msg || '图片无法读取，请换一张 JPG / PNG 图片' })
}

/* ── 底纸预设：上传即存（去重置顶），不限数量 ── */
async function loadBgPresets() {
  try {
    bgPresets.value = await getWallBgPresets()
  } catch (e) {
    console.error('[album] 底纸预设读取失败', e)
  }
}
async function addBgPreset(path) {
  if (!path) return
  const list = bgPresets.value.filter((p) => p.path !== path)
  list.unshift({ id: 'bgp' + Date.now(), path })
  bgPresets.value = list
  try {
    await saveWallBgPresets(list)
  } catch (e) {
    console.error('[album] 底纸预设保存失败', e)
  }
}
async function removeBgPreset(p) {
  const next = bgPresets.value.filter((x) => x.id !== p.id)
  bgPresets.value = next
  try {
    await saveWallBgPresets(next)
    toast.pushToast({ type: 'info', title: '已删除这张底纸' })
  } catch (e) {
    toast.pushToast({ type: 'error', title: '删除失败', text: e.message })
  }
}
async function applyBgPreset(p) {
  paperSheet.value = false
  wall.value.bg = p.path
  try {
    await updatePhotoWall(props.wallId, { bg: p.path })
  } catch (e) {
    console.error('[album] 底纸保存失败', e)
  }
}

/* 自定义相框：上传图片盖在元素上方（PNG 透明区会透出下面的照片） */
function pickCustomFrame() {
  frFileEl.value && frFileEl.value.click()
}
/* 当前元素用的自定义相框地址（frame = 'custom:' + 图片） */
const currentCustomFrame = computed(() => {
  const f = (selEl.value && selEl.value.frame) || ''
  return f.startsWith('custom:') ? f.slice(7) : ''
})
/* 当前自定义相框不在预设里（旧数据/被淘汰）时，仍在上传格上显示选中态 */
const showCustomFrameOnUpload = computed(() =>
  !!currentCustomFrame.value && !framePresets.value.some((p) => p.path === currentCustomFrame.value))

/* ── 相框预设：上传即存（按 path 去重），不限数量 ── */
const framePresets = ref([])
async function loadFramePresets() {
  try {
    framePresets.value = await getWallFramePresets()
  } catch (e) {
    console.error('[album] 相框预设读取失败', e)
  }
}
async function addFramePreset(path) {
  if (!path) return
  const list = framePresets.value.filter((p) => p.path !== path)
  list.unshift({ id: 'frp' + Date.now(), path })
  framePresets.value = list
  try {
    await saveWallFramePresets(list)
  } catch (e) {
    console.error('[album] 相框预设保存失败', e)
  }
}
async function removeFramePreset(p) {
  const next = framePresets.value.filter((x) => x.id !== p.id)
  framePresets.value = next
  try {
    await saveWallFramePresets(next)
    toast.pushToast({ type: 'info', title: '已删除这个相框' })
  } catch (e) {
    toast.pushToast({ type: 'error', title: '删除失败', text: e.message })
  }
}
function applyFramePreset(p) {
  setFrame('custom:' + p.path)
}
async function onCustomFramePick(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    // PNG 可能带透明底，跳过填白压缩，保留 alpha
    const small = await prepareUpload(file)
    const res = await uploadFile(small)
    if (selEl.value) selEl.value.frame = 'custom:' + res.path
    scheduleSave()
    // 上传后自动存入相框预设，下次可直接从宫格选用
    await addFramePreset(res.path)
    toast.pushToast({ type: 'info', title: '相框已应用', text: '已存入相框预设' })
  } catch (err) {
    toast.pushToast({ type: 'error', title: '相框上传失败', text: err.message })
  }
}

/* ── 页数：弹窗里增加 / 减少（至少保留一页，最多 10 页） ── */
const PAGE_MAX = 10
async function changePage(delta) {
  pageSheet.value = false
  const cur = pageCount.value
  const next = Math.max(1, Math.min(PAGE_MAX, cur + delta))
  if (next === cur) {
    if (delta < 0) toast.pushToast({ type: 'info', title: '至少保留一页', text: '照片墙至少要有一页哦' })
    return
  }
  if (delta < 0) {
    // 减页：被删页面上的装饰一并清除（先确认，避免误删）
    const limit = contentWidth.value
    const dropped = elements.value.filter((e) => (e.x || 0) >= limit)
    if (dropped.length) {
      const ok = await confirmDialog({
        title: '减少页数',
        text: `第 ${next + 1} 页及以后的 ${dropped.length} 个装饰会一并删除，确定减少吗？`,
        okText: '减少',
        danger: true
      })
      if (!ok) return
      elements.value = elements.value.filter((e) => (e.x || 0) < limit)
    }
  }
  wall.value.page_count = next
  await nextTick()
  if (scrollEl.value) {
    if (delta > 0) {
      // 加页后滚到新扩展的尾部，方便继续装饰
      scrollEl.value.scrollLeft = scrollEl.value.scrollWidth
    } else {
      // 减页后把滚动位置收回到新范围内
      const max = scrollEl.value.scrollWidth - scrollEl.value.clientWidth
      scrollEl.value.scrollLeft = Math.max(0, Math.min(scrollEl.value.scrollLeft, max))
    }
  }
  syncCurPage()
  await flushSave()
}

/* ── 实时保存（防抖） ──
   落库只是崩溃安全网；「装饰中离开要不要确认」由装饰态本身决定，
   不依赖脏标记——只选中/查看而未拖动同样算未保存。 */
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
    // 封面：默认取最靠左的一张图片元素，让列表页显示真实封面；
    // 用户在相册列表编辑弹窗里手动换过封面（cover_manual=1）则钉住，不被自动覆盖
    const manual = !!(wall.value.cover_manual && wall.value.cover)
    const firstImg = [...elements.value].sort((a, b) => a.x - b.x).find((e) => e.type === 'image' && e.content)
    await updatePhotoWall(props.wallId, {
      page_count: wall.value.page_count,
      width: contentWidth.value,
      bg: wall.value.bg || 'cream',
      cover: manual ? wall.value.cover : (firstImg ? firstImg.content : (wall.value.cover || '')),
      cover_manual: manual ? 1 : 0
    })
  } catch (e) {
    console.error('[album] 保存失败', e)
  }
}

/* 显式保存：完成 / 保存并退出走这里 */
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
/* 缩放后可纵向滚动（放大时长卷比屏幕高）；未缩放时无纵向溢出，行为与原来一致 */
.pwc-scroll.zoomed { overflow-y: auto; touch-action: auto; }
.pwc-strip {
  position: relative;
  height: 100%;
  transition: background 0.3s ease;
}
/* 缩放 HUD：装饰态显示，－ / 百分比（点击复位） / ＋ */
.pwc-zoomhud {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.9);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  z-index: 900;
}
.zh-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-size: 15px;
  line-height: 1;
  color: var(--text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.zh-btn:active { background: var(--bg-soft); }
.zh-val {
  min-width: 46px;
  padding: 5px 2px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-serif);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
/* 当前页指示（装饰态，左上角，与右上角缩放 HUD 对称） */
.pwc-pageind {
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.9);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  font-family: var(--font-serif);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  z-index: 200;
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
.sheet-item.off { color: var(--text-soft); opacity: 0.55; cursor: not-allowed; }
.sheet-empty { text-align: center; color: var(--text-soft); font-size: 13px; padding: 12px; }

.card-grid, .sticker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 10px;
}
.card-thumb, .sticker-thumb {
  position: relative;
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
/* 自定义分类的删除 ×（pill 内右侧小号，误触率低） */
.cat-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 3px;
  margin-right: -4px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.14);
  font-size: 11px;
  line-height: 1;
}
.st-cat.on .cat-del { background: rgba(255, 255, 255, 0.28); }
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

/* 文字弹窗：字体宫格 + 便签宫格（复用贴纸弹窗的布局语言） */
.font-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  align-content: start;
}
.font-cell {
  aspect-ratio: 1;
  border: 1.5px solid var(--border);
  background: var(--bg-screen);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1.25;
  text-align: center;
  color: var(--text);
  padding: 4px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.font-cell:active { border-color: var(--accent); color: var(--accent); }
.note-cell {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  background-size: cover;
  background-position: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.note-cell:active { opacity: 0.85; }
/* 设置模式的「无便签」格：去掉便签底变回普通文字 */
.note-none {
  border: 1.5px dashed var(--border);
  background: var(--bg-screen);
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-soft);
}
/* 自定义便签纸缩略图左上角序号，便于与内置色块区分 */
.note-num {
  position: absolute;
  top: 4px;
  left: 4px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 10px;
  line-height: 15px;
  text-align: center;
  z-index: 2;
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

/* 自定义底纸上传格：虚线占位；已上传时背景换成照片缩略图 */
.paper-cell-upload {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-style: dashed;
  background: var(--bg-soft);
}
.paper-cell-upload.on { border-style: solid; }

/* 我的底纸：上传即存的预设（最多 4 张） */
.paper-mine { margin-top: 14px; }
.paper-mine-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.paper-mine-title { font-size: 13px; font-weight: 700; }
.paper-mine-count {
  font-size: 11px;
  color: var(--text-soft);
  font-family: var(--font-serif);
}
.mine-del {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  z-index: 2;
  -webkit-tap-highlight-color: transparent;
}
.mine-del:active { background: rgba(0, 0, 0, 0.78); }

/* 相框宫格弹窗（布局同贴纸：标题 + 右上 × + 宫格） */
.sheet-frame {
  max-height: 72vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.frame-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px 8px;
  margin-bottom: 10px;
}
/* 无外框直接布局：缩略图 + 下方文字；选中态 = 文字着色 + 右上角 ✓ */
.frame-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 4px 2px;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.frame-cell:active .frame-thumb { opacity: 0.82; }
.frame-thumb {
  width: 46px;
  height: 46px;
  border-radius: 8px;
  background: var(--bg-soft);
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.frame-name {
  font-size: 11px;
  color: var(--text-soft);
  white-space: nowrap;
}
.frame-cell.on .frame-name { color: var(--accent); font-weight: 700; }
.frame-check {
  position: absolute;
  top: 0;
  right: 0;
  color: var(--accent);
}
/* 预设格右上角有删除 ×，选中勾放左上角避免重叠 */
.frame-check-left { right: auto; left: 0; }
/* 内置相框的 mini 预览：白边拍立得（竖：下边宽；横：右边宽）与斜贴胶带 */
.ft-polaroid, .ft-polaroid-h, .ft-tape { position: relative; background: #fff; border: 1px solid rgba(0, 0, 0, 0.08); }
.ft-polaroid::before, .ft-polaroid-h::before, .ft-tape::before { content: ''; position: absolute; }
.ft-polaroid::before {
  left: 5px;
  right: 5px;
  top: 5px;
  bottom: 13px;
  background: linear-gradient(135deg, #c9b8a3, #9a8a72);
}
.ft-polaroid-h::before {
  left: 5px;
  right: 13px;
  top: 5px;
  bottom: 5px;
  background: linear-gradient(135deg, #c9b8a3, #9a8a72);
}
.ft-tape { background: linear-gradient(135deg, #b9ac97, #96886f); }
.ft-tape::before {
  left: 2px;
  right: 2px;
  top: 50%;
  height: 11px;
  transform: translateY(-50%) rotate(-9deg);
  background: rgba(255, 255, 255, 0.82);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
</style>
