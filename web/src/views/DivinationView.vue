<template>
  <div class="divi">
    <AppHeader title="占卜" back />

    <!-- 顶部四个 tab -->
    <div class="d-tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="d-tab"
        :class="{ on: tab === t.key }"
        @click="tab = t.key"
      >
        <AppIcon :name="t.icon" :size="16" />
        <span>{{ t.label }}</span>
      </button>
    </div>

    <div class="d-body">
      <!-- ═══════ 每日运势 ═══════ -->
      <template v-if="tab === 'daily'">
        <div class="seg">
          <button class="seg-btn" :class="{ on: dailyState.mode === 'week' }" @click="setMode('week')">
            <AppIcon name="sun" :size="14" /> 每周主牌
          </button>
          <button class="seg-btn" :class="{ on: dailyState.mode === 'day' }" @click="setMode('day')">
            <AppIcon name="divination" :size="14" /> 每日运势
          </button>
        </div>

        <!-- 每周主牌 -->
        <div v-if="dailyState.mode === 'week'" class="week-wrap">
          <p class="d-hint">凭直觉点击翻开你的每周主牌</p>
          <FlipCard
            :card="dailyState.week.card"
            :flipped="dailyState.week.flipped"
            size="big"
            @flip="dailyState.week.flipped = true; persistDaily()"
          />
        </div>

        <!-- 每日运势：三牌展开 -->
        <div v-else class="day-wrap">
          <p class="day-date">
            <AppIcon name="moon" :size="14" /> {{ dayDateText() }}
          </p>
          <div class="flip-grid">
            <div v-for="(c, i) in dailyState.day.cards" :key="i" class="flip-col">
              <span class="flip-label">{{ DAILY_POS[i] }}</span>
              <FlipCard
                :card="c"
                :flipped="dailyState.day.flipped[i]"
                @flip="dailyState.day.flipped[i] = true; persistDaily()"
              />
            </div>
          </div>

          <div class="reflect">
            <label class="reflect-label"><AppIcon name="edit" :size="14" /> 今日解读</label>
            <textarea
              v-model="dailyState.day.reflection"
              class="reflect-area"
              rows="3"
              placeholder="写下你对今日牌阵的感悟…"
              @input="persistDaily()"
            />
            <button class="btn btn-primary reflect-save" @click="saveDaily">保存</button>
          </div>

          <p class="d-foot"><AppIcon name="loop" :size="13" /> 每日零时自动更新 · 点击牌背翻开查看解读</p>
        </div>
      </template>

        <!-- ═══════ 雷诺曼占卜 ═══════ -->
      <template v-else-if="tab === 'lenormand'">
        <div class="spread-label" v-if="!lmResult.length"><AppIcon name="grid" :size="14" /> 牌阵选择</div>
        <div class="opt-row" v-if="!lmResult.length">
          <button class="opt-card" :class="{ on: lmSpread === '1' }" @click="lmSpread = '1'">
            <span class="opt-num">1</span><span class="opt-name">单张</span>
          </button>
          <button class="opt-card" :class="{ on: lmSpread === '3' }" @click="lmSpread = '3'">
            <span class="opt-num">3</span><span class="opt-name">三张</span>
          </button>
        </div>
        <p class="opt-cap" v-if="!lmResult.length">{{ lmSpread === '1' ? '单张牌 · 直指当下' : '三张牌 · 情境全貌' }}</p>

        <div class="result" v-else>
          <div class="r-cards" :class="{ single: lmSpread === '1' }">
            <div v-for="(c, i) in lmResult" :key="i" class="r-card panel">
              <div class="r-pos" v-if="lmSpread === '3'">{{ DAILY_POS[i] }}</div>
              <div class="r-name">{{ c.name }}</div>
              <div class="r-mean">{{ c.meaning }}</div>
            </div>
          </div>
        </div>

        <label class="q-label"><AppIcon name="edit" :size="14" /> 你的提问（可选）</label>
        <textarea v-model="lmQuestion" class="q-area" rows="2" placeholder="将内心的迷惑轻轻诉说…" />
        <button class="btn btn-primary big-btn" @click="drawLenormand" :disabled="lmLoading">
          {{ lmLoading ? '抽牌中…' : lmResult.length ? '再抽一次' : '开始雷诺曼占卜' }}
        </button>
        <button class="cancel-btn" v-if="lmResult.length" @click="cancelLenormand">取消</button>
      </template>

        <!-- ═══════ 塔罗占卜 ═══════ -->
      <template v-else-if="tab === 'tarot'">
        <div class="spread-label" v-if="!tResult.length"><AppIcon name="grid" :size="14" /> 牌阵选择</div>
        <div class="opt-row" v-if="!tResult.length">
          <button class="opt-card" :class="{ on: tSpread === '1' }" @click="tSpread = '1'">
            <span class="opt-num">1</span><span class="opt-name">单张</span>
          </button>
          <button class="opt-card" :class="{ on: tSpread === '3' }" @click="tSpread = '3'">
            <span class="opt-num">3</span><span class="opt-name">三张</span>
          </button>
        </div>
        <p class="opt-cap" v-if="!tResult.length">{{ tSpread === '1' ? '单张牌 · 直指当下' : '三张牌 · 过去 · 现在 · 未来' }}</p>

        <div class="result" v-else>
          <div class="r-cards" :class="{ single: tSpread === '1' }">
            <div v-for="(c, i) in tResult" :key="i" class="r-card panel">
              <div class="r-pos" v-if="tSpread === '3'">{{ DAILY_POS[i] }}</div>
              <div class="r-name">{{ c.name }}</div>
              <div class="r-orient" :class="c.reversed ? 'rev' : 'up'">{{ c.reversed ? '逆位' : '正位' }}</div>
              <div class="r-mean">{{ c.reversed ? c.reversed : c.upright }}</div>
            </div>
          </div>
        </div>

        <label class="q-label"><AppIcon name="edit" :size="14" /> 你的提问（可选）</label>
        <textarea v-model="tQuestion" class="q-area" rows="2" placeholder="将内心的迷惑轻轻诉说…" />
        <button class="btn btn-primary big-btn" @click="drawTarot" :disabled="tLoading">
          {{ tLoading ? '抽牌中…' : tResult.length ? '再抽一次' : '开始塔罗占卜' }}
        </button>
        <button class="cancel-btn" v-if="tResult.length" @click="cancelTarot">取消</button>
      </template>

      <!-- ═══════ 往昔（历史） ═══════ -->
      <template v-else>
        <div class="hist-head">
          <p class="hist-title">每一次占卜，皆是与命运的对话。</p>
          <button class="hist-clear" @click="clearHistory">清空记录</button>
        </div>

        <div v-if="history.length" class="hist-list">
          <div v-for="h in history" :key="h.id" class="hist-card panel">
            <div class="hist-top">
              <span class="hist-tag">{{ methodLabel(h) }}</span>
              <span class="hist-date">{{ fmtDate(h.created_at) }}</span>
              <button class="hist-del" @click="delDivination(h)" title="删除这条记录">
                <AppIcon name="trash" :size="15" />
              </button>
            </div>
            <div v-if="h.question" class="hist-q">「{{ h.question }}」</div>
            <div class="hist-chips">
              <span v-for="(c, i) in drawnOf(h)" :key="i" class="hist-chip">
                <span class="chip-arrow" :class="{ down: c.reversed }">{{ c.reversed ? '↓' : '↑' }}</span>{{ c.name }}
              </span>
            </div>
            <button class="hist-more" @click="toggleExpand(h.id)">
              {{ expanded.has(h.id) ? '收起解读' : '查看解读' }} <AppIcon name="chevron-down" :size="13" :class="{ up: expanded.has(h.id) }" />
            </button>
            <div v-if="expanded.has(h.id)" class="hist-detail">
              <div v-for="(c, i) in drawnOf(h)" :key="i" class="hd-row">
                <span class="hd-name">{{ c.name }} <em>{{ c.reversed ? '逆位' : '正位' }}</em></span>
                <span class="hd-mean">{{ c.reversed ? c.reversed : c.upright || c.meaning }}</span>
              </div>
              <div v-if="h.reflection" class="hd-reflect">「{{ h.reflection }}」</div>
            </div>
          </div>
        </div>
        <div v-else class="d-empty">
          <AppIcon name="scroll" :size="40" color="var(--text-soft)" />
          <p>尚无占卜记录</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import FlipCard from '@/components/divination/FlipCard.vue'
