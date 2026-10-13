<template>
  <div class="md-page">
    <AppHeader title="设置" back />

    <div class="md-body ms-body">
      <!-- ═══ 悬浮窗 ═══ -->
      <div class="ms-card">
        <div class="ms-row">
          <div class="ms-row-txt">
            <div class="ms-row-name">显示悬浮播放器</div>
          </div>
          <button
            class="ms-switch"
            :class="{ on: store.floating }"
            @click="toggleFloat"
            :aria-label="store.floating ? '关闭悬浮窗' : '开启悬浮窗'"
          ><i /></button>
        </div>
      </div>

      <!-- ═══ 音乐导入 ═══ -->
      <div class="ms-card">
        <div class="ms-title"><AppIcon name="download" :size="15" color="var(--accent)" /> 音乐导入</div>
        <input v-model="form.title" class="ms-input" placeholder="歌曲名称（例如：这里的风暴）" maxlength="60" />
        <input v-model="form.artist" class="ms-input" placeholder="歌手/备注" maxlength="60" />
        <div class="ms-audio-row">
          <input v-model="form.audio" class="ms-input grow" placeholder="音频链接（mp3/m4a）" />
          <button class="ms-folder" @click="pickAudio" aria-label="选择本地文件"><AppIcon name="folder" :size="18" /></button>
        </div>
        <input ref="audioEl" type="file" accept="audio/*" hidden @change="onAudioPicked" />
        <p v-if="form.audioName" class="ms-file-name">{{ form.audioName }}</p>
        <button class="ms-primary" :disabled="saving" @click="saveManual">{{ saving ? '导入中…' : '导入歌曲' }}</button>
      </div>

      <!-- ═══ 解析服务（可选：自定义跨域代理，默认用云端） ═══ -->
      <div class="ms-card">
        <div class="ms-title"><AppIcon name="music" :size="15" color="var(--accent)" /> 解析服务</div>
        <input v-model="proxyUrl" class="ms-input" placeholder="留空则用默认云服务，例如 http://127.0.0.1:8787" />
        <div class="ms-hint-row">
          <span>默认云端解析提取酷狗歌名/封面/歌词/音频，每日免费额度10万次请求，约可解析/播放2-5万首；也可自行填写其他解析服务地址。网易云音源/歌词已浏览器直连，无需中转</span>
        </div>
        <div class="ms-proxy-row">
          <button class="ms-ghost grow" @click="saveProxy">保存</button>
          <button class="ms-primary soft grow" :disabled="testing" @click="testProxy">{{ testing ? '测试中…' : '测试连接' }}</button>
        </div>
        <p v-if="proxyMsg" class="ms-file-name">{{ proxyMsg }}</p>
      </div>

      <!-- ═══ 链接导入（网易云/酷狗/音频直链，支持批量） ═══ -->
      <div class="ms-card">
        <div class="ms-title"><AppIcon name="download" :size="15" color="var(--accent)" /> 链接导入</div>
        <textarea v-model="plUrl" class="ms-textarea" placeholder="每行一个链接，支持网易云歌曲/歌单、酷狗歌曲分享链接、mp3/m4a 直链" />
        <div class="ms-hint-row">
          <span>一行一个链接，点导入后逐条抓取；歌单会自动抓取全部曲目</span>
        </div>
        <button class="ms-primary soft" :disabled="plLoading" @click="importPlaylist">{{ plLoading ? (importProgress || '抓取中…') : '导入' }}</button>
      </div>

      <!-- ═══ 本地缓存（封面/歌词抓到本地，断网也能看） ═══ -->
      <div class="ms-card">
        <div class="ms-title"><AppIcon name="download" :size="15" color="var(--accent)" /> 本地缓存</div>
        <div class="ms-hint-row">
          <span>把曲库里歌曲的封面图和歌词抓到本地存好，之后断网也能显示；新导入的歌会在后台自动缓存</span>
        </div>
        <button class="ms-primary soft" :disabled="cacheBtnLoading" @click="backfillCache">
          {{ cacheBtnLoading ? (cacheProgress || '缓存中…') : '一键缓存封面和歌词' }}
        </button>
      </div>

      <!-- ═══ 自定义唱片 ═══ -->
      <div class="ms-card">
        <div class="ms-title"><AppIcon name="music" :size="15" color="var(--accent)" /> 自定义唱片</div>
        <div class="ms-vinyl-row">
          <button class="ms-vinyl cur" @click="pickVinyl">
            <img v-if="store.vinyl" :src="store.vinyl" alt="" />
            <AppIcon v-else name="music" :size="26" color="#fff" />
          </button>
          <button class="ms-vinyl add" @click="pickVinyl"><AppIcon name="plus" :size="22" /></button>
        </div>
        <input ref="vinylEl" type="file" accept="image/*" hidden @change="onVinylPicked" />
        <button class="ms-ghost" @click="resetVinyl">恢复默认灰色唱片</button>
      </div>

      <!-- 唱片图片圆形裁剪 -->
      <ImageCropper
        v-if="showCrop"
        :src="cropSrc"
        title="裁剪唱片图片"
        :ratio="1"
        circle
        @done="onVinylCropped"
        @cancel="closeCrop"
      />
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onUnmounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ImageCropper from '@/components/common/ImageCropper.vue'
import { useMusicStore } from '@/stores/music'
import { useDesktopStore } from '@/stores/desktop'
import { useNotificationsStore } from '@/stores/notifications'
import { uploadFile } from '@/api/settings'
import { backfillMusicCache, getMusicCacheStats } from '@/api/music'

