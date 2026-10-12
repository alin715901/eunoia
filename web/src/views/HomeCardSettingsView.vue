<template>
  <div class="hcs">
    <AppHeader title="人物卡设置" back />
    <div class="hcs-body">
      <!-- 切换主体：一行「切换主体 + 当前主体名 + >」，点 > 才展开下方可选列表（只列已创建的单人） -->
      <div class="panel sec">
        <button class="sw-current" :class="{ open: showSwitcher }" @click="showSwitcher = !showSwitcher">
          <span class="sw-cur-label">切换主体</span>
          <span class="sw-cur-name">{{ curName }}</span>
          <AppIcon name="chevron-right" :size="14" color="var(--text-soft)" />
        </button>
        <div v-if="showSwitcher" class="sw-menu">
          <button
            v-for="c in persons"
            :key="c.id"
            class="sw-menu-item"
            :class="{ on: Number(c.id) === Number(curId) }"
            @click="switchTo(c.id)"
          >
            <span class="sw-menu-name">{{ c.name }}</span>
            <AppIcon v-if="Number(c.id) === Number(curId)" name="check" :size="16" color="var(--accent)" />
          </button>
          <p v-if="!persons.length" class="sw-empty">还没有已创建的主体</p>
        </div>
      </div>

      <!-- 头像 -->
      <div class="panel sec">
        <div class="sec-title">头像</div>
        <div class="ava-row">
          <div class="ava-item">
            <span class="ai-label">我的头像</span>
            <button class="ai-pick" :class="{ busy: busyKey === 'myAvatar' }" :disabled="uploading" @click="pick('myAvatar')">
              <AppAvatar v-if="form.myAvatar" :avatar="form.myAvatar" :name="form.myName || '我'" :size="56" />
              <span v-else class="ai-add"><AppIcon name="plus" :size="22" color="var(--accent)" /></span>
              <span v-if="busyKey === 'myAvatar'" class="ai-busy">
                <span class="ai-spinner"></span>
                <span class="ai-busy-txt">上传中</span>
              </span>
            </button>
            <button v-if="form.myAvatar" class="ai-clear" :disabled="uploading" @click="form.myAvatar = ''">移除</button>
          </div>
          <div class="ava-item" v-if="!desktop.isGroup">
            <span class="ai-label">对方头像</span>
            <button class="ai-pick" :class="{ busy: busyKey === 'partnerAvatar' }" :disabled="uploading" @click="pick('partnerAvatar')">
              <AppAvatar v-if="form.partnerAvatar" :avatar="form.partnerAvatar" :name="form.partnerName || '对方'" :size="56" />
              <span v-else class="ai-add"><AppIcon name="plus" :size="22" color="var(--accent)" /></span>
              <span v-if="busyKey === 'partnerAvatar'" class="ai-busy">
                <span class="ai-spinner"></span>
                <span class="ai-busy-txt">上传中</span>
              </span>
            </button>
            <button v-if="form.partnerAvatar" class="ai-clear" :disabled="uploading" @click="form.partnerAvatar = ''">移除</button>
          </div>
        </div>
      </div>

      <!-- 应用到聊天：开启后人物卡设置的头像同步到与该联系人的聊天界面 -->
      <div class="panel sec">
        <label class="sw-row">
          <span class="sw-row-main">
            <span class="sw-row-title">应用到聊天</span>
            <span class="sw-row-sub">开启后，人物卡设置的头像会同步到与该联系人的聊天界面</span>
          </span>
          <button
            type="button"
            class="toggle"
            :class="{ on: form.syncChatAvatar }"
            role="switch"
            :aria-checked="form.syncChatAvatar"
            @click="form.syncChatAvatar = !form.syncChatAvatar"
          >
            <span class="toggle-knob"></span>
          </button>
        </label>
      </div>

      <!-- 头像左右位置（群聊无"对方"，隐藏） -->
      <div class="panel sec" v-if="!desktop.isGroup">
        <div class="sec-title">头像左右位置</div>
        <div class="seg">
          <button :class="{ on: form.avaLeft === 'me' }" @click="form.avaLeft = 'me'">我 在左</button>
          <button :class="{ on: form.avaLeft === 'partner' }" @click="form.avaLeft = 'partner'">对方 在左</button>
        </div>
      </div>

      <!-- 名称 + 签名 -->
      <div class="panel sec">
        <label class="fld">
          <span class="fld-label">我的名称</span>
          <input class="field" v-model="form.myName" placeholder="例如：我" />
        </label>
        <label class="fld">
          <span class="fld-label">对方名称</span>
          <input class="field" v-model="form.partnerName" placeholder="例如：TA" />
        </label>
        <label class="fld">
          <span class="fld-label">
            签名
            <span class="fld-count" :class="{ over: signTooLong }">{{ signLen }}/20</span>
          </span>
          <textarea
            class="field"
            :class="{ 'field-err': signTooLong }"
            v-model="form.sign"
            rows="2"
            maxlength="20"
            placeholder="写一句签名…"
          ></textarea>
          <span v-if="signTooLong" class="fld-err">
            <AppIcon name="warn" :size="13" color="#c0576b" /> 签名不能超过 20 个字
          </span>
        </label>
      </div>

      <!-- 卡片背景图 -->
      <div class="panel sec">
        <div class="sec-title">卡片背景图</div>
        <button
          class="bg-pick"
          :class="{ has: !!form.cardBg }"
          :disabled="uploading"
          :style="form.cardBg ? { backgroundImage: `url(${form.cardBg})` } : {}"
          @click="pick('cardBg')"
        >
          <span v-if="uploading" class="bg-ph"><AppIcon name="image" :size="20" color="var(--text-soft)" /> 上传中…</span>
          <span v-else-if="!form.cardBg" class="bg-ph"><AppIcon name="image" :size="20" color="var(--text-soft)" /> 选择背景图</span>
          <span v-else class="bg-clear" @click.stop="form.cardBg = ''">移除背景</span>
        </button>

        <!-- 背景图透明度：滑块调节，越小背景越淡 -->
        <div class="bg-op" v-if="form.cardBg">
          <div class="bg-op-head">
            <span class="bg-op-label">背景透明度</span>
            <span class="bg-op-val">{{ form.cardBgOpacity }}%</span>
          </div>
          <input
            class="bg-op-range"
            type="range"
            min="0"
            max="100"
            step="5"
            v-model.number="form.cardBgOpacity"
          />
          <div class="bg-op-tips">
            <span>更淡</span>
            <span>更清晰</span>
          </div>
        </div>
      </div>

      <p v-if="uploadErr || saveErr" class="err-tip">
        <AppIcon name="warn" :size="14" color="#c0576b" />
        <span>{{ uploadErr || saveErr }}</span>
      </p>

      <button class="btn btn-primary save-btn" :disabled="uploading" @click="save">{{ uploading ? '上传中…' : '保存' }}</button>
    </div>

    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />

    <!-- 裁剪弹窗：头像（方形）与背景（宽幅）用不同输出比例 -->
    <ImageCropper
      v-if="cropSrc"
      :src="cropSrc"
      :title="cropTitle"
      :ratio="cropRatio"
      @cancel="cropSrc = ''"
      @done="onCropped"
      @error="onCropError"
    />

  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { useDesktopStore } from '@/stores/desktop'