import { confirmDialog } from '@/utils/dialog'
import { getDivinations, saveDivination, clearDivinations, deleteDivination } from '@/api/content'

const tabs = [
  { key: 'daily', label: '每日运势', icon: 'sun' },
  { key: 'lenormand', label: '雷诺曼', icon: 'divination' },
  { key: 'tarot', label: '塔罗', icon: 'moon' },
  { key: 'history', label: '往昔', icon: 'scroll' }
]
const tab = ref('daily')

const DAILY_POS = ['过去·根源', '现在·核心', '未来·启示']

/* ───────── 牌库 ───────── */
// 塔罗：全套 78 张（22 大阿尔卡纳 + 56 小阿尔卡纳）
const TAROT = [
  // ── 大阿尔卡纳 ──
  { name: '愚者', upright: '新的开始、纯真、勇敢出发', reversed: '犹豫不决、鲁莽冒险' },
  { name: '魔术师', upright: '创造力、行动力、万事俱备', reversed: '潜能未发、沟通受阻' },
  { name: '女祭司', upright: '直觉、神秘、内在智慧', reversed: '忽略内心、秘密未明' },
  { name: '皇后', upright: '丰盛、温柔、孕育与爱', reversed: '依赖、停滞、缺乏滋养' },
  { name: '皇帝', upright: '秩序、掌控、稳定根基', reversed: '固执、专断、失控' },
  { name: '教皇', upright: '传统、指引、信念', reversed: '循规蹈矩、盲从' },
  { name: '恋人', upright: '爱、结合、重要选择', reversed: '失衡、误会、错失' },
  { name: '战车', upright: '胜利、意志、突破', reversed: '内耗、方向迷失' },
  { name: '力量', upright: '温柔的勇气、自控', reversed: '自我怀疑、情绪失控' },
  { name: '隐者', upright: '独处、自省、寻光', reversed: '孤立、逃避' },
  { name: '命运之轮', upright: '转机、循环、顺势', reversed: '波折、停滞' },
  { name: '正义', upright: '公正、因果、平衡', reversed: '偏颇、逃避责任' },
  { name: '倒吊人', upright: '暂停、换个视角', reversed: '无谓牺牲、抗拒' },
  { name: '死神', upright: '结束与重生、蜕变', reversed: '抗拒改变、拖延' },
  { name: '节制', upright: '调和、耐心、中庸', reversed: '失衡、急躁' },
  { name: '恶魔', upright: '束缚、欲望、执念', reversed: '挣脱、觉察' },
  { name: '高塔', upright: '突变、破局、觉醒', reversed: '灾后重建、余震' },
  { name: '星星', upright: '希望、疗愈、指引', reversed: '失望、迷茫' },
  { name: '月亮', upright: '潜意识、幻象、直觉', reversed: '澄清、释疑' },
  { name: '太阳', upright: '光明、喜悦、成功', reversed: '短暂阴霾' },
  { name: '审判', upright: '觉醒、召唤、清算', reversed: '自我怀疑、拖延' },
  { name: '世界', upright: '圆满、完成、合一', reversed: '未竟、收尾难' },

  // ── 小阿尔卡纳 · 权杖（火·行动热情） ──
  { name: '权杖一', upright: '新起点、灵感迸发、行动力', reversed: '拖延、计划搁浅、动力不足' },
  { name: '权杖二', upright: '规划未来、抉择、远望', reversed: '犹豫不决、错失机会、停滞' },
  { name: '权杖三', upright: '拓展、远行、合作初成', reversed: '受阻、延迟、团队不和' },
  { name: '权杖四', upright: '稳固、庆祝、家园安定', reversed: '变动、不安、根基动摇' },
  { name: '权杖五', upright: '竞争、冲突、磨合', reversed: '平息争端、内耗、方向混乱' },
  { name: '权杖六', upright: '胜利、认可、凯旋', reversed: '自满、落败、盛名之累' },
  { name: '权杖七', upright: '坚守、以寡敌众、捍卫', reversed: '力竭、放弃、被压垮' },
  { name: '权杖八', upright: '迅速、消息、顺势推进', reversed: '延误、失控、混乱' },
  { name: '权杖九', upright: '戒备、经验、坚守阵地', reversed: '过度警惕、疲惫、孤立' },
  { name: '权杖十', upright: '重担、责任、接近完成', reversed: '不堪重负、学会放手' },
  { name: '权杖侍从', upright: '探索、热情、新可能', reversed: '三分钟热度、轻率' },
  { name: '权杖骑士', upright: '行动、冲劲、勇往直前', reversed: '鲁莽、急躁、方向偏差' },
  { name: '权杖王后', upright: '自信、温暖、行动力', reversed: '情绪化、掌控欲' },
  { name: '权杖国王', upright: '领导、远见、务实', reversed: '专断、暴躁、失控' },

  // ── 小阿尔卡纳 · 圣杯（水·情感关系） ──
  { name: '圣杯一', upright: '爱、情感丰盈、新生', reversed: '情感封闭、空虚、错过' },
  { name: '圣杯二', upright: '吸引、平等关系、契合', reversed: '失衡、冷淡、误会' },
  { name: '圣杯三', upright: '欢聚、友谊、庆祝', reversed: '过度、闲言、疏离' },
  { name: '圣杯四', upright: '倦怠、不满、内省', reversed: '觉醒、重拾热情' },
  { name: '圣杯五', upright: '失落、遗憾、悲伤', reversed: '释怀、疗愈、转机' },
  { name: '圣杯六', upright: '怀旧、童年、安全感', reversed: '沉溺回忆、依赖' },
  { name: '圣杯七', upright: '幻想、选择过多、迷惑', reversed: '幻灭、落地、专注' },
  { name: '圣杯八', upright: '离开、追寻、不满足', reversed: '犹豫、留恋、原地' },
  { name: '圣杯九', upright: '满足、如愿、自得', reversed: '空虚、自负、孤独' },
  { name: '圣杯十', upright: '圆满、家庭幸福、和谐', reversed: '隔阂、离散、表面和谐' },
  { name: '圣杯侍从', upright: '纯真、情感萌芽、直觉', reversed: '幼稚、情绪波动' },
  { name: '圣杯骑士', upright: '浪漫、温柔、追随之心', reversed: '优柔、善变、虚伪' },
  { name: '圣杯王后', upright: '共情、温柔、滋养', reversed: '情绪化、过度付出' },
  { name: '圣杯国王', upright: '包容、成熟、情感智慧', reversed: '冷漠、沉溺、操控' },

  // ── 小阿尔卡纳 · 宝剑（风·思维冲突） ──
  { name: '宝剑一', upright: '清晰、决断、新思路', reversed: '混乱、误判、纠结' },
  { name: '宝剑二', upright: '两难、权衡、封闭', reversed: '真相浮现、逃避结束' },
  { name: '宝剑三', upright: '心碎、伤痛、领悟', reversed: '疗愈、释怀、放下' },
  { name: '宝剑四', upright: '休整、暂停、恢复', reversed: '不安、停滞、焦躁' },
  { name: '宝剑五', upright: '冲突、得失、代价', reversed: '和解、悔意、输赢之外' },
  { name: '宝剑六', upright: '过渡、远离、疗愈之旅', reversed: '困顿、滞留、未愈' },
  { name: '宝剑七', upright: '策略、隐瞒、取巧', reversed: '暴露、坦承、自欺' },
  { name: '宝剑八', upright: '受限、自我设限、迷茫', reversed: '觉醒、解脱、看清' },
  { name: '宝剑九', upright: '焦虑、恐惧、失眠', reversed: '释压、释怀、过度担忧' },
  { name: '宝剑十', upright: '终结、重创、谷底', reversed: '转机、重建、放下痛苦' },
  { name: '宝剑侍从', upright: '敏锐、求知、新讯息', reversed: '多疑、轻率、谣言' },
  { name: '宝剑骑士', upright: '敏捷、理性、直言', reversed: '冲动、严苛、鲁莽' },
  { name: '宝剑王后', upright: '客观、洞察、冷静', reversed: '冷酷、尖刻、疏离' },
  { name: '宝剑国王', upright: '智慧、公正、决断', reversed: '专横、冷血、固执' },

  // ── 小阿尔卡纳 · 星币（土·物质现实） ──
  { name: '星币一', upright: '机遇、财富、新开始', reversed: '错失、延迟、不稳' },
  { name: '星币二', upright: '平衡、灵活、兼顾', reversed: '失衡、压力、顾此失彼' },
  { name: '星币三', upright: '协作、技能、踏实', reversed: '低效、不和、敷衍' },
  { name: '星币四', upright: '守护、稳固、保守', reversed: '吝啬、失控、紧绷' },
  { name: '星币五', upright: '匮乏、困境、求助', reversed: '转机、援助、脱贫' },
  { name: '星币六', upright: '给予、平衡、互助', reversed: '失衡、依赖、施舍' },
  { name: '星币七', upright: '等待、耕耘、评估', reversed: '焦虑、急功、徒劳' },
  { name: '星币八', upright: '专注、精进、手艺', reversed: '敷衍、停滞、粗心' },
  { name: '星币九', upright: '自足、丰盛、独立', reversed: '孤独、炫耀、空虚' },
  { name: '星币十', upright: '富裕、传承、安稳', reversed: '破财、离散、物质虚空' },
  { name: '星币侍从', upright: '学习、务实、新机会', reversed: '拖延、浮躁、不踏实' },
  { name: '星币骑士', upright: '稳健、可靠、推进', reversed: '迟缓、固执、保守' },
  { name: '星币王后', upright: '丰饶、务实、滋养', reversed: '过度操劳、掌控、吝啬' },
  { name: '星币国王', upright: '富足、稳健、事业有成', reversed: '贪婪、守财、失衡' }
]
// 雷诺曼：36 张
const LENORMAND = [
  { name: '骑士', meaning: '消息、行动、到来' },
  { name: '三叶草', meaning: '小幸运、短暂机会' },
  { name: '船', meaning: '旅行、远方、贸易' },
  { name: '房子', meaning: '家庭、根基、安全' },
  { name: '树', meaning: '健康、成长、耐心' },
  { name: '云', meaning: '困惑、不确定' },
  { name: '蛇', meaning: '嫉妒、复杂、危险' },
  { name: '棺材', meaning: '结束、停滞' },
  { name: '花束', meaning: '礼物、美好、欣赏' },
  { name: '镰刀', meaning: '突然、切割、决定性' },
  { name: '鞭子', meaning: '冲突、重复、争论' },
  { name: '鸟', meaning: '闲聊、焦虑、成双' },
  { name: '小孩', meaning: '纯真、开始、幼稚' },
  { name: '狐狸', meaning: '谨慎、工作、机变' },
  { name: '熊', meaning: '力量、资源、权威' },
  { name: '星星', meaning: '希望、指引、灵感' },
  { name: '鹳', meaning: '转变、迁移、新生' },
  { name: '狗', meaning: '忠诚、友谊、守护' },
  { name: '塔', meaning: '孤立、机构、权威' },
  { name: '花园', meaning: '社交、公众、群体' },
  { name: '山', meaning: '障碍、延迟、稳固' },
  { name: '十字路口', meaning: '选择、决定、方向' },
  { name: '老鼠', meaning: '损耗、焦虑、减少' },
  { name: '心', meaning: '爱、情感、真心' },
  { name: '戒指', meaning: '承诺、合约、循环' },
  { name: '书', meaning: '秘密、知识、隐藏' },
  { name: '信', meaning: '沟通、文件、消息' },
  { name: '男士', meaning: '男性、主体、对方' },
  { name: '女士', meaning: '女性、主体、对方' },
  { name: '百合', meaning: '平静、成熟、纯粹' },
  { name: '太阳', meaning: '成功、喜悦、清晰' },
  { name: '月亮', meaning: '直觉、潜意识、梦境' },
  { name: '钥匙', meaning: '答案、解决、关键' },
  { name: '鱼', meaning: '财富、丰盛、流动' },
  { name: '锚', meaning: '稳定、安全、坚持' },
  { name: '十字', meaning: '负担、命运、考验' }
]

