<template>
  <div class="sp-view">
    <AppHeader title="使用说明" back />
    <div class="sp-body">
      <!-- 分类页签 -->
      <div class="hp-tabs">
        <button
          v-for="t in TABS"
          :key="t"
          class="hp-tab"
          :class="{ on: tab === t }"
          @click="tab = t"
        >{{ t }}</button>
      </div>

      <section v-for="s in currentSections" :key="s.title" class="panel sec">
        <h3 class="h-title">{{ s.title }}</h3>
        <p v-for="(t, i) in s.items" :key="i" class="h-item" :class="{ 'h-warn': s.warn && i === s.items.length - 1 }">{{ t }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'

const TABS = ['使用须知', '使用教程', '使用问题']
const tab = ref('使用须知')

/* ── 使用须知：复制自首次进入网站的引导弹窗（NoticeDialog） ── */
const NOTICE_SECTIONS = [
  {
    title: '使用须知',
    items: [
      '本网站完全免费，不收取任何费用。字卡网站只是工具，使用情况因人而异，若使用过程中感到不适，请停止使用。支持二改二传和个人部署。',
      '建议定期导出数据，以免数据丢失。“心迹”为独立网站，请单独导出或导入数据。'
    ]
  },
  {
    title: '使用条款（使用本网站即代表你同意以下条款）',
    items: [
      '① 尊重创作：不恶意评价、拉踩、污蔑任何字卡内容或提供字卡的老师。发布任何相关的二改二传、灵感或参考等，标明出处。',
      '② 尊重角色：任何人接触新事物都需要一个适应的过程，给对方一点时间，理性看待内容。',
      '③ 内容合规：严禁利用本站上传、发布任何违反国家法律法规、涉黄涉暴或侵犯他人版权（如未经授权的商用素材）的内容。',
      '④ 数据自负：因个人误操作（如清理浏览器缓存）、设备损坏或自带云端账号欠费导致的数据丢失，本站不承担赔偿责任。',
      '⑤ 合理使用：请勿使用脚本、爬虫等恶意手段攻击本站或干扰服务器正常运行。'
    ]
  }
]

/* ── 使用教程：待补充（由用户撰写后填入） ── */
const GUIDE_SECTIONS = [
  {
    title: '使用教程',
    items: [
      '使用教程内容整理中，敬请期待。'
    ]
  }
]

/* ── 使用问题：原理与答疑 ── */
const QA_SECTIONS = [
  {
    title: '数据存在哪里？',
    items: [
      '本应用没有账号体系，全部数据（联系人、聊天、字卡、音乐、相册等）都保存在你当前浏览器的本地数据库里，换浏览器 / 换设备不会自动跟随。',
      '不同网站之间的数据完全隔离；把数据带到别处请用「内存数据」页的备份导出 / 导入，或云端恢复。'
    ]
  },
  {
    title: '云端同步（阿里云 OSS）',
    items: [
      '在「阿里云 OSS」页填入 AccessKey、Bucket 并保存连接后，会把本浏览器全部数据备份为云端一个 JSON 文件。',
      '每次打开网站约 15 秒后自动同步一次（距上次成功同步不足 30 分钟则跳过）；页面常开时每 30 分钟同步一次；保存连接成功立即同步。',
      '「迁移本地图片到云端」可把消息里的图片转为 OSS 链接存放，减小本地占用；备份文件里只保留链接，恢复后仍从 OSS 加载。',
      '注意：云端只保留最新一份备份，每次同步都会覆盖。建议同一时间段只在一台设备上当主力，换设备时先「从云端恢复数据」再继续使用，避免互相覆盖。'
    ]
  },
  {
    title: '备份与恢复',
    items: [
      '「内存数据」页支持导出 JSON 备份文件：全部导出 / 按板块导出（字卡库、美化设置、聊天、朋友圈、信件、纪念、陪伴、占卜、音乐、影院、游戏、心情、备忘录、经期、相册、统计）/ 按联系人导出。',
      '导入数据可选择「合并」（同名联系人、歌曲自动归并，不覆盖本地已有）或「覆盖」（先清空对应范围再写入）。'
    ]
  },
  {
    title: '语音消息（MiniMax）',
    items: [
      '在「MiniMax 语音」页开启并填入 API Key 等配置后，对方回复的文字字卡有概率（内置 20%）转为语音消息，配置齐全时是可播放的真实语音。',
      '开启但未配置时转出的是伪语音（能播动画但没有声音）；补齐配置后，历史伪语音会在后台自动升级为真实语音。',
      '每条语音默认显示转写文字，可在聊天设置里调整。'
    ]
  },
  {
    title: '换设备 / 换浏览器建议',
    items: [
      '方式一（推荐）：旧设备「保存并连接 OSS」完成一次同步 → 新设备填同一套 OSS 配置 → 「从云端恢复数据到本浏览器」。',
      '方式二：旧设备「全部导出」得到备份文件 → 新设备「导入数据」。'
    ]
  }
]

const TAB_MAP = { 使用须知: NOTICE_SECTIONS, 使用教程: GUIDE_SECTIONS, 使用问题: QA_SECTIONS }
const currentSections = computed(() => TAB_MAP[tab.value] || [])
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.hp-tabs { display: flex; gap: 8px; }
.hp-tab {
  flex: 1; border: 1px solid var(--border); background: var(--bg-screen);
  border-radius: 999px; padding: 9px 0; font-size: 13px; color: var(--text-soft);
  transition: all .2s ease;
}
.hp-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.h-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: var(--text); }
.h-item { margin: 0 0 8px; font-size: 13px; line-height: 1.75; color: var(--text-soft); }
.h-item:last-child { margin-bottom: 0; }
.h-warn { color: #c0956a; }
</style>
