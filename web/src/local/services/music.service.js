/* 音乐导入解析服务：网易云歌曲/歌单、酷狗歌曲、通用音频直链 */
import * as crypto from '../shims/crypto.js'
import db from '../db'
import * as notification from './notification.service'

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/* 解析中转地址优先级：
   1) 用户在「设置 → 音乐 → 解析服务」里手填的（localStorage）
   2) 运行时配置 public/config.js 的 musicProxy（云端或本地中转都可能是这个）
   3) 构建时环境变量 VITE_MUSIC_PROXY */
const OVERRIDE_KEY = 'eunoia.musicProxy'
function proxyBase() {
  let local = ''
  try {
    local = (window.localStorage && localStorage.getItem(OVERRIDE_KEY)) || ''
  } catch (e) {
    /* 隐私模式下 localStorage 不可用，忽略 */
  }
  const rt =
    typeof window !== 'undefined' && window.__EUNOIA_CONFIG__ && window.__EUNOIA_CONFIG__.musicProxy
      ? String(window.__EUNOIA_CONFIG__.musicProxy).trim()
      : ''
  return (local || rt || (import.meta.env && import.meta.env.VITE_MUSIC_PROXY) || '').trim()
}

function withProxy(url) {
  const base = proxyBase()
  return base ? `${base.replace(/\/+$/, '')}/?url=${encodeURIComponent(url)}` : url
}

async function fetchText(url, headers = {}) {
  const res = await fetch(withProxy(url), { headers: { 'User-Agent': UA, ...headers }, redirect: 'follow' });
  if (!res.ok) throw new Error(`请求失败 ${res.status}`);
  return res.text();
}
async function fetchJson(url, headers = {}) {
  const text = await fetchText(url, headers);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('返回内容不是 JSON');
  }
}