function pickTarot() {
  const c = TAROT[Math.floor(Math.random() * TAROT.length)]
  const rev = Math.random() < 0.35
  return { name: c.name, upright: c.upright, reversed: c.reversed, rev }
}
function pickLenormand() {
  const c = LENORMAND[Math.floor(Math.random() * LENORMAND.length)]
  return { name: c.name, meaning: c.meaning }
}
function pickN(pool, n) {
  const arr = [...pool]
  const out = []
  for (let i = 0; i < n && arr.length; i++) out.push(arr.splice(Math.floor(Math.random() * arr.length), 1)[0])
  return out
}

/* ───────── 每日运势（本地按天/周生成 + 翻牌） ───────── */
const LS = 'divi_daily_v1'
const dateKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
const todayKey = () => dateKey(new Date())
function weekKey() {
  const d = new Date()
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return dateKey(d)
}
function freshDay() {
  const cards = Array.from({ length: 3 }, () => pickTarot())
  return { cards, flipped: [false, false, false], reflection: '' }
}
const dailyState = ref({
  dayKey: todayKey(), weekKey: weekKey(), mode: 'week',
  week: { card: pickTarot(), flipped: false },
  day: freshDay()
})

function persistDaily() {
  localStorage.setItem(LS, JSON.stringify(dailyState.value))
}
function initDaily() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || 'null')
    if (saved && saved.dayKey === todayKey() && saved.weekKey === weekKey()) {
      dailyState.value = saved
      return
    }
  } catch (e) { /* ignore */ }
  dailyState.value = {
    dayKey: todayKey(), weekKey: weekKey(), mode: 'week',
    week: { card: pickTarot(), flipped: false },
    day: freshDay()
  }
  persistDaily()
}
function setMode(m) {
  dailyState.value.mode = m
  persistDaily()
}
const dayDateText = () => {
  const d = new Date()
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
function saveDaily() {
  const cards = dailyState.value.day.cards.map((c) => ({ name: c.name, meaning: c.rev ? c.reversed : c.upright, reversed: c.rev }))
  saveDivination({ method: 'daily', spread: '3', drawn: cards, reflection: dailyState.value.day.reflection || '' })
  persistDaily()
  loadHistory()
}

/* ───────── 雷诺曼 ───────── */
const lmSpread = ref('1')
const lmQuestion = ref('')
const lmResult = ref([])
const lmLoading = ref(false)
function drawLenormand() {
  lmLoading.value = true
  lmResult.value = []
  setTimeout(() => {
    const n = lmSpread.value === '1' ? 1 : 3
    const drawn = pickN(LENORMAND, n).map((c) => ({ name: c.name, meaning: c.meaning, reversed: false }))
    lmResult.value = drawn
    saveDivination({ method: 'lenormand', spread: lmSpread.value, drawn, reflection: lmQuestion.value.trim() })
    lmLoading.value = false
    loadHistory()
  }, 450)
}

/* ───────── 塔罗 ───────── */
const tSpread = ref('1')
const tQuestion = ref('')
const tResult = ref([])
const tLoading = ref(false)
function drawTarot() {
  tLoading.value = true
  tResult.value = []
  setTimeout(() => {
    const n = tSpread.value === '1' ? 1 : 3
    const drawn = pickN(TAROT, n).map((c) => {
      const rev = Math.random() < 0.35
      return { name: c.name, upright: c.upright, reversed: c.reversed, rev }
    })
    tResult.value = drawn
    saveDivination({
      method: 'tarot', spread: tSpread.value,
      drawn: drawn.map((c) => ({ name: c.name, meaning: c.rev ? c.reversed : c.upright, reversed: c.rev })),
      reflection: tQuestion.value.trim()
    })
    tLoading.value = false
    loadHistory()
  }, 450)
}
function cancelLenormand() { lmResult.value = [] }
function cancelTarot() { tResult.value = [] }

/* ───────── 往昔 ───────── */
const history = ref([])
const expanded = ref(new Set())
function drawnOf(h) {
  try { return JSON.parse(h.drawn || '[]') || [] } catch (e) { return [] }
}
function methodLabel(h) {
  const map = {
    daily: '每日运势', lenormand: '雷诺曼', tarot: '塔罗'
  }
  const base = map[h.method] || h.method
  if (h.method === 'daily') return '每日运势'
  return h.spread === '1' ? `${base}单张` : `${base}三张`
}
function fmtDate(ts) {
  const d = new Date(Number(ts))
  const p = (x) => String(x).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function toggleExpand(id) {
  const s = new Set(expanded.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expanded.value = s
}
function loadHistory() {
  getDivinations().then((r) => { history.value = r || [] }).catch(() => {})
}
function clearHistory() {
  confirmDialog({
    title: '清空记录',
    text: '将删除全部占卜记录，且无法恢复。',
    okText: '清空',
    danger: true
  }).then((ok) => {
    if (!ok) return
    clearDivinations()
      .then(() => { history.value = [] })
      .catch(() => {})
  })
}
function delDivination(h) {
  confirmDialog({
    title: '删除这条记录',
    text: `${methodLabel(h)} · ${fmtDate(h.created_at)}\n删除后无法恢复。`,
    okText: '删除',
    danger: true
  }).then((ok) => {
    if (!ok) return
    deleteDivination(h.id)
      .then(() => { history.value = history.value.filter((x) => x.id !== h.id) })
      .catch(() => {})
  })
}

onMounted(() => {
  initDaily()
  loadHistory()
})
</script>

<style scoped>
.divi { flex: 1; display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
.d-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-soft);
}
.d-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 9px 4px;
  border: none;
  background: transparent;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-soft);
  font-family: var(--font-serif);
  position: relative;
  transition: all 0.2s ease;
}
.d-tab.on { color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); }
.d-tab.on::after {
  content: '';
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: -9px;
  height: 2.5px;
  border-radius: 2px;
  background: var(--accent);
}
.d-body { flex: 1; overflow-y: auto; padding: 20px 18px 28px; }

