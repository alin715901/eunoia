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
      <!-- 云端历史版本：每次上传前自动留存的「云端旧快照」，误覆盖可从这里找回 -->
      <div class="hist-block">
        <div class="hist-head">
          <span class="hist-title">云端历史版本</span>
          <button class="hist-refresh" type="button" :disabled="listing" @click="refreshArchives">{{ listing ? '刷新中…' : '刷新列表' }}</button>
        </div>
        <p class="sub">
          这里存的是「云端过去的样子」：每次点「上传本机数据到云端」，系统会先把云端原有的那份备份另存到这里，再写入本机数据；万一覆盖错了（例如把旧手机的数据传上去），可以把它下载回来。
        </p>
        <p class="sub">
          「从云端恢复 / 覆盖导入」只是把云端数据下载到本机，<b>不会</b>在这里生成记录。想马上看到一条，点下面的「立即存档」就行。
        </p>
        <button class="btn-block" type="button" :disabled="archiving || !configured" @click="doArchive">
          {{ archiving ? '存档中…' : '立即存档当前云端备份' }}
        </button>
        <div v-if="archList.length" class="hist-list">
          <p class="sub">点「下载并恢复」后，仍会让你选「合并」或「覆盖」。</p>
          <div v-for="a in archList" :key="a.key" class="hist-item">
            <div class="hist-info">
              <span class="hist-at">{{ fmtTime(a.at) }}</span>
              <span class="hist-size">{{ fmtKb(a.size) }}</span>
            </div>
            <button class="hist-restore" type="button" :disabled="restoring || importing" @click="doRestoreArchive(a)">下载并恢复</button>
          </div>
        </div>
        <p v-else-if="archTried && !listing" class="hist-empty">
          还没有历史版本。常见原因：云端原本没有备份，或你只做过「从云端恢复 / 覆盖导入」（这一步不生成历史版本）。点上面的「立即存档」可以手动留一份，之后每次上传也会自动留一份。
        </p>
        <p v-if="archErr" class="hist-err">{{ archErr }}</p>
        <p class="sub">历史文件存放在 OSS 的 <code>{{ prefixHint }}/</code> 目录。</p>
      </div>
      <!-- 本机设备标识：多设备共用同一个 Bucket 时，用来区分数据来自哪台设备 -->
      <p class="sub">本机标识：{{ deviceLabel }}<span v-if="syncState && syncState.cloudLabel"> · 云端备份来自：{{ syncState.cloudLabel }}</span></p>
      <!-- 最近一次同步时间 -->
    </div>

    <!-- 从云端恢复：下载备份后选择合并 / 覆盖 -->
    <Modal :show="restoreOpen" title="从云端恢复" width="360px" @close="onRestoreClose">
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
        <p class="imp-warn">
          覆盖会用云端备份替换本机数据。此备份含歌曲 <b>{{ ((restorePending.tables && restorePending.tables.songs) || []).length }}</b> 首；
          若云端备份早于本机新增的歌曲/聊天，覆盖后这些新增内容会丢失。备份里没有的板块会自动保留，不确定请选「合并」。
        </p>
        <!-- 选完合并 / 覆盖后，该弹窗会先收起，进度在独立的「导入数据」弹窗展示 -->
        <div class="imp-modes">
          <button class="imp-btn" @click="doRestore('merge')">
            <b>合并到当前数据</b>
            <span>保留本浏览器当前数据，云端备份作为新条目加入；同名联系人、同源歌曲会自动归并到已有条目</span>
          </button>
          <button class="imp-btn danger" @click="askOverwriteRestore">
            <b>覆盖导入</b>
            <span>先删除本浏览器当前全部数据，再用云端备份替换，不可恢复</span>
          </button>
        </div>
      </template>
      <template #footer>
        <button class="mini-btn" @click="restoreOpen = false">取消</button>
      </template>
    </Modal>

    <!-- 导入数据：选完合并 / 覆盖后独立弹出的进度弹窗（与「从云端恢复」分离）。
         合并与覆盖都走这里，实时显示「正在导入 X」+ 进度条 + 百分比；出错时弹窗内显示错误。 -->
    <Modal :show="importOpen" title="导入数据" width="360px" @close="onImportClose">
      <div class="imp-progress">
        <!-- 出错 -->
        <template v-if="importErr">
          <div class="imp-prog-label err">{{ importErr }}</div>
          <p class="imp-err-tip">导入已中止，本机原有数据未受影响。可关闭后重试，或改用「本地导入」。</p>
        </template>
        <!-- 成功 -->
        <template v-else-if="progress.phase === 'done'">
          <div class="imp-prog-label ok">{{ progress.label || '导入完成 ✓' }}</div>
        </template>
        <!-- 进行中 -->
        <template v-else>
          <div class="imp-prog-label">{{ progress.label || '正在导入…' }}</div>
          <div class="imp-prog-bar" :class="{ indeterminate: importIndeterminate }">
            <span :style="{ width: importPercent + '%' }"></span>
          </div>
          <div class="imp-prog-count" v-if="!importIndeterminate">
            {{ progress.done }} / {{ progress.total }} 条（{{ importPercent }}%）
          </div>
          <div class="imp-prog-count" v-else>数据较多时可能需要几分钟，请保持应用在前台…</div>
        </template>
      </div>
      <template #footer>
        <button class="mini-btn" :disabled="importing" @click="importOpen = false">关闭</button>
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
import { getSettings, saveSettings, migrateImagesToOss, backupToOss, downloadOssBackup, importBackup, getOssSyncState, getDeviceLabel, markOssCloudSeen, listOssArchives, downloadOssArchive, archiveCurrentOssBackup } from '@/api/settings'
import { fmtBackupTime, backupTotalRows, backupFeatureSummary } from '@/utils/backupInfo'
import { prepareReload } from '@/local/db'
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
/* 独立的「导入数据」进度弹窗：选完合并 / 覆盖后弹出，与「从云端恢复」弹窗分离 */
const importOpen = ref(false)
const importErr = ref('')
/* 导入进度：{ phase, label, done, total }，由 importBackup 的 onProgress 回调实时填充，
   用于展示「正在导入 X」与进度条（避免导入中界面无反馈、不知是否在跑）。 */
