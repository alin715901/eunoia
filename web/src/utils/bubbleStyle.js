// 聊天气泡样式：预设模板 + 默认值 + 解析工具（联系人设置页 / 气泡样式面板共用）

// 默认气泡：两侧同色淡雅绿（参考微信风格），小圆角，无小尾巴，默认大小
export const DEFAULT_BUBBLE = { my: '#d9e7c8', contact: '#d9e7c8', radius: 8, size: 68 }

// 预设模板：淡雅中国传统色配色（点一下直接套用）
export const BUBBLE_PRESETS = [
  { name: '天青', my: '#6a9fb5', contact: '#e8f1f4', radius: 10 },
  { name: '藕荷', my: '#b48aa4', contact: '#f4ecf1', radius: 12 },
  { name: '竹青', my: '#7f9f7a', contact: '#ebf2e6', radius: 10 },
  { name: '缃色', my: '#d9b382', contact: '#f7f0e0', radius: 12 },
  { name: '黛蓝', my: '#5f7a99', contact: '#e7edf3', radius: 10 },
  { name: '胭脂', my: '#c17a72', contact: '#f8e9e7', radius: 12 },
  // 新增：极简黑白（深色气泡自动配白字，浅色配深字）
  // 素白：我方与对方气泡同色（均为浅灰），整体素净统一
  { name: '素白', my: '#e9e9ef', contact: '#e9e9ef', radius: 10 },
  { name: '墨黑', my: '#2b2b30', contact: '#3a3a40', radius: 10 },
  // 新增：青瓷（深浅青绿，温润如瓷）
  { name: '青瓷', my: '#5e9b8f', contact: '#e3f1ec', radius: 12 }
]

// 解析数据库里的 bubble_style（可能是 JSON 字符串 / 对象 / 空）
export function parseBubbleStyle(raw) {
  let obj = {}
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw) } catch (e) { obj = {} }
  } else if (raw && typeof raw === 'object') {
    obj = raw
  }
  return {
    my: obj.my || DEFAULT_BUBBLE.my,
    contact: obj.contact || DEFAULT_BUBBLE.contact,
    radius: Number.isFinite(Number(obj.radius)) ? Number(obj.radius) : DEFAULT_BUBBLE.radius,
    size: Number.isFinite(Number(obj.size)) ? Number(obj.size) : DEFAULT_BUBBLE.size,
    css: typeof obj.css === 'string' ? obj.css : ''
  }
}

// 匹配预设名（设置页摘要展示用）；不匹配返回「自定义」
export function bubblePresetName(style) {
  const s = parseBubbleStyle(style)
  const hit = BUBBLE_PRESETS.find(
    (p) => p.my === s.my && p.contact === s.contact && p.radius === s.radius
  )
  return hit ? hit.name : '自定义'
}

// 把用户输入的 CSS 文本解析成 style 对象（每条 declaration 以 ; 分隔）
// 例："background: linear-gradient(90deg,#fee,#fee); color:#333; font-size:15px"
export function cssTextToStyle(css) {
  const out = {}
  if (!css) return out
  for (const decl of String(css).split(';')) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    const val = decl.slice(i + 1).trim()
    if (!prop || !val) continue
    // 简单加固：拦掉可疑值
    if (/url\s*\(|expression|javascript:/i.test(val)) continue
    if (!/^[a-z-]+$/i.test(prop)) continue
    const camel = prop.replace(/^-ms-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    out[camel] = val
  }
  return out
}