/* 通用提示 */
.d-hint { font-family: var(--font-serif); font-size: 14px; color: var(--text-soft); margin: 0 0 16px; }
.d-hint.center { text-align: center; }

/* 分段开关 */
.seg { display: flex; gap: 8px; margin-bottom: 18px; }
.seg-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text-soft);
  font-size: 14px;
  font-weight: 600;
  font-family: var(--font-serif);
  transition: all 0.2s ease;
}
.seg-btn.on { background: var(--accent); color: #fff; border-color: var(--accent); }

/* 每周主牌 */
.week-wrap { display: flex; flex-direction: column; align-items: center; }
.week-wrap .d-hint { text-align: center; }

/* 每日三牌 */
.day-date { display: flex; align-items: center; gap: 6px; font-family: var(--font-serif); font-size: 14px; color: var(--text); margin: 4px 0 14px; }
.flip-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.flip-col { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.flip-label { font-size: 12px; color: var(--text-soft); font-family: var(--font-serif); }

.reflect { margin-top: 22px; }
.reflect-label, .q-label, .spread-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}
.reflect-area, .q-area {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-size: 14px;
  font-family: var(--font-serif);
  background: var(--bg-soft);
  color: var(--text);
  resize: vertical;
  box-sizing: border-box;
}
.reflect-area:focus, .q-area:focus { outline: none; border-color: var(--accent); }
.reflect-save { margin-top: 12px; width: 100%; }
.d-foot { display: flex; align-items: center; gap: 5px; justify-content: center; font-size: 12px; color: var(--text-soft); margin-top: 18px; }

/* 牌阵选择 */
.spread-label { margin-top: 6px; }
.opt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 10px; }
.opt-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px;
  border-radius: var(--radius);
  border: 1.5px solid var(--border);
  background: var(--bg-soft);
  color: var(--text-soft);
  transition: all 0.2s ease;
}
.opt-card.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.opt-num { font-family: var(--font-serif); font-size: 28px; font-weight: 700; line-height: 1; }
.opt-name { font-size: 13px; font-weight: 600; }
.opt-cap { text-align: center; font-size: 13px; color: var(--text-soft); margin: 0 0 18px; font-family: var(--font-serif); }

