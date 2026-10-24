<template>
  <div class="sp-view">
    <AppHeader title="使用说明" back />
    <div class="sp-body">
      <section v-for="s in SECTIONS" :key="s.title" class="panel sec">
        <h3 class="h-title">{{ s.title }}</h3>
        <p v-for="(t, i) in s.items" :key="i" class="h-item">{{ t }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import AppHeader from '@/components/layout/AppHeader.vue'

const SECTIONS = [
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
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.h-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: var(--text); }
.h-item { margin: 0 0 8px; font-size: 13px; line-height: 1.75; color: var(--text-soft); }
.h-item:last-child { margin-bottom: 0; }
</style>
