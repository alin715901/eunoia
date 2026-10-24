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

      <!-- 使用须知 / 使用问题：普通卡片 -->
      <template v-if="tab !== '使用教程'">
        <section v-for="s in currentSections" :key="s.title" class="panel sec">
          <h3 class="h-title">{{ s.title }}</h3>
          <p v-for="(t, i) in s.items" :key="i" class="h-item">{{ t }}</p>
        </section>
      </template>

      <!-- 使用教程：普通卡片，点击展开/收起 -->
      <template v-else>
        <div
          v-for="(g, gi) in GUIDE_SECTIONS"
          :key="gi"
          class="acc panel"
          :class="{ open: openSet[gi] }"
          @click="toggle(gi)"
        >
          <div class="acc-head">
            <span class="acc-title">{{ g.title }}</span>
            <span class="acc-arrow">{{ openSet[gi] ? '▲' : '▼' }}</span>
          </div>
          <div v-if="openSet[gi]" class="acc-body" @click.stop>
            <template v-for="(b, bi) in g.blocks" :key="bi">
              <div v-if="b.head" class="acc-sub">{{ b.head }}</div>
              <div v-for="(ln, li) in b.lines" :key="bi + '-' + li" class="acc-line" :class="{ note: b.note }">{{ ln }}</div>
            </template>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
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