const store = useMusicStore()
const desktop = useDesktopStore()
const toast = useNotificationsStore()

const form = reactive({ title: '', artist: '', audio: '', audioName: '' })
const plUrl = ref('')
const saving = ref(false)
const plLoading = ref(false)
const importProgress = ref('')
const audioEl = ref(null)
const vinylEl = ref(null)
/* 一键缓存封面/歌词 */
const cacheBtnLoading = ref(false)
const cacheProgress = ref('')

/* 解析服务地址：本地中转优先于云端配置 */
const PROXY_KEY = 'eunoia.musicProxy'
const proxyUrl = ref('')
const proxyMsg = ref('')
const testing = ref(false)
let cachePollTimer = null
/* 唱片图片圆形裁剪 */
function defaultProxy() {
  try {
    return (window.__EUNOIA_CONFIG__ && window.__EUNOIA_CONFIG__.musicProxy) || ''
  } catch (e) {
    return ''
  }
}
function saveProxy() {
  const v = String(proxyUrl.value || '').trim().replace(/\/+$/, '')
  try {
    if (v) localStorage.setItem(PROXY_KEY, v)
    else localStorage.removeItem(PROXY_KEY)
  } catch (e) {
    proxyMsg.value = '无法保存（浏览器禁止访问存储）'
    return
  }
  proxyMsg.value = v ? `已切换到 ${v}` : '已恢复默认云服务'
}
async function testProxy() {
  if (testing.value) return
  testing.value = true
  proxyMsg.value = ''
  const v = String(proxyUrl.value || '').trim().replace(/\/+$/, '')
  if (!v) {
    proxyMsg.value = '请先填写地址'
    testing.value = false
    return
  }
  try {
    const r = await fetch(`${v}/?url=${encodeURIComponent('https://music.163.com/api/song/detail?ids=[186016]')}`, {
      cache: 'no-store'
    })
    const t = (await r.text()).slice(0, 200)
    if (r.ok && t.includes('songs')) proxyMsg.value = '连接成功，可以正常解析歌曲'
    else proxyMsg.value = `有响应但异常：HTTP ${r.status} ${t}`
  } catch (e) {
    proxyMsg.value = '连不上，确认电脑上已运行 server.js 且端口正确（也是一种可能：https 页面不能访问 http 地址，须用 127.0.0.1）'
  }
  testing.value = false
}

/* 自定义唱片 */
const cropSrc = ref('')
const showCrop = ref(false)

function toggleFloat() {
  store.saveSettings({ floating: !store.floating }).catch((e) => toast.pushToast({ title: '保存失败', text: e.message }))
}

