/* 拍一拍文本合成
 * 拍一拍库里存的是「被拍的对象」（如「脑袋」「肩膀」），
 * 根据方向合成完整的居中提示文本：
 *   - out（我拍对方）：拍了拍对方的{对象}
 *   - in （对方拍我）：拍了拍你的{对象}
 * 同时兼容老数据：若直接存了完整「拍了拍你的脑袋」，会先归一化成对象再重组，
 * 保证两个方向都不会出现「拍了拍你的拍了拍对方的」这种重复前缀。 */
export function composePoke(raw, dir = 'out') {
  let obj = String(raw || '').trim()
  if (!obj) obj = '肩膀'
  if (obj.startsWith('拍了拍')) obj = obj.slice(3)
  if (obj.startsWith('你的')) obj = obj.slice(2)
  if (obj.startsWith('对方的')) obj = obj.slice(3)
  if (!obj) obj = '肩膀'
  return (dir === 'out' ? '拍了拍对方的' : '拍了拍你的') + obj
}