import { useContactsStore } from '@/stores/contacts'
import { useHomeStore } from '@/stores/home'
import { uploadFile } from '@/api/settings'
import { compressImage } from '@/utils/image'
import { notify } from '@/utils/dialog'

const desktop = useDesktopStore()
const contactsStore = useContactsStore()
const homeStore = useHomeStore()
const fileInput = ref(null)
const pickKey = ref('')
const uploading = ref(false)
/* 正在上传的字段，用于在对应头像位置显示"上传中" */
const busyKey = ref('')
const uploadErr = ref('')
const saveErr = ref('')

/* 人物卡表单：当前主体专属的头像/昵称/签名/背景 */
const form = reactive({
  myName: '',
  myAvatar: '',
  partnerName: '',
  partnerAvatar: '',
  avaLeft: 'me',
  sign: '',
  cardBg: '',
  cardBgOpacity: 100,
  syncChatAvatar: false
})

async function loadForm() {
  await desktop.ensureValid()
  /* 人物卡只与单人有关：当前是群聊时先落到最近的一位单人 */
  const cur = contactsStore.getById(desktop.currentContactId)
  if (!cur || cur.kind === 'group') {
    const next = persons.value.find((c) => Number(c.id) !== Number(cur?.id)) || persons.value[0]
    if (next) {
      homeStore.select(next.id)
      desktop.setCurrent(next.id)
    }
  }
  const d = await desktop.load()
  Object.assign(form, {
    myName: d.myName || '',
    myAvatar: d.myAvatar || '',
    partnerName: d.partnerName || '',
    partnerAvatar: d.partnerAvatar || '',
    avaLeft: d.avaLeft || 'me',
    sign: d.sign || '',
    cardBg: d.cardBg || '',
    cardBgOpacity: Number(d.cardBgOpacity) || 100,
    syncChatAvatar: !!d.syncChatAvatar
  })
}

