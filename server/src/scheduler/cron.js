// 定时任务：主动消息（对方后台无人交互时主动发来字卡）、朋友圈、信件等
const chatService = require('../services/chat.service');
const momentService = require('../services/moment.service');
const letterService = require('../services/letter.service');
const companionService = require('../services/companion.service');
const listenService = require('../services/listen.service');
const musicService = require('../services/music.service');

function start() {
  // eslint-disable-next-line no-console
  console.log('[scheduler] cron started');
  // 主动消息：每分钟检查一次，由 chatService.proactiveTick 内部按每个联系人的间隔节流
  setInterval(() => {
    try {
      chatService.proactiveTick();
    } catch (e) {
      /* ignore */
    }
    // 朋友圈：开了「主动发朋友圈」的联系人按频率发动态
    try {
      momentService.momentTick();
      // 朋友圈评论：开了「会回复评论」的联系人，偶尔在我的动态下评论
      momentService.momentCommentTick();
    } catch (e) {
      /* ignore */
    }
    // 信件：开了「主动寄信」的联系人，按每周封数与句数设置自动从字卡库抽句寄信
    try {
      letterService.letterTick();
    } catch (e) {
      /* ignore */
    }
    // 陪伴邀请：联系人小概率主动邀请我一起吃饭/学习…，顺带清理过期邀请
    try {
      companionService.contactInviteTick();
      listenService.contactInviteTick();
    } catch (e) {
      /* ignore */
    }
    // 音乐：联系人小概率自己收藏一首歌（弹窗提示）
    try {
      musicService.contactFavTick();
    } catch (e) {
      /* ignore */
    }
  }, 60 * 1000);
}

module.exports = { start };
