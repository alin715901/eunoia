<template>
  <svg
    class="mood-face"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="color ? { color } : null"
    aria-hidden="true"
  >
    <g v-html="face" />
  </svg>
</template>

<script setup>
/* 心情标签的极简线条表情：统一圆脸，只变眉眼嘴。
   12 个预设心情各一枚；自定义标签不走表情（用色点）。 */
import { computed } from 'vue'

const FACE_CIRCLE = '<circle cx="12" cy="12" r="9.2"/>'
const FACES = {
  /* 开心：弯眼 + 大笑 */
  happy:
    FACE_CIRCLE +
    '<path d="M7.6 10.1 q1.1 -1.3 2.2 0 M14.2 10.1 q1.1 -1.3 2.2 0"/>' +
    '<path d="M8.2 13.9 q3.8 3.6 7.6 0"/>',
  /* 激动：圆眼 + 张嘴 */
  excited:
    FACE_CIRCLE +
    '<circle cx="7.9" cy="10.2" r="1"/><circle cx="16.1" cy="10.2" r="1"/>' +
    '<ellipse cx="12" cy="14.4" rx="2" ry="1.8"/>',
  /* 甜蜜：闭眼 + 浅笑 */
  sweet:
    FACE_CIRCLE +
    '<path d="M7.6 10.3 q1.1 1.1 2.2 0 M14.2 10.3 q1.1 1.1 2.2 0"/>' +
    '<path d="M9.2 14 q2.8 2.2 5.6 0"/>',
  /* 平静：点眼 + 平嘴 */
  calm:
    FACE_CIRCLE +
    '<path d="M7.2 10.3 h2 M14.8 10.3 h2"/>' +
    '<path d="M8.6 14.4 h6.8"/>',
  /* 疲惫：眼皮下垂 + 微叹 */
  tired:
    FACE_CIRCLE +
    '<path d="M7.4 10.5 q1.1 0.9 2.2 0 M14.4 10.5 q1.1 0.9 2.2 0"/>' +
    '<path d="M9.4 14.7 q2.6 -1.1 5.2 0"/>',
  /* 难过：八字眉 + 撇嘴 */
  sad:
    FACE_CIRCLE +
    '<path d="M7.1 8.5 q1.1 -0.4 2.2 0 M14.7 8.5 q1.1 -0.4 2.2 0"/>' +
    '<path d="M7.5 10.7 q1.1 -0.5 2.2 0 M14.3 10.7 q1.1 -0.5 2.2 0"/>' +
    '<path d="M8.6 15.2 q3.4 -2.8 6.8 0"/>',
  /* 焦虑：波浪嘴 */
  anxious:
    FACE_CIRCLE +
    '<path d="M7.4 10.3 h2 M14.6 10.3 h2"/>' +
    '<path d="M8 14.2 q1.1 -1.2 2.2 0 t2.2 0 t2.2 0"/>',
  /* 生气：压眉 + 咬牙 */
  angry:
    FACE_CIRCLE +
    '<path d="M7.1 8.7 l2.5 1.1 M16.9 8.7 l-2.5 1.1"/>' +
    '<path d="M7.5 11 h2 M14.5 11 h2"/>' +
    '<path d="M9 14.8 h6"/>',
  /* 烦躁：高低眉 + 咬牙 */
  irritable:
    FACE_CIRCLE +
    '<path d="M7 8.5 l2.5 -0.8 M14.5 9.7 l2.5 0.8"/>' +
    '<path d="M7.5 10.9 h2 M14.5 10.9 h2"/>' +
    '<path d="M9.2 14.8 h5.6"/>',
  /* 委屈：垂眼 + 泪 + 扁嘴 */
  wronged:
    FACE_CIRCLE +
    '<path d="M7.6 10.2 q1.1 -0.9 2.2 0 M14.2 10.2 q1.1 -0.9 2.2 0"/>' +
    '<path d="M8.7 11.8 v1.4 M15.3 11.8 v1.4"/>' +
    '<path d="M9.6 14.8 q2.4 -1.8 4.8 0"/>',
  /* 无聊：半眯 + 平嘴 */
  bored:
    FACE_CIRCLE +
    '<path d="M7.4 10.7 q1.1 0.7 2.2 0 M14.4 10.7 q1.1 0.7 2.2 0"/>' +
    '<path d="M9 14.8 h6"/>',
  /* 呆滞：呆毛 + 直眼 + 小圆嘴 */
  blank:
    FACE_CIRCLE +
    '<path d="M12 2.6 q0.8 1.5 -0.3 2.4"/>' +
    '<circle cx="7.9" cy="10.3" r="0.9"/><circle cx="16.1" cy="10.3" r="0.9"/>' +
    '<circle cx="12" cy="14.6" r="1.3"/>'
}

const props = defineProps({
  name: { type: String, default: 'calm' },
  size: { type: [Number, String], default: 18 },
  color: { type: String, default: '' }
})
const face = computed(() => FACES[props.name] || FACES.calm)
</script>
