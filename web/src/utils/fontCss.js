// 聊天字体自定义 CSS：把用户输入的 font- 相关声明解析成 style 对象
// 例："font-family: 'LXGW WenKai', serif; font-size: 15px" → { fontFamily: "...", fontSize: "15px" }
export function fontCssToStyle(css) {
  const out = {}
  if (!css) return out
  for (const decl of String(css).split(';')) {
    const i = decl.indexOf(':')
    if (i < 1) continue
    const prop = decl.slice(0, i).trim().toLowerCase()
    // 只放行字体相关属性，避免注入无关样式
    if (!/^(font-[a-z-]+|letter-spacing|line-height)$/.test(prop)) continue
    const val = decl.slice(i + 1).trim()
    if (!val || /url\s*\(|expression|javascript:/i.test(val)) continue
    const camel = prop.replace(/^-ms-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    out[camel] = val
  }
  return out
}
