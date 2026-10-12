<template>
  <div class="compose-view">
    <AppHeader title="编辑朋友圈" back>
      <template #right>
        <button class="pub-btn" :disabled="publishing" @click="publish">
          {{ publishing ? '发布中…' : '发布' }}
        </button>
      </template>
    </AppHeader>

    <div class="cv-body">
      <textarea
        v-model="text"
        class="cv-area"
        placeholder="此刻在想什么…"
        rows="6"
      ></textarea>

      <!-- 图片九宫格：最多 9 张，末尾是「＋」加图块 -->
      <div class="cv-grid">
        <div v-for="(img, i) in images" :key="img + i" class="cv-cell">
          <img :src="imgFull(img)" alt="" />
          <button class="cv-del" @click="images.splice(i, 1)">×</button>
        </div>
        <button v-if="images.length < 9" class="cv-add" @click="pickImages">
          <AppIcon name="plus" :size="26" color="var(--text-soft)" />
        </button>
      </div>

      <div class="cv-opts">
        <button class="cv-opt cv-opt-btn" @click="showScope = true">
          <span class="cv-opt-label">可见范围</span>
          <span class="cv-opt-val">{{ scopeLabel }}</span>
        </button>
      </div>

      <p class="cv-hint">写点什么或加张图就可以发布</p>
    </div>

    <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPick" />

    <!-- 可见范围：应用内弹窗选择（不带群聊，不用系统 picker） -->
    <Modal :show="showScope" title="可见范围" @close="showScope = false">
      <div class="scope-list">
        <button class="scope-item" :class="{ on: postTo === '' }" @click="pickScope('')">
          <span>全部可见</span>
          <span v-if="postTo === ''" class="scope-check">✓</span>
        </button>
        <button
          v-for="c in personContacts"
          :key="c.id"
          class="scope-item"
          :class="{ on: postTo === String(c.id) }"
          @click="pickScope(String(c.id))"
        >
          <span>仅 {{ c.name }} 可见</span>
          <span v-if="postTo === String(c.id)" class="scope-check">✓</span>
        </button>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import Modal from '@/components/common/Modal.vue'
import { compressImage } from '@/utils/image'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { createMoment, uploadImage } from '@/api/content'

const router = useRouter()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()

const personContacts = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))

const text = ref('')
const images = ref([])
const postTo = ref('')
const publishing = ref(false)
const uploading = ref(false)

/* 可见范围弹窗：只列单人联系人（群聊不能发朋友圈） */
const showScope = ref(false)
const scopeLabel = computed(() => {
  if (!postTo.value) return '全部可见'
  const c = personContacts.value.find((x) => String(x.id) === String(postTo.value))
  return c ? `仅 ${c.name} 可见` : '全部可见'
})
function pickScope(v) {
  postTo.value = v
  showScope.value = false
}

const fileInput = ref(null)
function pickImages() {
  fileInput.value?.click()
}

function imgFull(p) {
  return p || ''
}

/* 选图即上传，不裁剪（保持原比例原图） */
async function onPick(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) return
  /* 最多 9 张 */
  const room = 9 - images.value.length
  if (room <= 0) {
    toast.pushToast({ title: '提示', text: '最多 9 张图' })
    return
  }
  uploading.value = true
  try {
    for (const f of files.slice(0, room)) {
      const small = await compressImage(f)
      const fd = new FormData()
      fd.append('file', small)
      const r = await uploadImage(fd)
      images.value.push(r.path)
    }
  } catch (err) {
    toast.pushToast({ title: '上传失败', text: err.message })
  } finally {
    uploading.value = false
  }
}

async function publish() {
  if (!text.value.trim() && !images.value.length) {
    toast.pushToast({ title: '提示', text: '写点什么或加张图' })
    return
  }
  if (uploading.value) return
  publishing.value = true
  try {
    await createMoment({
      /* 可见范围：空 = 全部可见 */
      contactId: postTo.value ? Number(postTo.value) : null,
      author: 'me',
      authorContactId: null,
      text: text.value.trim(),
      images: images.value
    })
    toast.pushToast({ title: '已发布' })
    router.back()
  } catch (err) {
    toast.pushToast({ title: '发布失败', text: err.message })
  } finally {
    publishing.value = false
  }
}

onMounted(async () => {
  await contactsStore.load().catch(() => {})
})
</script>

<style scoped>
.compose-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cv-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.cv-body::-webkit-scrollbar { display: none; }

.pub-btn {
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border-radius: 999px;
  padding: 7px 18px;
  white-space: nowrap;
}
.pub-btn:disabled { opacity: 0.6; }

.cv-area {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px 14px;
  font-size: 15px;
  font-family: var(--font-serif);
  line-height: 1.8;
  background: var(--bg-screen);
  color: var(--text);
  resize: none;
  min-height: 132px;
}
.cv-area:focus { border-color: var(--accent); outline: none; }

/* 图片九宫格 */
.cv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.cv-cell { position: relative; aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: var(--bg-soft); }
.cv-cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  line-height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
}
.cv-add {
  aspect-ratio: 1;
  border: 1px dashed var(--border);
  background: var(--bg-soft);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cv-add:active { background: var(--accent-soft); }

.cv-opts { display: flex; flex-direction: column; gap: 10px; }
.cv-opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.cv-opt-btn {
  width: 100%;
  border: none;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  font-family: inherit;
}
.cv-opt-btn:active { background: var(--accent-soft); }
.cv-opt-label { font-size: 14px; color: var(--text); font-weight: 600; }
.cv-opt-val { font-size: 13px; color: var(--text-soft); }

/* 可见范围弹窗 */
.scope-list { display: flex; flex-direction: column; }
.scope-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: none;
  background: transparent;
  padding: 12px 4px;
  font-size: 14px;
  color: var(--text);
  text-align: left;
  font-family: inherit;
}
.scope-item + .scope-item { border-top: 1px solid var(--border); }
.scope-item.on { color: var(--accent); font-weight: 600; }
.scope-check { color: var(--accent); font-weight: 700; }
.cv-hint { margin: 0; font-size: 12px; color: var(--text-soft); }
</style>