/* 手动导入 */
function pickAudio() {
  audioEl.value?.click()
}
async function onAudioPicked(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  try {
    const r = await store.uploadAudio(f)
    form.audio = r.path
    form.audioName = f.name
    if (!form.title) form.title = f.name.replace(/\.[a-z0-9]+$/i, '')
  } catch (err) {
    toast.pushToast({ title: '文件上传失败', text: err.message })
  }
}
async function saveManual() {
  if (!form.title.trim()) return toast.pushToast({ title: '填一下歌曲名称' })
  if (!form.audio.trim()) return toast.pushToast({ title: '需要音频链接或选择本地文件' })
  saving.value = true
  try {
    await store.addManual({
      title: form.title.trim(),
      artist: form.artist.trim(),
      audio: form.audio.trim(),
      cover: ''
    })
    toast.pushToast({ title: '已导入', text: form.title })
    form.title = ''
    form.artist = ''
    form.audio = ''
    form.audioName = ''
  } catch (e) {
    toast.pushToast({ title: '导入失败', text: e.message })
  } finally {
    saving.value = false
  }
}

/* 链接导入：一行一个链接，逐条抓取（网易云歌曲/歌单、酷狗歌曲、音频直链） */
async function importPlaylist() {
  const lines = plUrl.value.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!lines.length) return
  plLoading.value = true
  let okCount = 0
  let vipCount = 0
  let skipCount = 0
  let failLines = []
  try {
    for (let i = 0; i < lines.length; i++) {
      importProgress.value = `导入中 ${i + 1}/${lines.length}`
      try {
        const r = await store.importLink(lines[i])
        if (r && r.imported) {
          okCount += r.imported
          vipCount += r.unplayable || 0
        }
        skipCount += (r && r.skipped) || 0
        if (r && !r.imported && !r.skipped) failLines.push(lines[i])
      } catch (e) {
        failLines.push(lines[i])
      }
    }
    const parts = []
    if (okCount) parts.push(`成功 ${okCount} 首`)
    if (skipCount) parts.push(`跳过 ${skipCount} 首重复`)
    if (failLines.length) parts.push(`失败 ${failLines.length} 条`)
    const notes = []
    if (vipCount) {
      notes.push(`${vipCount} 首无音源（会员付费 / 版权受限），可在音乐页右上角「移除会员付费歌曲」一键清理`)
    }
    if (failLines.length) {
      notes.push(`失败：${failLines.slice(0, 2).map((l) => (l.length > 24 ? l.slice(0, 24) + '…' : l)).join(' / ')}${failLines.length > 2 ? ' 等' : ''}`)
    }
    toast.pushToast({
      title: parts.join('，') || '没有可导入的链接',
      text: notes.join('；')
    })
    if (okCount) plUrl.value = ''
  } finally {
    importProgress.value = ''
    plLoading.value = false
  }
}

/* 一键缓存：把未本地化的封面/歌词全部入队，轮询队列进度 */
function backfillCache() {
  const r = backfillMusicCache()
  if (!r.tasks) {
    toast.pushToast({ title: '都已缓存', text: '封面和歌词都已在本地，无需再抓' })
    return
  }
  cacheBtnLoading.value = true
  cacheProgress.value = `缓存中 0/${r.tasks}`
  if (cachePollTimer) clearInterval(cachePollTimer)
  cachePollTimer = setInterval(() => {
    const st = getMusicCacheStats()
    const done = Math.min(st.done, r.tasks)
    cacheProgress.value = `缓存中 ${done}/${r.tasks}`
    if (st.queued <= 0 && done >= r.tasks) {
      clearInterval(cachePollTimer)
      cachePollTimer = null
      cacheBtnLoading.value = false
      cacheProgress.value = ''
      toast.pushToast({ title: '缓存完成', text: `已处理 ${r.songs} 首歌曲的封面和歌词` })
    }
  }, 500)
}
onUnmounted(() => {
  if (cachePollTimer) clearInterval(cachePollTimer)
})

