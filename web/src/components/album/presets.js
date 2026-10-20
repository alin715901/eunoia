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

/* ── 内置贴纸（透明 PNG 观感的 SVG data URL） ── */
function svgData(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

export const STICKERS = [
  { name: 'tape', data: svgData(`<rect x="3" y="9" width="18" height="6" rx="1" transform="rotate(-18 12 12)" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.7)" stroke-width="0.6"/>`) },
  { name: 'tape-white', data: svgData(`<rect x="2" y="8.5" width="20" height="7" rx="1" transform="rotate(-7 12 12)" fill="rgba(255,255,255,0.62)" stroke="rgba(160,150,140,0.55)" stroke-width="0.6"/>`) },
  { name: 'tape-vertical', data: svgData(`<rect x="8.5" y="2" width="7" height="20" rx="1" transform="rotate(9 12 12)" fill="rgba(197,164,126,0.5)" stroke="rgba(150,120,80,0.65)" stroke-width="0.6"/>`) },
  { name: 'pin', data: svgData(`<circle cx="12" cy="8" r="5" fill="#e2554f"/><path d="M12 13l-2.4 8 2.4-3 2.4 3z" fill="#b83b36"/><circle cx="10.4" cy="6.6" r="1.2" fill="rgba(255,255,255,0.55)"/>`) },
  { name: 'heart', data: svgData(`<path d="M12 21s-7-4.6-9.2-9C1.3 8.7 3 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3 0 4.7 3.2 3.2 6.5C19 16.4 12 21 12 21z" fill="#ff7a8a"/>`) },
  { name: 'star', data: svgData(`<path d="M12 3l2.6 5.6 6 .7-4.4 4 1.3 6L12 16.6 6.5 19.3l1.3-6-4.4-4 6-.7z" fill="#f6c453"/>`) },
  { name: 'flower', data: svgData(`<g fill="#c79be0"><circle cx="12" cy="7" r="3"/><circle cx="17" cy="12" r="3"/><circle cx="12" cy="17" r="3"/><circle cx="7" cy="12" r="3"/></g><circle cx="12" cy="12" r="2.4" fill="#fff"/>`) },
  { name: 'sparkle', data: svgData(`<path d="M12 2.5c.7 4.6 2.7 6.6 7.3 7.3-4.6.7-6.6 2.7-7.3 7.3-.7-4.6-2.7-6.6-7.3-7.3 4.6-.7 6.6-2.7 7.3-7.3z" fill="#ffd166"/><circle cx="19" cy="5" r="1.6" fill="#ffd166"/>`) },
  { name: 'cloud', data: svgData(`<path d="M6.5 17a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 16.6 9.6 3.8 3.8 0 0 1 17.5 17z" fill="rgba(255,255,255,0.85)" stroke="rgba(140,150,170,0.5)" stroke-width="0.7"/>`) },
  { name: 'sun', data: svgData(`<circle cx="12" cy="12" r="4.6" fill="#ffcf6b"/><g stroke="#ffcf6b" stroke-width="1.4" stroke-linecap="round"><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.2 5.2l1.8 1.8M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/></g>`) },
  { name: 'moon', data: svgData(`<path d="M20 14.6A8.4 8.4 0 1 1 9.4 4 8.4 8.4 0 0 0 20 14.6z" fill="#ffd98a"/><circle cx="17.5" cy="5.5" r="1.1" fill="#ffd98a"/>`) },
  { name: 'rainbow', data: svgData(`<g fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M3.5 16a8.5 8.5 0 0 1 17 0" stroke="#ff8a8a"/><path d="M6.3 16a5.7 5.7 0 0 1 11.4 0" stroke="#ffc46b"/><path d="M9.1 16a2.9 2.9 0 0 1 5.8 0" stroke="#8ac6a0"/></g>`) },
  { name: 'leaf', data: svgData(`<path d="M20 4C10 4 4 9 4 16c0 1.6.4 3 1 4 1.5-6 6-9.5 12-10.5C14 9 10.5 11 8 15c6.5.5 10-2.5 12-11z" fill="#9ccb8f"/><path d="M5 20c1.5-5 5-8.5 9-11" stroke="rgba(90,130,80,0.6)" stroke-width="0.8" fill="none"/>`) },
  { name: 'bubble', data: svgData(`<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v5A3.5 3.5 0 0 1 16.5 15H10l-4.2 3.4c-.5.4-1.3 0-1.3-.7z" fill="rgba(255,255,255,0.9)" stroke="rgba(140,150,170,0.6)" stroke-width="0.8"/><g fill="rgba(140,150,170,0.5)"><circle cx="9" cy="9" r="1"/><circle cx="12.5" cy="9" r="1"/><circle cx="16" cy="9" r="1"/></g>`) },
  { name: 'corner-tl', data: svgData(`<path d="M3 3h13l-13 13z" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.6)" stroke-width="0.6"/>`) },
  { name: 'corner-br', data: svgData(`<path d="M21 21H8l13-13z" fill="rgba(197,164,126,0.55)" stroke="rgba(150,120,80,0.6)" stroke-width="0.6"/>`) },
  { name: 'frame', data: svgData(`<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="3" fill="none" stroke="rgba(120,110,95,0.75)" stroke-width="1.2"/><rect x="4.6" y="4.6" width="14.8" height="14.8" rx="2" fill="none" stroke="rgba(120,110,95,0.35)" stroke-width="0.7" stroke-dasharray="2 1.6"/>`) },
  { name: 'bow', data: svgData(`<path d="M12 8 5.5 4.8c-1.6-.9-3.2.8-2.6 2.5L4.6 12l-1.7 4.7c-.6 1.7 1 3.4 2.6 2.5L12 16z" fill="#ff9db0"/><path d="M12 8l6.5-3.2c1.6-.9 3.2.8 2.6 2.5L19.4 12l1.7 4.7c.6 1.7-1 3.4-2.6 2.5L12 16z" fill="#ff9db0"/><circle cx="12" cy="12" r="2.2" fill="#f27e95"/>`) },
  { name: 'cake', data: svgData(`<path d="M5 20h14v-5.5a7 7 0 0 0-14 0z" fill="#ffd9e0"/><path d="M5 14.5c2.2 1.2 4.4 1.2 6.6 0s4.4-1.2 6.6 0" stroke="rgba(230,150,165,0.7)" stroke-width="0.9" fill="none"/><path d="M12 3.5v4M10.4 4.6 12 3l1.6 1.6" stroke="#8ac6a0" stroke-width="1.2" fill="none" stroke-linecap="round"/>`) }
]
