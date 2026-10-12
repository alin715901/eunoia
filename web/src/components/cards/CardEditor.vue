<template>
  <Modal :show="show" :title="title" @close="$emit('close')">
    <!-- ═══ 添加模式：文本类 → 批量粘贴；图片/表情包 → 批量选文件；语音 → 两步上传 ═══ -->
    <template v-if="!initial && !isMedia && !isVoice">
      <p class="ce-sub">每行一条，自动去重</p>
      <textarea
        v-model="content"
        class="ce-batch"
        placeholder="在此粘贴内容，每行一条…"
      ></textarea>
      <div class="ce-count">{{ lineCount }} 条</div>
      <!-- 添加到分组：应用内下拉弹层（彩色圆点 + 名称） -->
      <div class="ce-group" :class="{ open: groupOpen }">
        <button class="ce-group-btn" type="button" @click="groupOpen = !groupOpen">
          <span class="ce-group-ico"><AppIcon name="folder" :size="16" /></span>
          <span class="ce-group-label" :class="{ ph: !picked }">
            <template v-if="picked">
              <i class="ce-dot" :style="{ background: dotColor(picked) }"></i>{{ picked.name }}
            </template>
            <template v-else>添加到分组</template>
          </span>
          <span class="ce-caret">▼</span>
        </button>
        <div v-if="groupOpen" class="ce-group-pop">
          <button
            v-for="g in groups"
            :key="g.id"
            class="ce-group-opt"
            :class="{ on: picked && String(picked.id) === String(g.id) }"
            type="button"
            @click="pickGroup(g)"
          >
            <i class="ce-dot" :style="{ background: dotColor(g) }"></i>
            <span class="ce-group-opt-name">{{ g.name }}</span>
            <AppIcon v-if="picked && String(picked.id) === String(g.id)" name="check" :size="15" />
          </button>
          <div v-if="!groups.length" class="ce-group-empty">不选则归入「未分组」</div>
        </div>
      </div>
    </template>

    <!-- ═══ 添加模式（图片/表情包分类）：批量选择图片或文件 ═══ -->
    <template v-else-if="!initial && isMedia">
      <p class="ce-sub">可多选一次添加；若系统只让选一张，重复添加会自动累积</p>
      <div v-if="files.length" class="ce-files">
        <div v-for="(f, i) in files" :key="i" class="ce-file">
          <img v-if="f.preview" :src="f.preview" class="ce-file-thumb" alt="" />
          <span v-else class="ce-file-badge">FILE</span>
          <span class="ce-file-name">{{ f.file.name }}</span>
          <button class="ce-file-del" @click="removeFile(i)">✕</button>
        </div>
      </div>
      <!-- 主入口：accept="image/*" multiple（浏览器/支持多选的容器可直接多选）；
           容器不支持多选时系统只返回单张，按钮变为「继续添加」，多次选取自动累积去重 -->
      <button class="ce-img-btn ce-add-files" :disabled="uploading" @click="mediaEl?.click()">
        {{ uploading ? '上传中…' : (files.length ? `＋ 继续添加（已选 ${files.length} 个）` : '＋ 选择图片 / 文件') }}
      </button>
      <p class="ce-hint">
        一次只能选一张？没关系：反复点「继续添加」逐张选取，所选自动累积在下方，最后点「添加」一次全部上传
      </p>
      <input ref="mediaEl" type="file" accept="image/*" multiple hidden @change="onPickFiles" />
      <div class="ce-count">{{ files.length }} 个</div>
      <!-- 添加到分组：应用内下拉弹层（彩色圆点 + 名称） -->
      <div class="ce-group" :class="{ open: groupOpen }">
        <button class="ce-group-btn" type="button" @click="groupOpen = !groupOpen">
          <span class="ce-group-ico"><AppIcon name="folder" :size="16" /></span>
          <span class="ce-group-label" :class="{ ph: !picked }">
            <template v-if="picked">
              <i class="ce-dot" :style="{ background: dotColor(picked) }"></i>{{ picked.name }}
            </template>
            <template v-else>添加到分组（可选）</template>
          </span>
          <span class="ce-caret">▼</span>
        </button>
        <div v-if="groupOpen" class="ce-group-pop">
          <button
            v-for="g in groups"
            :key="g.id"
            class="ce-group-opt"
            :class="{ on: picked && String(picked.id) === String(g.id) }"
            type="button"
            @click="pickGroup(g)"
          >
            <i class="ce-dot" :style="{ background: dotColor(g) }"></i>
            <span class="ce-group-opt-name">{{ g.name }}</span>
            <AppIcon v-if="picked && String(picked.id) === String(g.id)" name="check" :size="15" />
          </button>
          <div v-if="!groups.length" class="ce-group-empty">不选则归入「未分组」</div>
        </div>
      </div>
    </template>

    <!-- ═══ 添加模式（语音字卡）：第一步，批量选择音频文件 ═══ -->
    <template v-else-if="!initial && isVoice && voiceStep === 'pick'">
      <p class="ce-sub">可多选音频文件（mp3 等），选完点「添加」进入文字编辑</p>
      <div v-if="files.length" class="ce-files">
        <div v-for="(f, i) in files" :key="i" class="ce-file">
          <span class="ce-file-badge"><AppIcon name="voice" :size="18" /></span>
          <span class="ce-file-name">{{ f.file.name }}</span>
          <button class="ce-file-del" @click="removeFile(i)">✕</button>
        </div>
      </div>
      <button class="ce-img-btn ce-add-files" :disabled="uploading" @click="mediaEl?.click()">
        {{ files.length ? `＋ 继续添加（已选 ${files.length} 个）` : '＋ 选择音频文件' }}
      </button>
      <input ref="mediaEl" type="file" accept="audio/*" multiple hidden @change="onPickFiles" />
      <div class="ce-count">{{ files.length }} 个</div>
      <!-- 添加到分组：应用内下拉弹层（彩色圆点 + 名称） -->
      <div class="ce-group" :class="{ open: groupOpen }">
        <button class="ce-group-btn" type="button" @click="groupOpen = !groupOpen">
          <span class="ce-group-ico"><AppIcon name="folder" :size="16" /></span>
          <span class="ce-group-label" :class="{ ph: !picked }">
            <template v-if="picked">
              <i class="ce-dot" :style="{ background: dotColor(picked) }"></i>{{ picked.name }}
            </template>
            <template v-else>添加到分组（可选）</template>
          </span>
          <span class="ce-caret">▼</span>
        </button>
        <div v-if="groupOpen" class="ce-group-pop">
          <button
            v-for="g in groups"
            :key="g.id"
            class="ce-group-opt"
            :class="{ on: picked && String(picked.id) === String(g.id) }"
            type="button"
            @click="pickGroup(g)"
          >
            <i class="ce-dot" :style="{ background: dotColor(g) }"></i>
            <span class="ce-group-opt-name">{{ g.name }}</span>
            <AppIcon v-if="picked && String(picked.id) === String(g.id)" name="check" :size="15" />
          </button>
          <div v-if="!groups.length" class="ce-group-empty">不选则归入「未分组」</div>
        </div>
      </div>
    </template>

    <!-- ═══ 添加模式（语音字卡）：第二步，逐个编辑语音对应的文字 ═══ -->
    <template v-else-if="!initial && isVoice && voiceStep === 'edit'">
      <div class="cev-label">
        <span>语音文件</span>
        <span class="cev-cnt">{{ voiceIdx + 1 }}/{{ files.length }}</span>
      </div>
      <div class="cev-file">
        <span class="cev-ico"><AppIcon name="voice" :size="16" /></span>
        <span class="cev-name">{{ files[voiceIdx]?.file.name }}</span>
      </div>
      <div class="cev-label"><span>语音文字内容</span></div>
      <textarea
        v-model="voiceTexts[voiceIdx]"
        class="cev-input"
        rows="4"
        placeholder="输入这段语音对应的文字内容…（留空则导入为无文字）"
      ></textarea>
    </template>

    <!-- ═══ 修改模式：单卡编辑（仅文字；原图片保留不变） ═══ -->
    <template v-else>
      <textarea
        v-model="content"
        class="field ce-input"
        rows="4"
        placeholder="输入字卡内容…"
      ></textarea>
    </template>

    <template #footer>
      <template v-if="!initial && isVoice && voiceStep === 'edit'">
        <button class="btn btn-ghost" :disabled="voiceIdx === 0" @click="voiceIdx--">上一个</button>
        <button v-if="voiceIdx < files.length - 1" class="btn btn-primary" @click="voiceIdx++">下一个</button>
        <button v-else class="btn btn-primary" @click="save">确定</button>
      </template>
      <template v-else>
        <button class="btn btn-ghost" @click="$emit('close')">取消</button>
        <button
          class="btn btn-primary"
          :disabled="!canSave || uploading"
          @click="!initial && isVoice && voiceStep === 'pick' ? (voiceStep = 'edit') : save()"
        >
          {{ initial ? '保存' : '添加' }}
        </button>
      </template>
    </template>
  </Modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import Modal from '@/components/common/Modal.vue'
