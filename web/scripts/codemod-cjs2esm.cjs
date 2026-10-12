// 一次性 codemod：把从 server/src 复制过来的 CJS 文件转成浏览器可用的 ESM。
// 规则：
//   const X = require('REL')        → import * as X from 'REL'
//   const { A, B } = require(REL)   → import { A, B } from 'REL'
//   require('../db')                → import db from '../db'（本地 sql.js 门面，默认导出）
//   require('../config')            → import { ... } from '../config'（本地 config）
//   require('fs'/'path'/'crypto')   → import * as X from '../shims/X.js'
//   module.exports = { ... }        → export { ... }
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'src', 'local')

function mapSpecifier(spec, names) {
  // 解构导入（names 含逗号）一律转命名导入
  if (names.includes(',')) {
    if (spec === '../config') return { stmt: `import { ${names} } from '../config'` }
    return { stmt: `import { ${names} } from '${spec}'` }
  }
  if (spec === '../db') return { stmt: `import db from '../db'` }
  if (spec === '../config') return { stmt: `import { ${names} } from '../config'` }
  if (spec === 'fs') return { stmt: `import * as fs from '../shims/fs.js'` }
  if (spec === 'path') return { stmt: `import * as path from '../shims/path.js'` }
  if (spec === 'crypto') return { stmt: `import * as crypto from '../shims/crypto.js'` }
  return { stmt: `import * as ${names} from '${spec}'` }
}

let changed = 0
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) { walk(p); continue }
    if (!f.endsWith('.js')) continue
    let src = fs.readFileSync(p, 'utf8')
    const before = src

    src = src.replace(
      /^const \{ ([^}]+) \} = require\('([^']+)'\);$/gm,
      (m, names, spec) => mapSpecifier(spec, names).stmt
    )
    src = src.replace(
      /^const (\w+) = require\('([^']+)'\);$/gm,
      (m, name, spec) => mapSpecifier(spec, name).stmt
    )
    // module.exports 多行或单行对象 → export
    src = src.replace(/^module\.exports = \{$/gm, 'export {')
    src = src.replace(/^module\.exports = \{ ([^}]+) \};$/gm, 'export { $1 }')

    if (src !== before) {
      fs.writeFileSync(p, src)
      changed++
      console.log('transformed:', path.relative(DIR, p))
    }
  }
}
walk(DIR)
console.log(`done, ${changed} files`)
