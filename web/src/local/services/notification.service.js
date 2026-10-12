// SSE 客户端集合与广播
const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

// 本地版：没有 SSE 长连接，广播改用 window 自定义事件（eunoia:<event>），
// 前端 store / 组件按需监听（如主动消息、来电、信件到达）。
function broadcast(event, data) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent(`eunoia:${event}`, { detail: data }))
    }
  } catch (e) {
    /* 忽略 */
  }
}

export {
  clients,
  addClient,
  removeClient,
  broadcast,
};