/* ─────────── 链接识别 ─────────── */
function parseLink(raw) {
  const url = String(raw || '').trim();
  if (!url) return { type: 'unknown' };
  // 通用音频直链
  if (/^https?:\/\//i.test(url) && /\.(mp3|m4a|aac|wav|flac|ogg)(\?|$)/i.test(url)) {
    return { type: 'audio', url };
  }
  // 网易云歌单
  let m = url.match(/music\.163\.com[^#]*#*\/?playlist\?id=(\d+)/i) || url.match(/163cn\.tv[^]*playlist[^]*(\d{5,})/i);
  if (/music\.163\.com/i.test(url) && /playlist/i.test(url)) {
    const id = (url.match(/id=(\d+)/) || [])[1];
    if (id) return { type: 'netease_playlist', id };
  }
  // 网易云歌曲
  if (/music\.163\.com/i.test(url)) {
    const id = (url.match(/[?&]id=(\d+)/) || url.match(/\/song\/(\d+)/) || [])[1];
    if (id) return { type: 'netease_song', id };
  }
  // 短链 163cn.tv —— 需要先展开
  if (/163cn\.tv/i.test(url)) return { type: 'netease_short', url };
  // 酷狗
  if (/kugou\.com/i.test(url)) {
    const hash = (url.match(/hash=([0-9a-fA-F]{32})/) || [])[1];
    if (hash) return { type: 'kugou', hash: hash.toLowerCase(), url };
    return { type: 'kugou_page', url };
  }
  return { type: 'unknown' };
}

/* ─────────── 网易云 ─────────── */
function neSongFromDetail(s) {
  if (!s) return null;
  return {
    title: s.name || '未知歌曲',
    artist: (s.artists || []).map((a) => a.name).join('/') || '',
    cover: (s.album && s.album.picUrl) || '',
    duration: Math.round((s.duration || 0) / 1000),
    source: 'netease',
    source_id: String(s.id),
    vip: (s.fee === 1 || s.fee === 4) ? 1 : 0
  };
}

async function neGetSongUrl(id) {
  const d = await fetchJson(
    `https://music.163.com/api/song/enhance/player/url?ids=[${id}]&br=320000`,
    { Referer: 'https://music.163.com/' }
  );
  const item = d && d.data && d.data[0];
  return item && item.url ? String(item.url) : '';
}

/* ── 备用音源：公开 Meting 服务（带 CORS，浏览器可直连，无需中转）─────────
   网易云的播放直链接口对境外 IP 一律返回 url:null，而且拿到的地址带临时令牌会过期。
   Meting 每次请求会 302/直返一份**新签名**的音频流，因此：
     ① 不依赖我们自己的中转出口 IP；
     ② 把这个接口地址本身存为音源，每次播放都自动换一份有效地址，永不过期。
   为降低对单一第三方依赖，配置了多个镜像依次尝试。 */
const METING_HOSTS = ['https://api.injahow.cn', 'https://api.qijieya.cn'];

/* 探测某个 Meting 镜像能否给出音频：拿到响应头看 content-type 就立刻中断下载 */
async function metingAudio(host, id) {
  const url = `${host}/meting/?server=netease&type=url&id=${id}`;
  try {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (ctrl) ctrl.abort();
    const good = res.ok && (/audio|mpeg|octet-stream/.test(ct) || ct === '');
    return good ? url : '';
  } catch (e) {
    return '';
  }
}

/* 依次尝试各镜像，返回可用的音源地址（都不可用则返回空串） */
async function neAudioBest(id) {
  for (const host of METING_HOSTS) {
    const u = await metingAudio(host, id);
    if (u) return u;
  }
  return '';
}

async function neResolveSong(id) {
  const d = await fetchJson(`https://music.163.com/api/song/detail?id=${id}&ids=[${id}]`);
  const song = d && d.songs && d.songs[0];
  if (!song) throw new Error('没找到这首歌（链接可能无效）');
  const meta = neSongFromDetail(song);
  /* 不论是否会员都先尝试取音源：能取到就存，取不到留空（曲库里会标「不可播」，
     可在音乐页一键移除）。优先 Meting（自动续签、不过期），再退回网易云官方接口。 */
  meta.audio = (await neAudioBest(id)) || (await neGetSongUrl(id).catch(() => ''));
  return meta;
}

async function neResolvePlaylist(id) {
  const d = await fetchJson(`https://music.163.com/api/playlist/detail?id=${id}`);
  const pl = d && d.result;
  if (!pl || !Array.isArray(pl.tracks)) throw new Error('歌单不存在或为空');
  const name = pl.name || '网易云歌单';
  const songs = pl.tracks.slice(0, 100).map((s) => {
    const meta = neSongFromDetail(s);
    meta.plist = name;
    return meta;
  });
  /* 批量补直链（免费歌才有）：分 20 个一组 */
  const free = songs.filter((s) => !s.vip);
  for (let i = 0; i < free.length; i += 20) {
    const batch = free.slice(i, i + 20);
    const ids = batch.map((s) => s.source_id).join(',');
    try {
      const d2 = await fetchJson(
        `https://music.163.com/api/song/enhance/player/url?ids=[${ids}]&br=320000`,
        { Referer: 'https://music.163.com/' }
      );
      const map = new Map((d2.data || []).map((x) => [String(x.id), x.url || '']));
      batch.forEach((s) => { s.audio = map.get(s.source_id) || ''; });
    } catch (e) { /* 忽略，audio 留空 */ }
  }
  /* 官方接口没给直链的，用 Meting 备用音源补齐（最多 30 首，避免请求过密） */
  const missing = songs.filter((s) => !s.audio).slice(0, 30);
  for (const s of missing) {
    const u = await neAudioBest(s.source_id).catch(() => '');
    if (u) s.audio = u;
  }
  return { name, songs };
}

async function neExpandShort(url) {
  /* 163cn.tv 短链：跟随重定向拿到真实链接。
     走 worker 中转时 res.url 只是 worker 地址，最终地址由响应头 X-Final-Url 带回；
     直连模式（无中转）时 res.url 即最终地址。 */
  const res = await fetch(withProxy(url), { method: 'GET', redirect: 'follow' })
  const final = res.headers.get('X-Final-Url') || res.url || ''
  return parseLink(final)
}

/* ─────────── 酷狗 ─────────── */
/* 播放直链：tracker 接口，key = md5(hash + 'kgcloudv2')，无需时间戳签名。
   免费歌 status=1 返回 url[]；VIP/付费歌 status=2（fail_process: pkg/buy）拿不到 */
async function kugouGetPlayUrl(hash) {
  const h = String(hash).toLowerCase();
  const key = crypto.createHash('md5').update(h + 'kgcloudv2').digest('hex');
  const d = await fetchJson(
    `https://trackercdn.kugou.com/i/v2/?cmd=25&key=${key}&hash=${h}&behavior=play&pid=3&version=8990`
  );
  if (!d || d.status !== 1 || !Array.isArray(d.url) || !d.url.length) return null;
  return {
    url: String(d.url[0]).replace(/^http:\/\//i, 'https://'),
    fileName: d.fileName || '',
    duration: Math.round(d.timeLength || 0)
  };
}

async function kugouFromPage(url) {
  const html = await fetchText(url);
  const hash = (html.match(/hash=([0-9a-fA-F]{32})/) || html.match(/"hash":"([0-9a-fA-F]{32})"/) || [])[1];
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1] || '';
  return { hash: hash ? hash.toLowerCase() : '', title: title.replace(/[-_|]\s*酷狗.*$/i, '').trim() };
}

async function kugouSearchMeta(keyword, hash) {
  const d = await fetchJson(
    `https://mobiles.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=1&pagesize=5`
  );
  const list = (d && d.data && d.data.info) || [];
  if (!list.length) return null;
  /* 优先匹配同一 hash 的结果，避免同名不同版本/演唱者 */
  let info = list[0];
  if (hash) {
    const hit = list.find((x) => String(x.hash || '').toLowerCase() === String(hash).toLowerCase());
    if (hit) info = hit;
  }
  return {
    title: info.songname || keyword,
    artist: info.singername || '',
    cover: '',
    duration: info.duration || 0,
    album_id: info.album_id || ''
  };
}

/* 专辑封面：album/info 返回带 {size} 占位符的 imgurl */
async function kugouAlbumCover(albumId) {
  if (!albumId) return '';
  const d = await fetchJson(
    `https://mobiles.kugou.com/api/v3/album/info?albumid=${encodeURIComponent(albumId)}&plat=0`
  );
  const tpl = d && d.data && d.data.imgurl;
  if (!tpl) return '';
  return String(tpl).replace('{size}', '400').replace(/^http:\/\//i, 'https://');
}

async function kugouResolve({ hash: hashIn, url }) {
  let hash = String(hashIn || '').toLowerCase();
  let pageTitle = '';
  if (!hash && url) {
    const p = await kugouFromPage(url);
    hash = p.hash;
    pageTitle = p.title;
  }
  if (!hash) throw new Error('没解析到歌曲信息，请确认是酷狗歌曲分享链接');
  /* 直链（拿不到 = VIP/付费/下架）+ 文件名（形如「歌手 - 歌名 - 专辑」）+ 时长 */
  const play = await kugouGetPlayUrl(hash).catch(() => null);
  let title = '';
  let artist = '';
  let duration = (play && play.duration) || 0;
  if (play && play.fileName) {
    const seg = play.fileName.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (seg.length >= 2) { artist = seg[0]; title = seg[1]; }
    else if (seg.length === 1) { title = seg[0]; }
  }
  /* 元数据补全：歌词检索接口可按 hash 反查歌名/歌手
     （VIP 歌拿不到直链、用户上传文件文件名是 hex 乱码、或缺少歌手时用） */
  const metaBad = !title || kugouGarbage(title) || !artist || kugouGarbage(artist);
  if (metaBad || !duration) {
    const l = await kugouLyricSearch(hash).catch(() => null);
    if (l) {
      if (metaBad) {
        if (l.song && !kugouGarbage(l.song)) title = l.song;
        if (l.singer) artist = l.singer;
      }
      if (!duration && l.duration) duration = Math.round(l.duration / 1000);
    }
  }
  /* 页面标题兜底（老格式分享页 <title> 里有歌名_歌手） */
  if (!title && pageTitle) {
    const m = await kugouSearchMeta(pageTitle, hash).catch(() => null);
    if (m) {
      title = m.title;
      artist = artist || m.artist;
      if (!duration && m.duration) duration = m.duration;
    }
  }
  /* 封面：按 歌名+歌手 搜接口（优先同 hash 结果）拿 album_id，再查专辑接口取 imgurl */
  let cover = '';
  if (title) {
    const m = await kugouSearchMeta(`${title} ${artist}`.trim(), hash).catch(() => null);
    if (m && m.album_id) cover = await kugouAlbumCover(m.album_id).catch(() => '');
  }
  /* 清理乱码文件名残留（去掉扩展名/hex 歌手名） */
  if (kugouGarbage(title)) title = title.replace(/\.[a-z0-9]+$/i, '');
  if (kugouGarbage(artist)) artist = '';
  /* 既拿不到直链也查不到任何元数据 = 链接无效/歌曲下架，直接报错不入库 */
  if (!title && !play) throw new Error('没找到这首歌，链接可能无效或歌曲已下架');
  return {
    title: title || '酷狗歌曲',
    artist,
    cover,
    duration,
    source: 'kugou',
    source_id: hash,
    audio: play ? play.url : '',
    vip: play ? 0 : 1
  };
}

/* 歌词检索：按 hash 查候选（同时可用于补歌名/歌手元数据） */
async function kugouLyricSearch(hash) {
  const s = await fetchJson(`https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=${String(hash).toLowerCase()}`);
  const cand = s && s.candidates && s.candidates[0];
  if (!cand) return null;
  return {
    id: cand.id,
    accesskey: cand.accesskey || '',
    song: cand.song || '',
    singer: cand.singer || '',
    duration: cand.duration || 0
  };
}

/* 歌词：search 拿候选 id/accesskey，download 返回 base64 的 LRC */
async function kugouGetLyric(hash) {
  const c = await kugouLyricSearch(hash);
  if (!c || !c.accesskey) return '';
  const d = await fetchJson(
    `https://lyrics.kugou.com/download?ver=1&man=yes&client=pc&hash=${String(hash).toLowerCase()}&id=${c.id}&accesskey=${encodeURIComponent(c.accesskey)}&fmt=lrc&decode=true`
  );
  const content = d && d.content;
  if (!content) return '';
  // base64 → utf8 文本（浏览器无 Buffer，用 atob + TextDecoder）
  const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* 用户上传文件的乱码命名：纯 hex 串 或 hex数字.mp3 形式 */
function kugouGarbage(s) {
  return /^[0-9a-f]{8,}$/i.test(s) || /^[0-9a-z]+\.(mp3|m4a|flac|wav|aac)$/i.test(s);
}

/* ─────────── 总入口 ─────────── */
async function resolveImport(rawUrl) {
  let parsed = parseLink(rawUrl);
  if (parsed.type === 'netease_short') parsed = await neExpandShort(parsed.url);
  switch (parsed.type) {
    case 'netease_song':
      return { kind: 'song', songs: [await neResolveSong(parsed.id)] };
    case 'netease_playlist':
      return await neResolvePlaylist(parsed.id); // {name, songs}
    case 'kugou':
      return { kind: 'song', songs: [await kugouResolve({ hash: parsed.hash })] };
    case 'kugou_page':
      return { kind: 'song', songs: [await kugouResolve({ url: rawUrl })] };
    case 'audio':
      return {
        kind: 'song',
        songs: [{
          title: decodeURIComponent(parsed.url.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '') || '网络歌曲',
          artist: '', cover: '', duration: 0,
          source: 'link', source_id: '', audio: parsed.url, vip: 0
        }]
      };
    default:
      throw new Error('暂时识别不了这个链接，支持网易云歌曲/歌单、酷狗歌曲分享或 mp3/m4a 直链');
  }
}

/* 网易云歌词：优先 Meting 直连（带 CORS，浏览器可直连、不依赖中转），
   失败再回落官方 lyric 接口（走中转）。官方接口不返回 CORS 头，浏览器无法直连。 */
async function neGetLyricMeting(id) {
  for (const host of METING_HOSTS) {
    try {
      const res = await fetch(`${host}/meting/?server=netease&type=lrc&id=${id}`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim()) return text;
      }
    } catch (e) {
      /* 换镜像重试 */
    }
  }
  return '';
}

/* 歌词：网易云 LRC（进程内缓存，避免重复抓取） */
const lyricCache = new Map();
async function neGetLyric(id) {
  if (lyricCache.has(String(id))) return lyricCache.get(String(id));
  let lrc = await neGetLyricMeting(id);
  if (!lrc) {
    try {
      const d = await fetchJson(`https://music.163.com/api/song/lyric?id=${id}&lv=-1&tv=-1`, {
        Referer: 'https://music.163.com/'
      });
      lrc = (d && d.lrc && d.lrc.lyric) || '';
    } catch (e) {
      lrc = '';
    }
  }
  if (lrc) lyricCache.set(String(id), lrc);
  return lrc;
}

/* 运行时解析播放地址：网易云直链有时效，每次播放重新解析 */
async function resolveStreamUrl(song) {
  if (!song) return '';
  if (song.audio && song.audio.startsWith('/assets/')) return song.audio; // 本地上传
  if (song.source === 'netease' && song.source_id && !song.vip) {
    return neGetSongUrl(song.source_id).catch(() => song.audio || '');
  }
  /* 酷狗 CDN 直链带时效，每次播放重新解析；失败回退导入时存的地址 */
  if (song.source === 'kugou' && song.source_id) {
    const r = await kugouGetPlayUrl(song.source_id).catch(() => null);
    if (r && r.url) return r.url;
    return song.audio || '';
  }
  return song.audio || '';
}

/* 播放地址过期重解析：与 resolveStreamUrl 的区别是失败时返回空（让调用方区分「没拿到」和「用旧的」） */
async function refreshAudioUrl(song) {
  if (!song) return '';
  if (song.source === 'netease' && song.source_id) {
    /* 老歌直链过期时优先走 Meting 续签（会员歌也一并尝试，取不到仍标不可播） */
    const viaMeting = await neAudioBest(song.source_id);
    if (viaMeting) return viaMeting;
    return await neGetSongUrl(song.source_id).catch(() => '');
  }
  if (song.source === 'kugou' && song.source_id) {
    const r = await kugouGetPlayUrl(song.source_id).catch(() => null);
    return (r && r.url) || '';
  }
  return '';
}

/* 封面图抓取 → dataURL（入库后离线可用）。
   网易云封面 CDN 自带 CORS 头，可直连抓取（不依赖中转）；
   酷狗 CDN 不带 CORS，必须走中转补 CORS 头。
   策略：先直连，失败再回落到中转——这样即便没配中转，网易云封面仍可缓存。
   大于 2MB 的图拒绝（保护 IndexedDB 体积）。 */
const COVER_MAX_BYTES = 2 * 1024 * 1024;
async function readCoverBlob(res) {
  if (!res.ok) throw new Error(`封面抓取失败 ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('封面返回的不是图片');
  if (blob.size > COVER_MAX_BYTES) throw new Error('封面太大，跳过缓存');
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(new Error('封面读取失败'));
    fr.readAsDataURL(blob);
  });
}
async function fetchCoverDataUrl(url) {
  const u = String(url || '').trim();
  if (!u || u.startsWith('data:')) return '';
  let firstErr = null;
  try {
    return await readCoverBlob(await fetch(u));
  } catch (e) {
    firstErr = e;
  }
  /* 直连失败（通常是缺 CORS 头）→ 回落到中转 */
  const proxied = withProxy(u);
  if (!proxied || proxied === u) throw firstErr || new Error('封面抓取失败');
  return readCoverBlob(await fetch(proxied));
}

/* ═══ 联系人（对方）自己收藏歌曲：cron 每分钟小概率触发，广播弹窗提示 ═══ */
function contactFavTick() {
  try {
    const rows = db.prepare("SELECT id FROM contacts WHERE kind != 'group'").all();
    const now = Math.floor(Date.now() / 1000);
    for (const c of rows) {
      if (Math.random() > 0.012) continue;
      const row = db
        .prepare(
          `SELECT id, title, artist, cover FROM songs
           WHERE id NOT IN (SELECT song_id FROM song_favs WHERE contact_id = ?)
           ORDER BY RANDOM() LIMIT 1`
        )
        .get(c.id);
      if (!row) continue;
      const info = db.prepare('SELECT id, name, avatar FROM contacts WHERE id = ?').get(c.id);
      const desk = db
        .prepare('SELECT sync_chat_avatar, partner_avatar FROM contact_desktop WHERE contact_id = ?')
        .get(c.id);
      let avatar = (info && info.avatar) || '';
      if (desk && desk.sync_chat_avatar && desk.partner_avatar) avatar = desk.partner_avatar;
      db.prepare('INSERT OR IGNORE INTO song_favs(song_id, contact_id, created_at) VALUES(?,?,?)').run(
        row.id,
        c.id,
        now
      );
      notification.broadcast('music_fav', {
        contactId: c.id,
        name: (info && info.name) || '对方',
        avatar,
        song: { id: row.id, title: row.title, artist: row.artist, cover: row.cover }
      });
    }
  } catch (e) {
    console.error('[musicFavTick]', e.message);
  }
}

export { parseLink, resolveImport, resolveStreamUrl, refreshAudioUrl, fetchCoverDataUrl, neGetSongUrl, neGetLyric, kugouGetLyric, contactFavTick }
