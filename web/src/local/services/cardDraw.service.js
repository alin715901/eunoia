import db from '../db'

// 资源是否存在（避免抽到「数据库有行、文件缺失」的字卡 → 聊天里渲染成灰色空框）
// 本地版：图片一律以 dataURL 直接入库，非空前缀即视为存在；
// 兼容旧的 /assets/... 路径形态（本地版不会有这种数据，直接判不存在）。
function assetExists(assetPath) {
  if (!assetPath) return false;
  const s = String(assetPath);
  return s.startsWith('data:') || s.startsWith('blob:');
}

// 某分类在「通用库 + 该联系人专属库」里是否有「带图且文件存在」的有效字卡
function categoryHasValidVisual(category, contactId) {
  const cands = queryCandidates(category, 'general', contactId).concat(
    queryCandidates(category, 'contact', contactId)
  );
  return cands.some((c) => c.asset_path && assetExists(c.asset_path));
}

function parseWeights(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// 按非零权重加权随机选一个分类
function pickCategory(weights) {
  const entries = Object.entries(weights || {}).filter(([, v]) => Number(v) > 0);
  if (entries.length === 0) return 'main';
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  let r = Math.random() * total;
  for (const [k, v] of entries) {
    if (r < Number(v)) return k;
    r -= Number(v);
  }
  return entries[entries.length - 1][0];
}

// 按 weight 加权随机选一行
function randomPick(rows) {
  if (!rows || rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 1), 0);
  let r = Math.random() * total;
  for (const row of rows) {
    const w = Number(row.weight) || 1;
    if (r < w) return row;
    r -= w;
  }
  return rows[rows.length - 1];
}

function queryCandidates(category, source, contactId) {
  // source: 'general' | 'contact'
  // 未分组（group_id = NULL）的字卡同样参与抽卡；scope 用卡片自身字段判断，不依赖分组
  return db
    .prepare(
      `SELECT c.* FROM cards c LEFT JOIN card_groups g ON c.group_id = g.id
       WHERE c.category = ? AND c.blocked = 0 AND (c.group_id IS NULL OR g.blocked = 0)
         AND (
           (? = 'general' AND c.scope = 'general')
           OR (? = 'contact' AND c.scope = 'contact' AND c.owner_contact_id = ?)
         )`
    )
    // ★ 参数顺序必须与 SQL 占位符一致：category, source(general 分支), source(contact 分支), contactId。
    //   之前写成 (category, source, contactId, source)，把联系人 ID 塞给了 source 比较、
    //   把 'contact' 塞给了 owner_contact_id —— 专属库候选永远查不出来，只能掉进兜底抽别的分类。
    .all(category, source, source, contactId);
}

function fallbackAny(contactId) {
  // ★ 兜底也必须限定归属：只能抽「通用库 + 该联系人自己的专属库」，
  //   绝不能把其他联系人的专属字卡抽出来（之前没过滤 owner，导致串卡）。
  return db
    .prepare(
      `SELECT c.* FROM cards c LEFT JOIN card_groups g ON c.group_id = g.id
       WHERE c.blocked = 0 AND (c.group_id IS NULL OR g.blocked = 0)
         AND c.category != 'poke'
         AND (c.scope = 'general' OR (c.scope = 'contact' AND c.owner_contact_id = ?))`
    )
    .all(contactId);
}

// 拍一拍抽卡：从通用库 category='poke' 的未屏蔽字卡里按权重随机取一条。
// 用 LEFT JOIN 兼容「未分组」的拍一拍字卡（group_id 为 NULL）。
function drawPokeCard(dbRef) {
  const d = dbRef || db;
  const rows = d
    .prepare(
      `SELECT c.* FROM cards c LEFT JOIN card_groups g ON c.group_id = g.id
       WHERE c.category = 'poke' AND c.scope = 'general' AND c.blocked = 0
         AND (c.group_id IS NULL OR g.blocked = 0)`
    )
    .all();
  return randomPick(rows);
}

