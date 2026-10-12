/* 本地版：直接调用浏览器内服务，无网络请求 */
export {
  sendListenInvite,
  respondListenInvite,
  cancelListenInvite,
  endListen,
  getListenInvites,
  getListenMinutes,
  addListenMinutes,
  setListenMinutes,
} from '../local/api'
