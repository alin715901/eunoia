/* 本地版：直接调用浏览器内服务，无网络请求 */
export {
  getCardGroups,
  getCardGroupStats,
  createCardGroup,
  updateCardGroup,
  deleteCardGroup,
  getCards,
  createCard,
  updateCard,
  createCardsBatch,
  importMochi,
  deleteCard,
  drawPreview,
  listMyPokes,
  createMyPokes,
  updateMyPoke,
  deleteMyPoke,
} from '../local/api'