onMounted(async () => {
  try { await contactsStore.load() } catch (e) { /* ignore */ }
  await loadForm()
})

/* 可切换的联系人：只列单人（群聊与人物卡无关）。默认收起，点击「切换联系人」才展开 */
const showSwitcher = ref(false)
const persons = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))
const curId = computed(() => desktop.currentContactId || homeStore.selectedId)
const curContact = computed(() => contactsStore.getById(curId.value))
const curName = computed(() => curContact.value?.name || '未选择')

/* 切换联系人：加载该联系人专属的头像/昵称/签名/背景 */
async function switchTo(id) {
  const cid = Number(id)
  if (!cid) return
  if (cid === Number(curId.value)) {
    showSwitcher.value = false
    return
  }
  showSwitcher.value = false
  homeStore.select(cid)
  desktop.setCurrent(cid)
  await desktop.load(cid)
  loadForm()
}

/* 签名限 20 字，超出则标红并阻止保存 */
const SIGN_MAX = 20
const signLen = computed(() => (form.sign || '').trim().length)
const signTooLong = computed(() => signLen.value > SIGN_MAX)

function pick(key) {
  uploadErr.value = ''
  pickKey.value = key
  fileInput.value?.click()
}

/* 头像走方形裁剪，卡片背景走宽幅裁剪 */
const cropSrc = ref('')
const cropTitle = computed(() => (pickKey.value === 'cardBg' ? '裁剪背景图' : '裁剪头像'))
const cropRatio = computed(() => (pickKey.value === 'cardBg' ? 16 / 10 : 1))

/* 选好文件后先进入裁剪，不直接上传 */
function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!file.type?.startsWith('image/')) {
    uploadErr.value = '请选择图片文件'
    return
  }
  cropSrc.value = URL.createObjectURL(file)
}

/* 裁剪组件内部解码失败（常见于 HEIC 等格式）*/
function onCropError(msg) {
  uploadErr.value = msg || '图片无法读取，请换一张 JPG / PNG 图片'
}

/* 裁剪确认后上传 */
async function onCropped(blob) {
  cropSrc.value = ''
  if (!blob) {
    uploadErr.value = '裁剪失败，请重试'
    return
  }
  // 记录正在上传的字段，头像位要显示「上传中」遮罩
  const key = pickKey.value
  busyKey.value = key
  uploading.value = true
  uploadErr.value = ''
  try {
    const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' })
    // 再次压缩，避免隧道上传超时
    const small = await compressImage(file)
    const res = await uploadFile(small)
    const path = res?.path
    if (path) {
      form[key] = path
    } else {
      uploadErr.value = '上传返回为空，请重试'
    }
  } catch (err) {
    uploadErr.value = err?.message || '上传失败，请重试'
  } finally {
    uploading.value = false
    busyKey.value = ''
  }
}
async function save() {
  // 签名超 20 字不允许保存
  if (signTooLong.value) {
    saveErr.value = '签名不能超过 20 个字，请修改后再保存'
    return
  }
  saveErr.value = ''
  const payload = {
    myName: form.myName,
    myAvatar: form.myAvatar,
    avaLeft: form.avaLeft,
    sign: form.sign,
    cardBg: form.cardBg,
    cardBgOpacity: Number(form.cardBgOpacity) || 100,
    syncChatAvatar: form.syncChatAvatar
  }
  // 群聊没有"对方"概念，不写入 partner 字段（避免覆盖群名显示）
  if (!desktop.isGroup) {
    payload.partnerName = form.partnerName
    payload.partnerAvatar = form.partnerAvatar
  }
  desktop.d = { ...desktop.d, ...payload }
  try {
    await desktop.save()
    notify('已保存')
  } catch (e) {
    saveErr.value = '保存失败，请重试'
  }
}
</script>

<style scoped>
.hcs {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-body);
}
.hcs-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 14px 14px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sec { padding: 18px 14px; }
/* 分组标题：与下方内容留出呼吸空间，不要贴太近 */
.sec-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 22px;
  letter-spacing: 0.5px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