import AppIcon from '@/components/common/AppIcon.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  /* 传入则为修改模式（预填内容与图片）；不传为批量添加模式 */
  initial: { type: Object, default: null },
  /* 可选分组列表（添加模式下展示「添加到分组」下拉） */
  groups: { type: Array, default: () => [] },
  /* 当前分类：图片 / 表情包板块走「批量添加图片或文件」 */
  category: { type: String, default: 'main' }
})
const emit = defineEmits(['close', 'save'])

const content = ref('')
const img = ref('')
const uploading = ref(false)
const picked = ref(null)
const groupOpen = ref(false)

/* 图片 / 表情包分类：添加模式改为批量选文件 */
const isMedia = computed(() => ['image', 'sticker'].includes(props.category))
const files = ref([])
const mediaEl = ref(null)

/* 语音字卡：两步流程 pick（选音频）→ edit（逐个编辑对应文字） */
const isVoice = computed(() => props.category === 'voice')
const voiceStep = ref('pick')
const voiceTexts = ref([])
const voiceIdx = ref(0)

const title = computed(() => {
  if (props.initial) return '修改字卡'
  if (isVoice.value && voiceStep.value === 'edit') return '编辑语音文字'
  return '添加字卡'
})

/* 添加模式：按行拆分、去空白、去重 */
const lines = computed(() => {
  const seen = new Set()
  const out = []
  for (const raw of String(content.value || '').split('\n')) {
    const t = raw.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
})
const lineCount = computed(() => lines.value.length)

const canSave = computed(() => {
  if (props.initial) return !!(content.value.trim() || img.value)
  if (isMedia.value || isVoice.value) return files.value.length > 0
  return lineCount.value > 0
})

watch(
  () => props.show,
  (v) => {
    if (v) {
      content.value = props.initial?.content || ''
      img.value = props.initial?.asset_path || ''
      picked.value = null
      groupOpen.value = false
      uploading.value = false
      files.value = []
      voiceStep.value = 'pick'
      voiceTexts.value = []
      voiceIdx.value = 0
    }
  }
)

function pickGroup(g) {
  picked.value = g
  groupOpen.value = false
}

/* 批量选文件：记录 File 与预览（图片用本地 objectURL，其他文件显示 FILE 角标） */
function onPickFiles(e) {
  const pickedFiles = [...(e.target.files || [])]
  e.target.value = ''
  if (!pickedFiles.length) return
  const exist = new Set(files.value.map((f) => f.file.name + '|' + f.file.size))
  for (const f of pickedFiles) {
    const key = f.name + '|' + f.size
    if (exist.has(key)) continue
    exist.add(key)
    files.value.push({
      file: f,
      preview: f.type?.startsWith('image/') ? URL.createObjectURL(f) : ''
    })
  }
}
function removeFile(i) {
  const [f] = files.value.splice(i, 1)
  voiceTexts.value.splice(i, 1)
  if (voiceIdx.value >= files.value.length) voiceIdx.value = Math.max(0, files.value.length - 1)
  if (f?.preview) URL.revokeObjectURL(f.preview)
}

/* 分组圆点颜色：优先自定义色，否则按 id 兜底 */
const DOT_COLORS = ['#e5989b', '#f4a261', '#e9c46a', '#8ab17d', '#5fa8a0', '#9b8fc4', '#f28482', '#84a59d', '#cdb4db', '#b8c0ff']
function dotColor(g) {
  if (g?.color) return g.color
  const n = Number(g?.id)
  return DOT_COLORS[Number.isFinite(n) ? n % DOT_COLORS.length : 0]
}

function save() {
  if (!canSave.value || uploading.value) return
  if (props.initial) {
    emit('save', { content: content.value.trim(), asset_path: img.value })
  } else if (isMedia.value) {
    emit('save', { files: files.value.map((f) => f.file), groupId: picked.value?.id ?? null })
  } else if (isVoice.value) {
    emit('save', {
      files: files.value.map((f) => f.file),
      texts: files.value.map((_, i) => String(voiceTexts.value[i] || '').trim()),
      groupId: picked.value?.id ?? null
    })
  } else {
    emit('save', { lines: lines.value, groupId: picked.value?.id ?? null, asset_path: '' })
  }
  content.value = ''
  img.value = ''
  picked.value = null
  files.value = []
  voiceStep.value = 'pick'
  voiceTexts.value = []
  voiceIdx.value = 0
}
</script>

<style scoped>
.ce-sub { margin: 0 0 10px; font-size: 13px; color: var(--text-soft); }
/* 批量文本域：大输入区，浅灰底圆角 */
.ce-batch {
  width: 100%;
  min-height: 210px;
  box-sizing: border-box;
  resize: none;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text);
  font-family: inherit;
}
.ce-batch:focus { outline: none; border-color: var(--accent); }
.ce-count { margin: 8px 2px 12px; font-size: 13px; color: var(--text-soft); }

