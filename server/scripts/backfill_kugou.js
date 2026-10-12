/* 一次性回填：给已有酷狗歌补歌手/封面/时长（只补空字段） */
const path = require('path');
const db = require(path.resolve(__dirname, '../src/db'));
const music = require(path.resolve(__dirname, '../src/services/music.service'));

(async () => {
  const rows = db.prepare("SELECT id, title, artist, cover, duration, source_id FROM songs WHERE source = 'kugou'").all();
  console.log(`待检查酷狗歌 ${rows.length} 首`);
  for (const r of rows) {
    const need = [];
    if (!r.artist) need.push('artist');
    if (!r.cover) need.push('cover');
    if (!r.duration) need.push('duration');
    if (!need.length) { console.log(`  #${r.id} ${r.title} 数据完整，跳过`); continue; }
    try {
      const m = await music.resolveImport(`https://www.kugou.com/song/#hash=${r.source_id}`);
      const s = (m.songs || [])[0];
      if (!s) { console.log(`  #${r.id} ${r.title} 解析失败`); continue; }
      const sets = [];
      const vals = [];
      if (!r.artist && s.artist) { sets.push('artist = ?'); vals.push(s.artist); }
      if (!r.cover && s.cover) { sets.push('cover = ?'); vals.push(s.cover); }
      if (!r.duration && s.duration) { sets.push('duration = ?'); vals.push(s.duration); }
      if (sets.length) {
        vals.push(r.id);
        db.prepare(`UPDATE songs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
        console.log(`  #${r.id} ${r.title} 已补: ${need.join('/')} -> artist=${s.artist || '(空)'} cover=${s.cover ? '有' : '无'} dur=${s.duration}`);
      } else {
        console.log(`  #${r.id} ${r.title} 接口也没返回 ${need.join('/')}`);
      }
    } catch (e) {
      console.log(`  #${r.id} ${r.title} 出错: ${e.message}`);
    }
  }
  console.log('回填完成');
  process.exit(0);
})();
