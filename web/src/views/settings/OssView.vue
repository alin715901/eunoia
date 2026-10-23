<template>
  <div class="sp-view">
    <AppHeader title="云端同步设置" back />
    <div class="sp-body">
      <!-- 帮助链接 -->
      <a class="help-link" href="https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair" target="_blank" rel="noopener">如何申请阿里云密钥?</a>

      <!-- Bucket 名称 -->
      <label class="field-label">Bucket 名称</label>
      <input v-model="form.bucket" class="field" autocomplete="off" />

      <!-- 地区：下拉联动 Endpoint，可切自定义手填 -->
      <label class="field-label">地区</label>
      <select v-model="regionPick" class="field" @change="onRegionChange">
        <option v-for="r in REGIONS" :key="r.endpoint" :value="r.endpoint">{{ r.n }}</option>
        <option value="__custom">自定义 Endpoint</option>
      </select>
      <input v-if="regionPick === '__custom'" v-model="form.endpoint" class="field custom-ep" placeholder="oss-cn-xxx.aliyuncs.com" autocomplete="off" />
      <p class="sub">与创建 Bucket 时选择的地区保持一致</p>

      <!-- AccessKey ID -->
      <label class="field-label">AccessKey ID</label>
      <input v-model="form.accessKeyId" class="field" autocomplete="off" />

      <!-- AccessKey Secret -->
      <label class="field-label">AccessKey Secret</label>
      <input v-model="form.accessKeySecret" class="field" type="password" autocomplete="off" />
      <p class="sub">密钥仅保存在你的浏览器本地，不会上传到任何服务器（除了阿里云本身）。</p>

      <!-- 已配置：断开连接 -->
      <button v-if="configured" class="btn-block danger" type="button" :disabled="saving || testing" @click="doClear">断开连接</button>
      <!-- 从云端恢复梦角到本浏览器 -->
      <button class="btn-block" type="button" :disabled="restoring || !configured" @click="doRestore">
        {{ restoring ? '恢复中…' : '从云端恢复梦角到本浏览器' }}
      </button>
      <!-- 迁移本地图片到云端 -->
      <button class="btn-block" type="button" :disabled="migrating || !configured" @click="doMigrate">
        {{ migrating ? `迁移中…（已完成 ${migDone}）` : '迁移本地图片到云端（省空间）' }}
      </button>

      <p v-if="msg" class="msg" :class="{ err: isErr }">{{ msg }}</p>
    </div>

    <!-- 底部按钮栏：取消 / 测试连接 / 保存并连接 -->
    <div class="oss-footer">
      <button class="f-btn" type="button" @click="goBack">取消</button>
      <button class="f-btn" type="button" :disabled="testing || saving" @click="doTest">{{ testing ? '测试中…' : '测试连接' }}</button>
      <button class="f-btn primary" type="button" :disabled="saving || testing" @click="doSave">{{ saving ? '保存中…' : '保存并连接' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getSettings, saveSettings, migrateImagesToOss, backupToOss, restoreFromOss } from '@/api/settings'
import { readOssCfg, ossReady, ossTest } from '@/utils/oss'
import { notify, confirmDialog } from '@/utils/dialog'

const router = useRouter()

/* 阿里云 OSS 常用地域节点（选中后自动填入 Endpoint；控制台显示的名称
   与本列表不一致时选「自定义 Endpoint」手填） */
const REGIONS = [
  { n: '华东 1（杭州）', endpoint: 'oss-cn-hangzhou.aliyuncs.com' },
  { n: '华东 2（上海）', endpoint: 'oss-cn-shanghai.aliyuncs.com' },
  { n: '华北 1（北京）', endpoint: 'oss-cn-beijing.aliyuncs.com' },
  { n: '华北 2（青岛）', endpoint: 'oss-cn-qingdao.aliyuncs.com' },
  { n: '华北 3（张家口）', endpoint: 'oss-cn-zhangjiakou.aliyuncs.com' },
  { n: '华北 5（呼和浩特）', endpoint: 'oss-cn-huhehaote.aliyuncs.com' },
  { n: '华北 6（乌兰察布）', endpoint: 'oss-cn-wulanchabu.aliyuncs.com' },
  { n: '华南 1（深圳）', endpoint: 'oss-cn-shenzhen.aliyuncs.com' },
  { n: '华南 2（河源）', endpoint: 'oss-cn-heyuan.aliyuncs.com' },
  { n: '华南 3（广州）', endpoint: 'oss-cn-guangzhou.aliyuncs.com' },
  { n: '西南 1（成都）', endpoint: 'oss-cn-chengdu.aliyuncs.com' },
  { n: '中国香港', endpoint: 'oss-cn-hongkong.aliyuncs.com' },
  { n: '亚太东南 1（新加坡）', endpoint: 'oss-ap-southeast-1.aliyuncs.com' },
  { n: '亚太东南 5（雅加达）', endpoint: 'oss-ap-southeast-5.aliyuncs.com' },
  { n: '美国西部 1（硅谷）', endpoint: 'oss-us-west-1.aliyuncs.com' }
]

const form = reactive({ accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', prefix: 'eunoia' })
const regionPick = ref('')
const saving = ref(false)
const testing = ref(false)
const migrating = ref(false)
const migDone = ref(0)
const restoring = ref(false)
const msg = ref('')
const isErr = ref(false)

const configured = computed(() => ossReady({
  accessKeyId: form.accessKeyId, accessKeySecret: form.accessKeySecret,
  bucket: form.bucket, endpoint: form.endpoint
}))

async function fill() {
  try {
    const s = await getSettings()
    Object.assign(form, readOssCfg(s))
    /* 反推地区下拉：endpoint 命中列表→选中该项，否则自定义 */
    const hit = REGIONS.find((r) => r.endpoint === form.endpoint)
    regionPick.value = hit ? hit.endpoint : (form.endpoint ? '__custom' : REGIONS[0].endpoint)
    if (!form.endpoint && !hit) form.endpoint = REGIONS[0].endpoint
  } catch (e) { /* 忽略：保持默认值 */ }
}
fill()

function onRegionChange() {
  if (regionPick.value !== '__custom') form.endpoint = regionPick.value
}

function goBack() {
  router.back()
}

async function doSave() {
  saving.value = true
  isErr.value = false
  try {
    if (!form.bucket.trim() || !form.endpoint.trim()) throw new Error('请填写 Bucket 名称并选择地区')
    await saveSettings({
      oss_config: {
        accessKeyId: form.accessKeyId.trim(),
        accessKeySecret: form.accessKeySecret.trim(),
        bucket: form.bucket.trim(),
        endpoint: form.endpoint.trim(),
        prefix: form.prefix.trim()
      }
    })
    msg.value = '已保存并连接'
    notify('云端同步配置已保存')
    /* 保存成功 → 自动把当前全部数据备份到云端（供「从云端恢复梦角到本浏览器」使用） */
    try {
      await backupToOss()
      notify('已自动备份当前数据到云端')
    } catch (be) {
      isErr.value = true
      msg.value = `已保存，但自动备份失败：${be.message || '请检查 Bucket 权限'}`
    }
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '保存失败'
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
    regionPick.value = REGIONS[0].endpoint
    msg.value = '已断开连接，上传将回到本地存储'
  } catch (e) {
    isErr.value = true
    msg.value = '断开失败：' + e.message
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

/* 从云端恢复梦角到本浏览器：下载备份 JSON → 覆盖导入 → 整页刷新重新初始化 */
async function doRestore() {
  const ok = await confirmDialog({
    title: '从云端恢复',
    text: '将用云端备份的数据覆盖本浏览器当前的梦角数据（聊天、字卡、设置等全部替换），且无法撤销。确定继续吗？',
    okText: '恢复',
    danger: true
  })
  if (!ok) return
  restoring.value = true
  isErr.value = false
  msg.value = '正在从云端下载数据…'
  try {
    const r = await restoreFromOss()
    msg.value = '恢复完成，正在刷新…'
    notify(`已恢复云端数据（导入 ${r?.inserted ?? '--'} 条）`)
    setTimeout(() => location.reload(), 800)
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '恢复失败'
  } finally {
    restoring.value = false
  }
}

/* 迁移本地图片到云端：逐张上传并替换字段，完成后汇报成功/失败数 */
async function doMigrate() {
  migrating.value = true
  migDone.value = 0
  isErr.value = false
  msg.value = '正在扫描本地图片…'
  try {
    const r = await migrateImagesToOss()
    msg.value = r.total === 0
      ? '没有需要迁移的本地图片'
      : `迁移完成：成功 ${r.migrated} 张${r.failed ? `，失败 ${r.failed} 张` : ''}`
    if (r.migrated > 0) notify(`已迁移 ${r.migrated} 张图片到云端`)
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '迁移失败'
  } finally {
    migrating.value = false
  }
}
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; }
.help-link {
  align-self: flex-start;
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
  margin-bottom: 14px;
}
.help-link::before { content: '? '; }
.field-label { display: block; font-size: 13px; color: var(--text); margin: 14px 0 8px; }
.field-label:first-of-type { margin-top: 0; }
.field {
  width: 100%; box-sizing: border-box; padding: 12px 14px; font-size: 14px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--bg-screen); color: var(--text);
}
.field:focus { outline: none; border-color: var(--accent); }
select.field {
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--text-soft) 50%), linear-gradient(135deg, var(--text-soft) 50%, transparent 50%);
  background-position: calc(100% - 18px) 55%, calc(100% - 13px) 55%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
  padding-right: 36px;
}
.custom-ep { margin-top: 8px; }
.sub { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 6px 0 0; }
.btn-block {
  margin-top: 14px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: var(--bg-soft);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
.btn-block:disabled { opacity: 0.5; cursor: default; }
.btn-block:active { opacity: 0.8; }
.btn-block.danger { background: rgba(192, 87, 107, 0.12); color: #c0576b; }
.msg { font-size: 12px; color: var(--text-soft); margin: 14px 0 0; }
.msg.err { color: #c0576b; }
/* 底部按钮栏：取消 / 测试连接 / 保存并连接 */
.oss-footer {
  display: flex;
  gap: 10px;
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--bg-screen);
}
.f-btn {
  flex: 1;
  padding: 11px 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
.f-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.f-btn:disabled { opacity: 0.5; cursor: default; }
</style>
