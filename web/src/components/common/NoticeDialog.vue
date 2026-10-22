<template>
  <!-- 首次进入的使用须知：必须勾选同意才能进入，否则只能退出网站 -->
  <div class="nt-mask">
    <div class="nt-card">
      <h3 class="nt-title">使用须知</h3>
      <div class="nt-body">
        <p>本网站不收取任何费用。字卡网站只是工具，使用情况因人而异，若使用过程中感到不适，请停止使用。支持二改二传和个人部署。</p>
        <p>建议定期导出数据，以免数据丢失。“心迹”为独立网站，请单独导出或导入数据。</p>
        <p class="nt-terms-head">使用本网站，即代表你同意以下条款：</p>
        <ol class="nt-terms">
          <li>尊重创作：不恶意评价、拉踩、污蔑任何字卡内容或提供字卡的老师。发布任何相关的二改二传，灵感或参考等，请标明出处。</li>
          <li>尊重角色：任何人接触新事物都需要一个适应的过程，请给对方一点时间，理性看待内容。</li>
          <li>内容合规：严禁利用本站上传、发布任何违反国家法律法规、涉黄涉暴或侵犯他人版权（如未经授权的商用素材）的内容。</li>
          <li>数据自负：因个人误操作（如清理浏览器缓存）、设备损坏或自带云端账号欠费导致的数据丢失，本站不承担赔偿责任。</li>
          <li>合理使用：请勿使用脚本、爬虫等恶意手段攻击本站或干扰服务器正常运行。</li>
        </ol>
      </div>
      <label class="nt-check">
        <input v-model="agreed" type="checkbox" />
        <span>我已知晓并同意上述条款</span>
      </label>
      <button v-if="!agreed" class="nt-btn" @click="exitSite">退出</button>
      <button v-else class="nt-btn primary" @click="$emit('enter')">进入</button>
      <p v-if="closeHint" class="nt-hint">页面未能自动关闭，请手动关闭本标签页</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineEmits(['enter'])

const agreed = ref(false)
const closeHint = ref(false)

/* 退出网站：优先关闭标签页；浏览器禁止脚本关窗时给出手动关闭提示 */
function exitSite() {
  window.close()
  setTimeout(() => {
    if (!document.hidden) closeHint.value = true
  }, 300)
}
</script>

<style scoped>
.nt-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  /* 压过确认弹窗（1200）：首次须知应在最上层 */
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.nt-card {
  width: 100%;
  max-width: 320px;
  max-height: 82%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--bg-screen);
  border-radius: var(--radius-lg);
  padding: 20px 18px 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  text-align: center;
}
.nt-title {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 700;
  font-family: var(--font-serif);
  color: var(--text);
}
.nt-body {
  overflow-y: auto;
  text-align: left;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-soft);
  margin-bottom: 12px;
  -webkit-overflow-scrolling: touch;
}
.nt-body p { margin: 0 0 10px; }
.nt-terms-head { font-weight: 600; color: var(--text); }
.nt-terms { margin: 0; padding-left: 18px; }
.nt-terms li { margin-bottom: 8px; }
.nt-check {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 13px;
  color: var(--text);
  margin-bottom: 12px;
  cursor: pointer;
  user-select: none;
}
.nt-check input { width: 16px; height: 16px; accent-color: var(--accent); }
.nt-btn {
  width: 100%;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 11px 0;
  font-size: 14px;
  color: var(--text);
}
.nt-btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}
.nt-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #c0576b;
}
</style>
