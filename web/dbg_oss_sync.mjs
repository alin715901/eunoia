/* 端到端验证「双浏览器 + 阿里云 OSS 同步」修复。
 *
 * 严格对齐用户反馈的场景：
 *   1) A 浏览器配置 OSS 并上传（云端 = A 的数据）
 *   2) B 浏览器配置 OSS → 绝不能自动把 B 的数据传上去（否则冲掉 A 的）
 *   3) B 手动点「上传本机数据到云端」→ 必须弹冲突确认，取消后云端不变
 *   4) A 再次上传 → 云端被 B 改过则冲突提示；force 后覆盖成功
 *   5) B 点「从云端恢复」→ 覆盖导入 → 刷新后 B 必须变成 A 的数据（落盘竞态验证）
 */
import { chromium } from 'playwright'

const DEV = 'http://127.0.0.1:5176'
const CFG = { accessKeyId: 'AK', accessKeySecret: 'SK', bucket: 'bkt', endpoint: 'oss-cn-hangzhou.aliyuncs.com', prefix: 'eunoia' }
const bucket = new Map()
const putLog = []
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PUT,DELETE,HEAD', 'access-control-allow-headers': '*' })

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] })

async function newDevice(tag) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } })
  await ctx.addInitScript(() => { localStorage.setItem('eunoia-notice-acked-v1', '1') })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [${tag} pageerror]`, String(e).slice(0, 200)))
  await page.route(/aliyuncs\.com/, async (route) => {
    const req = route.request()
    const key = decodeURIComponent(new URL(req.url()).pathname.replace(/^\//, ''))
    if (req.method() === 'PUT') {
      const body = req.postDataBuffer()
      bucket.set(key, body)
      putLog.push({ tag, key: key.replace(CFG.prefix + '/', ''), bytes: body.length })
      return route.fulfill({ status: 200, headers: cors(), body: '' })
    }
    if (req.method() === 'GET') {
      const b = bucket.get(key)
      if (!b) return route.fulfill({ status: 404, headers: { ...cors(), 'content-type': 'application/xml' }, body: '<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>' })
      return route.fulfill({ status: 200, headers: { ...cors(), 'content-type': 'application/json' }, body: b })
    }
    if (req.method() === 'DELETE') { bucket.delete(key); return route.fulfill({ status: 204, headers: cors(), body: '' }) }
    return route.fulfill({ status: 200, headers: cors(), body: '' })
  })
  await page.goto(DEV + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  return page
}

/* 造数据后立即强制落盘（否则页面跳转时数据还在内存里 → 丢） */
async function mark(page, name) {
  await page.evaluate(async (n) => {
    const { db, dbm } = window.__eunoia
    db.prepare('INSERT INTO contacts (kind,name,avatar,created_at) VALUES (?,?,?,?)').run('person', n, '', Date.now())
    await dbm.flushNow()
  }, name)
}
async function names(page) {
  return page.evaluate(async () => {
    const { db } = window.__eunoia
    return db.prepare("SELECT name FROM contacts WHERE name LIKE 'MARK_%' ORDER BY name").all().map((r) => r.name)
  })
}
async function setOss(page) {
  await page.evaluate(async (cfg) => {
    await window.__eunoia.api.saveSettings({ oss_config: cfg })
  }, CFG)
}
async function doUpload(page, force) {
  return page.evaluate(async (f) => {
    try { const r = await window.__eunoia.api.backupToOss(f ? { force: true } : {}); return 'ok rev=' + r.rev } catch (e) {
      return (e && e.code === 'OSS_CONFLICT' ? 'CONFLICT: ' : 'ERR: ') + e.message
    }
  }, !!force)
}
async function cloudState() {
  const body = bucket.get(CFG.prefix + '/backup/eunoia.json')
  if (!body) return { exists: false }
  const p = JSON.parse(body.toString())
  const metaBody = bucket.get(CFG.prefix + '/backup/eunoia.meta.json')
  const meta = metaBody ? JSON.parse(metaBody.toString()) : null
  return {
    marks: (p.tables.contacts || []).map((c) => c.name).filter((n) => String(n).startsWith('MARK_')),
    rev: meta ? meta.rev : null,
    metaDevice: meta ? meta.device_label : null
  }
}
let failures = 0
const check = (label, cond, detail) => {
  if (!cond) failures++
  console.log(`  ${cond ? '✅' : '❌'} ${label}${detail ? ' → ' + detail : ''}`)
}

console.log('=== 步骤1：A 浏览器配置 OSS 并上传 ===')
const A = await newDevice('A')
await mark(A, 'MARK_A_唯一')
await setOss(A)
console.log('  A 上传:', await doUpload(A))
console.log('  云端:', JSON.stringify(await cloudState()))
check('云端 = A 的数据', (await cloudState()).marks.join() === 'MARK_A_唯一')

console.log('\n=== 步骤2：B 浏览器配置 OSS（绝不能自动上传覆盖 A）===')
const B = await newDevice('B')
await mark(B, 'MARK_B_唯一')
await setOss(B)
await B.goto(DEV + '/settings/oss', { waitUntil: 'domcontentloaded' })
await B.waitForTimeout(3000)
const inputs = B.locator('input.field')
await inputs.nth(0).fill('bkt')
await inputs.nth(1).fill('AK')
await inputs.nth(2).fill('SK')
await inputs.nth(3).fill('eunoia')
const putBefore = putLog.length
await B.getByRole('button', { name: '保存并连接' }).click()
await B.waitForTimeout(2500)
check('保存配置后没有发生任何上传', putLog.length === putBefore, `新增 ${putLog.length - putBefore} 次`)
check('云端仍是 A 的数据', (await cloudState()).marks.join() === 'MARK_A_唯一', JSON.stringify((await cloudState()).marks))

console.log('\n=== 步骤3：B 手动点「上传本机数据到云端」→ 应弹冲突确认 ===')
console.log('  B 点击上传前的内部状态:', JSON.stringify(await B.evaluate(async () => {
  const st = await window.__eunoia.api.getOssSyncState()
  const s = await window.__eunoia.api.getSettings()
  return { localRev: st.localRev, cloudRev: st.cloudRev, cloudDevice: st.cloudDevice, deviceId: st.deviceId, hasCloud: st.hasCloud, conflict: st.conflict, oss_rev: s.oss_rev, oss_seen_rev: s.oss_seen_rev }
})))
await B.getByRole('button', { name: '上传本机数据到云端' }).click()
await B.waitForTimeout(2500)
const dlg = await B.evaluate(() => {
  const m = document.querySelector('.dlg-mask')
  return m ? m.innerText.replace(/\n+/g, ' | ').slice(0, 240) : '(无确认弹窗)'
})
console.log('  确认弹窗:', dlg)
check('弹出了冲突确认弹窗', dlg !== '(无确认弹窗)')
check('弹窗提示了云端数据的来源设备', /Chrome|Firefox|Safari|Edge|旧版本/.test(dlg))
check('确认前云端数据未被覆盖', (await cloudState()).marks.join() === 'MARK_A_唯一', JSON.stringify((await cloudState()).marks))
await B.locator('.dlg-mask button', { hasText: '取消' }).last().click()
await B.waitForTimeout(1500)
check('取消后云端仍是 A 的数据', (await cloudState()).marks.join() === 'MARK_A_唯一', JSON.stringify((await cloudState()).marks))

console.log('\n=== 步骤4：A 再次上传（同一台设备重复上传不应被拦）===')
const aPlain = await doUpload(A)
console.log('  A 直接上传:', aPlain)
check('A（同设备）重复上传不被拦', aPlain.startsWith('ok'), aPlain)
check('A 上传后云端 = A 的数据', (await cloudState()).marks.join() === 'MARK_A_唯一', JSON.stringify((await cloudState()).marks))

console.log('\n=== 步骤5：B 从云端恢复 → 覆盖导入 → 刷新后必须变成 A 的数据 ===')
await B.reload({ waitUntil: 'domcontentloaded' })
await B.waitForTimeout(3000)
await B.getByRole('button', { name: '从云端恢复数据到本浏览器' }).click()
await B.waitForTimeout(2500)
const preview = await B.evaluate(() => {
  const m = document.querySelector('.modal-mask')
  return m ? m.innerText.replace(/\n+/g, ' | ').slice(0, 160) : '(无弹窗)'
})
console.log('  预览:', preview)
await B.locator('.imp-btn.danger').click()
await B.waitForTimeout(1200)
await B.locator('.dlg-mask button', { hasText: '覆盖' }).last().click()
await B.waitForTimeout(5000)
const after = await names(B)
console.log('  刷新后 B 本地数据:', JSON.stringify(after))
check('B 的数据变成了 A 的（MARK_A_唯一）', after.length === 1 && after[0] === 'MARK_A_唯一', JSON.stringify(after))

console.log('\n=== 上传流水 ===')
for (const p of putLog) console.log(' ', JSON.stringify(p))
await browser.close()
console.log(failures === 0 ? '\n全部通过 ✅' : `\n有 ${failures} 项未通过 ❌`)
