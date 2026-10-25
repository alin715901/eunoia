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

      <!-- 地区：应用内弹层单选（不用原生 select，避免 iOS 系统滚轮弹窗），
           选中联动 Endpoint，可切自定义手填 -->
      <label class="field-label">地区</label>
      <button type="button" class="field select-trigger" @click="regionOpen = true">
        <span class="st-text">{{ regionLabel }}</span>
        <AppIcon name="chevron-right" :size="16" color="var(--text-soft)" />
      </button>
      <input v-if="regionPick === '__custom'" v-model="form.endpoint" class="field custom-ep" placeholder="oss-cn-xxx.aliyuncs.com" autocomplete="off" />
      <p class="sub">与创建 Bucket 时选择的地区保持一致</p>

      <!-- AccessKey ID -->
      <label class="field-label">AccessKey ID</label>
      <input v-model="form.accessKeyId" class="field" autocomplete="off" />

      <!-- AccessKey Secret -->
      <label class="field-label">AccessKey Secret</label>
      <input v-model="form.accessKeySecret" class="field" type="password" autocomplete="off" />
      <p class="sub">密钥仅保存在你的浏览器本地，不会上传到任何服务器（除了阿里云本身）。</p>

      <!-- 路径前缀：多台设备必须填成一样的，否则各存各的，看起来像"同步没生效" -->
      <label class="field-label">路径前缀</label>
      <input v-model="form.prefix" class="field" autocomplete="off" placeholder="eunoia" />
      <p class="sub">云端文件会存在「前缀/backup/eunoia.json」。多台设备共用同一个 Bucket 时，此处必须完全一致。</p>

      <!-- 已配置：断开连接 -->
      <button v-if="configured" class="btn-block danger" type="button" :disabled="saving || testing" @click="doClear">断开连接</button>
      <!-- 上传本机数据到云端（会覆盖云端现有备份，冲突时二次确认） -->
      <button class="btn-block" type="button" :disabled="uploading || restoring || importing || !configured" @click="doUpload()">
        {{ uploading ? '上传中…' : '上传本机数据到云端' }}
      </button>
      <!-- 从云端恢复数据到本浏览器（下载后可选合并 / 覆盖） -->
      <button class="btn-block" type="button" :disabled="restoring || importing || !configured" @click="openRestore">
        {{ restoring ? '恢复中…' : '从云端恢复数据到本浏览器' }}
      </button>
      <!-- 迁移本地图片到云端 -->
      <button class="btn-block" type="button" :disabled="migrating || !configured" @click="doMigrate">
        {{ migrating ? `迁移中…（已完成 ${migDone}）` : '迁移本地图片到云端（省空间）' }}
      </button>
      <!-- 本机设备标识：多设备共用同一个 Bucket 时，用来区分数据来自哪台设备 -->
      <p class="sub">本机标识：{{ deviceLabel }}<span v-if="syncState && syncState.cloudLabel"> · 云端备份来自：{{ syncState.cloudLabel }}</span></p>
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

    <!-- 地区选择：应用内弹层单选列表（样式同「深色模式」选择） -->
    <Modal :show="regionOpen" title="选择地区" width="320px" @close="regionOpen = false">
      <div class="region-list">
        <button
          v-for="r in REGIONS"
          :key="r.endpoint"
          class="region-row"
          :class="{ on: regionPick === r.endpoint }"
          @click="pickRegion(r.endpoint)"
        >
          <span class="region-name">{{ r.n }}</span>
          <AppIcon v-if="regionPick === r.endpoint" name="check" :size="18" color="var(--accent)" />
        </button>
        <button class="region-row" :class="{ on: regionPick === '__custom' }" @click="pickRegion('__custom')">
          <span class="region-name">自定义 Endpoint</span>
          <AppIcon v-if="regionPick === '__custom'" name="check" :size="18" color="var(--accent)" />
        </button>
      </div>
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
import AppIcon from '@/components/common/AppIcon.vue'
import Modal from '@/components/common/Modal.vue'
import { getSettings, saveSettings, migrateImagesToOss, backupToOss, downloadOssBackup, importBackup, getOssSyncState, getDeviceLabel, markOssCloudSeen } from '@/api/settings'
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
/* 地区选择弹层（应用内 Modal，替代原生 select 的系统弹窗） */
const regionOpen = ref(false)
const regionLabel = computed(() => {
  if (regionPick.value === '__custom') return '自定义 Endpoint'
  const hit = REGIONS.find((r) => r.endpoint === regionPick.value)
  return hit ? hit.n : '请选择地区'
})
function pickRegion(v) {
  regionPick.value = v
  if (v !== '__custom') form.endpoint = v
  regionOpen.value = false
}
const saving = ref(false)
const testing = ref(false)
const uploading = ref(false)
const migrating = ref(false)
const migDone = ref(0)
const restoring = ref(false)
const restoreOpen = ref(false)
const restorePending = ref(null)
const importing = ref(false)
/* 本机设备标识 + 云端备份状态（用于冲突提示） */
const deviceLabel = getDeviceLabel()
const syncState = ref(null)
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

