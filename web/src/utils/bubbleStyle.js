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

/* ── 规则式自定义 CSS（selector { declaration } 形式） ──
   用户在设置页可能直接写完整 CSS 规则（如 .message-sent { … }），
   这里把常见类名别名映射到本站真实气泡类名后作为 <style> 注入，
   用户写的 !important 声明按层叠规则自然盖过预设颜色/圆角。 */

// 是否「规则式」CSS：含有 { … } 规则块即视为规则式
export function isRuleCss(text) {
  return /\{[^{}]*\}/.test(String(text || ''))
}

/* 选择器别名（用户常见写法 → 真实结构）：
   .message            双方气泡通用
   .message-sent       我的气泡
   .message-received   对方气泡
   （本站真实类名 .bubble / .bubble-me / .bubble-contact 也原样支持） */
function rewriteSelectors(css, sent, received, base) {
  return String(css || '')
    .replace(/\.message-sent\b/g, sent)
    .replace(/\.message-received\b/g, received)
    .replace(/\.message\b/g, base)
}

/* 变量别名：把用户可能写错的常见变量名接到本站主题变量上，
   例如 --accent-color → var(--accent)，--text-primary → var(--text) */
const VAR_ALIAS = [
  ['--accent-color', 'var(--accent, #c0956a)'],
  ['--text-primary', 'var(--text, #3a3a3a)'],
  ['--text-secondary', 'var(--text-soft, #8a8a8a)'],
  ['--bg-primary', 'var(--bg-screen, #ffffff)'],
  ['--bg-secondary', 'var(--bg-soft, #f2f2f2)']
]

// :root 变量别名块（聊天与预览注入都需要，保证 --accent-color 等名字开箱即用）
const VAR_ALIAS_BLOCK = `:root{${VAR_ALIAS.map(([k, v]) => `${k}:${v};`).join('')}}`

/* 把 CSS 里的 px 数值包一层 calc(… * var(--bubble-scale, 1))：
   「气泡大小」滑条通过 .msg-wrap 上的 --bubble-scale 缩放气泡，
   自定义 CSS 的写死 px 值（字号/内边距/边框/圆角）原本不跟着滑条变，
   包一层后滑条对自定义气泡同样生效（预览容器也会注入同名变量）。 */
function scalePxValues(css) {
  return String(css || '').replace(/(-?\d+(?:\.\d+)?)px/g, 'calc($1px * var(--bubble-scale, 1))')
}

// 图片/表情/红包等「无气泡底」卡片（.bubble.bare）排除在气泡规则外，
// 避免自定义边框/背景在卡片外面多套一层框
function excludeBare(selector) {
  const s = selector.trim()
  if (s === '.bubble' || s === '.bubble.bubble-me' || s === '.bubble.bubble-contact') {
    return s + ':not(.bare)'
  }
  return s
}

// 聊天内注入：别名 + :not(.bare) 排除 + 变量别名 + px 缩放
export function ruleCssForChat(css) {
  if (!isRuleCss(css)) return ''
  let text = rewriteSelectors(css, '.bubble.bubble-me', '.bubble.bubble-contact', '.bubble')
  // 对每条规则的选择器列表逐个处理（只处理不含后代/伪类的简单选择器）
  text = text.replace(/([^{}]+)\{([^{}]*)\}/g, (_m, sels, decls) => {
    const next = sels.split(',').map(excludeBare).join(',')
    return `${next}{${decls}}`
  })
  return VAR_ALIAS_BLOCK + scalePxValues(text)
}

// 预览注入：把气泡类名换成预览区类名（mock-bubble + mock-me / mock-contact）
export function ruleCssForPreview(css) {
  if (!isRuleCss(css)) return ''
  const text = rewriteSelectors(css, '.mock-bubble.mock-me', '.mock-bubble.mock-contact', '.mock-bubble')
  return VAR_ALIAS_BLOCK + scalePxValues(text)
}
