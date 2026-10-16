/* 本地版：直接调用浏览器内服务，无网络请求 */
export {
  sendGameInvite,
  respondGameInvite,
  cancelGameInvite,
  endGame,
  getGameInvites,
  getActiveGame,
  getGameName,
  getGameMetaList,
  getGameMeta,
} from '../local/api'