/* 批量文件列表（图片/表情包分类） */
.ce-files {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  padding: 8px;
  margin-bottom: 10px;
}
.ce-file { display: flex; align-items: center; gap: 8px; }
.ce-file-thumb {
  width: 38px;
  height: 38px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--border);
  flex: 0 0 auto;
}
.ce-file-badge {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  border: 1px dashed var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--text-soft);
  flex: 0 0 auto;
  background: var(--bg-screen);
}
.ce-file-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ce-file-del {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  font-size: 14px;
  padding: 6px;
}
.ce-add-files {
  width: 100%;
  padding: 11px 0;
  font-size: 14px;
  border-radius: 12px;
  border: 1px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.ce-add-files:disabled { opacity: 0.6; }
/* 单选容器的累积引导提示 */
.ce-hint {
  margin: 6px 2px 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-soft);
  background: var(--bg-soft);
  border-radius: 10px;
  padding: 8px 10px;
}

/* 添加到分组：按钮 + 应用内下拉弹层 */
.ce-group { position: relative; }
.ce-group-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
  padding: 0 12px;
  height: 44px;
  text-align: left;
}
.ce-group.open .ce-group-btn { border-color: var(--accent); }
.ce-group-ico { display: flex; align-items: center; color: var(--text-soft); flex: 0 0 auto; }
.ce-group-label {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ce-group-label.ph { color: var(--text-soft); }
.ce-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; display: inline-block; }
.ce-caret { flex: 0 0 auto; font-size: 10px; color: var(--text-soft); }
.ce-group-pop {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  z-index: 5;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}
.ce-group-opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  border-radius: 9px;
  padding: 10px 10px;
  font-size: 14px;
  color: var(--text);
  text-align: left;
}
.ce-group-opt:active { background: var(--bg-soft); }
.ce-group-opt.on { color: var(--accent); }
.ce-group-opt-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ce-group-empty { padding: 14px 10px; font-size: 13px; color: var(--text-soft); text-align: center; }

/* 修改模式输入框 */
.ce-input { width: 100%; resize: none; }

/* 语音字卡 · 编辑语音文字（第二步） */
.cev-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-soft);
  margin: 2px 2px 8px;
}
.cev-cnt { font-size: 13px; color: var(--text-soft); }
.cev-file {
  display: flex;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
  padding: 11px 13px;
  margin-bottom: 14px;
}
.cev-ico { display: flex; color: var(--accent); flex: 0 0 auto; }
.cev-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cev-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
  padding: 12px 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  font-family: inherit;
  margin-bottom: 6px;
}
.cev-input:focus { outline: none; border-color: var(--accent); }
.cev-input::placeholder { color: var(--text-soft); }
</style>
