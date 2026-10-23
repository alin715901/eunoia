/* 电子手账预设库：字体 / 底纸 / 贴纸 / 便利贴色
   纯数据模块，PhotoWallCanvas 与 WallElement 共用。
   注意：SVG data URL 统一交给 encodeURIComponent 编码，源串里不要预编码（如 url(#g) 保持原样）。 */

/* ── 字体：中文 / 英文 / 日韩 三类（条目与顺序按参考面板提取；sample 为宫格预览样张，
   每款映射到最接近的可用字体栈 —— 系统字体 + Google Fonts webfont，w 为该字体固有权重。
   webfont 由 ensureGoogleFonts() 在首次打开文字面板时按需注入，不拖慢首屏） ── */
export const FONT_CATS = [
  { key: 'zh', name: '中文' },
  { key: 'en', name: '英文' },
  { key: 'jk', name: '日韩' }
]

export const FONTS = [
  /* ── 中文 ── */
  { key: 'sans', cat: 'zh', name: '系统默认', sample: '测试', css: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' },
  { key: 'zh-yunchen', cat: 'zh', name: '点字云辰', sample: '测试', css: '"ZCOOL KuaiLe", "Comic Sans MS", cursive' },
  { key: 'zh-shanghei', cat: 'zh', name: '点字尚黑', sample: '测试', w: 900, css: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif' },
  { key: 'zh-maobi', cat: 'zh', name: '鸿雷拙书简体', sample: '测试', css: '"Zhi Mang Xing", "Kaiti SC", "STKaiti", cursive' },
  { key: 'zh-boldsong', cat: 'zh', name: '点字永胜粗宋', sample: '测试', w: 900, css: '"Noto Serif SC", "Songti SC", "SimSun", serif' },
  { key: 'zh-guoguo', cat: 'zh', name: '字由果果体', sample: '测试', css: '"ZCOOL QingKe HuangYou", "Noto Sans SC", sans-serif' },
  { key: 'zh-bangbang', cat: 'zh', name: '优设字由棒棒体', sample: '测试', w: 700, css: '"Noto Sans SC", "PingFang SC", sans-serif' },
  { key: 'zh-manman', cat: 'zh', name: '点字漫漫体', sample: '测试', css: '"Long Cang", cursive' },
  { key: 'zh-yunshu', cat: 'zh', name: '云舒体', sample: '测试', css: '"ZCOOL XiaoWei", "Kaiti SC", serif' },
  { key: 'zh-xiaowei', cat: 'zh', name: '霞鹜文楷-Bold', sample: '测试', w: 700, css: '"LXGW WenKai TC", "Kaiti SC", "STKaiti", "KaiTi", serif' },
  { key: 'zh-suiyi', cat: 'zh', name: '字由随意', sample: '测试', css: '"Liu Jian Mao Cao", cursive' },
  { key: 'zh-fulu', cat: 'zh', name: '福芦大毛笔体', sample: '测试', css: '"Ma Shan Zheng", "Zhi Mang Xing", cursive' },

  /* ── 英文 ── */
  { key: 'en-kallem', cat: 'en', name: 'Kallem', sample: 'Test', w: 600, css: '"Caveat", "Segoe Script", cursive' },
  { key: 'en-sacramento', cat: 'en', name: 'Sacramento', sample: 'Test', css: '"Sacramento", cursive' },
  { key: 'en-royalia', cat: 'en', name: 'Royalia', sample: 'Test', w: 600, css: '"Playfair Display", "Didot", "Times New Roman", serif' },
  { key: 'en-schoolbell', cat: 'en', name: 'Schoolbell', sample: 'Test', css: '"Schoolbell", "Comic Sans MS", cursive' },
  { key: 'en-stronger', cat: 'en', name: 'The Stronger', sample: 'Test', css: '"Shadows Into Light", "Segoe Print", cursive' },
  { key: 'en-gamahand', cat: 'en', name: 'GamaHand', sample: 'Test', css: '"Gochi Hand", "Comic Sans MS", cursive' },
  { key: 'en-corben', cat: 'en', name: 'Corben', sample: 'Test', w: 700, css: '"Corben", Georgia, serif' },
  { key: 'en-alexbrush', cat: 'en', name: 'AlexBrush', sample: 'Test', css: '"Alex Brush", cursive' },
  { key: 'en-afterzero', cat: 'en', name: 'AfterZero', sample: 'Test', css: '"Yellowtail", cursive' },
  { key: 'en-zapfino', cat: 'en', name: 'Zapfino', sample: 'Test', css: '"Great Vibes", "Snell Roundhand", cursive' },
  { key: 'en-futura', cat: 'en', name: 'Futura', sample: 'Test', w: 500, css: 'Futura, "Jost", "Century Gothic", "Trebuchet MS", sans-serif' },
  { key: 'en-courier', cat: 'en', name: 'CourierNew', sample: 'Test', css: '"Courier Prime", "Courier New", Courier, monospace' },
  { key: 'en-times', cat: 'en', name: 'TimesNewRoman', sample: 'Test', css: '"Tinos", "Times New Roman", Times, serif' },
  { key: 'en-trebuchet', cat: 'en', name: 'TrebuchetMS', sample: 'Test', css: '"Trebuchet MS", Trebuchet, sans-serif' },
  { key: 'en-rolesoft', cat: 'en', name: 'Role Soft', sample: 'Test', w: 600, css: '"Quicksand", "Comfortaa", sans-serif' },
  { key: 'en-courgette', cat: 'en', name: 'Courgette-Re', sample: 'Test', css: '"Courgette", cursive' },
  { key: 'en-aperitif', cat: 'en', name: 'French Aperitif', sample: 'Test', css: '"Italianno", cursive' },
  { key: 'zh-songtc', cat: 'en', name: '全字库正宋体', sample: 'Test', w: 600, css: '"Noto Serif SC", "Songti SC", "SimSun", serif' },
  { key: 'en-flanogant', cat: 'en', name: 'Flanogant-Cle', sample: 'Test', css: '"Pinyon Script", cursive' },
  { key: 'en-routine', cat: 'en', name: 'Routine Oldnig', sample: 'Test', css: '"Rozha One", Georgia, serif' },
  { key: 'en-office', cat: 'en', name: 'Office-Typewri', sample: 'Test', css: '"Special Elite", "Courier New", monospace' },
  { key: 'en-bonanova', cat: 'en', name: 'BonaNova-Re', sample: 'Test', css: '"Bona Nova", "Times New Roman", serif' },
  { key: 'en-meiescript', cat: 'en', name: 'MeieScript-Re', sample: 'Test', css: '"Meie Script", cursive' },
  { key: 'en-cormorant', cat: 'en', name: 'CormorantGar', sample: 'Test', w: 600, css: '"Cormorant Garamond", Garamond, serif' },
  { key: 'en-monsieur', cat: 'en', name: 'MonsieurLaDo', sample: 'Test', css: '"Monsieur La Doulaise", cursive' },

  /* ── 日韩 ── */
  { key: 'jk-barunpen', cat: 'jk', name: '너눔바른펜 일반', sample: '테스트', css: '"Nanum Pen Script", cursive' },
  { key: 'jk-higemoji', cat: 'jk', name: 'ひげ文字 (Hige)', sample: 'テスト', css: '"Hachi Maru Pop", cursive' },
  { key: 'jk-a1hei', cat: 'jk', name: 'A1黒體 繁體字', sample: 'テスト', w: 900, css: '"Noto Sans TC", "Noto Sans JP", sans-serif' },
  { key: 'jk-hazetoppo', cat: 'jk', name: 'はぜトッポ (Ha)', sample: 'テスト', css: '"Mochiy Pop One", "Noto Sans JP", sans-serif' },
  { key: 'jk-suiryu', cat: 'jk', name: '翠流デコロマン', sample: 'テスト', css: '"Rampart One", "Noto Sans JP", cursive' },
  { key: 'jk-mikaze', cat: 'jk', name: '美風 (Mikaze)', sample: 'テスト', css: '"Sawarabi Mincho", "Hiragino Mincho ProN", serif' },
  { key: 'jk-imaryu', cat: 'jk', name: 'いまりゅう (Im)', sample: 'テスト', css: '"Yomogi", "Noto Sans JP", cursive' },
  { key: 'jk-hotteri', cat: 'jk', name: 'ほってり L (Pot)', sample: 'テスト', css: '"Kiwi Maru", "Noto Sans JP", serif' },
  { key: 'jk-shiofune', cat: 'jk', name: '汐舟 (Shiofune)', sample: 'テスト', css: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif' },
  { key: 'jk-harukaze', cat: 'jk', name: 'TT-PHarukaze', sample: 'テスト', css: '"Zen Kurenaido", "Noto Sans JP", sans-serif' },
  { key: 'jk-lineseed', cat: 'jk', name: 'LINESeedJP_T', sample: 'テスト', css: '"Noto Sans JP", "Hiragino Sans", sans-serif' },
  { key: 'jk-dahfont', cat: 'jk', name: 'Dah_Font', sample: '테스트', css: '"Jua", "Noto Sans KR", cursive' },
  { key: 'jk-galmuri11', cat: 'jk', name: 'Galmuri 11-Re', sample: '테스트', css: '"DotGothic16", "Hi Melody", monospace' },
  { key: 'jk-galmuri7', cat: 'jk', name: 'Galmuri 7-Reg', sample: '테스트', css: '"Hi Melody", "Noto Sans KR", cursive' },
  /* 朝鲜日报体 Chosun 系列（明朝体 / 粗黑 / 圆体等风格变体） */
  { key: 'jk-chosunsm', cat: 'jk', name: 'ChosunSm', sample: '테스트', css: '"Noto Serif KR", "Songti SC", serif' },
  { key: 'jk-chosunsg', cat: 'jk', name: 'ChosunSg', sample: '테스트', css: '"Song Myung", "Noto Serif KR", serif' },
  { key: 'jk-chosunnm', cat: 'jk', name: 'ChosunNm', sample: '테스트', css: '"Nanum Myeongjo", "Noto Serif KR", serif' },
  { key: 'jk-chosunlo', cat: 'jk', name: 'ChosunLo', sample: '테스트', css: '"Gowun Batang", "Noto Serif KR", serif' },
  { key: 'jk-chosunkm', cat: 'jk', name: 'ChosunKm', sample: '테스트', w: 600, css: '"Hahmlet", "Noto Serif KR", serif' },
  { key: 'jk-chosunkg', cat: 'jk', name: 'ChosunKg', sample: '테스트', css: '"Gowun Dodum", "Noto Sans KR", sans-serif' },
  { key: 'jk-chosungu', cat: 'jk', name: 'ChosunGu', sample: '테스트', css: '"Gugi", "Noto Sans KR", sans-serif' },
  { key: 'jk-chosungs', cat: 'jk', name: 'ChosunGs', sample: '테스트', w: 500, css: '"IBM Plex Sans KR", "Noto Sans KR", sans-serif' },
  { key: 'jk-chosunbg', cat: 'jk', name: 'ChosunBg', sample: '테스트', w: 900, css: '"Black Han Sans", "Noto Sans KR", sans-serif' },
  /* IdeaFonts 手写系列 */
  { key: 'jk-ideayou', cat: 'jk', name: 'IdeaFonts You', sample: '테스트', css: '"Gamja Flower", "Nanum Pen Script", cursive' },
  { key: 'jk-ideasha', cat: 'jk', name: 'IdeaFonts Sha', sample: '테스트', css: '"Hi Melody", "Gamja Flower", cursive' },
  { key: 'jk-ideasas', cat: 'jk', name: 'IdeaFonts SaS', sample: '테스트', css: '"Nanum Brush Script", "Hi Melody", cursive' },
  /* 日文补充 */
  { key: 'jk-delagothic', cat: 'jk', name: '日式超粗 DelaGothic', sample: 'テスト', w: 900, css: '"Dela Gothic One", "Noto Sans JP", sans-serif' },
  { key: 'jk-kiraboshi', cat: 'jk', name: '翠流Kiraboshi', sample: 'テスト', css: '"Kaisei Decol", "Sawarabi Mincho", serif' },
  { key: 'jk-puhupicnic', cat: 'jk', name: 'Puhu Picnic', sample: 'テスト', css: '"Mochiy Pop P One", "Mochiy Pop One", sans-serif' },
  { key: 'jk-puhuholiday', cat: 'jk', name: 'Puhu Holiday', sample: 'テスト', css: '"Slackside One", "Zen Kurenaido", cursive' }
]

/* 分类取字体（保持定义顺序） */
export function fontsOf(cat) {
  return FONTS.filter((f) => f.cat === cat)
}

export function fontCss(key) {
  const f = FONTS.find((x) => x.key === key)
  return f ? f.css : FONTS[0].css
}

/* 字体固有权重（尚黑/粗宋/文楷 Bold 等映射到 700/900 的 webfont；未标注按 400） */
export function fontWeight(key) {
  const f = FONTS.find((x) => x.key === key)
  return (f && f.w) || 400
}

/* Google Fonts webfont 按需注入：首次打开文字面板时调用一次。
   中日韩字体按 unicode-range 分片，只有实际用到的字符分片才会下载 */
let googleFontsLoaded = false
export function ensureGoogleFonts() {
  if (googleFontsLoaded || typeof document === 'undefined') return
  googleFontsLoaded = true
  const families = [    /* 中文 */
    'ZCOOL+KuaiLe', 'Noto+Sans+SC:wght@700;900', 'Zhi+Mang+Xing',
    'Noto+Serif+SC:wght@600;900', 'ZCOOL+QingKe+HuangYou', 'Ma+Shan+Zheng',
    'Long+Cang', 'ZCOOL+XiaoWei', 'LXGW+WenKai+TC:wght@400;700', 'Liu+Jian+Mao+Cao',
    'Caveat:wght@500',
    /* 英文 */
    'Caveat:wght@600', 'Sacramento', 'Playfair+Display:wght@600', 'Schoolbell',
    'Shadows+Into+Light', 'Gochi+Hand', 'Corben:wght@700', 'Alex+Brush',
    'Yellowtail', 'Great+Vibes', 'Jost:wght@500', 'Courier+Prime', 'Tinos',
    'Quicksand:wght@600', 'Courgette', 'Italianno', 'Pinyon+Script',
    'Rozha+One', 'Special+Elite', 'Bona+Nova', 'Meie+Script',
    'Cormorant+Garamond:wght@600', 'Monsieur+La+Doulaise',
    /* 日韩 */
    'Nanum+Pen+Script', 'Hachi+Maru+Pop', 'Noto+Sans+TC:wght@900',
    'Mochiy+Pop+One', 'Rampart+One', 'Sawarabi+Mincho', 'Yomogi', 'Kiwi+Maru',
    'Zen+Maru+Gothic:wght@500', 'Zen+Kurenaido', 'Noto+Sans+JP', 'Jua',
    'DotGothic16', 'Hi+Melody',
    /* 日韩 · 新增（Chosun 系列 / IdeaFonts 系列 / 日文补充） */
    'Noto+Serif+KR:wght@400;600', 'Song+Myung', 'Nanum+Myeongjo:wght@700',
    'Gowun+Batang', 'Hahmlet:wght@600', 'Gowun+Dodum', 'Gugi',
    'IBM+Plex+Sans+KR:wght@500', 'Black+Han+Sans',
    'Gamja+Flower', 'Nanum+Brush+Script',
    'Dela+Gothic+One', 'Kaisei+Decol', 'Mochiy+Pop+P+One', 'Slackside+One'
  ]
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?' + families.map((f) => 'family=' + f).join('&') + '&display=swap'
  document.head.appendChild(link)
}

/* 预热墙上文字元素实际用到的 webfont。
   为什么需要：Google Fonts 的 CSS 按需注入 + display=swap，意味着文字元素
   挂载后浏览器才开始下载对应字体文件——用户看到的就是「先用 fallback 渲染，
   等一下才跳变成目标字体」。进装饰态时主动对墙上每个字体调用
   document.fonts.load()，把该字体 + 元素自身字符（unicode-range 分片）
   的下载提前到用户点文字之前，点击时字体已然就绪。 */
export function warmWallFonts(els) {
  if (typeof document === 'undefined' || !document.fonts || !Array.isArray(els)) return
  const seen = new Set()
  for (const el of els) {
    if (!el || el.type !== 'text' || !el.font) continue
    const stack = fontCss(el.font)
    const primary = String(stack).split(',')[0].trim().replace(/^["']+|["']+$/g, '')
    if (!primary || seen.has(primary)) continue
    seen.add(primary)
    const w = Number(el.font_weight) || fontWeight(el.font) || 400
    const sample = String(el.content || '测试').slice(0, 64)
    try {
      document.fonts.load(`${w > 400 ? w + ' ' : ''}16px "${primary}"`, sample).catch(() => {})
    } catch (_) { /* 系统字体栈会立即 resolve/reject，忽略 */ }
  }
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

/* ── 便利贴配色（保留给旧数据兼容：sticky:#fff3b0 等仍指向对应纸面） ── */
export const STICKY_COLORS = ['#fff3b0', '#ffd9e0', '#d7f0ff', '#ddf7d3', '#efe1ff', '#ffe9c9']

/* ── 手账便签纸：16 款纸面（横线/方格/虚线框/碎花/双框/撕边，外加波点/格纹/爱心/星星/
   波浪/斜纹/双虚框/信封/云朵/角花；都带胶带或纸纹，避免纯色块的死板感）。参考手账风便签图。
   viewBox 100×100 + preserveAspectRatio=none，任意长宽都整张铺满（线条随手势拉伸，符合纸质观感）。 ── */
function noteData(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" preserveAspectRatio="none">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}
/* 顶部/角落的和纸胶带：半透明斜贴小条 */
function tape(x, w, rot, fill) {
  return `<rect x="${x}" y="-2.5" width="${w}" height="8" rx="1" fill="${fill}" opacity="0.85" transform="rotate(${rot} ${x + w / 2} 1.5)"/>`
}
/* 手写横线 */
function noteLines(color, y0, gap) {
  let p = ''
  for (let y = y0; y <= 94; y += gap) p += `<line x1="7" y1="${y}" x2="93" y2="${y}" stroke="${color}" stroke-width="1"/>`
  return p
}
/* 方格 */
function noteGrid(color, gap) {
  let p = ''
  for (let i = gap; i < 100; i += gap) {
    p += `<line x1="${i}" y1="0" x2="${i}" y2="100" stroke="${color}" stroke-width="0.8"/>`
    p += `<line x1="0" y1="${i}" x2="100" y2="${i}" stroke="${color}" stroke-width="0.8"/>`
  }
  return p
}
/* 撕纸毛边（顶部锯齿白边，确定性伪随机抖动） */
function tornTop(fill) {
  let d = 'M0 0 H100 V4.5'
  for (let x = 100; x >= 0; x -= 5) d += ` L${x} ${(4.5 + 3.5 * Math.abs(Math.sin(x * 1.7))).toFixed(1)}`
  return `<path d="${d} Z" fill="${fill}"/>`
}
/* 碎花（五瓣小白花散布） */
function noteFlowers() {
  const at = [[16, 22], [52, 14], [84, 30], [30, 56], [68, 62], [14, 84], [50, 88], [88, 82]]
  let p = ''
  for (const [cx, cy] of at) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2
      p += `<circle cx="${(cx + 3.4 * Math.cos(a)).toFixed(1)}" cy="${(cy + 3.4 * Math.sin(a)).toFixed(1)}" r="2.3" fill="rgba(255,255,255,0.9)"/>`
    }
    p += `<circle cx="${cx}" cy="${cy}" r="1.8" fill="rgba(255,224,130,0.9)"/>`
  }
  return p
}
/* 波点 */
function noteDots(color, gap, r) {
  let p = ''
  let row = 0
  for (let y = gap; y < 100; y += gap) {
    const off = row % 2 ? gap / 2 : 0
    for (let x = gap + off; x < 100; x += gap) p += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`
    row++
  }
  return p
}
/* 格纹（双向半透明条纹叠出交叉深色，像棉布格纹） */
function noteGingham(color) {
  const step = 12
  let p = ''
  for (let i = 0; i < 100; i += step) {
    p += `<rect x="${i}" y="0" width="${step / 2}" height="100" fill="${color}" opacity="0.4"/>`
    p += `<rect x="0" y="${i}" width="100" height="${step / 2}" fill="${color}" opacity="0.4"/>`
  }
  return p
}
/* 小爱心散布 */
function noteHearts(color) {
  const at = [[18, 20], [54, 15], [84, 34], [28, 52], [66, 60], [16, 84], [52, 90], [86, 82]]
  let p = ''
  for (const [cx, cy] of at) {
    const s = 3.6
    p += `<path d="M${cx} ${(cy + s * 0.7).toFixed(1)} C ${(cx - s).toFixed(1)} ${(cy - s * 0.3).toFixed(1)}, ${(cx - s * 0.7).toFixed(1)} ${(cy - s).toFixed(1)}, ${cx} ${(cy - s * 0.3).toFixed(1)} C ${(cx + s * 0.7).toFixed(1)} ${(cy - s).toFixed(1)}, ${(cx + s).toFixed(1)} ${(cy - s * 0.3).toFixed(1)}, ${cx} ${(cy + s * 0.7).toFixed(1)} Z" fill="${color}" opacity="0.85"/>`
  }
  return p
}
/* 四角星小涂鸦散布 */
function noteStars(color) {
  const at = [[18, 18], [52, 14], [84, 30], [28, 54], [66, 62], [16, 84], [50, 88], [86, 80]]
  let p = ''
  for (const [cx, cy] of at) {
    p += `<path d="M${cx} ${cy - 4} L${cx + 1} ${cy - 1} L${cx + 4} ${cy} L${cx + 1} ${cy + 1} L${cx} ${cy + 4} L${cx - 1} ${cy + 1} L${cx - 4} ${cy} L${cx - 1} ${cy - 1} Z" fill="${color}" opacity="0.8"/>`
  }
  return p
}
/* 波浪横线 */
function noteWaves(color, y0, gap) {
  let p = ''
  for (let y = y0; y <= 94; y += gap) p += `<path d="M7 ${y} q 10 -4 21 0 t 21 0 t 21 0 t 21 0" fill="none" stroke="${color}" stroke-width="1"/>`
  return p
}
/* 斜纹 */
function noteStripes(color, gap) {
  let p = ''
  for (let i = -100; i < 200; i += gap) p += `<line x1="${i}" y1="0" x2="${i + 100}" y2="100" stroke="${color}" stroke-width="3"/>`
  return p
}
/* 角花：左上角一片小枝叶 + 花苞 */
function noteCorner() {
  return `<path d="M4 4 C20 6 30 16 34 32" fill="none" stroke="rgba(150,190,130,0.7)" stroke-width="1.2"/>` +
    `<path d="M12 10c3-3 7-2 8 1-3 2-7 1-8-1z" fill="rgba(170,205,150,0.85)"/>` +
    `<path d="M22 20c3-3 7-2 8 1-3 2-7 1-8-1z" fill="rgba(170,205,150,0.85)"/>` +
    `<circle cx="30" cy="28" r="2.4" fill="rgba(245,200,120,0.9)"/>`
}
/* 信封：上下折线 + 四边圆角框 */
function noteEnvelope(color) {
  return `<rect x="6" y="8" width="88" height="84" rx="3" fill="none" stroke="${color}" stroke-width="1" opacity="0.6"/>` +
    `<path d="M6 9 L50 42 L94 9" fill="none" stroke="${color}" stroke-width="1.2"/>` +
    `<line x1="6" y1="91" x2="94" y2="91" stroke="${color}" stroke-width="1.2"/>`
}
/* 云朵涂鸦散布 */
function noteClouds(color) {
  const at = [[24, 26], [70, 20], [40, 64], [82, 70]]
  let p = ''
  for (const [cx, cy] of at) {
    p += `<g fill="${color}" opacity="0.85"><circle cx="${cx - 6}" cy="${cy}" r="5"/><circle cx="${cx}" cy="${cy - 3}" r="6.5"/><circle cx="${cx + 6}" cy="${cy}" r="5"/><rect x="${cx - 11}" y="${cy}" width="22" height="6" rx="3"/></g>`
  }
  return p
}

/* 内置便签纸面：键名含 6 个旧色值（兼容旧数据），其余为新款式 key */
const NOTE_DESIGNS = {
  /* 黄 · 横线便签 + 顶部米色胶带 */
  '#fff3b0': `<rect width="100" height="100" fill="#fff9d6"/>${noteLines('rgba(214,182,110,0.42)', 18, 11)}${tape(38, 24, -4, '#e9cfa0')}`,
  /* 粉 · 方格纸 + 右上粉色胶带 */
  '#ffd9e0': `<rect width="100" height="100" fill="#ffeff2"/>${noteGrid('rgba(235,160,175,0.35)', 10)}${tape(58, 20, 5, '#f5b9c6')}`,
  /* 蓝 · 虚线框信纸 + 浅横线 */
  '#d7f0ff': `<rect width="100" height="100" fill="#e9f5ff"/><rect x="5.5" y="5.5" width="89" height="89" rx="4" fill="none" stroke="rgba(130,180,220,0.75)" stroke-width="1.2" stroke-dasharray="4 3"/>${noteLines('rgba(140,185,220,0.35)', 20, 12)}`,
  /* 绿 · 碎花图案纸 */
  '#ddf7d3': `<rect width="100" height="100" fill="#eaf8e2"/>${noteFlowers()}${noteLines('rgba(150,190,130,0.28)', 22, 14)}${tape(40, 20, -3, '#bfe0a8')}`,
  /* 紫 · 双线框 + 顶角胶带 */
  '#efe1ff': `<rect width="100" height="100" fill="#f5eeff"/><rect x="5" y="5" width="90" height="90" rx="3" fill="none" stroke="rgba(180,150,220,0.65)" stroke-width="1"/><rect x="9" y="9" width="82" height="82" rx="2" fill="none" stroke="rgba(180,150,220,0.4)" stroke-width="0.7" stroke-dasharray="3 2.4"/>${noteLines('rgba(180,150,220,0.3)', 22, 12)}${tape(8, 15, -40, '#cbb2e8')}${tape(77, 15, 40, '#cbb2e8')}`,
  /* 橙 · 撕边横线纸 + 对角胶带 */
  '#ffe9c9': `<rect width="100" height="100" fill="#fff3e2"/>${tornTop('#fffdf8')}${noteLines('rgba(210,170,120,0.42)', 16, 11)}${tape(6, 16, -38, '#e2b98c')}${tape(78, 16, 38, '#e2b98c')}`,
  /* 黄 · 波点纸 */
  'yellow-dot': `<rect width="100" height="100" fill="#fff7d6"/>${noteDots('rgba(230,190,90,0.45)', 15, 2.4)}${tape(40, 20, -4, '#e9cfa0')}`,
  /* 粉 · 爱心点点纸 */
  'pink-heart': `<rect width="100" height="100" fill="#ffe9ef"/>${noteHearts('rgba(235,130,150,0.85)')}${tape(58, 20, 5, '#f5b9c6')}`,
  /* 蓝 · 格纹棉布纸 */
  'blue-gingham': `<rect width="100" height="100" fill="#e8f4ff"/>${noteGingham('rgba(120,170,215,0.9)')}${tape(40, 20, -3, '#bcd6ee')}`,
  /* 绿 · 波浪横线纸 */
  'green-wave': `<rect width="100" height="100" fill="#eaf8e2"/>${noteWaves('rgba(140,185,120,0.5)', 20, 12)}${tape(40, 20, -3, '#bfe0a8')}`,
  /* 紫 · 星星涂鸦纸 */
  'purple-star': `<rect width="100" height="100" fill="#f3eaff"/>${noteStars('rgba(180,140,220,0.85)')}${tape(8, 15, -40, '#cbb2e8')}${tape(77, 15, 40, '#cbb2e8')}`,
  /* 橙 · 斜纹纸 */
  'orange-stripe': `<rect width="100" height="100" fill="#fff1e0"/>${noteStripes('rgba(225,175,120,0.5)', 14)}${tape(42, 20, -4, '#e2b98c')}`,
  /* 薄荷 · 双虚线框 + 角花 */
  'mint-frame': `<rect width="100" height="100" fill="#e4f6f0"/><rect x="5" y="5" width="90" height="90" rx="3" fill="none" stroke="rgba(120,190,165,0.7)" stroke-width="1"/><rect x="9" y="9" width="82" height="82" rx="2" fill="none" stroke="rgba(120,190,165,0.4)" stroke-width="0.7" stroke-dasharray="3 2.4"/>${noteCorner()}`,
  /* 米色 · 信封纸 */
  'cream-env': `<rect width="100" height="100" fill="#faf3e6"/>${noteEnvelope('rgba(200,160,110,0.7)')}${tape(40, 20, -4, '#d9bf94')}`,
  /* 天蓝 · 云朵纸 */
  'sky-cloud': `<rect width="100" height="100" fill="#eaf4ff"/>${noteClouds('rgba(150,190,225,0.85)')}${noteLines('rgba(150,185,220,0.25)', 24, 14)}`,
  /* 桃色 · 角花纸 */
  'peach-corner': `<rect width="100" height="100" fill="#ffe9e1"/>${noteLines('rgba(220,150,130,0.3)', 22, 13)}${noteCorner()}`
}

const NOTE_NAMES = {
  '#fff3b0': '黄·横线', '#ffd9e0': '粉·方格', '#d7f0ff': '蓝·虚线框', '#ddf7d3': '绿·碎花',
  '#efe1ff': '紫·双框', '#ffe9c9': '橙·撕边',
  'yellow-dot': '黄·波点', 'pink-heart': '粉·爱心', 'blue-gingham': '蓝·格纹', 'green-wave': '绿·波浪',
  'purple-star': '紫·星星', 'orange-stripe': '橙·斜纹', 'mint-frame': '薄荷·双虚框', 'cream-env': '米·信封',
  'sky-cloud': '天蓝·云朵', 'peach-corner': '桃·角花'
}
/* 便签宫格数据源：key 即存入 frame 的标识 */
export const NOTE_PRESETS = Object.keys(NOTE_DESIGNS).map((k) => ({
  key: k,
  name: NOTE_NAMES[k] || '',
  paper: noteData(NOTE_DESIGNS[k])
}))

export function noteBg(key) {
  return noteData(NOTE_DESIGNS[key] || NOTE_DESIGNS['#fff3b0'])
}

/* ── 内置贴纸分类 ── */
export const STICKER_CATEGORIES = [
  { name: '心情' },
  { name: '天气' },
  { name: '记号' },
  { name: '涂鸦' },
  { name: '植物' },
  { name: '动物' },
  { name: '便签' }
]

/* ── 内置贴纸（按分类组织的透明 PNG 观感 SVG data URL） ── */
function svgData(inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">${inner}</svg>`
  return 'data:image/svg+xml,' + encodeURIComponent(s)
}

export const STICKERS = [
  /* 心情 */
  { name: 'heart', cat: '心情', data: svgData(`<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#ff7a8a"/>`) },
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
  { name: 'snow', cat: '天气', data: svgData(`<g stroke="#9cc8e8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none"><g><path d="M12 3v18"/><path d="M9.8 5.2 12 7.4l2.2-2.2M9.8 18.8 12 16.6l2.2 2.2"/></g><g transform="rotate(60 12 12)"><path d="M12 3v18"/><path d="M9.8 5.2 12 7.4l2.2-2.2M9.8 18.8 12 16.6l2.2 2.2"/></g><g transform="rotate(120 12 12)"><path d="M12 3v18"/><path d="M9.8 5.2 12 7.4l2.2-2.2M9.8 18.8 12 16.6l2.2 2.2"/></g></g>`) },
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
  { name: 'doodle-heart', cat: '涂鸦', data: svgData(`<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="none" stroke="#e2554f" stroke-width="1.3"/>`) },
  { name: 'doodle-arrow', cat: '涂鸦', data: svgData(`<path d="M4 19C5.5 12.5 10.5 7.5 18.5 6.8" fill="none" stroke="#7a86b8" stroke-width="1.4" stroke-linecap="round"/><path d="M14.4 4.4 18.7 6.8l-4.3 2.6" fill="none" stroke="#7a86b8" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`) },
  { name: 'doodle-wave', cat: '涂鸦', data: svgData(`<path d="M2.5 13c1.4-2.8 3.2-2.8 4.6 0s3.2 2.8 4.6 0 3.2-2.8 4.6 0 3.2 2.8 4.6 0" fill="none" stroke="#5aa8a0" stroke-width="1.3" stroke-linecap="round"/>`) },
  { name: 'music', cat: '涂鸦', data: svgData(`<path d="M9.6 17.4V6.6l8.8-2.4v10.9" fill="none" stroke="#8a7ac8" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7.4" cy="17.4" rx="2.5" ry="1.9" fill="#8a7ac8" transform="rotate(-14 7.4 17.4)"/><ellipse cx="16.2" cy="15.1" rx="2.5" ry="1.9" fill="#8a7ac8" transform="rotate(-14 16.2 15.1)"/>`) },
  /* 植物 */
  { name: 'leaf', cat: '植物', data: svgData(`<path d="M20 4C11 4 4 11 4 20c9 0 16-7 16-16z" fill="#9ccb8f"/><path d="M6 18C8.5 12.5 12 9 17.5 6.5" stroke="#6f9e60" stroke-width="0.9" fill="none" stroke-linecap="round"/>`) },
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

/* ── 「便签」贴纸分类：16 款内置便签纸面复制而来（纯装饰贴纸上墙用，默认 1:1 方形，
   选中后四边可任意拉伸；与「文字设置 → 便签」共用同一套纸面数据） ── */
STICKERS.push(...NOTE_PRESETS.map((p) => ({
  name: 'note-' + p.key,
  cat: '便签',
  data: p.paper
})))
