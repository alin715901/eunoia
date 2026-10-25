<template>
  <div class="sp-view">
    <AppHeader title="云端同步设置" back />
    <div class="sp-body">
      <!-- 顶部状态行：左侧帮助链接，右侧最近同步时间与成功/错误提示 -->
      <div class="top-row">
        <a class="help-link" href="https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair" target="_blank" rel="noopener">如何申请阿里云密钥？</a>
        <span class="top-status">
          <span v-if="lastSyncText" class="sync-time">{{ lastSyncText }}</span>
          <span v-if="msg" class="msg" :class="{ err: isErr, ok: msgOk && !isErr }">{{ msg }}</span>
        </span>
      </div>

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
      <!-- 从云端恢复数据到本浏览器（下载后可选合并 / 覆盖） -->
      <button class="btn-block" type="button" :disabled="restoring || importing || !configured" @click="openRestore">
        {{ restoring ? '恢复中…' : '从云端恢复数据到本浏览器' }}
      </button>
      <!-- 迁移本地图片到云端 -->
      <button class="btn-block" type="button" :disabled="migrating || !configured" @click="doMigrate">
        {{ migrating ? `迁移中…（已完成 ${migDone}）` : '迁移本地图片到云端（省空间）' }}
      </button>
      <!-- 最近一次同步时间 -->
    </div>

    <!-- 从云端恢复：下载备份后选择合并 / 覆盖 -->
    <Modal :show="restoreOpen" title="从云端恢复" width="360px" @close="restoreOpen = false">
      <template v-if="restorePending">
        <div class="imp-info">
          <div class="imp-row"><span>备份时间</span><span>{{ fmtTime(restorePending.created_at) }}</span></div>
          <div class="imp-row"><span>数据量</span><span>{{ totalRows(restorePending) }} 条</span></div>
        </div>
        <div class="bk-feats">
          <div v-for="f in featSummary.features" :key="f.key" class="feat-row">
            <span class="ck-name">{{ f.label }}</span>
            <span class="ck-count">{{ f.count }} 条</span>
          </div>
          <div v-for="o in featSummary.others" :key="o.label" class="feat-row">
            <span class="ck-name">{{ o.label }}</span>
            <span class="ck-count">{{ o.count }} 条</span>
          </div>
          <p v-if="!featSummary.features.length && !featSummary.others.length" class="exp-empty">（空备份）</p>
        </div>
        <div class="imp-modes">
          <button class="imp-btn" :disabled="importing" @click="doRestore('merge')">
            <b>合并到当前数据</b>
            <span>保留本浏览器当前数据，云端备份作为新条目加入；同名联系人、同源歌曲会自动归并到已有条目</span>
          </button>
          <button class="imp-btn danger" :disabled="importing" @click="askOverwriteRestore">
            <b>覆盖导入</b>
            <span>先删除本浏览器当前全部数据，再用云端备份替换，不可恢复</span>
          </button>
        </div>
      </template>
      <template #footer>
        <button class="mini-btn" @click="restoreOpen = false">取消</button>
      </template>
    </Modal>

    <!-- 底部按钮栏：取消 / 测试连接 / 保存并连接 -->
    <div class="oss-footer">
      <button class="f-btn" type="button" @click="goBack">取消</button>
      <button class="f-btn" type="button" :disabled="testing || saving" @click="doTest">{{ testing ? '测试中…' : '测试连接' }}</button>
      <button class="f-btn primary" type="button" :disabled="saving || testing" @click="doSave">{{ saving ? '保存中…' : '保存并连接' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import Modal from '@/components/common/Modal.vue'
import { getSettings, saveSettings, migrateImagesToOss, backupToOss, downloadOssBackup, importBackup } from '@/api/settings'
import { fmtBackupTime, backupTotalRows, backupFeatureSummary } from '@/utils/backupInfo'
import { readOssCfg, ossReady, ossTest } from '@/utils/oss'
import { fmtSyncTime } from '@/utils/syncTime'
import { notify, confirmDialog } from '@/utils/dialog'

/* 备份信息展示（与本地导入弹窗共用一套 helpers，保证口径一致） */
const fmtTime = fmtBackupTime
const totalRows = backupTotalRows

const router = useRouter()

/* 阿里云 OSS 常用地域节点（选中后自动填入 Endpoint；控制台显示的名称
   与本列表不一致时选「自定义 Endpoint」手填） */
const REGIONS = [
  { n: '华东 1（杭州）', endpoint: 'oss-cn-hangzhou.aliyuncs.com' },
  { n: '华东 2（上海）', endpoint: 'oss-cn-shanghai.aliyuncs.com' },
  { n: '华东 5（南京）', endpoint: 'oss-cn-nanjing.aliyuncs.com' },
  { n: '华东 6（福州）', endpoint: 'oss-cn-fuzhou.aliyuncs.com' },
  { n: '华北 1（青岛）', endpoint: 'oss-cn-qingdao.aliyuncs.com' },
  { n: '华北 2（北京）', endpoint: 'oss-cn-beijing.aliyuncs.com' },
  { n: '华北 3（张家口）', endpoint: 'oss-cn-zhangjiakou.aliyuncs.com' },
  { n: '华北 5（呼和浩特）', endpoint: 'oss-cn-huhehaote.aliyuncs.com' },
  { n: '华北 6（乌兰察布）', endpoint: 'oss-cn-wulanchabu.aliyuncs.com' },
  { n: '华南 1（深圳）', endpoint: 'oss-cn-shenzhen.aliyuncs.com' },
  { n: '华南 2（河源）', endpoint: 'oss-cn-heyuan.aliyuncs.com' },
  { n: '华南 3（广州）', endpoint: 'oss-cn-guangzhou.aliyuncs.com' },
  { n: '西南 1（成都）', endpoint: 'oss-cn-chengdu.aliyuncs.com' },
  { n: '中国香港', endpoint: 'oss-cn-hongkong.aliyuncs.com' }
]

const form = reactive({ accessKeyId: '', accessKeySecret: '', bucket: '', endpoint: '', prefix: 'eunoia' })
const regionPick = ref('')
const saving = ref(false)
const testing = ref(false)
const migrating = ref(false)
const migDone = ref(0)
const restoring = ref(false)
const restoreOpen = ref(false)
const restorePending = ref(null)
const importing = ref(false)
/* 备份内容按板块汇总（与「按板块导出」弹窗同口径） */
const featSummary = computed(() => backupFeatureSummary(restorePending.value))
const msg = ref('')
const isErr = ref(false)
const msgOk = ref(false) /* 成功提示走绿色样式 */

const configured = computed(() => ossReady({
  accessKeyId: form.accessKeyId, accessKeySecret: form.accessKeySecret,
  bucket: form.bucket, endpoint: form.endpoint
}))

/* ── 最近同步时间（oss_last_backup_at 由 backupToOss 成功后写入全局设置） ── */
const lastSyncText = ref('')
let syncTimer = null

async function loadSyncTime() {
  try {
    const s = await getSettings()
    const t = Number(s.oss_last_backup_at) || 0
    lastSyncText.value = t ? fmtSyncTime(t) : ''
  } catch (e) { /* ignore */ }
}
loadSyncTime()
syncTimer = setInterval(loadSyncTime, 30 * 1000)
onBeforeUnmount(() => clearInterval(syncTimer))

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
  msgOk.value = false
  try {
    if (!form.bucket.trim() || !form.endpoint.trim()) throw new Error('请填写 Bucket 名称并选择地区')
    msgOk.value = false
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
    msgOk.value = true
    notify('云端同步配置已保存')
    /* 保存成功 → 后台自动把当前全部数据备份到云端（不阻塞按钮，
       上传在后台继续，完成后刷新同步时间并通知） */
    backupToOss()
      .then(() => {
        loadSyncTime()
        notify('已自动备份当前数据到云端')
      })
      .catch((be) => {
        isErr.value = true
        msg.value = `已保存，但自动备份失败：${be.message || '请检查 Bucket 权限'}`
      })
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
  msgOk.value = false
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
  msgOk.value = false
  try {
    const r = await ossTest({
      accessKeyId: form.accessKeyId.trim(),
      accessKeySecret: form.accessKeySecret.trim(),
      bucket: form.bucket.trim(),
      endpoint: form.endpoint.trim(),
      prefix: form.prefix.trim()
    })
    isErr.value = !r.ok
    msgOk.value = r.ok && r.level === 'ok'
    msg.value = r.ok && r.level === 'ok' ? '连接成功，密钥可用' : r.message
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '测试失败'
  } finally {
    testing.value = false
  }
}

/* 从云端恢复：先下载备份并展示信息（时间 / 范围 / 条数），
   再由用户选择合并 / 覆盖——与本地文件导入的体验保持一致 */
async function openRestore() {
  if (restoring.value) return
  restoring.value = true
  isErr.value = false
  msgOk.value = false
  msg.value = '正在从云端下载数据…'
  try {
    restorePending.value = await downloadOssBackup()
    restoreOpen.value = true
    msg.value = ''
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '下载失败'
  } finally {
    restoring.value = false
  }
}

/* mode: 'merge' 合并 / 'overwrite' 覆盖；成功后整页刷新重新初始化 */
async function doRestore(mode) {
  if (!restorePending.value || importing.value) return
  importing.value = true
  try {
    const r = await importBackup(restorePending.value, mode)
    const n = r && r.inserted ? Object.values(r.inserted).reduce((a, b) => a + b, 0) : null
    restoreOpen.value = false
    msgOk.value = true
    isErr.value = false
    msg.value = '恢复完成，正在刷新…'
    notify(`已${mode === 'overwrite' ? '覆盖' : '合并'}恢复云端数据${n != null ? `（导入 ${n} 条）` : ''}`)
    setTimeout(() => location.reload(), 800)
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '恢复失败'
  } finally {
    importing.value = false
  }
}

/* 覆盖导入二次确认（合并不破坏当前数据，无需确认） */
async function askOverwriteRestore() {
  const ok = await confirmDialog({
    title: '确认覆盖导入',
    text: '覆盖会先删除本浏览器当前全部数据，再用云端备份替换，且无法撤销。确定继续吗？',
    danger: true,
    okText: '覆盖'
  })
  if (ok) doRestore('overwrite')
}

/* 迁移本地图片到云端：逐张上传并替换字段，完成后汇报成功/失败数 */
async function doMigrate() {
  migrating.value = true
  migDone.value = 0
  isErr.value = false
  msgOk.value = false
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
.top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
}
.top-status { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; margin-left: auto; text-align: right; }
.help-link {
  font-size: 12px;
  color: var(--accent);
  text-decoration: none;
}
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
  background: color-mix(in srgb, var(--text) 8%, var(--bg-soft));
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
}
.btn-block:disabled { opacity: 0.5; cursor: default; }
.btn-block:active { opacity: 0.8; }
.btn-block.danger { background: rgba(192, 87, 107, 0.12); color: #c0576b; }
.msg { font-size: 12px; color: var(--text-soft); margin: 0; }
.msg.err { color: #c0576b; }
/* 成功提示：仅绿字 + ✓ 前缀，无背景色 */
.msg.ok { color: #3d9a6c; font-weight: 600; }
.msg.ok::before { content: '✓ '; }
.sync-time { font-size: 11px; color: var(--text-soft); margin: 0; }
/* 恢复弹窗：备份信息 + 合并/覆盖 选择（样式与本地导入弹窗保持一致） */
.mini-btn {
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; color: var(--text);
}
.mini-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.mini-btn:disabled { opacity: 0.6; }
.imp-info { border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; margin-bottom: 10px; }
.imp-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 4px 0; }
.imp-row span:first-child { color: var(--text-soft); flex: 0 0 auto; }
.imp-row span:last-child { text-align: right; word-break: break-all; }
.imp-tables { font-size: 12px; color: var(--text-soft); line-height: 1.7; margin: 0 0 12px; word-break: break-all; }
/* 备份内容板块列表（与「按板块导出」弹窗同口径） */
.bk-feats { border: 1px solid var(--border); border-radius: var(--radius); padding: 2px 12px; margin-bottom: 12px; max-height: 38vh; overflow: auto; }
.feat-row { display: flex; align-items: center; gap: 9px; padding: 8px 0; font-size: 13px; color: var(--text); border-bottom: 1px solid var(--border); }
.feat-row:last-child { border-bottom: none; }
.feat-row .ck-name { flex: 1 1 auto; min-width: 0; }
.feat-row .ck-count { font-size: 12px; color: var(--text-soft); flex: 0 0 auto; }
.exp-empty { font-size: 12px; color: var(--text-soft); text-align: center; padding: 12px 0; margin: 0; }
.imp-modes { display: flex; flex-direction: column; gap: 10px; }
.imp-btn {
  display: flex; flex-direction: column; gap: 3px; text-align: left;
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: var(--radius); padding: 12px; color: var(--text);
}
.imp-btn b { font-size: 14px; }
.imp-btn span { font-size: 12px; color: var(--text-soft); line-height: 1.5; }
.imp-btn.danger { border-color: #c0576b; }
.imp-btn.danger b { color: #c0576b; }
.imp-btn:disabled { opacity: 0.6; }

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
