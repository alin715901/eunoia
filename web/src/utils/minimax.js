/* MiniMax 语音（TTS）工具：配置按联系人存在 contact_settings 的 minimax_* 列，
 * 这里只封装「调用」与「常量」——存取走 api/contacts 的 getContactSettings /
 * updateContactSettings（列已迁移，见 local/migrate.js）。
 *
 * API：T2A v2（非流式）
 *   POST https://api.minimax.chat/v1/t2a_v2?GroupId={group}
 *   Header: Authorization: Bearer {apiKey}
 *   Body:   { model, text, stream:false, voice_setting:{voice_id,speed,vol,pitch},
 *             audio_setting:{sample_rate,format,channel}, language_boost }
 *   返回:   { data:{ audio:"<hex mp3>", status:2 }, base_resp:{ status_code:0 } }
 */

/* 语音语言（参考站选项）：原文=不指定语言由模型判断 */
export const MM_LANGS = [
  { k: 'auto', n: '原文', boost: '' },
  { k: 'zh', n: '中文', boost: 'Chinese' },
  { k: 'ja', n: '日语', boost: 'Japanese' },
  { k: 'en', n: '英语', boost: 'English' },
  { k: 'ko', n: '韩语', boost: 'Korean' },
  { k: 'de', n: '德语', boost: 'German' }
]

/* 常用模型（可手填覆盖） */
export const MM_MODELS = [
  { k: 'speech-02-turbo', n: 'speech-02-turbo（快）' },
  { k: 'speech-02-hd', n: 'speech-02-hd（高清）' },
  { k: 'speech-01-turbo', n: 'speech-01-turbo' }
]

export const MM_GENDERS = [
  { k: 'female', n: '女声' },
  { k: 'male', n: '男声' }
]

/* 从 contact_settings 行读出一份干净配置 */
export function readCfg(s) {
  return {
    enabled: !!Number(s?.minimax_enabled),
    key: String(s?.minimax_key || ''),
    group: String(s?.minimax_group || ''),
    model: String(s?.minimax_model || 'speech-02-turbo'),
    voice: String(s?.minimax_voice || ''),
    lang: String(s?.minimax_lang || 'auto'),
    speed: Number(s?.minimax_speed) > 0 ? Number(s.minimax_speed) : 1,
    gender: String(s?.minimax_gender || 'female'),
    style: String(s?.minimax_style || '')
  }
}

export function cfgReady(cfg) {
  return !!(cfg && cfg.key && cfg.group && cfg.model && cfg.voice)
}

/* hex 字符串 → Blob（mp3） */
function hexToBlob(hex, type = 'audio/mpeg') {
  const clean = hex.replace(/\s+/g, '')
  const buf = new ArrayBuffer(clean.length / 2)
  const view = new Uint8Array(buf)
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return new Blob([view], { type })
}

/**
 * 调用 MiniMax TTS，返回 mp3 Blob（失败抛错，错误信息可读）。
 * 消息生成（chat.service）用它拿 Blob 转 dataURL 持久化；试听/播放用它转 objectURL。
 */
export async function minimaxTtsBlob(cfg, text) {
  const t = String(text || '').trim()
  if (!t) throw new Error('没有要朗读的文字')
  if (!cfgReady(cfg)) throw new Error('MiniMax 配置不完整（API Key / Group ID / 模型 / Voice ID）')
  const boost = (MM_LANGS.find((l) => l.k === cfg.lang) || {}).boost || ''
  const body = {
    model: cfg.model,
    text: t.slice(0, 2000),
    stream: false,
    voice_setting: {
      voice_id: cfg.voice,
      speed: Math.min(3, Math.max(0.5, Number(cfg.speed) || 1)),
      vol: 1,
      pitch: 0
    },
    audio_setting: { sample_rate: 32000, format: 'mp3', channel: 1 }
  }
  if (boost) body.language_boost = boost
  let res
  try {
    res = await fetch(`https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(cfg.group)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  } catch (e) {
    throw new Error('网络请求失败（浏览器直连可能被 CORS 拦截，需在 MiniMax 控制台放权当前域名）')
  }
  let json = null
  try { json = await res.json() } catch (e) { /* 非 JSON（如 HTML 错误页） */ }
  if (!res.ok) {
    throw new Error(`MiniMax 接口错误 HTTP ${res.status}` + (json?.base_resp?.status_msg ? `：${json.base_resp.status_msg}` : ''))
  }
  if (json?.base_resp && json.base_resp.status_code !== 0) {
    throw new Error(`MiniMax 接口错误 ${json.base_resp.status_code}：${json.base_resp.status_msg || '未知'}`)
  }
  const audio = json?.data?.audio
  if (!audio) throw new Error('MiniMax 未返回音频（可能文本超长或参数有误）')
  return hexToBlob(audio)
}

/* 调用 MiniMax TTS，返回音频 objectURL（调用方负责 revoke）。供试听/即时播放用 */
export async function minimaxTts(cfg, text) {
  return URL.createObjectURL(await minimaxTtsBlob(cfg, text))
}