.q-label { margin-top: 4px; }
.big-btn { width: 100%; padding: 13px; font-size: 15px; font-family: var(--font-serif); margin-top: 14px; }

/* 结果牌 */
.result { display: flex; flex-direction: column; align-items: center; margin-top: 22px; }
.r-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; }
.r-cards.single { display: flex; justify-content: center; }
.r-cards.single .r-card { width: 64%; max-width: 260px; }
.r-card { padding: 16px 12px; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.cancel-btn {
  display: block;
  width: 100%;
  margin: 14px 0 0;
  padding: 13px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: var(--text-soft);
  font-size: 15px;
  font-family: var(--font-serif);
  transition: all 0.2s ease;
}
.cancel-btn:active { transform: scale(0.98); }
.r-pos { font-size: 12px; color: var(--text-soft); }
.r-name { font-family: var(--font-serif); font-size: 17px; font-weight: 700; }
.r-orient { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.r-orient.up { background: var(--bg-soft); color: var(--text-soft); }
.r-orient.rev { background: #f6e0e0; color: #b5656b; }
.r-mean { font-size: 12px; color: var(--text); line-height: 1.5; margin-top: 2px; }

/* 往昔 */
.hist-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.hist-title { font-family: var(--font-serif); font-size: 15px; color: var(--text); margin: 0; }
.hist-clear {
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-soft);
}
.hist-list { display: flex; flex-direction: column; gap: 12px; }
.hist-card { padding: 14px; }
.hist-top { display: flex; align-items: center; justify-content: flex-start; gap: 8px; margin-bottom: 8px; }
.hist-del {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--text-soft);
  padding: 4px;
  border-radius: 8px;
  display: flex;
  cursor: pointer;
  transition: all 0.2s ease;
}
.hist-del:active { background: var(--bg-soft); color: #c0576b; }
.hist-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 600;
}
.hist-date { font-size: 12px; color: var(--text-soft); }
.hist-q { font-family: var(--font-serif); font-size: 14px; color: var(--text); margin-bottom: 8px; }
.hist-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.hist-chip {
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--bg-soft);
  color: var(--text);
}
.chip-arrow { color: var(--accent); margin-right: 2px; font-weight: 700; }
.chip-arrow.down { transform: rotate(180deg); display: inline-block; }
.hist-more {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}
.hist-detail { margin-top: 10px; border-top: 1px dashed var(--border); padding-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.hd-row { display: flex; flex-direction: column; gap: 2px; }
.hd-name { font-family: var(--font-serif); font-size: 14px; font-weight: 700; }
.hd-name em { font-style: normal; font-size: 11px; color: var(--text-soft); font-weight: 500; }
.hd-mean { font-size: 13px; color: var(--text); }
.hd-reflect { font-family: var(--font-serif); font-size: 13px; color: var(--text-soft); font-style: italic; }

/* 空态 */
.d-empty { margin-top: 60px; display: flex; flex-direction: column; align-items: center; gap: 10px; color: var(--text-soft); }
.d-empty p { font-size: 13px; }
</style>
