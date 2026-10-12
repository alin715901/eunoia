const express = require('express');
const path = require('path');
const multer = require('multer');
const db = require('../db');
const { UPLOAD_DIR } = require('../config');
const { assetUrl } = require('../services/file.service');
const musicService = require('../services/music.service');

const router = express.Router();
const ok = (res, data, msg = 'ok') => res.json({ code: 0, data, msg });
const fail = (res, msg) => res.json({ code: 1, msg });

/* 音频文件上传（上限 60MB） */
const audioUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, path.join(UPLOAD_DIR, 'voices'));
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname) || '.mp3';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    }
  }),
  limits: { fileSize: 60 * 1024 * 1024 }
});

const now = () => Math.floor(Date.now() / 1000);

function insertSong(m) {
  const r = db
    .prepare(
      `INSERT INTO songs (title, artist, cover, duration, source, source_id, audio, plist, vip, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      m.title || '未知歌曲', m.artist || '', m.cover || '', m.duration || 0,
      m.source || 'local', m.source_id || '', m.audio || '', m.plist || '',
      m.vip ? 1 : 0, m.note || '', now()
    );
  return r.lastInsertRowid;
}

/* ─── 曲库列表（带指定联系人的收藏标记） ─── */
router.get('/music/songs', (req, res) => {
  try {
    const contactId = Number(req.query.contactId || 0);
    const songs = db.prepare('SELECT * FROM songs ORDER BY id DESC').all();
    let favIds = new Set();
    if (contactId) {
      favIds = new Set(
        db.prepare('SELECT song_id FROM song_favs WHERE contact_id = ?').all(contactId).map((r) => r.song_id)
      );
    }
    ok(res, {
      songs: songs.map((s) => ({ ...s, fav: favIds.has(s.id) })),
      favIds: [...favIds]
    });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 某个联系人的收藏 id 列表（每个联系人各自一份收藏） ─── */
router.get('/music/favids', (req, res) => {
  try {
    const contactId = Number(req.query.contactId || 0);
    if (!contactId) return fail(res, '缺少联系人');
    const favIds = db
      .prepare('SELECT song_id FROM song_favs WHERE contact_id = ?')
      .all(contactId)
      .map((r) => r.song_id);
    ok(res, { contactId, favIds });
  } catch (e) {
    fail(res, e.message);
  }
});

/* 已导入过同一首歌（同源同 ID）则跳过，避免批量粘贴重复入库 */
function songExists(source, sourceId) {
  if (!sourceId || (source !== 'netease' && source !== 'kugou')) return false;
  return !!db.prepare('SELECT 1 FROM songs WHERE source = ? AND source_id = ?').get(source, sourceId);
}

/* ─── 链接导入：网易云歌曲/歌单、酷狗、音频直链 ─── */
router.post('/music/import', async (req, res) => {
  try {
    const { url, note } = req.body || {};
    if (!url) return fail(res, '请先粘贴链接');
    const result = await musicService.resolveImport(url);
    const songs = result.songs || [];
    const ids = [];
    let skipped = 0;
    let unplayable = 0;
    for (const m of songs) {
      if (note) m.note = note;
      if (songExists(m.source, m.source_id)) { skipped++; continue; }
      ids.push(insertSong(m));
      if (!m.audio) unplayable++;
    }
    ok(res, {
      imported: ids.length,
      skipped,
      playlist: result.name || '',
      unplayable,
      ids
    });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 手动导入（设置页表单：歌名/歌手/音频链接 或 本地文件） ─── */
router.post('/music/manual', (req, res) => {
  try {
    const { title, artist, audio, cover, note } = req.body || {};
    if (!title || !title.trim()) return fail(res, '填一下歌曲名称');
    if (!audio || !String(audio).trim()) return fail(res, '需要音频链接或先上传本地文件');
    const a = String(audio).trim();
    const isLocal = a.startsWith('/assets/');
    const id = insertSong({
      title: title.trim(),
      artist: (artist || '').trim(),
      cover: cover || '',
      audio: a,
      source: isLocal ? 'local' : 'link',
      note: note || ''
    });
    ok(res, { id });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 本地音频文件上传 ─── */
router.post('/music/upload', audioUpload.single('file'), (req, res) => {
  try {
    if (!req.file) return fail(res, 'no file');
    ok(res, { path: assetUrl(req.file.filename, 'voices') });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 编辑歌曲（补音频链接 / 改封面等） ─── */
router.put('/music/songs/:id', (req, res) => {
  try {
    const s = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!s) return fail(res, '歌曲不存在');
    const b = req.body || {};
    const next = {
      title: b.title !== undefined ? String(b.title) : s.title,
      artist: b.artist !== undefined ? String(b.artist) : s.artist,
      cover: b.cover !== undefined ? String(b.cover) : s.cover,
      audio: b.audio !== undefined ? String(b.audio) : s.audio,
      note: b.note !== undefined ? String(b.note) : s.note,
      plist: b.plist !== undefined ? String(b.plist) : s.plist,
      vip: b.audio !== undefined && b.audio && !s.audio ? 0 : s.vip
    };
    db.prepare('UPDATE songs SET title=?, artist=?, cover=?, audio=?, note=?, plist=?, vip=? WHERE id=?').run(
      next.title, next.artist, next.cover, next.audio, next.note, next.plist, next.vip, s.id
    );
    ok(res, { id: s.id });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 删除（单条 / 批量） ─── */
router.delete('/music/songs/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM song_favs WHERE song_id = ?').run(req.params.id);
    ok(res, { id: Number(req.params.id) });
  } catch (e) {
    fail(res, e.message);
  }
});
router.post('/music/songs/batch-delete', (req, res) => {
  try {
    const ids = (req.body && req.body.ids) || [];
    const del = db.prepare('DELETE FROM songs WHERE id = ?');
    const delFav = db.prepare('DELETE FROM song_favs WHERE song_id = ?');
    const tx = db.transaction(() => {
      ids.forEach((id) => { del.run(id); delFav.run(id); });
    });
    tx();
    ok(res, { deleted: ids.length });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 清理会员/无法播放的歌曲 ─── */
router.post('/music/clear-unplayable', (req, res) => {
  try {
    const r = db.prepare("DELETE FROM songs WHERE audio = '' AND source NOT IN ('local','link')").run();
    ok(res, { deleted: r.changes });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 收藏（按联系人切换） ─── */
router.post('/music/songs/:id/fav', (req, res) => {
  try {
    const contactId = Number((req.body && req.body.contactId) || 0);
    if (!contactId) return fail(res, '缺少联系人');
    const songId = Number(req.params.id);
    const exists = db.prepare('SELECT 1 FROM song_favs WHERE song_id = ? AND contact_id = ?').get(songId, contactId);
    if (exists) {
      db.prepare('DELETE FROM song_favs WHERE song_id = ? AND contact_id = ?').run(songId, contactId);
      ok(res, { fav: false });
    } else {
      db.prepare('INSERT INTO song_favs (song_id, contact_id, created_at) VALUES (?,?,?)').run(songId, contactId, now());
      ok(res, { fav: true });
    }
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 播放代理：每次播放实时解析最新直链（网易云直链有时效），302 跳转 ─── */
router.get('/music/stream/:id', async (req, res) => {
  try {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!song) return res.status(404).json({ code: 1, msg: '歌曲不存在' });
    const url = await musicService.resolveStreamUrl(song);
    if (!url) return res.status(404).json({ code: 1, msg: '该歌曲暂无可用音频链接' });
    res.redirect(302, url);
  } catch (e) {
    res.status(500).json({ code: 1, msg: e.message });
  }
});

/* ─── 歌词：按歌曲源自动抓取（网易云 LRC），无源返回空 ─── */
router.get('/music/songs/:id/lyric', async (req, res) => {
  try {
    const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
    if (!song) return fail(res, '歌曲不存在');
    let lyric = '';
    if (song.source === 'netease' && song.source_id) {
      lyric = await musicService.neGetLyric(song.source_id).catch(() => '');
    } else if (song.source === 'kugou' && song.source_id) {
      lyric = await musicService.kugouGetLyric(song.source_id).catch(() => '');
    }
    ok(res, { lyric });
  } catch (e) {
    fail(res, e.message);
  }
});

/* ─── 播放/唱片设置（按联系人） ─── */
router.get('/music/settings', (req, res) => {
  try {
    const contactId = Number(req.query.contactId || 0);
    if (!contactId) return fail(res, '缺少联系人');
    const row = db
      .prepare(
        'SELECT play_mode, music_vinyl, music_floating, music_playlists, music_card_bg, music_card_bg_op FROM contact_desktop WHERE contact_id = ?'
      )
      .get(contactId);
    let playlists = []
    try { playlists = JSON.parse((row && row.music_playlists) || '[]') } catch (e) { playlists = [] }
    if (!Array.isArray(playlists)) playlists = []
    ok(res, {
      play_mode: (row && row.play_mode) || 'list',
      vinyl: (row && row.music_vinyl) || '',
      floating: row ? (row.music_floating ? 1 : 0) : 1,
      playlists,
      musicBg: (row && row.music_card_bg) || '',
      musicBgOpacity: row && row.music_card_bg_op != null ? Number(row.music_card_bg_op) : 100
    });
  } catch (e) {
    fail(res, e.message);
  }
});
router.put('/music/settings', (req, res) => {
  try {
    const b = req.body || {};
    const contactId = Number(b.contactId || 0);
    if (!contactId) return fail(res, '缺少联系人');
    const cols = db.prepare('PRAGMA table_info(contact_desktop)').all().map((r) => r.name);
    const row = db.prepare('SELECT * FROM contact_desktop WHERE contact_id = ?').get(contactId);
    if (!row) {
      db.prepare('INSERT INTO contact_desktop (contact_id) VALUES (?)').run(contactId);
    }
    if (b.play_mode !== undefined && cols.includes('play_mode')) {
      db.prepare('UPDATE contact_desktop SET play_mode = ? WHERE contact_id = ?').run(String(b.play_mode), contactId);
    }
    if (b.vinyl !== undefined && cols.includes('music_vinyl')) {
      db.prepare('UPDATE contact_desktop SET music_vinyl = ? WHERE contact_id = ?').run(String(b.vinyl || ''), contactId);
    }
    if (b.floating !== undefined && cols.includes('music_floating')) {
      db.prepare('UPDATE contact_desktop SET music_floating = ? WHERE contact_id = ?').run(b.floating ? 1 : 0, contactId);
    }
    if (b.playlists !== undefined && cols.includes('music_playlists')) {
      const arr = Array.isArray(b.playlists) ? b.playlists : []
      db.prepare('UPDATE contact_desktop SET music_playlists = ? WHERE contact_id = ?').run(JSON.stringify(arr), contactId);
    }
    if (b.musicBg !== undefined && cols.includes('music_card_bg')) {
      db.prepare('UPDATE contact_desktop SET music_card_bg = ? WHERE contact_id = ?').run(String(b.musicBg || ''), contactId);
    }
    if (b.musicBgOpacity !== undefined && cols.includes('music_card_bg_op')) {
      const v = Math.max(0, Math.min(100, Number(b.musicBgOpacity) || 0))
      db.prepare('UPDATE contact_desktop SET music_card_bg_op = ? WHERE contact_id = ?').run(v, contactId);
    }
    ok(res, { contactId });
  } catch (e) {
    fail(res, e.message);
  }
});

module.exports = router;