const progress = ref({ phase: 'prepare', label: '', done: 0, total: 0 })
const importPercent = computed(() => {
  const p = progress.value
  if (!p.total) return 0
  return Math.min(100, Math.max(0, Math.round((p.done / p.total) * 100)))
})
/* 清理 / 保存阶段无总行数，进度条走不确定动画 */
const importIndeterminate = computed(() => {
  const p = progress.value
  return p.phase !== 'import' || !p.total
})
function onImportProgress(p) { progress.value = p }
/* 云端历史备份（archive）列表：进入页面自动拉一次 */
const archList = ref([])
const listing = ref(false)
const archTried = ref(false)
const archiving = ref(false)
/* 历史版本读取 / 存档失败只在这一块提示，不覆盖顶部上传、保存的状态文案 */
const archErr = ref('')
const prefixHint = computed(() => (form.prefix && form.prefix.trim()) ? form.prefix.trim() + '/backup/archive' : 'backup/archive')
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
/* 进入即尝试拉取云端历史备份列表（覆盖前自动留存的旧备份） */
refreshArchives().catch(() => {})
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

/* 显式上传本机数据到云端。
   云端有更新的数据（多半来自另一台设备）时先弹二次确认，用户点「覆盖云端」后
   在同一函数内重试（不递归：递归时外层 finally 会把 uploading 提前复位，
   上传还在飞按钮就恢复可点，且成功文案容易被后续状态覆盖）。
   覆盖成功要给一条不带歧义的「已更新云端数据」——只看按钮回到可点状态，
   用户判断不出到底传没传上去、覆盖成功没有。 */