/* 读取云端备份状态（版本号 / 来源设备 / 是否冲突） */
async function refreshSyncState() {
  try {
    syncState.value = await getOssSyncState()
  } catch (e) { /* ignore */ }
}
loadSyncTime()
refreshSyncState()
syncTimer = setInterval(() => { loadSyncTime(); refreshSyncState() }, 30 * 1000)
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

function goBack() {
  router.back()
}

async function doSave() {
  saving.value = true
  isErr.value = false
  msgOk.value = false
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
    msgOk.value = true
    notify('云端同步配置已保存')
    /* 保存配置只保存配置，不动云端数据。
       早期这里会「顺手把本机数据上传覆盖云端」，导致另一台设备刚同步上去的数据
       被无声冲掉（用户反馈的「B 填好配置马上同步了 B 的数据」）。
       现在上传必须显式点击「上传本机数据到云端」，且云端有更新数据时会二次确认。 */
    await refreshSyncState()
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

/* 显式上传本机数据到云端；云端有更新的数据（多半来自另一台设备）时二次确认。
   force 只接受 true（内部递归调用时传），避免按钮事件对象被当成真值。 */
async function doUpload(force = false) {
  const hard = force === true
  if (uploading.value) return
  uploading.value = true
  isErr.value = false
  msgOk.value = false
  try {
    const r = await backupToOss({ force: hard, archive: true })
    await loadSyncTime()
    await refreshSyncState()
    msgOk.value = true
    msg.value = `已上传本机数据到云端（约 ${Math.round((r.bytes || 0) / 1024)} KB）`
    notify('已上传本机数据到云端')
  } catch (e) {
    if (e && e.code === 'OSS_CONFLICT') {
      /* 云端有本机没见过的新数据 → 询问是否覆盖（覆盖前会把旧备份存到 archive/） */
      const ok = await confirmDialog({
        title: '云端已有更新的数据',
        text: `${e.message}\n\n覆盖前会先把云端现有备份另存为一份历史文件，确定继续吗？`,
        danger: true,
        okText: '覆盖云端'
      })
      uploading.value = false
      if (ok) doUpload(true)
      return
    }
    isErr.value = true
    msg.value = e.message || '上传失败'
  } finally {
    uploading.value = false
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

/* mode: 'merge' 合并 / 'overwrite' 覆盖；
   导入后 api 层已 await flushNow() 确保写进 IndexedDB，这里才刷新页面。
   早先固定等 800ms 就 location.reload()，数据量大时写盘尚未完成就被刷新打断，
   表现为「提示导入成功、刷新后浏览器还是原来的数据」。 */
async function doRestore(mode) {
  if (!restorePending.value || importing.value) return
  importing.value = true
  try {
    const r = await importBackup(restorePending.value, mode)
    /* 本机已把云端这一版看进本地了 → 记下版本号，之后本机上传不会被误判冲突 */
    markOssCloudSeen().catch(() => {})
    const n = r && r.inserted ? Object.values(r.inserted).reduce((a, b) => a + b, 0) : null
    restoreOpen.value = false
    msgOk.value = true
    isErr.value = false
    msg.value = '恢复完成，正在刷新…'
    notify(`${r && r.text ? r.text : '已恢复云端数据'}${n != null ? `（共 ${n} 条）` : ''}`)
    setTimeout(() => location.reload(), 300)
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
/* 地区选择触发器：外观与输入框一致，点击弹应用内列表（替代原生 select） */
.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}
.st-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 地区弹层单选列表（样式同「深色模式」选择） */
.region-list { display: flex; flex-direction: column; }
.region-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 13px 4px; border: none; background: transparent;
  border-bottom: 1px solid var(--border);
  font-size: 15px; color: var(--text); text-align: left;
}
.region-row:last-child { border-bottom: none; }
.region-row.on { color: var(--accent); font-weight: 600; }
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