/* ═══ 头像 ═══ */
.ava-row {
  display: flex;
  gap: 18px;
}
.ava-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.ai-label { font-size: 12px; color: var(--text-soft); }
.ai-pick {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1.5px dashed var(--border);
  background: var(--bg-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}
/* 上传中：就在头像位置盖一层遮罩 */
.ai-pick.busy {
  border-style: solid;
  border-color: var(--accent);
}
.ai-busy {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.ai-spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, 0.12);
  border-top-color: var(--accent);
  animation: ai-spin 0.7s linear infinite;
}
@keyframes ai-spin { to { transform: rotate(360deg); } }
.ai-busy-txt {
  font-size: 10px;
  line-height: 1;
  color: var(--text-soft);
  letter-spacing: 0.02em;
}
.ai-add {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--bg-screen);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-clear {
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 12px;
  padding: 0;
}

/* ═══ 头像左右位置 ═══ */
.seg {
  display: flex;
  gap: 10px;
}
.seg button {
  flex: 1;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text);
}
.seg button.on {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}

/* ═══ 名称 / 签名 ═══ */
.fld {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}
.fld:last-child { margin-bottom: 0; }
/* 签名固定两行高度，不允许拖动拉伸 */
textarea.field {
  resize: none;
  min-height: 46px;
  height: 46px;
  line-height: 1.5;
  overflow-y: auto;
}
.fld-label {
  font-size: 12px;
  color: var(--text-soft);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.fld-count {
  font-size: 11px;
  color: var(--text-soft);
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.fld-count.over {
  color: #c0576b;
  opacity: 1;
  font-weight: 600;
}
.field-err {
  border-color: #c0576b !important;
  background: #fdf5f6 !important;
}
.fld-err {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #c0576b;
}

/* ═══ 卡片背景图 ═══ */
.bg-pick {
  width: 100%;
  height: 96px;
  border-radius: var(--radius-sm);
  border: 1.5px dashed var(--border);
  background-color: var(--bg-soft);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.bg-pick.has { border-style: solid; }
.bg-ph {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 13px;
}
.bg-clear {
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
}

/* ═══ 背景图透明度 ═══ */
.bg-op { margin-top: 14px; }
.bg-op-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 8px;
}
.bg-op-label { font-size: 12px; color: var(--text-soft); }
.bg-op-val {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.bg-op-range {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 999px;
  background: var(--border);
  outline: none;
}
.bg-op-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
}
.bg-op-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.22);
}
.bg-op-tips {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-soft);
}

/* ═══ 切换主体：与其它设置行同一套样式（无独立背景框，只用分割线） ═══ */
.sw-current {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 13px;
  text-align: left;
}
.sw-current:active { background: var(--bg-soft); }
.sw-cur-label { flex: 0 0 auto; font-size: 13px; }
.sw-cur-name {
  flex: 1 1 auto;
  text-align: right;
  color: var(--text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sw-current :deep(svg:last-child) { transition: transform 0.2s ease; flex: 0 0 auto; }
.sw-current.open :deep(svg:last-child) { transform: rotate(90deg); }
/* 展开后的选择列表：接着上面那行往下排，同样只用分割线 */
.sw-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-top: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  font-size: 13px;
  text-align: left;
}
.sw-menu-item:active { background: var(--bg-soft); }
.sw-menu-item.on { color: var(--accent); font-weight: 600; }
.sw-menu-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sw-empty {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--text-soft);
  border-top: 1px solid var(--border);
}

/* ═══ 应用到聊天开关 ═══ */
.sw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.sw-row-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sw-row-title { font-size: 14px; font-weight: 600; color: var(--text); }
.sw-row-sub { font-size: 11px; color: var(--text-soft); line-height: 1.4; }
.toggle {
  flex: 0 0 auto;
  width: 46px;
  height: 27px;
  border-radius: 999px;
  border: none;
  background: var(--border);
  position: relative;
  padding: 0;
  transition: background 0.2s ease;
}
.toggle.on { background: var(--accent); }
.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: var(--bg-screen);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}
.toggle.on .toggle-knob { transform: translateX(19px); }

.save-btn { margin-top: 4px; }
.err-tip {
  position: sticky;
  top: 8px;
  z-index: 5;
  margin: 0 0 10px;
  font-size: 12px;
  color: #c0576b;
  background: #fdeef0;
  border: 1px solid #f3d3d8;
  border-radius: var(--radius-sm);
  padding: 9px 11px;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 8px rgba(192, 87, 107, 0.12);
}
button:disabled { opacity: 0.6; }
</style>