// ★ 两层混抽算法
function drawCards(dbRef, contactId, count) {
  const d = dbRef || db;
  const st = d.prepare('SELECT cat_weights, gen_ratio FROM contact_settings WHERE contact_id = ?').get(contactId);
  const weights = parseWeights(st ? st.cat_weights : null);
  const genRatio = st ? Number(st.gen_ratio ?? 70) : 70;
  return drawWith(contactId, weights, genRatio, count);
}

// 群聊用：按「谁发的」抽——抽谁的字卡库 + 通用库，不混抽别人的
function drawCardsForMember(dbRef, groupId, memberId, count) {
  const d = dbRef || db;
  let weights = null;
  let genRatio = 70;
  const own = d
    .prepare('SELECT cat_weights, gen_ratio FROM group_member_settings WHERE group_id = ? AND member_id = ?')
    .get(groupId, memberId);
  if (own) {
    weights = parseWeights(own.cat_weights);
    genRatio = Number(own.gen_ratio ?? 70);
  } else {
    const g = d.prepare('SELECT cat_weights, gen_ratio FROM contact_settings WHERE contact_id = ?').get(groupId);
    if (g) {
      weights = parseWeights(g.cat_weights);
      genRatio = Number(g.gen_ratio ?? 70);
    }
  }
  // 注意：contactId 传成员自己 —— 专属库按成员抽，通用库照常
  return drawWith(memberId, weights, genRatio, count);
}

function drawWith(contactId, weights, genRatio, count) {
  const result = [];
  const n = Math.max(0, Number(count) || 0);
  const g = Math.max(0, Math.min(100, Number(genRatio ?? 70)));

  // ★ 图片 / 表情包板块：必须「真有带图且文件存在的字卡」才参与抽卡。
  //   若只调了占比却没往这两个板块加东西（或加了但图丢了），就把权重清零，
  //   绝不发空的/坏的图片消息；没图时回落到文字卡，有图才发。
  const effWeights = { ...(weights || {}) };
  if (!categoryHasValidVisual('image', contactId)) delete effWeights.image;
  if (!categoryHasValidVisual('sticker', contactId)) delete effWeights.sticker;
  const hasWeight = Object.values(effWeights).some((v) => Number(v) > 0);
  if (!hasWeight) effWeights.main = 1; // 全部置空时退回主字卡，保证有内容可发

  for (let i = 0; i < n; i++) {
    const category = pickCategory(effWeights);
    const source = Math.random() < g / 100 ? 'general' : 'contact';

    let rows = queryCandidates(category, source, contactId);
    // ★ 回退顺序：指定来源没有 → 换「另一个来源」（通用↔专属）再试该分类；
    //   两边都没有该分类的字卡才允许跨分类兜底。之前固定重试 'general'，
    //   当首选就是 general 时重试等于重查一遍，直接掉进 fallbackAny 抽到别的分类。
    if (rows.length === 0) rows = queryCandidates(category, source === 'general' ? 'contact' : 'general', contactId);
    if (rows.length === 0) rows = fallbackAny(contactId);
    if (rows.length === 0) {
      result.push({ id: null, category, content: '（沉默地陪伴着你）', asset_path: null, duration: null });
      continue;
    }
    let card = randomPick(rows);
    // 图片 / 表情包板块本就是带图的字卡。保险：只取「文件真实存在」的视觉卡，
    // 避免抽到磁盘缺文件的坏图（聊天里渲染成灰色空框）。没有有效图就退回文字卡。
    const isVisual = category === 'image' || category === 'sticker';
    if (isVisual) {
      const withValid = rows.filter((r) => r.asset_path && assetExists(r.asset_path));
      if (withValid.length) card = randomPick(withValid);
    }
    result.push({
      id: card.id,
      category,
      content: card.content,
      asset_path: card.asset_path,
      duration: card.duration,
    });
  }
  return result;
}

export {
  drawCards,
  drawCardsForMember,
  drawPokeCard,
  pickCategory,
  randomPick,
};
