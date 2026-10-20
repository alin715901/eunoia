/* 电子手账预设库：字体 / 底纸 / 贴纸 / 便利贴色
   纯数据模块，PhotoWallCanvas 与 WallElement 共用。
   注意：SVG data URL 统一交给 encodeURIComponent 编码，源串里不要预编码（如 url(#g) 保持原样）。 */

/* ── 字体（至少 3 款） ── */
export const FONTS = [
  { key: 'sans', name: '常规黑体', css: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { key: 'kai', name: '淡雅楷体', css: '"Kaiti SC", "STKaiti", "KaiTi", "KaiTi_GB2312", "楷体", serif' },
  { key: 'hand', name: '可爱手写体', css: '"Xingkai SC", "HanziPen SC", "Caveat", "Comic Sans MS", "Chalkboard SE", cursive' }
]

export function fontCss(key) {
  const f = FONTS.find((x) => x.key === key)
  return f ? f.css : FONTS[0].css
}

/* ── 底纸（背景） ──
   bg: CSS background 值；thumb: 宫格缩略图用的背景 */
export const PAPERS = [
  { key: 'cream', name: '米白', bg: '#faf6ec', thumb: '#faf6ec' },
  { key: 'morandi', name: '浅莫兰迪', bg: '#e9ece4', thumb: '#e9ece4' },
  {
    key: 'line',
    name: '横线纸',
    bg: 'repeating-linear-gradient(to bottom, #fdfcf7 0, #fdfcf7 25px, rgba(122,134,164,0.22) 25px, rgba(122,134,164,0.22) 26px)',
    thumb: 'repeating-linear-gradient(to bottom, #fdfcf7 0, #fdfcf7 7px, rgba(122,134,164,0.35) 7px, rgba(122,134,164,0.35) 8px)'
  },
  {
    key: 'grid',
    name: '网格纸',
    bg: 'repeating-linear-gradient(to bottom, rgba(122,134,164,0.18) 0, rgba(122,134,164,0.18) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(to right, rgba(122,134,164,0.18) 0, rgba(122,134,164,0.18) 1px, transparent 1px, transparent 24px), #fdfcf7',
    thumb: 'repeating-linear-gradient(to bottom, rgba(122,134,164,0.3) 0, rgba(122,134,164,0.3) 1px, transparent 1px, transparent 7px), repeating-linear-gradient(to right, rgba(122,134,164,0.3) 0, rgba(122,134,164,0.3) 1px, transparent 1px, transparent 7px), #fdfcf7'
  },
  {
    key: 'grad',
    name: '渐变色',
    bg: 'linear-gradient(160deg, #fdeef1 0%, #eef1fb 52%, #e6f4ec 100%)',
    thumb: 'linear-gradient(160deg, #fdeef1 0%, #eef1fb 52%, #e6f4ec 100%)'
  }
]

export function paperBg(key) {
  const p = PAPERS.find((x) => x.key === key)
  return p ? p.bg : PAPERS[0].bg
}

/* ── 便利贴配色 ── */
export const STICKY_COLORS = ['#fff3b0', '#ffd9e0', '#d7f0ff', '#ddf7d3', '#efe1ff', '#ffe9c9']

/* ── 内置贴纸分类 ── */
export const STICKER_CATEGORIES = [
  { name: '心情' },
  { name: '天气' },
  { name: '记号' },
  { name: '涂鸦' },
  { name: '植物' },
  { name: '动物' }
]

/* ── 内置贴纸（按分类组织的透明 PNG 观感 SVG data URL） ── */
function svgData(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

export const STICKERS = [
  /* 心情 */
  { name: 'heart', cat: '心情', data: svgData(`<path d="M12 21s-7-4.6-9.2-9C1.3 8.7 3 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3 0 4.7 3.2 3.2 6.5C19 16.4 12 21 12 21z" fill="#ff7a8a"/>`) },
  { name: 'smile', cat: '心情', data: svgData(`<circle cx="12" cy="12" r="9" fill="#ffd166"/><circle cx="9" cy="10" r="1.1" fill="#5a4a2a"/><circle cx="15" cy="10" r="1.1" fill="#5a4a2a"/><path d="M8.5 14a4.4 4.4 0 0 0 7 0" stroke="#5a4a2a" stroke-width="1" fill="none" stroke-linecap="round"/>`) },
  { name: 'cry', cat: '心情', data: svgData(`<circle cx="12" cy="12" r="9" fill="#a8cbe8"/><circle cx="9" cy="10.5" r="1.1" fill="#3a4a5a"/><circle cx="15" cy="10.5" r="1.1" fill="#3a4a5a"/><path d="M8.8 16a4.2 4.2 0 0 1 6.4 0" stroke="#3a4a5a" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M17 13.5c.9 1.6 1.4 2.6 1.4 3.3a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.7 1.4-3.3z" fill="#fff"/>`) },
  { name: 'star', cat: '心情', data: svgData(`<path d="M12 3l2.6 5.6 6 .7-4.4 4 1.3 6L12 16.6 6.5 19.3l1.3-6-4.4-4 6-.7z" fill="#f6c453"/>`) },
  { name: 'flower', cat: '心情', data: svgData(`<g fill="#c79be0"><circle cx="12" cy="7" r="3"/><circle cx="17" cy="12" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="7" cy="12" r="3"/></g><circle cx="12" cy="12" r="2.4" fill="#fff"/>`) },
  { name: 'sparkle', cat: '心情', data: svgData(`<path d="M12 2.5c.7 4.6 2.7 6.6 7.3 7.3-4.6.7-6.6 2.7-7.3 7.3-.7-4.6-2.7-6.6-7.3-7.3 4.6-.7 6.6-2.7 7.3-7.3z" fill="#ffd166"/><circle cx="19" cy="5" r="1.6" fill="#ffd166"/>`) },
  { name: 'bow', cat: '心情', data: svgData(`<path d="M12 8 5.5 4.8c-1.6-.9-3.2.8-2.6 2.5L4.6 12l-1.7 4.7c-.6 1.7 1 3.4 2.6 2.5L12 16z" fill="#ff9db0"/><path d="M12 8l6.5-3.2c1.6-.9 3.2.8 2.6 2.5L19.4 12l1.7 4.7c.6 1.7-1 3.4-2.6 2.5L12 16z" fill="#ff9db0"/><circle cx="12" cy="12" r="2.2" fill="#f27e95"/>`) },
  /* 天气 */
  { name: 'cloud', cat: '天气', data: svgData(`<path d="M6.5 17a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.6 9.6 3.8 3.8 0 0 1 17.5 17z" fill="rgba(255,255,255,0.9)" stroke="rgba(140,150,170,0.5)" stroke-width="0.7"/>`) },
  { name: 'sun', cat: '天气', data: svgData(`<circle cx="12" cy="12" r="4.6" fill="#ffcf6b"/><g stroke="#ffcf6b" stroke-width="1.4" stroke-linecap="round"><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/></g>`) },
  { name: 'moon', cat: '天气', data: svgData(`<path d="M20 14.6A8.4 8.4 0 1 1 9.4 4 8.4 8.4 0 0 0 20 14.6z" fill="#ffd98a"/><circle cx="17.5" cy="5.5" r="1.1" fill="#ffd98a"/>`) },
  { name: 'rainbow', cat: '天气', data: svgData(`<g fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M3.5 16a8.5 8.5 0 0 1 17 0" stroke="#ff8a8a"/><path d="M6.3 16a5.7 5.7 0 0 1 11.4 0" stroke="#ffc46b"/><path d="M9.1 16a2.9 2.9 0 0 1 5.8 0" stroke="#8ac6a0"/></g>`) },
  { name: 'rain', cat: '天气', data: svgData(`<path d="M6.5 13a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.6 5.6 3.8 3.8 0 0 1 17.5 13z" fill="rgba(255,255,255,0.9)" stroke="rgba(140,150,170,0.5)" stroke-width="0.7"/><g stroke="#7fb8d9" stroke-width="1.2" stroke-linecap="round"><path d="M8.5 15.5 7.5 18M12.5 15.5l-1 2.5M16.5 15.5l-1 2.5"/></g>`) },
  { name: 'snow', cat: '天气', data: svgData(`<g stroke="#9cc8e8" stroke-width="1.2" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2M4.2 7.5l2.7.4M4.2 7.5l.4-2.7M19.8 16.5l-2.7-.4M19.8 16.5l-.4 2.7M4.2 16.5l2.7-.4M4.2 16.5l.4 2.7M19.8 7.5l-2.7.4M19.8 7.5l-.4-2.7"/></g>`) },
  /* 记号 */
  { name: 'tape', cat: '记号', data: svgData(`<rect x="3" y="9" width="18" height="6" rx="1" transform="rotate(-18 12 12)" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.7)" stroke-width="0.6"/>`) },
  { name: 'tape-white', cat: '记号', data: svgData(`<rect x="2" y="8.5" width="20" height="7" rx="1" transform="rotate(-7 12 12)" fill="rgba(255,255,255,0.62)" stroke="rgba(160,150,140,0.55)" stroke-width="0.6"/>`) },
  { name: 'tape-vertical', cat: '记号', data: svgData(`<rect x="8.5" y="2" width="7" height="20" rx="1" transform="rotate(9 12 12)" fill="rgba(197,164,126,0.5)" stroke="rgba(150,120,80,0.65)" stroke-width="0.6"/>`) },
  { name: 'pin', cat: '记号', data: svgData(`<circle cx="12" cy="8" r="5" fill="#e2554f"/><path d="M12 13l-2.4 8 2.4-3 2.4 3z" fill="#b83b36"/><circle cx="10.4" cy="6.6" r="1.2" fill="rgba(255,255,255,0.55)"/>`) },
  { name: 'corner-tl', cat: '记号', data: svgData(`<path d="M3 3h13l-13 13z" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.6)" stroke-width="0.6"/>`) },
  { name: 'corner-br', cat: '记号', data: svgData(`<path d="M21 21H8l13-13z" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.6)" stroke-width="0.6"/>`) },
  { name: 'frame', cat: '记号', data: svgData(`<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="3" fill="none" stroke="rgba(120,110,95,0.75)" stroke-width="1.2"/><rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2" fill="none" stroke="rgba(120,110,95,0.35)" stroke-width="0.7" stroke-dasharray="2 1.6"/>`) },
  { name: 'bubble', cat: '记号', data: svgData(`<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v5A3.5 3.5 0 0 1 16.5 15H10l-4.2 3.4c-.5.4-1.3 0-1.3-.7z" fill="rgba(255,255,255,0.9)" stroke="rgba(140,150,170,0.6)" stroke-width="0.8"/><g fill="rgba(140,150,170,0.5)"><circle cx="9" cy="9" r="1"/><circle cx="12.5" cy="9" r="1"/><circle cx="16" cy="9" r="1"/></g>`) },
  /* 涂鸦 */
  { name: 'doodle-star', cat: '涂鸦', data: svgData(`<path d="M12 4l1.8 4.2 4.6.4-3.5 3 1 4.5L12 13.7 8.1 16.1l1-4.5-3.5-3 4.6-.4z" fill="none" stroke="#f0a24a" stroke-width="1.2" stroke-linejoin="round"/>`) },
  { name: 'doodle-circle', cat: '涂鸦', data: svgData(`<path d="M13.5 4.8c3.6.8 6 3.2 6 6.4 0 3.9-3.4 7-8 7-4.2 0-7-2.7-7-6.3 0-3.9 3.5-6.9 8.6-6.4 1.2.1 2.2.4 3 .8" fill="none" stroke="#e2554f" stroke-width="1.3" stroke-linecap="round"/>`) },
  { name: 'doodle-heart', cat: '涂鸦', data: svgData(`<path d="M12 21s-7-4.6-9.2-9C1.3 8.7 3 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3 0 4.7 3.2 3.2 6.5C19 16.4 12 21 12 21z" fill="none" stroke="#e2554f" stroke-width="1.2"/>`) },
  { name: 'doodle-arrow', cat: '涂鸦', data: svgData(`<path d="M4 18c2-6 7-10 14-10.5" fill="none" stroke="#7a86b8" stroke-width="1.3" stroke-linecap="round"/><path d="M14.5 4.5l3.8 2.8-4.4 1.8" fill="none" stroke="#7a86b8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`) },
  { name: 'doodle-wave', cat: '涂鸦', data: svgData(`<path d="M2.5 13c1.4-2.8 3.2-2.8 4.6 0s3.2 2.8 4.6 0 3.2-2.8 4.6 0 3.2 2.8 4.6 0" fill="none" stroke="#5aa8a0" stroke-width="1.3" stroke-linecap="round"/>`) },
  { name: 'music', cat: '涂鸦', data: svgData(`<path d="M9 17.5V6.5l8-2v11" fill="none" stroke="#8a7ac8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.2" fill="#8a7ac8"/><circle cx="15" cy="15.5" r="2.2" fill="#8a7ac8"/>`) },
  /* 植物 */
  { name: 'leaf', cat: '植物', data: svgData(`<path d="M20 4C10 4 4 9 4 16c0 1.6.4 3 1 4 1.5-6 6-9.5 12-10.5C14 9 10.5 11 8 15c6.5.5 10-2.5 12-11z" fill="#9ccb8f"/><path d="M5 20c1.5-5 5-8.5 9-11" stroke="rgba(90,130,80,0.6)" stroke-width="0.8" fill="none"/>`) },
  { name: 'flower5', cat: '植物', data: svgData(`<g fill="#ff9db0"><circle cx="12" cy="6.5" r="3"/><circle cx="17.2" cy="10.3" r="3"/><circle cx="15.2" cy="16.5" r="3"/><circle cx="8.8" cy="16.5" r="3"/><circle cx="6.8" cy="10.3" r="3"/></g><circle cx="12" cy="12" r="2.2" fill="#ffd166"/>`) },
  { name: 'tulip', cat: '植物', data: svgData(`<path d="M7 5c0 4 1.5 7 5 7s5-3 5-7c-1.6 1-2.6 1.5-3.3 1.5C13 5.5 12.6 4 12 3c-.6 1-1 2.5-1.7 3.5C9.6 6.5 8.6 6 7 5z" fill="#f27e95"/><path d="M12 12v8" stroke="#7aa86b" stroke-width="1.3" stroke-linecap="round"/><path d="M12 16c-2.4 0-3.6-1.2-4-2.6 2 0 3.4.8 4 2.6zM12 17.5c2.4 0 3.6-1.2 4-2.6-2 0-3.4.8-4 2.6z" fill="#9ccb8f"/>`) },
  { name: 'cactus', cat: '植物', data: svgData(`<rect x="10" y="7" width="4" height="13" rx="2" fill="#8fbf7f"/><path d="M6 13v-2a3 3 0 0 1 4-2.8M18 11V9a3 3 0 0 0-4-2.8" stroke="#8fbf7f" stroke-width="2.6" fill="none" stroke-linecap="round"/><rect x="8" y="19.5" width="8" height="2" rx="1" fill="#c98d5f"/>`) },
  { name: 'mushroom', cat: '植物', data: svgData(`<path d="M4 13a8 8 0 0 1 16 0z" fill="#e2554f"/><circle cx="8.5" cy="9.5" r="1.4" fill="#fff" opacity="0.85"/><circle cx="14.5" cy="8.5" r="1.1" fill="#fff" opacity="0.85"/><path d="M9 13h6l-.8 6.2a1.5 1.5 0 0 1-1.5 1.3h-1.4a1.5 1.5 0 0 1-1.5-1.3z" fill="#f6e8d8"/>`) },
  { name: 'sprout', cat: '植物', data: svgData(`<path d="M12 20v-7" stroke="#7aa86b" stroke-width="1.4" stroke-linecap="round"/><path d="M12 14c-5 0-6.5-3.5-6.5-6C9 8 12 9.5 12 14z" fill="#9ccb8f"/><path d="M12 13.5c5 0 6.5-3.5 6.5-6C15 7.5 12 9 12 13.5z" fill="#7fae6f"/>`) },
  /* 动物 */
  { name: 'bunny', cat: '动物', data: svgData(`<ellipse cx="7.5" cy="7" rx="2.2" ry="4.5" fill="#fff" stroke="#e8b4c8" stroke-width="0.8"/><ellipse cx="16.5" cy="7" rx="2.2" ry="4.5" fill="#fff" stroke="#e8b4c8" stroke-width="0.8"/><ellipse cx="7.5" cy="7.5" rx="1" ry="2.6" fill="#f9c8d8"/><ellipse cx="16.5" cy="7.5" rx="1" ry="2.6" fill="#f9c8d8"/><circle cx="12" cy="14" r="7" fill="#fff" stroke="#e8b4c8" stroke-width="0.8"/><circle cx="9.5" cy="13" r="0.9" fill="#5a4a4a"/><circle cx="14.5" cy="13" r="0.9" fill="#5a4a4a"/><path d="M11 16h2l-1 1.2z" fill="#f08898"/><path d="M10.5 18.2a2 2 0 0 0 3 0" stroke="#5a4a4a" stroke-width="0.7" fill="none" stroke-linecap="round"/>`) },
  { name: 'cat', cat: '动物', data: svgData(`<path d="M6.2 9.5 5.2 3.8l5.2 2.6zM17.8 9.5 18.8 3.8l-5.2 2.6z" fill="#b9b3ac"/><circle cx="12" cy="13.5" r="7.5" fill="#b9b3ac"/><circle cx="9.5" cy="12.5" r="0.9" fill="#3f3a36"/><circle cx="14.5" cy="12.5" r="0.9" fill="#3f3a36"/><path d="M10.9 15h2.2l-1.1 1.3z" fill="#f08898"/><path d="M9.3 17a3 3 0 0 0 5.4 0" stroke="#3f3a36" stroke-width="0.7" fill="none" stroke-linecap="round"/>`) },
  { name: 'bear', cat: '动物', data: svgData(`<circle cx="6.5" cy="6.5" r="3" fill="#a5714f"/><circle cx="17.5" cy="6.5" r="3" fill="#a5714f"/><circle cx="6.5" cy="6.5" r="1.4" fill="#e3c4a8"/><circle cx="17.5" cy="6.5" r="1.4" fill="#e3c4a8"/><circle cx="12" cy="13" r="7.5" fill="#a5714f"/><circle cx="9.5" cy="11.5" r="0.9" fill="#3f2e22"/><circle cx="14.5" cy="11.5" r="0.9" fill="#3f2e22"/><ellipse cx="12" cy="15.5" rx="2.6" ry="2" fill="#e3c4a8"/><path d="M12 14.4v1.6M10.8 17.2a1.6 1.6 0 0 0 2.4 0" stroke="#3f2e22" stroke-width="0.7" fill="none" stroke-linecap="round"/>`) },
  { name: 'paw', cat: '动物', data: svgData(`<ellipse cx="12" cy="15" rx="4.6" ry="3.8" fill="#d9a68a"/><circle cx="5.8" cy="10.5" r="2.2" fill="#d9a68a"/><circle cx="10" cy="7.5" r="2.3" fill="#d9a68a"/><circle cx="14" cy="7.5" r="2.3" fill="#d9a68a"/><circle cx="18.2" cy="10.5" r="2.2" fill="#d9a68a"/>`) },
  { name: 'fish', cat: '动物', data: svgData(`<path d="M7.5 12c2-3 5.5-4.4 8.8-3.8 2.4.4 4 2 4.7 3.8-.7 1.8-2.3 3.4-4.7 3.8-3.3.6-6.8-.8-8.8-3.8z" fill="#7fb8d9"/><path d="M8 12 3.5 8v8z" fill="#5a94b8"/><circle cx="17" cy="11" r="0.9" fill="#2c4a5e"/>`) },
  { name: 'butterfly', cat: '动物', data: svgData(`<ellipse cx="7.5" cy="9" rx="4" ry="5" fill="#c79be0" transform="rotate(-20 7.5 9)"/><ellipse cx="16.5" cy="9" rx="4" ry="5" fill="#c79be0" transform="rotate(20 16.5 9)"/><ellipse cx="8" cy="16" rx="3.2" ry="3.8" fill="#b183d1" transform="rotate(-15 8 16)"/><ellipse cx="16" cy="16" rx="3.2" ry="3.8" fill="#b183d1" transform="rotate(15 16 16)"/><rect x="11.2" y="6" width="1.6" height="12" rx="0.8" fill="#5a4a5e"/><path d="M11.5 6c-1-1.5-2.5-2-3.5-2M12.5 6c1-1.5 2.5-2 3.5-2" stroke="#5a4a5e" stroke-width="0.7" fill="none" stroke-linecap="round"/>`) }
]