async function doUpload(force = false) {
  let hard = force === true
  if (uploading.value) return
  uploading.value = true
  isErr.value = false
  msgOk.value = false
  msg.value = ''
  /* 本次是否属于「用户确认后覆盖别人的数据」——决定成功文案 */
  let overwrote = false
  try {
    for (;;) {
      try {
        const r = await backupToOss({ force: hard, archive: true })
        await loadSyncTime()
        await refreshSyncState()
        /* 上传后立刻刷新历史版本列表：以前不刷新，用户传完看到的还是
           「暂无历史备份」，以为这功能根本没生效 */
        await refreshArchives()
        msgOk.value = true
        const archTip = r.archived ? '（原备份已存为历史版本）' : ''
        msg.value = overwrote
          ? `已更新云端数据${archTip}`
          : `已上传本机数据到云端（约 ${Math.round((r.bytes || 0) / 1024)} KB）${archTip}`
        notify(overwrote ? '已更新云端数据' : '已上传本机数据到云端')
        return
      } catch (e) {
        /* 只在还没取得用户授权时才弹确认；已经确认过还报冲突说明云端又变了，
           再弹一次让用户重新决策，而不是拿旧授权直接覆盖 */
        if (e && e.code === 'OSS_CONFLICT' && !hard) {
          const ok = await confirmDialog({
            title: '云端已有更新的数据',
            text: `${e.message}\n\n覆盖前会先把云端现有备份另存为一份历史文件，确定继续吗？`,
            danger: true,
            okText: '覆盖云端'
          })
          if (!ok) return
          hard = true
          overwrote = true
          continue
        }
        throw e
      }
    }
  } catch (e) {
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

/* mode: 'merge' 合并 / 'overwrite' 覆盖。
   流程：先收起「从云端恢复」弹窗 → 弹出独立的「导入数据」进度弹窗 → 实时展示进度。
   导入后 api 层已 await flushNow() 确保写进 IndexedDB，这里才刷新页面。
   导入中途失败：错误显示在「导入数据」弹窗内（而非回到云端弹窗），且本机原数据因回滚未受影响。 */
async function doRestore(mode) {
  if (!restorePending.value || importing.value) return
  const pending = restorePending.value
  /* 先收起「从云端恢复」弹窗，再打开独立的「导入数据」进度弹窗 */
  restoreOpen.value = false
  importErr.value = ''
  importOpen.value = true
  importing.value = true
  progress.value = { phase: 'prepare', label: '正在准备数据…', done: 0, total: 0 }
  try {
    const r = await importBackup(pending, mode, onImportProgress)
    /* 本机已把云端这一版看进本地了 → 记下版本号，之后本机上传不会被误判冲突 */
    markOssCloudSeen().catch(() => {})
    const n = r && r.inserted ? Object.values(r.inserted).reduce((a, b) => a + b, 0) : null
    /* 显示「导入完成」短暂停顿，让用户明确看到成功，再刷新页面 */
    progress.value = { phase: 'done', label: '导入完成 ✓', done: 0, total: 0 }
    await new Promise((resolve) => setTimeout(resolve, 800))
    importOpen.value = false
    msgOk.value = true
    isErr.value = false
    msg.value = '恢复完成，正在刷新…'
    notify(`${r && r.text ? r.text : '已恢复云端数据'}${n != null ? `（共 ${n} 条）` : ''}`)
    /* 与本地导入一致：刷新前先关闭数据库连接、停掉 pagehide 的重复落盘，
       避免 refresh 后卡在启动界面（详见 db.js prepareReload）。 */
    await prepareReload()
    location.reload()
  } catch (e) {
    /* 错误留在「导入数据」弹窗内展示，本机原数据未受影响 */
    importErr.value = e && e.message ? e.message : '导入失败'
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

/* 导入中不允许关闭「导入数据」弹窗（避免误触打断导入）；出错 / 完成后才允许关闭 */
function onImportClose() {
  if (importing.value) return
  importOpen.value = false
}

/* 「从云端恢复」弹窗关闭（导入已开始则不允许关闭，由 doRestore 先收起了） */
function onRestoreClose() {
  restoreOpen.value = false
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

/* 拉取云端历史备份列表（archive 目录下的旧备份） */
async function refreshArchives() {
  if (listing.value) return
  listing.value = true
  archTried.value = true
  try {
    archList.value = await listOssArchives()
    archErr.value = ''
  } catch (e) {
    /* 列表读取失败只在这一块提示：以前会把顶部的上传成功文案改成红色报错，
       让用户误以为上传也失败了 */
    archErr.value = '读取历史版本失败：' + (e.message || '请检查网络 / AccessKey 权限 / 本机时间')
    archList.value = []
  } finally {
    listing.value = false
  }
}

/* 手动存档：把云端当前备份另存一份，不改动主备份。
   既让用户能主动留后悔药，也能立刻看到「历史版本」是怎么产生的 */
async function doArchive() {
  if (archiving.value) return
  archiving.value = true
  archErr.value = ''
  try {
    const made = await archiveCurrentOssBackup()
    notify('已为当前云端备份创建一份历史版本')
    await refreshArchives()
    /* 兜底：OSS 列举偶尔有短暂延迟（或列举权限受限）导致新存档没出现在列表里。
       直接把刚生成的这条插到最前，保证点完立刻能看到一条，不用再手动刷新。 */
    if (made && made.key && !archList.value.some((a) => a.key === made.key)) {
      archList.value = [{ key: made.key, size: made.size || 0, at: made.at || Date.now() }, ...archList.value]
    }
  } catch (e) {
    archErr.value = e && e.message ? e.message : '存档失败'
  } finally {
    archiving.value = false
  }
}

/* 点击某条历史备份：下载并打开恢复弹窗（合并 / 覆盖），复用现有导入流程 */
async function doRestoreArchive(a) {
  if (restoring.value || importing.value) return
  restoring.value = true
  isErr.value = false
  msgOk.value = false
  msg.value = '正在从云端下载历史备份…'
  try {
    restorePending.value = await downloadOssArchive(a.key)
    restoreOpen.value = true
    msg.value = ''
  } catch (e) {
    isErr.value = true
    msg.value = e.message || '下载失败'
  } finally {
    restoring.value = false
  }
}

/* 历史备份大小友好显示 */
function fmtKb(n) {
  if (!n) return ''
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(1) + ' MB'
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
.imp-warn { font-size: 12px; line-height: 1.6; color: #9a6a2a; background: rgba(197,164,126,.14); border-radius: 8px; padding: 8px 10px; margin: 0 0 10px; }
.imp-warn b { color: #8a5518; }
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

/* 导入进度：取代按钮区，显示「正在导入 X」+ 进度条 + 计数 */
.imp-progress { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.imp-prog-label { font-size: 14px; font-weight: 600; color: var(--text); text-align: center; }
.imp-prog-label.err { color: #c0576b; }
.imp-prog-label.ok { color: #3d9a6c; }
.imp-err-tip { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 0; text-align: center; }
.imp-prog-bar {
  position: relative; height: 8px; border-radius: 5px;
  background: var(--bg-soft); overflow: hidden; border: 1px solid var(--border);
}
.imp-prog-bar > span {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0;
  background: var(--accent); border-radius: 5px;
  transition: width 0.2s ease;
}
/* 清理 / 保存阶段无总行数：走不确定的流动动画，表示「在跑但不知百分比」 */
.imp-prog-bar.indeterminate > span {
  width: 35% !important; transition: none;
  animation: imp-indet 1.1s ease-in-out infinite;
}
@keyframes imp-indet {
  0% { left: -35%; }
  100% { left: 100%; }
}
.imp-prog-count { font-size: 12px; color: var(--text-soft); text-align: center; }

/* 云端历史备份区块：列出被覆盖前自动留存的旧备份，可下载找回 */
.hist-block {
  margin-top: 18px;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
.hist-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.hist-title { font-size: 14px; font-weight: 600; color: var(--text); }
.hist-refresh {
  border: 1px solid var(--border); background: var(--bg-soft);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; color: var(--text);
  cursor: pointer;
}
.hist-refresh:disabled { opacity: 0.5; cursor: default; }
.hist-list { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 0; }
.hist-item {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px;
}
.hist-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hist-at { font-size: 13px; color: var(--text); }
.hist-size { font-size: 11px; color: var(--text-soft); }
.hist-restore {
  flex: 0 0 auto; border: none; border-radius: 10px; padding: 8px 14px;
  background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
}
.hist-restore:disabled { opacity: 0.5; cursor: default; }
.hist-empty { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin: 12px 0 0; }
.hist-empty code, .hist-block .sub code { background: var(--bg-soft); padding: 1px 5px; border-radius: 5px; font-size: 11px; word-break: break-all; }
.hist-err { font-size: 12px; color: #c0576b; line-height: 1.6; margin: 10px 0 0; }

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
