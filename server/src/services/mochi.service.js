const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, ASSET_BASE } = require('../config');
const { createCardsBatch } = require('../repositories/cards.repo');

/**
 * mochi 字卡全量备份（app === 'mochi-ccfull'）导入。
 *
 * 仅导入本网站字卡库实际存在的板块（不导入题库 / 情话 / 寻踪等本站没有的内容）。
 *
 * 备份结构（data 下）：
 *   ccPub  / ccOwn  —— 字卡（公用 / 专属），每个板块是一个数组：
 *                        text / emoji / kaomoji / poke / mjfree / sticker / image / voice
 *                        单项为对象 { text, img, voice }，文字在 text，图在 img，语音在 voice。
 *                        图/语音为 data:...;base64,... 内联 DataURL，或 @@m:<hash> 令牌（无法还原，跳过图）。
 *
 * 映射规则（与本网站字卡库板块一一对应）：
 *   字卡 text/emoji/kaomoji/poke/mjfree → category 'text'（普通字卡）
 *   字卡 sticker → category 'sticker'（无框表情，按图片落盘）
 *   字卡 image  → category 'image'（无框图片，按图片落盘）
 *   字卡 voice  → category 'voice'（语音落盘）
 *   ccPub → scope 'general'（通用库）；
 *   ccOwn → 绑定到 ownerContactId（scope 'contact'），未指定则归 general。
 */

// 把 dataURL（或令牌）解码落盘，返回 /assets/<sub>/<name> 访问路径；非 dataURL（如 @@m: 令牌）返回 null
function saveDataUrl(dataUrl, subdir) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) return null; // 令牌或非法，无法还原
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return null;
  let ext = 'bin';
  if (mime === 'image/png') ext = 'png';
  else if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg';
  else if (mime === 'image/webp') ext = 'webp';
  else if (mime === 'image/gif') ext = 'gif';
  else if (mime.startsWith('audio')) {
    if (mime.includes('mp3')) ext = 'mp3';
    else if (mime.includes('webm')) ext = 'webm';
    else if (mime.includes('m4a')) ext = 'm4a';
    else if (mime.includes('ogg')) ext = 'ogg';
    else ext = 'audio';
  } else if (mime === 'image/svg+xml') ext = 'svg';
  else return null; // 不支持的 mime，跳过资源（保留文字）
  const dir = path.join(UPLOAD_DIR, subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `${ASSET_BASE}/${subdir}/${name}`;
}

// 字卡单项 → cards 项
function mapCardItem(it, category, scope, ownerContactId) {
  if (!it || typeof it !== 'object') return null;
  const content = String(it.text || '').trim();
  let asset = null;
  let duration = null;
  let cat = category;
  if (category === 'sticker') {
    asset = saveDataUrl(it.img, 'stickers');
    // 无框表情：即使带文字也保持无框；既无图也无文则跳过
    if (!asset && !content) return null;
  } else if (category === 'image') {
    asset = saveDataUrl(it.img, 'images');
    if (!asset && !content) return null;
  } else if (category === 'voice') {
    asset = saveDataUrl(it.voice, 'voices');
    if (!asset) return null; // 语音必须有音频
    duration = Number(it.duration) > 0 ? Number(it.duration) : null;
  } else {
    // 文字类（text/emoji/kaomoji/poke/mjfree）：纯文字
    cat = 'text';
    if (!content) return null;
  }
  return {
    category: cat,
    scope,
    ownerContactId: scope === 'contact' ? ownerContactId : null,
    content: content || null,
    asset_path: asset,
    duration
  };
}

const CARD_KEYS = ['text', 'emoji', 'kaomoji', 'poke', 'mjfree', 'sticker', 'image', 'voice'];

// 把一组字卡板块（如 ccPub）展开为 cards 项
function mapCardSection(section, scope, ownerContactId) {
  const items = [];
  if (!section || typeof section !== 'object') return items;
  for (const key of CARD_KEYS) {
    const arr = section[key];
    if (!Array.isArray(arr)) continue;
    for (const it of arr) {
      const item = mapCardItem(it, key, scope, ownerContactId);
      if (item) items.push(item);
    }
  }
  return items;
}

/**
 * 解析并导入 mochi 全量备份中的字卡部分。
 * @param {object} json  已解析的 mochi 备份对象（顶层含 data）
 * @param {object} opt
 * @param {number|null} opt.ownerContactId  专属字卡绑定的联系人 id；null 则专属也归通用
 * @returns {{inserted:number, skipped:number, total:number}}
 */
function importMochi(json, { ownerContactId = null } = {}) {
  const data = json && json.data ? json.data : json;
  if (!data || typeof data !== 'object') throw new Error('不是有效的 mochi 备份（data 缺失）');
  if (data.ccPub === undefined && data.ccOwn === undefined) {
    throw new Error('不是有效的 mochi 字卡备份（未找到 ccPub / ccOwn 字卡数据）');
  }

  const contactScope = ownerContactId != null ? 'contact' : 'general';
  const items = [];

  // 公用字卡
  items.push(...mapCardSection(data.ccPub, 'general', null));
  // 专属字卡
  items.push(...mapCardSection(data.ccOwn, contactScope, ownerContactId));

  const result = createCardsBatch(items);
  return { ...result, total: items.length };
}

module.exports = { importMochi, saveDataUrl };
