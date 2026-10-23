<template>
  <div class="sp-view">
    <AppHeader title="阿里云 OSS" back />
    <div class="sp-body">
      <!-- 说明 -->
      <div class="panel sec">
        <div class="sec-title">用途</div>
        <p class="hint">
          配置后，新上传的图片（头像、聊天背景、照片等）会先传到你的 OSS Bucket，本地只保存对象链接，
          不再占用浏览器存储空间。未配置时全部保存在本地（IndexedDB）。
        </p>
        <p class="hint">
          浏览器直传需要：① Bucket 已配置 CORS（允许来源=当前站点，方法=PUT/DELETE/GET）；
          ② Bucket 为公共读，否则生成的链接无法直接打开。
        </p>
      </div>

      <!-- 配置表单 -->
      <div class="panel sec">
        <div class="sec-title">存储配置</div>
        <label class="field-label">AccessKeyId</label>
        <input v-model="form.accessKeyId" class="field" placeholder="阿里云账号 AK" autocomplete="off" />
        <label class="field-label">AccessKeySecret</label>
        <input v-model="form.accessKeySecret" class="field" type="password" placeholder="阿里云账号 SK" autocomplete="off" />
        <label class="field-label">Bucket 名称</label>
        <input v-model="form.bucket" class="field" placeholder="如 eunoia-media" autocomplete="off" />
        <label class="field-label">地域节点（Endpoint）</label>
        <input v-model="form.endpoint" class="field" placeholder="如 oss-cn-hangzhou.aliyuncs.com" autocomplete="off" />
        <p class="hint">填 OSS 控制台里 Bucket 的「地域节点」，不带 https:// 前缀。</p>
        <label class="field-label">存储目录前缀（选填）</label>
        <input v-model="form.prefix" class="field" placeholder="默认 eunoia" autocomplete="off" />
      </div>

      <!-- 操作 -->
      <div class="panel sec btn-row">
        <button class="mini-btn" type="button" :disabled="testing" @click="doTest">{{ testing ? '测试中…' : '测试连接' }}</button>
        <button class="mini-btn primary" type="button" :disabled="saving" @click="doSave">{{ saving ? '保存中…' : '保存配置' }}</button>
        <button class="mini-btn danger" type="button" :disabled="saving || testing" @click="doClear">清空</button>
      </div>
      <p v-if="msg" class="msg" :class="{ err: isErr }">{{ msg }}</p>
      <p v-if="savedUrl" class="msg">
        最近上传：<a :href="savedUrl" target="_blank" rel="noopener">{{ savedUrl }}</a>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getSettings, saveSettings } from '@/api/settings'
import { readOssCfg, ossTest } from '@/utils/oss'
import { notify } from '@/utils/dialog'

const form = reactive({ accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', prefix: 'eunoia' })
const saving = ref(false)
const testing = ref(false)
const msg = ref('')
const isErr = ref(false)
const savedUrl = ref('')

async function fill() {
  try {
    const s = await getSettings()
    Object.assign(form, readOssCfg(s))
  } catch (e) { /* 忽略：保持默认值 */ }
}
fill()

async function doSave() {
  saving.value = true
  isErr.value = false
  try {
    await saveSettings({
      oss_config: {
        accessKeyId: form.accessKeyId.trim(),
        accessKeySecret: form.accessKeySecret.trim(),
        bucket: form.bucket.trim(),
        endpoint: form.endpoint.trim(),
        prefix: form.prefix.trim()
      }
    })
    msg.value = '已保存'
  } catch (e) {
    isErr.value = true
    msg.value = '保存失败：' + e.message
  } finally {
    saving.value = false
  }
}

async function doClear() {
  saving.value = true
  isErr.value = false
  try {
    await saveSettings({ oss_config: { accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', prefix: '' } })
    Object.assign(form, { accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', prefix: '' })
    msg.value = '已清空，上传将回到本地存储'
  } catch (e) {
    isErr.value = true
    msg.value = '清空失败：' + e.message
  } finally {
    saving.value = false
  }
}

async function doTest() {
  testing.value = true
  isErr.value = false
  msg.value = ''
  try {
    const r = await ossTest({
      accessKeyId: form.accessKeyId.trim(),
      accessKeySecret: form.accessKeySecret.trim(),
      bucket: form.bucket.trim(),
      endpoint: form.endpoint.trim(),
      prefix: form.prefix.trim()
    })
    isErr.value = !r.ok
    msg.value = r.message
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '测试失败'
  } finally {
    testing.value = false
  }
}
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.sec-title { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 8px 0 0; }
.field-label { display: block; font-size: 12px; color: var(--text-soft); margin: 12px 0 6px; }
.field-label:first-of-type { margin-top: 0; }
.field {
  width: 100%; box-sizing: border-box; padding: 9px 12px; font-size: 13px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg-soft); color: var(--text);
}
.field:focus { outline: none; border-color: var(--accent); }
.btn-row { display: flex; gap: 10px; }
.btn-row .mini-btn { flex: 1; }
.mini-btn { border: 1px solid var(--border); background: var(--bg-soft); border-radius: 999px; padding: 9px 16px; font-size: 13px; color: var(--text); cursor: pointer; }
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mini-btn.danger { color: #c0576b; }
.mini-btn:disabled { opacity: 0.5; cursor: default; }
.msg { font-size: 12px; color: var(--text-soft); margin: 0 4px; word-break: break-all; }
.msg.err { color: #c0576b; }
.msg a { color: var(--accent); }
</style>
