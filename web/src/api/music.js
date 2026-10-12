/* 本地版：直接调用浏览器内服务，无网络请求 */
export {
  getMusicSongs,
  importMusic,
  addMusicManual,
  updateMusicSong,
  deleteMusicSong,
  batchDeleteMusicSongs,
  clearUnplayableSongs,
  favMusicSong,
  getMusicSettings,
  saveMusicSettings,
  uploadMusicFile,
  streamUrl,
  getFavIds,
  getMusicLyric,
} from '../local/api'
