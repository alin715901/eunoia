/* 本地版：直接调用浏览器内服务（sql.js 内存库），无网络请求。
 * 导出名与线上版完全一致，上层 stores 无需任何改动。 */
export {
  getChatList,
  searchMessages,
  getMessages,
  getAllMessages,
  sendMessage,
  continueTalk,
  markMessageRead,
  recallMessage,
  deleteMessage,
  favoriteMessage,
  claimRedPacket,
  returnRedPacket,
  claimGroupRedPacket,
  getGroupRedPacketDetail,
  getFavorites,
  clearMessages,
  sendImage,
  sendPoke,
  sendRedPacket,
  sendCallRecord,
  sendQuestion,
} from '../local/api'

export { getWallet, setMyBalance } from '../local/api'