/* 自定义唱片：选图 → 圆形裁剪 → 上传并直接应用到音乐卡胶片 */
function pickVinyl() {
  vinylEl.value?.click()
}
function onVinylPicked(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  cropSrc.value = URL.createObjectURL(f)
  showCrop.value = true
}
async function onVinylCropped(blob) {
  try {
    // 包成带文件名的 File，服务端按扩展名保存
    const file = new File([blob], 'vinyl.jpg', { type: 'image/jpeg' })
    const r = await uploadFile(file)
    await store.saveSettings({ vinyl: r.path })
    toast.pushToast({ title: '唱片已更新', text: '已应用到音乐卡胶片' })
  } catch (err) {
    toast.pushToast({ title: '上传失败', text: err.message })
  } finally {
    closeCrop()
  }
}
function closeCrop() {
  if (cropSrc.value) URL.revokeObjectURL(cropSrc.value)
  cropSrc.value = ''
  showCrop.value = false
}
function resetVinyl() {
  store.saveSettings({ vinyl: '' }).then(() => toast.pushToast({ title: '已恢复默认唱片' })).catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

onMounted(() => {
  store.init(desktop.currentContactId)
  try {
    proxyUrl.value = localStorage.getItem(PROXY_KEY) || ''
  } catch (e) {
    proxyUrl.value = ''
  }
})
</script>

<style scoped>
.ms-body { padding-bottom: 40px; }
.ms-card {
  background: var(--bg-screen); border: 1px solid var(--border);
  border-radius: 18px; padding: 16px; margin-bottom: 16px;
}
.ms-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 14px; font-weight: 700; margin-bottom: 12px;
}
.ms-input {
  width: 100%; box-sizing: border-box; padding: 11px 14px; margin-bottom: 10px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--bg);
  font-size: 13px; color: var(--text);
}
.ms-input::placeholder { color: var(--text-soft); }
.ms-textarea {
  width: 100%; box-sizing: border-box; padding: 11px 14px; margin-bottom: 10px;
  border-radius: 12px; border: 1px solid var(--border); background: var(--bg);
  font-size: 13px; line-height: 1.6; color: var(--text);
  min-height: 110px; resize: none; font-family: inherit;
  -webkit-appearance: none;
}
.ms-textarea::placeholder { color: var(--text-soft); }
.ms-audio-row { display: flex; gap: 8px; }
.ms-audio-row .grow { flex: 1; min-width: 0; margin-bottom: 0; }
.ms-folder {
  flex: 0 0 auto; width: 46px; border-radius: 12px; border: 1px solid var(--border);
  background: var(--bg-soft); display: flex; align-items: center; justify-content: center;
}
.ms-file-name { font-size: 11px; color: var(--accent); margin: 8px 0 0; word-break: break-all; }
.ms-proxy-row { display: flex; gap: 10px; margin-top: 2px; }
.ms-proxy-row .grow { flex: 1; min-width: 0; }
/* 保存按钮与「测试连接」等高 */
.ms-proxy-row .ms-ghost { padding: 13px 16px; font-size: 14px; font-weight: 700; }
.ms-primary {
  width: 100%; margin-top: 14px; padding: 13px 0; border: none; border-radius: 999px;
  background: var(--accent); color: #fff; font-size: 14px; font-weight: 700;
}
.ms-primary.soft { background: color-mix(in srgb, var(--accent) 82%, #fff); }
.ms-primary:disabled { opacity: 0.6; }
.ms-hint-row {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 2px;
  padding: 6px 10px; border-radius: 999px; background: var(--bg-soft);
  font-size: 11px; color: var(--text-soft);
}

/* 悬浮窗开关行 */
.ms-row { display: flex; align-items: center; gap: 12px; }
.ms-row-txt { flex: 1; min-width: 0; }
.ms-row-name { font-size: 14px; font-weight: 600; }
.ms-row-sub { font-size: 11px; color: var(--text-soft); margin-top: 2px; }
.ms-switch {
  flex: 0 0 auto; width: 44px; height: 26px; border-radius: 999px;
  background: var(--bg-soft); border: 1px solid var(--border);
  position: relative; transition: background 0.2s ease;
}
.ms-switch i {
  position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
  border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s ease;
}
.ms-switch.on { background: var(--accent); border-color: var(--accent); }
.ms-switch.on i { transform: translateX(18px); }

/* 自定义唱片 */
.ms-vinyl-row { display: flex; gap: 12px; margin-bottom: 14px; }
.ms-vinyl {
  width: 76px; height: 76px; border-radius: 16px; overflow: hidden;
  border: 1.5px solid var(--accent); background: #b9b4ae;
  display: flex; align-items: center; justify-content: center;
}
.ms-vinyl img { width: 100%; height: 100%; object-fit: cover; }
.ms-vinyl.add { border: 1.5px dashed var(--border); background: var(--bg-soft); }
.ms-ghost {
  width: auto; padding: 8px 16px; border-radius: 999px; font-size: 12px;
  border: none; background: var(--bg-soft); color: var(--text-soft);
}
</style>