/* ── 使用教程：可展开手风琴 ── */
const GUIDE_SECTIONS = [
  {
    title: '桌面设置',
    blocks: [
      { head: '人物卡卡片', lines: [
        '① 显示头像、昵称、签名、背景和时间，点击可修改和切换主体。',
        '② 灵魂链接、纪念日和音乐卡片跟随切换。'
      ]},
      { head: '灵魂链接卡片', lines: ['与主体的链接状态。'] },
      { head: '纪念日卡片', lines: ['点击可切换纪念日展示。'] },
      { head: '音乐卡片', lines: [
        '① 点击背景可上传背景图，再次点击设置透明度。',
        '② 点击歌曲胶片，弹出歌曲播放列表。',
        '③ 一起听累计时长统计。'
      ]}
    ]
  },
  {
    title: '字卡库',
    blocks: [
      { lines: [
        '① 参照 milk 老师的，支持导入 milk 网站的字卡文件。分通用和专属库，拍一拍算在通用（内置 5% 触发），对方回复时混抽，通用库占比在联系人设置里调整。',
        '② 包括主字卡、emoji、颜文字、图片、表情包、语音字卡。',
        '③ 关怀文案，快来经期或经期当天对方关心你的文案，开启后使用，可在联系人设置里开启。'
      ]}
    ]
  },
  {
    title: '聊天',
    blocks: [
      { head: '列表页面', lines: [
        '① 右上角 ＋，添加创建联系人和群聊。',
        '② 上方搜索栏可搜索联系人 / 群聊 / 聊天记录，展示相关信息，点击可跳转具体位置。'
      ]},
      { head: '聊天页面', lines: [
        '③ 右上角 …，进入设置，设置头像、名称、置顶、免打扰、拉黑（拉黑后只是收不到对方的消息，其他功能仍可以用）、特殊关怀、美化设置、回复设置、minimax 语音、专属字卡库等。',
        '④ 左下角 ＋，功能如下：',
        '· 红包：我的余额可自定义，对方余额会自动增资。群聊只显示我的余额，成员也可以发红包。',
        '· 相册：发送图片。',
        '· 通话：可收起为悬浮窗，群聊可通话，成员随时可能加入或退出。',
        '· 提问：单选、多选和问答题。',
        '⑤ 表情包：有通用和专属，需要在字卡库里添加。',
        '⑥ 表情包旁边的 …，点击让对方继续说。',
        '⑦ 长按消息或气泡，可引用、收藏、删除、撤回。'
      ]}
    ]
  },
  {
    title: '朋友圈',
    blocks: [
      { lines: [
        '① 右上角 …，编辑我的头像、名称、背景。',
        '② 右上角 ＋，发朋友圈。',
        '③ 朋友圈可点赞、收藏（名字旁边有 ⭐ 标识）、评论（可发表情包和手机图片）。',
        '④ 点击头像，可查看该联系人的全部朋友圈。'
      ]}
    ]
  },
  {
    title: '纪念',
    blocks: [
      { lines: [
        '① 右上角 ＋ 新建纪念日，名称、日期（公 / 农历）、类型、归属。',
        '② 纪念日可以在桌面的卡片里选择展示，只能选“我的”和“专属联系人的”。'
      ]}
    ]
  },
  {
    title: '信件',
    blocks: [
      { lines: [
        '① 信件可展开查看详情，按周 / 月分类。',
        '② 展开有收藏、回信、删除。',
        '③ 收藏有 ⭐ 标识。',
        '④ 我或对方回信后，下方展示原信，点击可跳转查看。',
        '⑤ 选择回信，写信上方显示回复哪一封信。'
      ]}
    ]
  },
  {
    title: '陪伴',
    blocks: [
      { lines: [
        '① 吃饭、睡觉、工作、学习、锻炼、摸鱼。',
        '② 你和对方都可邀请，聊天发送邀请卡，陪伴页面上方显示邀请消息。',
        '③ 正计时、倒计时。',
        '④ 结束后会记录。'
      ]}
    ]
  },
  {
    title: '占卜',
    blocks: [
      { lines: ['参考 milk 老师的，每周每日运势、雷诺曼、塔罗占卜，占卜结束会有记录。'] }
    ]
  },
  {
    title: '感知',
    blocks: [
      { lines: ['感知此刻与主体的链接，右上角 … 查看说明。'] },
      { lines: [
        '· 空间感：与主体的距离。',
        '· 存在感：周围有多少人。',
        '· 情绪状态：情绪的强烈起伏。'
      ], note: true },
      { lines: ['（仅供参考，请注意辨别）'], note: true }
    ]
  },
  {
    title: '心迹',
    blocks: [
      { lines: ['工作台是做好的独立网站，再接入到字卡里，请单独导出或导入数据。'] },
      { lines: ['① 用于记录和分析链接强弱和占卜记录。'] },
      { lines: ['② 工作栏：左侧工作栏可收，显示全部主体，搜索栏可搜索主体。'] },
      { lines: ['③ 设置：管理外观主题、字段开关和数据，外观主题可自定义或上传背景图，数据采用 json 和 csv 两种。'] },
      { lines: ['④ 创建主体：链接的主体，可以自定义类型和标签分组。'] },
      { lines: ['⑤ 记录状态：记录与主体链接的强弱、心情、事件、影响因素、体感灵觉，可以上传图片，加了补记标识。'] },
      { lines: ['⑥ 记录占卜：记录与主体相关的占卜问题、牌面、感想，可以自定义占卜方式和上传图片，加了应验选项和说明，如果未来有对上的可以回头补充。'] },
      { lines: ['⑦ 感知此刻：感知此刻与主体的链接，不会留存记录（结果仅供参考）。'] },
      { lines: ['⑧ 记录流：按年月分组，顶部搜索栏搜标签或文字显示记录卡，记录卡时间精确到时分，内容可展开收起，图片可点开，方便查看。'] },
      { lines: ['⑨ 分析：链接状态呈波动趋势，占卜过的日期会显示占卜标点，心情、影响因素、体感和灵觉，呈饼图占比，可以查看日度 / 月度 / 年度分析。'] }
    ]
  },
  {
    title: '音乐',
    blocks: [
      { lines: [
        '① 可以导入音频文件，批量导入网易云歌曲 / 歌单链接，酷狗歌曲分享链接（因为 QQ 音乐的限制，不支持解析导入）。',
        '② 加了解析服务，有需要的可以自己填写，不填则默认使用云端解析。',
        '③ 会员付费歌曲会有“会员”和“不可播”标识。',
        '④ 右上角：移除会员付费歌曲，设置。',
        '⑤ 右下角有定位锚点，点击跳转正在播放的歌曲。',
        '⑥ 点击底部播放器的封面进入歌词页，歌词页右上角 …，邀请一起听。',
        '⑦ 进度条可拖动。',
        '⑧ 长按歌曲可选择操作：收藏、移动到歌单、删除。'
      ]}
    ]
  },
  {
    title: '影院',
    blocks: [
      { lines: ['严禁添加任何非法、色情和暴力网站及视频。'], note: true },
      { head: '站点', lines: ['① 添加网站，点击跳转原网站（视频网站大多禁止内嵌，内嵌了也播不了视频）。'] },
      { head: '影片', lines: [
        '② 观影时右上方有全屏按钮，有的视频自带的全屏打不开可以用这个。观影会累计时长。',
        '③ 支持 b 站 / 腾讯视频链接和 mp4 直链，导入后直接播放；其他平台链接跳转浏览器里打开。（b 站的分享链接需要在浏览器打开后，再复制链接才可以导入）',
        '④ 建议用 b 站，毕竟腾讯很多要会员，观感没这么好。'
      ]}
    ]
  },
  {
    title: '游戏',
    blocks: [
      { lines: [
        '① 每个游戏下方都有游戏规则说明，游戏结束会有记录，在右上方的“历史”查看。',
        '② 有七款：默契翻牌、抽鬼牌、五子棋、围棋、飞行棋、猜拳、猜数。'
      ]}
    ]
  },
  {
    title: '心情',
    blocks: [
      { lines: [
        '① 顶部右上角可切换联系人。',
        '② 日历左上角“回到今日”，右上角 ＋，记录今天的心情。',
        '③ 下方展示区“查看分布”，点击查看本月的心情分布。',
        '④ 使用网站时，联系人会随时记录。',
        '⑤ 每天的心情记录以便签纸的形式展示在日历下方。',
        '⑥ 设置的纪念日 / 倒数日会在相应的日期显示。'
      ]}
    ]
  },
  {
    title: '备忘录',
    blocks: [
      { lines: [
        '① 右上角 ＋，添加待办 / 便签。',
        '② 待办 / 便签卡片，右上角有修改，置顶。',
        '③ 完成的待办会放到“已完成”，在“全部”中将不显示。',
        '④ 桌面备忘录卡片会展示置顶待办 / 便签，多条置顶点击可切换。'
      ]}
    ]
  },
  {
    title: '经期',
    blocks: [
      { lines: [
        '① 记录两次以上，系统自动统计周期规律并更新预测经期。',
        '② 顶部导航栏右侧“清空”，点击清空所有的经期记录。',
        '③ 日历下方显示卡片，右侧垃圾桶，点击删除这一天的记录，也不会计入经期。',
        '④ 经期记录有流量多少、痛经程度，日历会显示出来。',
        '⑤ 未来日期不可记录。',
        '⑥ 桌面经期卡片会展示排卵期 / 预测经期，点击可切换，若处于经期则展示经期第几天。'
      ]}
    ]
  },
  {
    title: '相册',
    blocks: [
      { lines: [
        '① 点击照片墙，右上角“装饰”进入装饰。',
        '② 进入装饰，下方弹出工具栏，上方显示页数和缩放度。',
        '③ 可双指放大缩小照片墙预览。',
        '④ 可左右无缝滑动，页数在工具栏添加或删减。',
        '⑤ 照片可手机上传，可选择字卡库的照片。',
        '⑥ 点击照片或其他，可进行置顶、上移、下移、置底、锁定和删除等操作。',
        '⑦ 相框、贴纸、底纸可自定义上传，没有抠图功能，需要自己抠好图上传。',
        '⑧ 文字可设置字体风格（中文、英文、日韩）、字号、大小、粗细、倾斜。'
      ]}
    ]
  },
  {
    title: '统计',
    blocks: [
      { lines: [
        '① 右上角可切换联系人。',
        '② 统计：聊天条数、占比、最近聊天时间和日期等。',
        '③ 消息收藏：收录你收藏的消息，语音可播放，语音文字在下方显示一行（过长省略）。',
        '④ 提问：你提问的问题。',
        '⑤ 红包：你和对方发红包的次数、累计金额和占比。',
        '⑥ 邀请：你和对方邀请游戏、观影和听歌的次数。'
      ]}
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

const TAB_MAP = { 使用须知: NOTICE_SECTIONS, 使用教程: [], 使用问题: QA_SECTIONS }
const currentSections = computed(() => TAB_MAP[tab.value] || [])

/* 手风琴展开状态（允许多个同时展开） */
const openSet = reactive({})
function toggle(i) { openSet[i] = !openSet[i] }
</script>

<style scoped>
.sp-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.sp-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
/* 关键：滚动容器内的卡片禁止被 flex 压缩，否则内容超一屏时全部裁字 */
.sp-body > * { flex: 0 0 auto; }

/* 页签 */
.hp-tabs { display: flex; gap: 8px; }
.hp-tab {
  flex: 1; border: 1px solid var(--border); background: var(--bg-screen);
  border-radius: 999px; padding: 9px 0; font-size: 13px; color: var(--text-soft);
  transition: all .2s ease;
}
.hp-tab.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }

/* 普通卡片 */
.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 14px; }
.h-title { margin: 0 0 8px; font-size: 15px; font-weight: 700; color: var(--text); }
.h-item { margin: 0 0 8px; font-size: 13px; line-height: 1.75; color: var(--text-soft); }
.h-item:last-child { margin-bottom: 0; }

/* 手风琴：普通 div 卡片，避免部分浏览器对 button 的渲染问题 */
.acc { overflow: hidden; }
.acc-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 14px; cursor: pointer;
}
.acc-title { font-size: 15px; font-weight: 700; line-height: 1.5; color: var(--text); }
.acc-arrow { font-size: 11px; color: var(--text-soft); flex: 0 0 auto; }
.acc-body { padding: 2px 14px 14px; border-top: 1px solid var(--border); cursor: default; }
.acc-sub { margin: 12px 0 6px; font-size: 13px; font-weight: 600; line-height: 1.6; color: var(--accent); }
.acc-line { position: relative; padding-left: 12px; margin-bottom: 7px; font-size: 13px; line-height: 1.7; color: var(--text-soft); }
.acc-line:last-child { margin-bottom: 0; }
.acc-line::before { content: ''; position: absolute; left: 0; top: 9px; width: 5px; height: 5px; border-radius: 50%; background: var(--text-soft); opacity: .6; }
.acc-line.note { color: #c0956a; }
.acc-line.note::before { background: #c0956a; }
</style>
