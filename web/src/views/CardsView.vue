<template>
  <div class="cards-view">
    <!-- ============ 枢纽态：通用库入口 + 每联系人专属入口 ============ -->
    <template v-if="!entered">
      <AppHeader title="字卡库" />

      <div class="hub-scroll">
      <div class="hub-hint">
        字卡分两层：<b>通用库</b>和<b>专属库</b>。 联系人回复时混抽，通用库占比可在联系人设置里调整。
      </div>

        <!-- 通用库入口 -->
        <button class="ent ent-general" @click="enterGeneral">
          <span class="ent-ico ent-ico-gen">
            <AppIcon name="cards" :size="20" />
          </span>
          <span class="ent-main">
            <span class="ent-title">通用字卡库</span>
          </span>
          <span class="ent-num">
            <b>{{ generalStat.groups }}</b> 组 · <b>{{ generalStat.cards }}</b> 张
          </span>
          <span class="ent-go">›</span>
        </button>

        <!-- 拍一拍入口（通用，下方库子里只留搜索 / 分组等功能） -->
        <button class="ent ent-poke" @click="enterPoke">
          <span class="ent-ico ent-ico-poke">
            <AppIcon name="poke" :size="20" />
          </span>
          <span class="ent-main">
            <span class="ent-title">拍一拍</span>
          </span>
          <span class="ent-num">
            <b>{{ pokeStat.groups }}</b> 组 · <b>{{ pokeStat.cards }}</b> 张
          </span>
          <span class="ent-go">›</span>
        </button>

        <!-- 关怀文案入口（经期特殊关怀发送的话语，可自定义） -->
        <button class="ent ent-care" @click="router.push('/settings/care-texts')">
          <span class="ent-ico ent-ico-poke">
            <AppIcon name="heart" :size="20" />
          </span>
          <span class="ent-main">
            <span class="ent-title">关怀文案</span>
          </span>
          <span class="ent-num">{{ careTextsLabel() }}</span>
          <span class="ent-go">›</span>
        </button>

        <div class="hub-label">联系人专属字卡</div>

        <button
          v-for="c in contactList"
          :key="c.id"
          class="ent"
          @click="enterContact(c.id)"
        >
          <AppAvatar :avatar="c.chat_avatar || c.avatar" :name="c.name" :size="38" />
          <span class="ent-main">
            <span class="ent-title">
              {{ c.name }}
              <span v-if="c.kind === 'group'" class="ent-tag">群</span>
            </span>
          </span>
          <span class="ent-num">
            <b>{{ statOfContact(c.id).groups }}</b> 组 · <b>{{ statOfContact(c.id).cards }}</b> 张
          </span>
          <span class="ent-go">›</span>
        </button>

        <div v-if="!contactList.length" class="hub-empty">
          还没有联系人。先去主页添加一位，再回来给他建专属字卡库。
        </div>
      </div>
    </template>

    <!-- ============ 管理态：某个库的管理界面（底部 tab 栏隐藏，顶部导航栏正常显示） ============ -->
    <template v-else>
      <AppHeader :title="category === 'poke' ? '拍一拍' : manageTitle" back @back="onBack" />

      <CategoryTabs v-if="category !== 'poke'" v-model="category" />

      <!-- 工具行：搜索 / 分组管理 / 检测重复 ｜ 多选 / 导入 / 导出 -->
      <div class="toolbar">
        <div class="tb-group">
          <button class="tb-btn" :class="{ on: searchOpen }" title="搜索" @click="toggleSearch">
            <AppIcon name="search" :size="18" />
          </button>
          <button class="tb-btn" title="分组管理" @click="openManage">
            <AppIcon name="folder" :size="18" />
          </button>
          <button class="tb-btn" title="检测重复" @click="openDupes">
            <AppIcon name="filter" :size="18" />
          </button>
        </div>
        <div class="tb-group">
          <button class="tb-btn" :class="{ on: selecting }" title="多选" @click="toggleSelect">
            <AppIcon name="grid" :size="18" />
          </button>
          <button class="tb-btn" title="导入" @click="importEl && importEl.click()">
            <AppIcon name="download" :size="18" />
          </button>
          <button class="tb-btn" title="导出" @click="exportJson">
            <AppIcon name="upload" :size="18" />
          </button>
          <button class="tb-btn" title="添加字卡" @click="openEditor">
            <AppIcon name="plus" :size="18" />
          </button>
        </div>
      </div>

      <!-- 搜索行 -->
      <div v-if="searchOpen" class="search-row">
        <input v-model="keyword" class="field" placeholder="搜索字卡内容" />
        <button v-if="keyword" class="sr-clear" @click="keyword = ''">清除</button>
      </div>

      <!-- 分组 chips：全部 / 未分组 / 各分组 -->
      <GroupList :groups="groups" :cards="storeCards" v-model="chip" />

      <!-- 多选操作条 -->
      <div v-if="selecting" class="sel-bar">
        <span class="sel-num">已选 <b>{{ selCount }}</b></span>
        <button class="sel-btn" @click="toggleSelAll">{{ allSelected ? '取消全选' : '全选' }}</button>
        <button class="sel-btn" :disabled="!selCount" @click="openBatchMove">分组</button>
        <button class="sel-btn" :disabled="!selCount && !selGroups.length" @click="batchBlock">屏蔽</button>
        <button class="sel-btn danger" :disabled="!selCount" @click="batchDelete">删除</button>
        <button class="sel-btn primary" @click="toggleSelect">完成</button>
      </div>

      <div class="cards-main">
        <div class="cm-head">
          <span class="cm-title">{{ currentCategoryLabel }}</span>
          <span class="cm-num">{{ visibleCards.length }} 张</span>
        </div>

        <div v-if="!groups.length && !visibleCards.length" class="cm-empty">
          还没有分组，先点上方「分组管理」新建一个
        </div>
        <div v-else-if="!visibleCards.length" class="cm-empty">
          {{ keyword ? '没有匹配的字卡' : '这里还没有字卡，点上方「＋」添加' }}
        </div>
        <!-- 全部：按分组分区展示，可收起展开（参考图三）；图片/表情包为缩略图网格 -->
        <div v-else-if="chip === 'all'" v-square-grid class="card-grid" :class="{ media: isMediaCat }">
          <template v-for="sec in groupedSections" :key="sec.key">
            <div class="sec-head" @click="selecting ? toggleSecSel(sec) : toggleCollapse(sec.key)">
              <!-- 多选态：分区头出现勾选圈，点击整组选中/取消（不折叠） -->
              <span v-if="selecting" class="sec-check" :class="{ on: secChecked(sec) }">
                <AppIcon v-if="secChecked(sec)" name="check" :size="13" color="#fff" />
              </span>
              <span class="mg-dot" :style="{ background: sec.color }"></span>
              <span class="sec-name" :style="{ color: sec.color }">
                {{ sec.name }}<i v-if="sec.blocked" class="mg-blocked-tag">已屏蔽</i>
              </span>
              <span class="sec-count">{{ sec.cards.length }} 条</span>
              <template v-if="sec.group && !selecting">
                <button class="mg-ico sec-edit" :class="{ on: sec.blocked }" title="屏蔽/解除" @click.stop="toggleGroupBlock(sec.group)">
                  <AppIcon :name="sec.blocked ? 'block' : 'eyeOff'" :size="15" />
                </button>
                <button class="mg-ico sec-edit" title="编辑分组" @click.stop="openGroupEdit(sec.group)">
                  <AppIcon name="edit" :size="15" />
                </button>
              </template>
              <span v-if="!selecting" class="sec-arrow" :class="{ shut: isCollapsed(sec.key) }">›</span>
            </div>
            <template v-if="!isCollapsed(sec.key)">
              <div v-if="!sec.cards.length" class="sec-empty">此分组暂无内容</div>
              <CardItem
                v-for="c in sec.cards"
                :key="c.id"
                :card="c"
                :media="isMediaCat"
                :selectable="selecting"
                :selected="isCardSelected(c)"
                @select="toggleSel"
                @open="openCardActions"
                @toggleBlock="onToggleBlock"
                @move="openMove"
                @edit="openEdit"
                @remove="removeCard"
              />
            </template>
          </template>
        </div>
        <!-- 具体分组 / 未分组：平铺 -->
        <div v-else v-square-grid class="card-grid" :class="{ media: isMediaCat }">
          <CardItem
            v-for="c in visibleCards"
            :key="c.id"
            :card="c"
            :media="isMediaCat"
            :selectable="selecting"
            :selected="selIds.includes(String(c.id))"
            @select="toggleSel"
            @open="openCardActions"
            @toggleBlock="onToggleBlock"
            @move="openMove"
            @edit="openEdit"
            @remove="removeCard"
          />
        </div>
      </div>
    </template>

    <CardEditor :show="showEditor" :initial="editingCard" :groups="groups" :category="category" @close="showEditor = false" @save="saveCard" />

    <input ref="importEl" type="file" accept=".json,.zip,application/json,application/zip" hidden @change="onImportFile" />

    <!-- 分组管理弹窗（参考图二：彩点 + 彩色名称 + 条数 + 编辑 + ›） -->
    <Modal :show="showManage" title="分组管理" @close="showManage = false">
      <div class="mg-list">
        <div v-for="g in groups" :key="g.id" class="mg-row" :class="{ blocked: g.blocked }" @click="jumpGroup(g)">
          <span class="mg-dot" :style="{ background: dotColor(g) }"></span>
          <span class="mg-name" :style="{ color: dotColor(g) }">{{ g.name }}<i v-if="g.blocked" class="mg-blocked-tag">已屏蔽</i></span>
          <span class="mg-count">{{ countOf(g.id) }} 条</span>
          <button class="mg-ico" :class="{ on: g.blocked }" title="屏蔽/解除" @click.stop="toggleGroupBlock(g)">
            <AppIcon :name="g.blocked ? 'block' : 'eyeOff'" :size="16" />
          </button>
          <button class="mg-ico" title="编辑" @click.stop="openGroupEdit(g)">
            <AppIcon name="edit" :size="16" />
          </button>
          <span class="mg-go">›</span>
        </div>
        <div v-if="!groups.length" class="mg-empty">还没有分组，点下方「＋ 新建」创建</div>
      </div>
      <template #footer>
        <button class="btn btn-ghost" @click="showManage = false">关闭</button>
        <button class="btn btn-primary" @click="openGroupEdit(null)">＋ 新建</button>
      </template>
    </Modal>

    <!-- 新建 / 编辑分组弹窗（参考图一：LABEL + COLOR PRESET + CUSTOM COLOR） -->
    <Modal :show="showGroupEdit" :title="groupEditId ? '编辑分组' : '新建分组'" @close="showGroupEdit = false">
      <div class="ge-label">LABEL</div>
      <input v-model="groupEditName" class="field" placeholder="分组名称…" maxlength="20" />
      <div class="ge-label">COLOR PRESET</div>
      <div class="ge-swatches">
        <button
          v-for="c in COLOR_PRESETS"
          :key="c"
          class="ge-sw"
          :class="{ on: groupEditColor.toLowerCase() === c }"
          :style="{ background: c }"
          @click="groupEditColor = c"
        ></button>
      </div>
      <div class="ge-label">CUSTOM COLOR</div>
      <div class="ge-custom">
        <input v-model="groupEditColor" type="color" class="ge-picker" />
        <input v-model="groupEditColor" class="field ge-hex" placeholder="#A9E34B" maxlength="7" />
        <span class="ge-preview" :style="{ background: groupEditColor, borderColor: groupEditColor }">
          <i :style="{ background: groupEditColor }"></i>
        </span>
      </div>
      <template #footer>
        <button v-if="groupEditId" class="btn btn-ghost ge-del" @click="removeGroup">删除分组</button>
        <button class="btn btn-ghost" @click="showGroupEdit = false">取消</button>
        <button class="btn btn-primary" :disabled="!groupEditName.trim()" @click="saveGroupEdit">保存</button>
      </template>
    </Modal>

    <!-- 重复检测结果弹窗 -->
    <Modal :show="showDupes" title="重复字卡" @close="showDupes = false">
      <div v-if="dupes.length" class="dupe-list">
        <div v-for="(arr, i) in dupes" :key="i" class="dupe-item">
          <span class="dupe-text">{{ arr[0].content || (arr[0].asset_path ? '[图片字卡]' : '[空内容]') }}</span>
          <span class="dupe-num">×{{ arr.length }}</span>
        </div>
      </div>
      <div v-else class="mg-empty">没有发现重复字卡</div>
      <template v-if="dupes.length" #footer>
        <button class="btn btn-ghost" @click="showDupes = false">关闭</button>
        <button class="btn btn-primary" @click="dedupe">一键去重</button>
      </template>
    </Modal>

    <!-- 移动到分组弹窗（单张 / 批量共用） -->
    <Modal :show="showMove" :title="moveTarget === 'batch' ? `移动 ${selIds.length} 张字卡到` : '移动到分组'" @close="showMove = false">
      <div class="move-list">
        <button v-for="g in groups" :key="g.id" class="move-row" @click="doMove(g)">
          <span class="mg-dot" :style="{ background: dotColor(g) }"></span>
          <span class="mg-name" :style="{ color: dotColor(g) }">{{ g.name }}</span>
        </button>
        <div v-if="!groups.length" class="mg-empty">还没有分组，先去分组管理新建</div>
      </div>
    </Modal>

    <!-- 瓦片点击操作面板（图片/表情包网格，点缩略图弹出） -->
    <Modal :show="!!actionCard" title="字卡操作" @close="actionCard = null">
      <div class="move-list">
        <button class="move-row" @click="actToggleBlock">
          <AppIcon :name="actionCard?.blocked ? 'eyeOff' : 'block'" :size="17" />
          <span class="mg-name">{{ actionCard?.blocked ? '解除屏蔽' : '屏蔽' }}</span>
        </button>
        <button class="move-row" @click="actMove">
          <AppIcon name="tag" :size="17" />
          <span class="mg-name">移动分组</span>
        </button>
        <button class="move-row act-danger" @click="actDelete">
          <AppIcon name="trash" :size="17" />
          <span class="mg-name">删除</span>
        </button>
      </div>
    </Modal>

    <!-- mochi 字卡全量备份导入：专属字卡绑定联系人 -->
    <Modal :show="showMochiBind" title="导入 mochi 字卡" @close="closeMochiBind">
      <p class="mochi-tip">检测到 mochi 全量备份，将按板块导入为字卡：</p>
      <ul class="mochi-sum">
        <li>公用字卡：{{ mochiSummary?.pub }} 张（归入通用库）</li>
        <li v-if="mochiSummary?.own">专属字卡：{{ mochiSummary.own }} 张（绑定下方联系人）</li>
      </ul>
      <div class="ge-label">专属字卡绑定到</div>
      <select v-model="mochiBindContact" class="field">
        <option :value="null">通用库（不绑定，所有联系人可用）</option>
        <option v-for="c in contactList" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <template #footer>
        <button class="btn btn-ghost" @click="closeMochiBind">取消</button>
        <button class="btn btn-primary" @click="confirmMochiImport">开始导入</button>
      </template>
    </Modal>

    <!-- 导出方式面板（底部弹出：全量导出 / 按分组导出） -->
    <Teleport to="body">
      <div v-if="showExport" class="export-mask" @click.self="closeExport">
        <div class="export-sheet">
          <template v-if="exportStep === 'mode'">
            <div class="export-head">
              <AppIcon name="upload" :size="17" />
              <span>导出方式</span>
            </div>
            <div class="export-sub">请选择导出模式</div>
            <button class="export-opt" @click="doExportAll">
              <span class="eo-ico"><AppIcon name="upload" :size="20" /></span>
              <span class="eo-txt">
                <span class="eo-t">全量导出</span>
                <span class="eo-d">自由选择要导出的模块</span>
              </span>
            </button>
            <button class="export-opt" @click="exportStep = 'groups'">
              <span class="eo-ico"><AppIcon name="folder" :size="20" /></span>
              <span class="eo-txt">
                <span class="eo-t">按分组导出</span>
                <span class="eo-d">仅导出指定分组的字卡内容</span>
              </span>
            </button>
          </template>
          <template v-else-if="exportStep === 'modules'">
            <div class="export-head">
              <AppIcon name="upload" :size="17" />
              <span>导出字卡</span>
              <button class="export-x" @click="exportStep = 'mode'"><AppIcon name="close" :size="16" /></button>
            </div>
            <div class="export-sub">选择要导出的模块</div>
            <div class="export-mlist">
              <label v-for="m in exportModules" :key="m.key" class="export-mitem">
                <span class="em-ico"><AppIcon :name="m.icon" :size="18" /></span>
                <span class="em-txt">
                  <span class="eo-t">{{ m.label }}</span>
                  <span class="em-cnt">{{ m.count }} 条</span>
                </span>
                <input v-model="m.on" type="checkbox" class="em-switch" />
              </label>
            </div>
            <div class="export-foot">
              <button class="export-foot-btn ghost" @click="exportStep = 'mode'">取消</button>
              <button class="export-foot-btn primary" :disabled="!exportModules.some((m) => m.on)" @click="confirmExportModules">
                <AppIcon name="upload" :size="15" /> 确认
              </button>
            </div>
          </template>
          <template v-else>
            <div class="export-head">
              <AppIcon name="folder" :size="17" />
              <span>选择分组</span>
            </div>
            <div class="export-sub">勾选要导出的分组（可多选）</div>
            <div class="export-glist">
              <label v-for="g in groups" :key="g.id" class="export-gitem">
                <input type="checkbox" :value="g.id" v-model="exportGroupIds" />
                <span class="mg-dot" :style="{ background: dotColor(g) }"></span>
                <span class="eo-t">{{ g.name }}</span>
              </label>
              <div v-if="!groups.length" class="mg-empty">当前板块还没有分组</div>
            </div>
            <button class="export-go" :disabled="!exportGroupIds.length" @click="doExportGroups">导出所选分组</button>
          </template>
          <button v-if="exportStep !== 'modules'" class="export-cancel" @click="closeExport">取消</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import CategoryTabs from '@/components/cards/CategoryTabs.vue'
import GroupList from '@/components/cards/GroupList.vue'
import CardItem from '@/components/cards/CardItem.vue'
import CardEditor from '@/components/cards/CardEditor.vue'
import Modal from '@/components/common/Modal.vue'
import AppAvatar from '@/components/common/AppAvatar.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import { useCardsStore } from '@/stores/cards'
import { useChatStore } from '@/stores/chat'
import { useContactsStore } from '@/stores/contacts'
import { useNotificationsStore } from '@/stores/notifications'
import { confirmDialog } from '@/utils/dialog'
import { useUiStore } from '@/stores/ui'
import { uploadFile } from '@/api/settings'
import { CARE_TEXTS_KEY } from '@/utils/careTexts'

/* 媒体网格正方形格子：实测容器宽度后用像素值直接定高。
 * 部分安卓 WebView 对 aspect-ratio 和 padding-top 百分比在 grid 内的计算都有偏差
 * （实测瓦片渲染成 0.87 比例的长方形），唯有「JS 量宽 → 写 CSS 变量 → 像素定高」跨内核一致。
 * 瓦片高度 = 列宽 = (内容宽 - 2×8px gap) / 3，宽高由同一来源保证相等 */
const vSquareGrid = {
  mounted(el) {
    const update = () => {
      /* 不判断 media 类：网格可能在挂载后才切换到 media（chip/分类变化复用同一元素），
       * 且 --cell 写在非 media 网格上无害（瓦片只出现在 media 网格） */
      const w = el.clientWidth - 2 /* padding-right: 2px */
      if (w > 0) el.style.setProperty('--cell', (w - 16) / 3 + 'px') /* 2 列间隙 × 8px */
    }
    update()
    el._sqRO = new ResizeObserver(update)
    el._sqRO.observe(el)
  },
  unmounted(el) { el._sqRO && el._sqRO.disconnect() },
}
import * as cardsApi from '@/api/cards'
import { compressImage } from '@/utils/image'

const props = defineProps({
  contactId: { type: [String, Number], default: null }
})

const store = useCardsStore()
const contactsStore = useContactsStore()
const toast = useNotificationsStore()
const chat = useChatStore()

const category = ref('main')
const scope = ref(props.contactId ? 'contact' : 'general')
const selectedContactId = ref(props.contactId || null)
const showEditor = ref(false)
// 是否已进入某个库的管理界面。从 /contacts/:id/cards 直接进入时为 true，
// 从 /cards 枢纽进入时先 false，点入口才 true。
const entered = ref(!!props.contactId)

const groups = computed(() => store.groups)
const storeCards = computed(() => store.cards)
/* 专属字卡库只属于单人联系人，群聊不在此列出（群聊抽卡按发言成员各自字卡库） */
const contactList = computed(() => (contactsStore.list || []).filter((c) => c.kind !== 'group'))

const generalStat = computed(() => store.statOf('general'))
/* 拍一拍：通用库 category='poke' 的字卡规模（含分组数） */
const pokeStat = computed(() => {
  const s = store.statOf('general')
  return { groups: s.pokeGroups, cards: s.poke }
})
function statOfContact(id) {
  return store.statOf('contact', id)
}

const contactName = computed(() => {
  const c = contactList.value.find((x) => String(x.id) === String(selectedContactId.value))
  return c ? c.name : 'TA'
})

const CATEGORY_LABELS = { main: '主字卡', emoji: 'emoji', kaomoji: '颜文字', image: '图片', sticker: '表情包', voice: '语音字卡', poke: '拍一拍' }
const currentCategoryLabel = computed(() => CATEGORY_LABELS[category.value] || category.value)
/* 图片/表情包板块：缩略图网格布局 */
const isMediaCat = computed(() => ['image', 'sticker'].includes(category.value))

const effectiveContactId = computed(() => (scope.value === 'contact' ? selectedContactId.value : null))

/* ══════════ 管理态状态 ══════════ */
/* 'all' | 'none' | 分组 id */
const chip = ref('all')
/* 搜索 */
const searchOpen = ref(false)
const keyword = ref('')
/* 多选 */
const selecting = ref(false)
const selIds = ref([])
/* 多选「全部」视图：以分组为单位的选择（含空分组与「未分组」键 'none'） */
const selGroups = ref([])
/* 弹窗 */
const showManage = ref(false)
const showDupes = ref(false)
const dupes = ref([])
const showMove = ref(false)
/* 'batch' | 卡片对象 */
const moveTarget = ref(null)
/* 编辑中的卡片（null = 添加模式） */
const editingCard = ref(null)
const importEl = ref(null)

/* mochi 字卡全量备份导入：绑定联系人弹窗状态 */
const mochiData = ref(null)
const mochiSummary = ref(null)
const showMochiBind = ref(false)
const mochiBindContact = ref(null)

const MOCHI_CARD_KEYS = ['text', 'emoji', 'kaomoji', 'poke', 'mjfree', 'sticker', 'image', 'voice']

// 预览 mochi 备份，统计字卡各板块条数，并判断是否需要绑定联系人
function previewMochi(json) {
  const data = json && json.data ? json.data : json
  const pub = MOCHI_CARD_KEYS.reduce((n, k) => n + (Array.isArray(data.ccPub?.[k]) ? data.ccPub[k].length : 0), 0)
  const own = MOCHI_CARD_KEYS.reduce((n, k) => n + (Array.isArray(data.ccOwn?.[k]) ? data.ccOwn[k].length : 0), 0)
  return { pub, own, needBind: own > 0 }
}
async function confirmMochiImport() {
  if (!mochiData.value) return
  const ownerId = mochiBindContact.value ? Number(mochiBindContact.value) : null
  try {
    const r = await cardsApi.importMochi(mochiData.value, ownerId)
    const inserted = (r && r.inserted) || 0
    toast.pushToast({ title: '导入完成', text: `共导入 ${inserted} 张字卡` })
    showMochiBind.value = false
    mochiData.value = null
    mochiSummary.value = null
    loadAll()
  } catch (err) {
    toast.pushToast({ title: '导入失败', text: err.message })
  }
}
function closeMochiBind() {
  showMochiBind.value = false
  mochiData.value = null
  mochiSummary.value = null
}

/* 按分组 chip + 关键词过滤后的可见字卡 */
const visibleCards = computed(() => {
  let list = store.cards
  if (chip.value === 'none') {
    const ids = new Set(groups.value.map((g) => String(g.id)))
    list = list.filter((c) => !ids.has(String(c.group_id)))
  } else if (chip.value !== 'all') {
    list = list.filter((c) => String(c.group_id) === String(chip.value))
  }
  const kw = keyword.value.trim().toLowerCase()
  if (kw) list = list.filter((c) => String(c.content || '').toLowerCase().includes(kw))
  return list
})

function countOf(gid) {
  return store.cards.filter((c) => String(c.group_id) === String(gid)).length
}

/* ═══ 「全部」视图：按分组分区，默认全部收起（点开才展开） ═══ */
const expandedGroups = ref({})
function isCollapsed(key) {
  return !expandedGroups.value[key]
}
function toggleCollapse(key) {
  expandedGroups.value[key] = !expandedGroups.value[key]
}
/* 多选态：分区头整组选中/取消（空分组、「未分组」也可选） */
function secChecked(sec) {
  return selGroups.value.includes(sec.key)
}
function toggleSecSel(sec) {
  const key = sec.key
  const cardIds = sec.cards.map((c) => String(c.id))
  if (selGroups.value.includes(key)) {
    selGroups.value = selGroups.value.filter((k) => k !== key)
    selIds.value = selIds.value.filter((id) => !cardIds.includes(id))
  } else {
    if (!selGroups.value.includes(key)) selGroups.value.push(key)
    for (const id of cardIds) if (!selIds.value.includes(id)) selIds.value.push(id)
  }
}
/* 单卡是否选中：自身在 selIds，或所属分组（含「未分组」）被整组选中 */
function isCardSelected(c) {
  const id = String(c.id)
  if (selIds.value.includes(id)) return true
  const key = c.group_id != null ? String(c.group_id) : 'none'
  return selGroups.value.includes(key)
}
/* 实际选中的字卡集合 = 单卡选择 ∪ 整组选择覆盖的字卡 */
function effectiveSelIds() {
  const set = new Set(selIds.value)
  for (const sec of groupedSections.value) {
    if (selGroups.value.includes(sec.key)) {
      for (const c of sec.cards) set.add(String(c.id))
    }
  }
  return [...set]
}
const selCount = computed(() => effectiveSelIds().length)
/* 全选：所有分区都被整组选中时视为「已全选」 */
const allSelected = computed(() => {
  const keys = groupedSections.value.map((s) => s.key)
  return keys.length > 0 && keys.every((k) => selGroups.value.includes(k))
})
function toggleSelAll() {
  if (allSelected.value) {
    selGroups.value = []
    selIds.value = []
  } else {
    selGroups.value = groupedSections.value.map((s) => s.key)
    selIds.value = visibleCards.value.map((c) => String(c.id))
  }
}
const groupedSections = computed(() => {
  const ids = new Set(groups.value.map((g) => String(g.id)))
  const secs = groups.value.map((g) => ({
    key: String(g.id),
    group: g,
    name: g.name,
    blocked: !!g.blocked,
    color: dotColor(g),
    cards: visibleCards.value.filter((c) => String(c.group_id) === String(g.id))
  }))
  const none = visibleCards.value.filter((c) => !ids.has(String(c.group_id)))
  if (none.length) {
    secs.push({ key: 'none', group: null, name: '未分组', blocked: false, color: '#9a9a9a', cards: none })
  }
  return secs
})

/* 分组颜色：优先用户自选色，未设置则按 id 稳定取一组柔和色 */
const DOT_COLORS = ['#e5989b', '#f4a261', '#e9c46a', '#8ab17d', '#5fa8a0', '#9b8fc4', '#f28482', '#84a59d', '#cdb4db', '#b8c0ff']
function dotColor(g) {
  if (g?.color) return g.color
  const n = Number(g?.id)
  return DOT_COLORS[Number.isFinite(n) ? n % DOT_COLORS.length : 0]
}

/* ---------- 枢纽 ---------- */
const ui = useUiStore()
const router = useRouter()

/* 关怀文案入口状态：localStorage 非响应式，用函数在每次渲染时读最新值 */
function careTextsLabel() {
  try {
    return localStorage.getItem(CARE_TEXTS_KEY) ? '已自定义' : '默认文案'
  } catch (e) {
    return '默认文案'
  }
}

/* 管理态顶部标题：通用库 / 联系人名 */
const manageTitle = computed(() => (scope.value === 'contact' ? contactName.value : '通用字卡库'))

/* 管理态隐藏底部 tab 栏；离开管理态或离开页面时恢复 */
watch(entered, (v) => ui.setTabbarHidden(v))
onActivated(() => ui.setTabbarHidden(entered.value))
onDeactivated(() => ui.setTabbarHidden(false))
onMounted(() => ui.setTabbarHidden(entered.value))

/* 返回：直入模式（从联系人设置跳进）回路由上一页；枢纽内进入的回到枢纽态。
   回枢纽时清掉多选等临时状态，下次进入是干净的 */
function onBack(e) {
  if (e && typeof e.prevent === 'function') e.prevent()
  selecting.value = false
  selIds.value = []
  if (props.contactId) {
    router.back()
  } else {
    entered.value = false
  }
}

function enterGeneral() {
  scope.value = 'general'
  selectedContactId.value = null
  category.value = 'main'
  entered.value = true
  resetAndLoad()
}

/* 拍一拍：通用库 category='poke'，专区里只保留搜索 / 分组 / 添加 */
function enterPoke() {
  scope.value = 'general'
  selectedContactId.value = null
  category.value = 'poke'
  entered.value = true
  resetAndLoad()
}

function enterContact(id) {
  scope.value = 'contact'
  selectedContactId.value = id
  category.value = 'main'
  entered.value = true
  resetAndLoad()
}

function resetAndLoad() {
  chip.value = 'all'
  keyword.value = ''
  searchOpen.value = false
  /* 每个库状态独立：换库时清掉多选、展开状态，避免上个库的痕迹带过来 */
  selecting.value = false
  selIds.value = []
  selGroups.value = []
  expandedGroups.value = {}
  loadAll()
}

/* ---------- 数据 ---------- */
/* 各库（scope+联系人+板块）视图缓存：切换板块先渲染缓存再后台刷新，消除切换延迟 */
const viewCache = {}

/* 管理界面一次拉取本库（scope+category）全部字卡（含屏蔽），
   分组筛选 / 搜索 / 计数 / 查重都在前端做 */
async function loadAll() {
  const key = `${scope.value}|${effectiveContactId.value || ''}|${category.value}`
  const cached = viewCache[key]
  if (cached) {
    store.groups = cached.groups
    store.cards = cached.cards
  }
  try {
    const [gs, cs] = await Promise.all([
      cardsApi.getCardGroups({ scope: scope.value, contactId: effectiveContactId.value, category: category.value }),
      cardsApi.getCards({ scope: scope.value, contactId: effectiveContactId.value, category: category.value, includeBlocked: true })
    ])
    store.groups = gs
    store.cards = cs
    viewCache[key] = { groups: gs, cards: cs }
  } catch (e) {
    if (!cached) toast.pushToast({ title: '加载失败', text: e.message })
  }
  if (chip.value !== 'all' && chip.value !== 'none' && !groups.value.find((g) => String(g.id) === String(chip.value))) {
    chip.value = 'all'
  }
  store.loadStats().catch(() => {})
  /* 语音板块：库里缺时长的卡，就地识别音频时长并回写，之后列表直接标注 */
  if (category.value === 'voice') backfillVoiceDurations()
}

/* 语音时长回写：读音频元数据拿到秒数，写回服务端并同步本地（只处理缺时长的卡） */
/* 语音时长识别：WebAudio 解码（VBR mp3 的 loadedmetadata 常返回 Infinity 不可靠） */
function probeDuration(url) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => {
      if (done) return
      done = true
      resolve(v)
    }
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('fetch fail'))))
      .then((buf) => {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return finish(null)
        const ctx = new Ctx()
        ctx.decodeAudioData(
          buf,
          (audio) => {
            finish(Number.isFinite(audio.duration) ? audio.duration : null)
            ctx.close?.()
          },
          () => {
            finish(null)
            ctx.close?.()
          }
        )
      })
      .catch(() => finish(null))
    setTimeout(() => finish(null), 20000)
  })
}
async function backfillVoiceDurations() {
  const todo = store.cards.filter((c) => c.category === 'voice' && c.asset_path && !c.duration)
  if (!todo.length) return
  for (const c of todo) {
    const dur = await probeDuration(c.asset_path)
    if (!dur) continue
    c.duration = dur
    try {
      await cardsApi.updateCard(c.id, { duration: dur })
    } catch { /* 回写失败不影响显示，本地已更新 */ }
  }
}

/* ---------- 工具行 ---------- */
function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) keyword.value = ''
}

function toggleSelect() {
  selecting.value = !selecting.value
  selIds.value = []
  selGroups.value = []
}

function toggleSel(c) {
  const id = String(c.id)
  const i = selIds.value.indexOf(id)
  if (i === -1) selIds.value.push(id)
  else selIds.value.splice(i, 1)
}

/* ---------- 单卡操作 ---------- */
function onToggleBlock(c) {
  store.toggleCardBlocked(c.id, !c.blocked).catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

function openMove(c) {
  moveTarget.value = c
  showMove.value = true
}

function openBatchMove() {
  if (!selCount.value) return
  moveTarget.value = 'batch'
  showMove.value = true
}

async function doMove(g) {
  const ids = moveTarget.value === 'batch' ? effectiveSelIds() : [String(moveTarget.value.id)]
  showMove.value = false
  /* 后台并行移动，完成刷新（逐条 await 会拖住弹窗关闭） */
  Promise.all(ids.map((id) => store.updateCard(id, { group_id: g.id })))
    .then(() => {
      toast.pushToast({ title: '已移动', text: `${ids.length} 张字卡 → ${g.name}` })
      loadAll()
    })
    .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

function openEdit(c) {
  editingCard.value = c
  showEditor.value = true
}

function openEditor() {
  editingCard.value = null
  showEditor.value = true
}

/* ═══ 瓦片操作面板（图片/表情包网格：点缩略图弹出 屏蔽/分组/修改/删除） ═══ */
const actionCard = ref(null)
function openCardActions(c) {
  actionCard.value = c
}
function actToggleBlock() {
  const c = actionCard.value
  if (!c) return
  actionCard.value = null
  onToggleBlock(c)
}
function actMove() {
  const c = actionCard.value
  if (!c) return
  actionCard.value = null
  openMove(c)
}
async function actDelete() {
  const c = actionCard.value
  if (!c) return
  actionCard.value = null
  await removeCard(c)
}

async function saveCard(payload) {
  /* 立即关弹窗：点「添加」后马上回到列表界面，添加/上传动作在后台执行，结果用 toast 提示 */
  function closeNow() {
    showEditor.value = false
    editingCard.value = null
  }
  /* 图片/表情包分类：批量添加文件 —— { files: [File...], groupId } 每个文件一张字卡 */
  if (payload && Array.isArray(payload.files)) {
    /* 没选分组 → 归入「未分组」（groupId 传 null） */
    const gid = payload.groupId ?? null
    const files = payload.files
    if (!files.length) {
      toast.pushToast({ title: '还没有选择文件' })
      return
    }
    closeNow()
    /* 语音：上传前用 Audio 元数据读出时长（秒），随卡存库，列表直接标注 */
    /* 语音：上传前用 WebAudio 解码读出时长（秒），随卡存库，列表直接标注 */
    const readAudioDuration = (file) =>
      new Promise((resolve) => {
        let done = false
        const finish = (v) => {
          if (done) return
          done = true
          resolve(v)
        }
        file
          .arrayBuffer()
          .then((buf) => {
            const Ctx = window.AudioContext || window.webkitAudioContext
            if (!Ctx) return finish(null)
            const ctx = new Ctx()
            ctx.decodeAudioData(
              buf,
              (audio) => {
                finish(Number.isFinite(audio.duration) ? audio.duration : null)
                ctx.close?.()
              },
              () => {
                finish(null)
                ctx.close?.()
              }
            )
          })
          .catch(() => finish(null))
        setTimeout(() => finish(null), 20000)
      })
    /* 后台并行上传+落库，完成后刷新列表 */
    Promise.all(
      files.map(async (f, i) => {
        const isImg = f.type?.startsWith('image/')
        const isVoiceFile = category.value === 'voice'
        const small = isImg ? await compressImage(f) : f
        const res = await uploadFile(small)
        const dur = isVoiceFile ? await readAudioDuration(f) : null
        await store.addCard({
          groupId: gid,
          category: category.value,
          /* 图片字卡内容留空；语音用编辑步输入的文字（留空回退文件名去扩展名）；其他文件用文件名 */
          content: isImg
            ? ''
            : String(payload.texts?.[i] || String(f.name || '').replace(/\.[^.]+$/, '')),
          asset_path: res?.path || '',
          duration: dur,
          scope: scope.value,
          ownerContactId: effectiveContactId.value
        })
      })
    )
      .then(() => {
        toast.pushToast({ title: '已添加', text: `${files.length} 张字卡` })
        loadAll()
      })
      .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
    return
  }
  /* 批量添加模式：{ lines, groupId, asset_path } —— 每行一条，行内已去重 */
  if (payload && Array.isArray(payload.lines)) {
    /* 没选分组 → 归入「未分组」（groupId 传 null） */
    const gid = payload.groupId ?? null
    /* 带图片时 lines 可能为空 → 仍创建 1 张内容为空的图片字卡 */
    const items = payload.lines.length ? payload.lines : (payload.asset_path ? [''] : [])
    if (!items.length) {
      toast.pushToast({ title: '还没有内容', text: '先输入字卡内容' })
      return
    }
    closeNow()
    /* 一次性批量入库（单请求单事务，服务端自动去重），完成后统一刷新列表 */
    cardsApi
      .createCardsBatch(
        items.map((line) => ({
          groupId: gid,
          category: category.value,
          content: line,
          asset_path: payload.asset_path || '',
          scope: scope.value,
          ownerContactId: effectiveContactId.value
        }))
      )
      .then((r) => {
        toast.pushToast({ title: '已添加', text: `${(r && r.inserted) || items.length} 张字卡` })
        loadAll()
      })
      .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
    return
  }
  /* 修改模式：{ content, asset_path } —— 立即关窗，更新在后台执行 */
  const body = typeof payload === 'string' ? { content: payload } : payload || {}
  const editId = editingCard.value?.id
  const editCat = editingCard.value?.category
  closeNow()
  if (editId) {
    store
      .updateCard(editId, { content: body.content || '', asset_path: body.asset_path || '' })
      .then(() => {
        toast.pushToast({ title: '已保存' })
        /* 语音卡：同步聊天里已加载的语音消息转写文案（服务端也已回写历史消息） */
        if (editCat === 'voice') chat.syncCardText(editId, body.content || '')
        loadAll()
      })
      .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
  } else {
    store
      .addCard({
        groupId: chip.value !== 'all' && chip.value !== 'none' ? chip.value : (groups.value[0]?.id ?? null),
        category: category.value,
        content: body.content || '',
        asset_path: body.asset_path || '',
        scope: scope.value,
        ownerContactId: effectiveContactId.value
      })
      .then(() => {
        loadAll()
      })
      .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
  }
}

async function removeCard(c) {
  const ok = await confirmDialog({ title: '删除字卡', text: '确定删除这张字卡？', okText: '删除', danger: true })
  if (!ok) return
  store.deleteCard(c.id).then(() => loadAll())
    .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

/* ---------- 批量操作 ---------- */
async function batchBlock() {
  const eff = effectiveSelIds()
  const groupIds = selGroups.value.filter((k) => k !== 'none')
  if (!eff.length && !groupIds.length) return
  const picked = store.cards.filter((c) => eff.includes(String(c.id)))
  const selGroupsObjs = groupIds.map((k) => groups.value.find((g) => String(g.id) === k)).filter(Boolean)
  /* 整组选择覆盖的字卡：屏蔽组时这些卡跟随，无需逐个再设 */
  const coveredByGroup = new Set()
  for (const k of groupIds) {
    for (const c of store.cards) if (String(c.group_id) === String(k)) coveredByGroup.add(String(c.id))
  }
  /* 整组或单卡任一未屏蔽 → 全部屏蔽；否则全部解除 */
  const next = picked.some((c) => !c.blocked) || selGroupsObjs.some((g) => !g.blocked)
  try {
    /* 1) 整组：服务端单条 SQL 级联屏蔽/解除该组及组内全部字卡 */
    await Promise.all(groupIds.map((k) => store.toggleGroupBlocked(k, next)))
    /* 2) 单卡（未被整组覆盖的）：并行请求 */
    await Promise.all(
      picked.filter((c) => !coveredByGroup.has(String(c.id))).map((c) => store.updateCard(c.id, { blocked: next }))
    )
    toast.pushToast({ title: next ? '已屏蔽所选' : '已解除屏蔽' })
    selIds.value = []
    selGroups.value = []
    loadAll()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

async function batchDelete() {
  const groupIds = selGroups.value.filter((k) => k !== 'none')
  const groupObjs = groupIds.map((k) => groups.value.find((g) => String(g.id) === k)).filter(Boolean)
  const eff = effectiveSelIds()
  if (!eff.length && !groupObjs.length) return
  /* 提示文案：选中整组时按"删除分组 + 级联其全部字卡"描述，其余按单卡计数 */
  let text
  if (groupObjs.length) {
    const gCards = groupObjs.reduce((s, g) => s + countOf(g.id), 0)
    const extra = Math.max(0, eff.length - gCards)
    const gNames = groupObjs.map((g) => `「${g.name}」`).join('、')
    text = `删除分组 ${gNames} 会级联删除其中的 ${gCards} 张字卡${extra ? `，以及另外 ${extra} 张字卡` : ''}，是否删除？`
  } else {
    text = `确定删除选中的 ${eff.length} 张字卡？`
  }
  const ok = await confirmDialog({ title: '批量删除', text, okText: '删除', danger: true })
  if (!ok) return
  try {
    /* 选中的整组：直接删除分组（单条 SQL 级联删组内全部字卡），不走逐卡循环 */
    for (const g of groupObjs) {
      await store.deleteGroup(g.id)
      if (String(chip.value) === String(g.id)) chip.value = 'all'
    }
    /* 其余未归入选中组的单卡：逐张删（数量少） */
    const covered = new Set(
      groupObjs.flatMap((g) => store.cards.filter((c) => String(c.group_id) === String(g.id)).map((c) => String(c.id)))
    )
    const singleIds = eff.filter((id) => !covered.has(id))
    for (const id of singleIds) await store.deleteCard(id)
    toast.pushToast({ title: '已删除' })
    selIds.value = []
    selGroups.value = []
    loadAll()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* ---------- 分组管理 ---------- */
function openManage() {
  showManage.value = true
}

/* 点击分组行 → 选中该分组并回到列表 */
function jumpGroup(g) {
  chip.value = g.id
  showManage.value = false
}

/* ---------- 新建 / 编辑分组（含颜色） ---------- */
const showGroupEdit = ref(false)
const groupEditId = ref(null)
const groupEditName = ref('')
const groupEditColor = ref('#e5989b')

const COLOR_PRESETS = [
  '#e5484d', '#f5871f', '#f5c518', '#46a758', '#29a383', '#0091ff', '#3e63dd', '#8e4ec6',
  '#e93d82', '#f76b15', '#a9e34b', '#12a594', '#3ba9dd', '#5b5bd6', '#9d5bd2', '#e54666',
  '#8d8d8d', '#1c1c1c'
]

function openGroupEdit(g) {
  groupEditId.value = g ? g.id : null
  groupEditName.value = g ? g.name : ''
  groupEditColor.value = g?.color || COLOR_PRESETS[(groups.value.length * 3) % COLOR_PRESETS.length]
  showManage.value = false
  showGroupEdit.value = true
}

/* 屏蔽 / 解除分组（入口：分组管理行、「全部」分区头，与编辑并列） */
function toggleGroupBlock(g) {
  store.toggleGroupBlocked(g.id, !g.blocked).then(() => loadAll())
    .catch((e) => toast.pushToast({ title: '失败', text: e.message }))
}

async function saveGroupEdit() {
  const name = groupEditName.value.trim()
  if (!name) return
  const color = /^#[0-9a-fA-F]{6}$/.test(groupEditColor.value) ? groupEditColor.value : ''
  /* 立即关窗：保存/创建在后台执行，结果用 toast 提示 */
  const isEdit = !!groupEditId.value
  const editId = groupEditId.value
  showGroupEdit.value = false
  try {
    if (isEdit) {
      await store.renameGroup(editId, { name, color })
      toast.pushToast({ title: '已保存' })
    } else {
      await store.addGroup({
        category: category.value,
        scope: scope.value,
        name,
        color,
        ownerContactId: effectiveContactId.value
      })
      toast.pushToast({ title: '已创建', text: name })
    }
    loadAll()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

async function removeGroup() {
  const g = groups.value.find((x) => String(x.id) === String(groupEditId.value))
  if (!g) return
  const ok = await confirmDialog({
    title: '删除分组',
    text: `删除分组「${g.name}」会级联删除其中的 ${countOf(g.id)} 张字卡，是否删除？`,
    okText: '删除',
    danger: true
  })
  if (!ok) return
  /* 立即关窗：级联删除在后台执行 */
  showGroupEdit.value = false
  try {
    await store.deleteGroup(g.id)
    if (String(chip.value) === String(g.id)) chip.value = 'all'
    loadAll()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* ---------- 检测重复 ---------- */
function openDupes() {
  const map = new Map()
  for (const c of store.cards) {
    const key = `${(c.content || '').trim()}|${c.asset_path || ''}`
    if (key === '|') continue
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(c)
  }
  dupes.value = [...map.values()].filter((arr) => arr.length > 1).sort((a, b) => b.length - a.length)
  showDupes.value = true
}

async function dedupe() {
  const total = dupes.value.reduce((n, arr) => n + arr.length - 1, 0)
  const ok = await confirmDialog({
    title: '一键去重',
    text: `将删除 ${total} 张重复字卡（每组保留一条），确定？`,
    okText: '去重',
    danger: true
  })
  if (!ok) return
  try {
    for (const arr of dupes.value) {
      const keep = arr.reduce((a, b) => (Number(a.id) < Number(b.id) ? a : b))
      for (const c of arr) {
        if (String(c.id) !== String(keep.id)) await store.deleteCard(c.id)
      }
    }
    toast.pushToast({ title: '去重完成', text: `已删除 ${total} 张重复字卡` })
    showDupes.value = false
    loadAll()
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}

/* ---------- 导入 / 导出 ---------- */
const showExport = ref(false)
const exportStep = ref('mode') // mode=选择导出方式 | modules=选择板块 | groups=勾选分组
const exportGroupIds = ref([])
const exportModules = ref([]) // [{key,label,icon,count,on}]
const MODULE_ICONS = { main: 'chat', emoji: 'emoji', kaomoji: 'kaomoji', image: 'image', sticker: 'sticker', voice: 'voice', poke: 'poke' }
/* 拍一拍只在「通用字卡库」下有板块，专属库没有；导出时该模块固定取通用库 */
const GENERAL_ONLY_CATS = new Set(['poke'])
/* 工具行「导出」按钮：打开导出方式面板 */
function exportJson() {
  exportStep.value = 'mode'
  exportGroupIds.value = []
  showExport.value = true
}
function closeExport() {
  showExport.value = false
  exportStep.value = 'mode'
}
/* 全量导出：先进入「选择要导出的模块」面板（各板块带条数与开关，默认全开） */
async function doExportAll() {
  try {
    const asList = (r) => (Array.isArray(r) ? r : r?.data || [])
    const contactId = effectiveContactId.value
    /* 通用库当前库的数据始终要拉：一是通用库导出时它就是主数据，
       二是专属库导出时「拍一拍」等只在通用库有的板块要从这里取。 */
    const [genGroups, genCards] = await Promise.all([
      cardsApi.getCardGroups({ scope: 'general' }),
      cardsApi.getCards({ scope: 'general', includeBlocked: 1 })
    ])
    const general = { groups: asList(genGroups), cards: asList(genCards) }
    let primary = general
    if (scope.value === 'contact') {
      const [ctGroups, ctCards] = await Promise.all([
        cardsApi.getCardGroups({ scope: 'contact', contactId }),
        cardsApi.getCards({ scope: 'contact', contactId, includeBlocked: 1 })
      ])
      primary = { groups: asList(ctGroups), cards: asList(ctCards) }
    }
    /* 每个板块各自的数据来源：拍一拍固定用通用库，其余用当前库 */
    const srcOf = (k) => (GENERAL_ONLY_CATS.has(k) ? general : primary)
    exportModules.value = Object.keys(CATEGORY_LABELS).map((k) => {
      const src = srcOf(k)
      return {
        key: k,
        label: CATEGORY_LABELS[k] + (scope.value === 'contact' && GENERAL_ONLY_CATS.has(k) ? '（通用库）' : ''),
        icon: MODULE_ICONS[k] || 'cards',
        count: src.cards.filter((c) => c.category === k).length,
        on: true
      }
    })
    exportModules._primary = primary
    exportModules._general = general
    exportStep.value = 'modules'
  } catch (e) {
    toast.pushToast({ title: '失败', text: e.message })
  }
}
/* 确认导出所选板块：跨板块导出（分组带各自 category，未分组卡也带 category） */
function confirmExportModules() {
  const picked = exportModules.value.filter((m) => m.on).map((m) => m.key)
  if (!picked.length) return
  const data = {
    app: 'zika-cards',
    version: 2,
    exported_at: new Date().toISOString(),
    scope: scope.value,
    categories: picked,
    groups: [],
    ungrouped: []
  }
  /* 逐板块按各自来源取数据：拍一拍固定取通用库，其余取当前库 */
  for (const k of picked) {
    const src = GENERAL_ONLY_CATS.has(k)
      ? (exportModules._general || { groups: [], cards: [] })
      : (exportModules._primary || { groups: [], cards: [] })
    for (const g of src.groups.filter((g) => g.category === k)) {
      data.groups.push({
        name: g.name,
        category: k,
        blocked: !!g.blocked,
        cards: src.cards
          .filter((c) => String(c.group_id) === String(g.id))
          .map((c) => ({ content: c.content || '', asset_path: c.asset_path || '', blocked: !!c.blocked }))
      })
    }
    for (const c of src.cards.filter((c) => c.category === k && (c.group_id == null || c.group_id === ''))) {
      data.ungrouped.push({ category: k, content: c.content || '', asset_path: c.asset_path || '', blocked: !!c.blocked })
    }
  }
  const label = picked.length === Object.keys(CATEGORY_LABELS).length ? '全量' : picked.map((k) => CATEGORY_LABELS[k]).join('+')
  downloadJson(data, `字卡库-${scope.value === 'contact' ? contactName.value : '通用'}-${label}.json`)
  closeExport()
}
function buildExportData(pickedGroups, ungroupedCards) {
  const data = {
    app: 'zika-cards',
    version: 1,
    exported_at: new Date().toISOString(),
    scope: scope.value,
    category: category.value,
    groups: pickedGroups.map((g) => ({
      name: g.name,
      blocked: !!g.blocked,
      cards: store.cards
        .filter((c) => String(c.group_id) === String(g.id))
        .map((c) => ({ content: c.content || '', asset_path: c.asset_path || '', blocked: !!c.blocked }))
    }))
  }
  if (ungroupedCards) data.ungrouped = ungroupedCards
  return data
}
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
/* 按分组导出：仅导出勾选的分组 */
function doExportGroups() {
  const picked = groups.value.filter((g) => exportGroupIds.value.includes(g.id))
  if (!picked.length) return
  downloadJson(
    buildExportData(picked, null),
    `字卡库-${scope.value === 'contact' ? contactName.value : '通用'}-${CATEGORY_LABELS[category.value] || category.value}-按分组.json`
  )
  closeExport()
}

async function onImportFile(e) {
  const file = (e.target.files || [])[0]
  e.target.value = ''
  if (!file) return
  let data
  try {
    const isZip =
      /\.zip$/i.test(file.name) ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed'
    if (isZip) {
      /* 对话类站点新版导出可能是 v5 ZIP（backup.json + media）：用 JSZip 解包 */
      const JSZip = (await import('jszip')).default
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const jf = zip.file('backup.json') || Object.values(zip.files).find((f) => /\.json$/i.test(f.name) && !f.dir)
      if (!jf) throw new Error('ZIP 内未找到 backup.json')
      let raw = await jf.async('string')
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
      data = JSON.parse(raw)
    } else {
      let raw = await file.text()
      if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
      data = JSON.parse(raw)
    }
  } catch {
    toast.pushToast({ title: '导入失败', text: '不是有效的备份文件' })
    return
  }

  /* ① 对话类站点（qcqzz/chat、aielin17/milk 等同款）导出的备份，两种形态都认：
     a) 整站备份：type=chatapp-backup-v4/v5，字卡在 localforage 的 customReplies 等键里；
     b) 回复库单独导出：顶层直接就是 customReplies / customReplyGroups / customPokes 等键。 */
  const isCompanion =
    !!(data && typeof data === 'object' && (data.type === 'chatapp-backup-v4' || data.type === 'chatapp-backup-v5' || (data.localforage && typeof data.localforage === 'object') || Array.isArray(data.customReplies) || Array.isArray(data.customPokes) || Array.isArray(data.customReplyGroups) || Array.isArray(data.customPokeGroups)))
  if (isCompanion) {
    try {
      const targetScope = scope.value
      const targetOwner = targetScope === 'contact' ? effectiveContactId.value : null
      const total = await importCompanionBackup(data, targetScope, targetOwner)
      toast.pushToast({ title: '导入完成', text: `共导入 ${total} 张字卡` })
      loadAll()
      return
    } catch (err) {
      toast.pushToast({ title: '导入失败', text: err.message })
      return
    }
  }

  /* ③ mochi 字卡全量备份（app === 'mochi-ccfull'） */
  const isMochi = !!(data && (data.app === 'mochi-ccfull' || (data.data && data.data.ccPub !== undefined)))
  if (isMochi) {
    try {
      const sum = previewMochi(data)
      if (!sum.needBind) {
        // 仅公用字卡：直接归通用库导入，无需选联系人
        const r = await cardsApi.importMochi(data, null)
        toast.pushToast({ title: '导入完成', text: `共导入 ${(r && r.inserted) || 0} 张字卡` })
        loadAll()
        return
      }
      mochiSummary.value = sum
      mochiData.value = data
      mochiBindContact.value = effectiveContactId.value || (contactList.value[0] && contactList.value[0].id) || null
      showMochiBind.value = true
      return
    } catch (err) {
      toast.pushToast({ title: '导入失败', text: err.message })
      return
    }
  }

  /* ④ 本站自己的导出格式（zika-cards） */
  const inGroups = Array.isArray(data?.groups) ? data.groups : null
  if (!inGroups) {
    toast.pushToast({ title: '导入失败', text: '文件格式不对（无法识别）' })
    return
  }
  let cardCount = 0
  const zikaBatch = []
  try {
    for (const g of inGroups) {
      const name = String(g.name || '未命名分组')
      const gCat = g.category || category.value
      /* 拍一拍等只在通用库有的板块：导入时一律归到通用库，避免导进专属库后看不到 */
      const gScope = GENERAL_ONLY_CATS.has(gCat) ? 'general' : scope.value
      const gOwner = gScope === 'general' ? null : effectiveContactId.value
      let gid
      const existing = groups.value.find((x) => x.name === name && x.category === gCat)
      if (existing) {
        gid = existing.id
      } else {
        const created = await store.addGroup({
          category: gCat,
          scope: gScope,
          name,
          ownerContactId: gOwner
        })
        gid = created.id
      }
      for (const c of Array.isArray(g.cards) ? g.cards : []) {
        if (!c.content && !c.asset_path) continue
        zikaBatch.push({
          groupId: gid,
          category: gCat,
          content: c.content || '',
          asset_path: c.asset_path || '',
          scope: gScope,
          ownerContactId: gOwner
        })
        cardCount++
      }
    }
    /* 全量导出里的「未分组」卡：不建组，直接归入未分组（groupId null） */
    if (Array.isArray(data.ungrouped)) {
      for (const c of data.ungrouped) {
        if (!c.content && !c.asset_path) continue
        zikaBatch.push({
          groupId: null,
          category: c.category || category.value,
          content: c.content || '',
          asset_path: c.asset_path || '',
          scope: GENERAL_ONLY_CATS.has(c.category || category.value) ? 'general' : scope.value,
          ownerContactId: GENERAL_ONLY_CATS.has(c.category || category.value) ? null : effectiveContactId.value
        })
        cardCount++
      }
    }
    /* 一次性批量入库（单请求单事务，服务端自动去重）；失败时 http 层自行抛出服务端错误 */
    if (zikaBatch.length) {
      const r = await cardsApi.createCardsBatch(zikaBatch)
      cardCount = (r && r.inserted) || 0
    }
    toast.pushToast({ title: '导入完成', text: `共导入 ${cardCount} 张字卡` })
    loadAll()
  } catch (err) {
    toast.pushToast({ title: '导入失败', text: err.message })
  }
}

/* 从对话类站点备份里抽取字卡：customReplies（主字卡）→ 进「当前所在库」（专属库则进该联系人库、通用库则进通用库）；
   customPokes（拍一拍）→ 永远进通用库（拍一拍只在通用库存在）。分组里的条目按所属分组归类，未归组的进「未分组」。 */
function companionKey(lf, suffix) {
  return Object.keys(lf || {}).find((k) => k.endsWith(suffix)) || null
}
async function importCompanionBackup(data, targetScope, targetOwner) {
  /* 兼容两种形态：整站备份（键在 localforage 里）与回复库单独导出（键直接在顶层） */
  const lf = (data.localforage && typeof data.localforage === 'object') ? data.localforage : data
  let total = 0
  const repliesKey = companionKey(lf, 'customReplies')
  const replyGroupsKey = companionKey(lf, 'customReplyGroups')
  const pokesKey = companionKey(lf, 'customPokes')
  const pokeGroupsKey = companionKey(lf, 'customPokeGroups')
  const replies = Array.isArray(lf[repliesKey]) ? lf[repliesKey] : []
  const replyGroups = Array.isArray(lf[replyGroupsKey]) ? lf[replyGroupsKey] : []
  const pokes = Array.isArray(lf[pokesKey]) ? lf[pokesKey] : []
  const pokeGroups = Array.isArray(lf[pokeGroupsKey]) ? lf[pokeGroupsKey] : []
  /* 主字卡：进当前所在库 */
  total += await importCompanionGrouped(replies, replyGroups, 'main', targetScope, targetOwner)
  /* 拍一拍：永远进通用库 */
  total += await importCompanionGrouped(pokes, pokeGroups, 'poke', 'general', null)
  /* 语音字卡：进当前所在库（音频 base64 → 上传 → 解码时长） */
  total += await importCompanionVoice(lf.customVoiceCards, targetScope, targetOwner)
  return total
}
/* 单个板块（main / poke）导入：reply=数组（多为纯文本字符串，也可能含 {text/image} 的对象）；groups=[{name,items:[...]}] */
async function importCompanionGrouped(replies, srcGroups, category, targetScope, targetOwner) {
  const norm = (x) => (typeof x === 'string' ? x : x && (x.text || x.content || '')) || ''
  const grouped = new Set()
  const batch = []
  /* 先把分组建好（数量少，逐个建），组内字卡收集后与未归组一起一次性批量插入 */
  for (const g of Array.isArray(srcGroups) ? srcGroups : []) {
    const name = String(g.name || '未命名分组')
    if (!name.trim()) continue
    /* 复用当前库中同名同类的分组，避免重复建组 */
    const existing = groups.value.find((x) => x.name === name && x.category === category)
    let gid
    if (existing) {
      gid = existing.id
    } else {
      const createdGroup = await store.addGroup({
        category,
        scope: targetScope,
        name,
        ownerContactId: targetOwner
      })
      gid = createdGroup.id
    }
    for (const it of Array.isArray(g.items) ? g.items : []) {
      const txt = norm(it).trim()
      if (!txt) continue
      batch.push({ groupId: gid, category, content: txt, scope: targetScope, ownerContactId: targetOwner })
      grouped.add(txt)
    }
  }
  /* 未归组的字卡：直接进目标库「未分组」 */
  for (const r of replies) {
    const txt = norm(r).trim()
    if (!txt || grouped.has(txt)) continue
    batch.push({ groupId: null, category, content: txt, scope: targetScope, ownerContactId: targetOwner })
  }
  /* 一次性批量入库（单请求单事务），比逐条请求快几个数量级。
     http 封装在 code!=0 时会自行 reject 并带上服务端 msg，这里无需再判 code。
     用服务端返回的 inserted（已自动去重）作为实际新增数 */
  let ins = 0
  if (batch.length) {
    const r = await cardsApi.createCardsBatch(batch)
    ins = (r && r.inserted) || 0
  }
  return ins
}
/* 语音字卡导入：voiceCards=[{id,text,audio:"data:audio/xxx;base64,..."}] → 上传音频并解码时长后入库 */
function dataUriToVoiceFile(dataUri, filename) {
  const [meta, b64] = String(dataUri).split(',')
  const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'audio/mpeg'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], filename, { type: mime })
}
function decodeAudioDurationFromFile(file) {
  return new Promise((resolve) => {
    let done = false
    const finish = (v) => { if (done) return; done = true; resolve(v) }
    file.arrayBuffer()
      .then((buf) => {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (!Ctx) return finish(null)
        const ctx = new Ctx()
        ctx.decodeAudioData(
          buf,
          (a) => { finish(Number.isFinite(a.duration) ? a.duration : null); ctx.close?.() },
          () => { finish(null); ctx.close?.() }
        )
      })
      .catch(() => finish(null))
    setTimeout(() => finish(null), 20000)
  })
}
async function importCompanionVoice(voiceCards, targetScope, targetOwner) {
  const list = (Array.isArray(voiceCards) ? voiceCards : []).filter((v) => v && v.audio && String(v.audio).startsWith('data:'))
  if (!list.length) return 0
  const batch = []
  /* 音频上传并行化（每批 4 个），全部传完后一次性批量入库 */
  const CHUNK = 4
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = await Promise.all(list.slice(i, i + CHUNK).map(async (v) => {
      try {
        const f = dataUriToVoiceFile(v.audio, (v.id ? String(v.id) : 'voice') + '.mp3')
        const res = await uploadFile(f)
        const dur = await decodeAudioDurationFromFile(f)
        return {
          groupId: null,
          category: 'voice',
          content: v.text || '',
          asset_path: res?.path || '',
          duration: dur,
          scope: targetScope,
          ownerContactId: targetOwner
        }
      } catch { return null /* 单条音频失败跳过，不影响其余 */ }
    }))
    for (const x of part) if (x) batch.push(x)
  }
  let ins = 0
  if (batch.length) {
    const r = await cardsApi.createCardsBatch(batch)
    ins = (r && r.inserted) || 0
  }
  return ins
}

/* ---------- 分类切换 ---------- */
watch(category, () => {
  chip.value = 'all'
  keyword.value = ''
  loadAll()
})

/* /contacts/:id/cards 直入时 props.contactId 可能随路由变化 */
watch(() => props.contactId, (v) => {
  if (!v) return
  scope.value = 'contact'
  selectedContactId.value = v
  entered.value = true
  resetAndLoad()
})

onMounted(async () => {
  await contactsStore.load().catch(() => {})
  store.loadStats().catch(() => {})
  if (entered.value) loadAll()
})

/* keep-alive 复用实例时刷新枢纽（联系人/字卡数量会变） */
onActivated(async () => {
  await contactsStore.load().catch(() => {})
  await store.loadStats().catch(() => {})
  if (entered.value) loadAll()
})
</script>

<style scoped>
.cards-view { flex: 1; display: flex; flex-direction: column; min-height: 0; max-width: 100%; overflow-x: hidden; }

/* 枢纽 */
.hub-scroll { flex: 1; overflow-y: auto; padding: 10px 12px 24px; }
.hub-hint {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-soft);
  background: var(--accent-soft);
  border-radius: 12px;
  padding: 10px 12px;
  margin-bottom: 12px;
}
.hub-hint b { color: var(--accent); }
.hub-label {
  font-size: 12px;
  color: var(--text-soft);
  margin: 16px 4px 8px;
  letter-spacing: 1px;
}
.ent {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-screen);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 10px 12px;
  margin-bottom: 8px;
  text-align: left;
  font-family: var(--font-serif);
  transition: all 0.2s ease;
}
.ent:active { transform: scale(0.985); background: var(--bg-soft); }
.ent-ico {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ent-ico-gen { background: var(--accent-soft); color: var(--accent); }
.ent-ico-poke { background: var(--accent-soft); color: var(--accent); }
.ent-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ent-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ent-tag {
  font-size: 10px;
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 400;
}
.ent-num { font-size: 11px; color: var(--text-soft); flex-shrink: 0; }
.ent-num b { color: var(--text); font-size: 13px; }
.ent-go { color: var(--text-soft); font-size: 18px; flex-shrink: 0; }
.hub-empty {
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  padding: 40px 20px;
  line-height: 1.8;
}

/* 管理态 */
/* 工具行：左（搜索/分组/查重）右（多选/导入/导出） */
.toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.tb-group { display: flex; gap: 10px; }
.tb-btn {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 12px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  padding: 0;
}
.tb-btn:active { background: var(--bg-soft); }
.tb-btn.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }

/* 搜索行 */
.search-row {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-screen);
  border-bottom: 1px solid var(--border);
}
.search-row .field { flex: 1 1 auto; margin: 0; }
.sr-clear {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  padding: 6px;
}

/* 多选操作条 */
.sel-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.sel-num { flex: 0 0 auto; font-size: 13px; color: var(--text-soft); margin-right: auto; }
.sel-num b { color: var(--accent); }
.sel-btn {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 999px;
  padding: 5px 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  flex: 0 0 auto;
}
.sel-btn:disabled { opacity: 0.45; }
.sel-btn.danger { color: #e5484d; border-color: #ffd6de; }
.sel-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }

.cards-main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; margin: 8px; }
.cm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px 8px;
}
.cm-title { font-size: 14px; font-weight: 700; }
.cm-num { font-size: 12px; color: var(--text-soft); }
.card-grid {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: grid;
  /* minmax(0,1fr)：强制列宽=容器宽。裸 1fr 会被内容 min-content 撑破，导致整列左右滑动 */
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-content: start;
  padding-right: 2px;
}
.card-grid > * { min-width: 0; max-width: 100%; }
/* 图片/表情包板块：一行三列缩略图网格（参考图） */
.card-grid.media { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.card-grid.media .sec-head { grid-column: 1 / -1; }
.cm-empty { padding: 30px 10px; text-align: center; color: var(--text-soft); font-size: 13px; }

/* 「全部」分区头（参考图三：彩点 + 彩色名 + 条数 + 编辑 + 展开箭头） */
.sec-head {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--bg-soft);
  cursor: pointer;
  user-select: none;
}
.sec-head:active { background: var(--accent-soft); }
/* 空分组展开后的占位提示（参考图二"此分组暂无内容"） */
.sec-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-soft);
  font-size: 13px;
  padding: 16px 0;
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
}
.sec-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sec-count { flex: 0 0 auto; font-size: 11px; color: var(--text-soft); }
/* 多选态：分区头勾选圈（与字卡行的选择圈同款） */
.sec-check {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-screen);
}
.sec-check.on { background: var(--accent); border-color: var(--accent); }
.sec-edit { width: 30px; height: 30px; border-radius: 9px; }
.sec-arrow {
  flex: 0 0 auto;
  color: var(--text-soft);
  font-size: 18px;
  transform: rotate(90deg);
  transition: transform 0.15s ease;
}
.sec-arrow.shut { transform: rotate(0deg); }

/* 分组管理弹窗（参考图二） */
.mg-list { display: flex; flex-direction: column; gap: 8px; }
.mg-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-soft);
  cursor: pointer;
}
.mg-row:active { background: var(--accent-soft); }
.mg-row.blocked { opacity: 0.55; }
.mg-dot { width: 10px; height: 10px; border-radius: 50%; flex: 0 0 auto; }
.mg-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mg-blocked-tag { font-style: normal; font-size: 10px; color: var(--text-soft); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; margin-left: 6px; }
.mg-count { flex: 0 0 auto; font-size: 11px; color: var(--text-soft); }
.mg-ico {
  flex: 0 0 auto;
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 10px;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  padding: 0;
}
.mg-ico:active { background: var(--bg-soft); }
.mg-go { flex: 0 0 auto; color: var(--text-soft); font-size: 18px; }
.mg-empty { padding: 24px 10px; text-align: center; color: var(--text-soft); font-size: 13px; }

/* 新建 / 编辑分组弹窗（参考图一） */
.ge-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1.2px;
  color: var(--text-soft);
  margin: 14px 2px 8px;
}
.mochi-tip { margin: 2px 2px 10px; font-size: 13px; color: var(--text); }
.mochi-sum { margin: 0 2px 6px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
.mochi-sum li {
  font-size: 13px;
  color: var(--text-soft);
  padding: 7px 11px;
  background: var(--bg-soft);
  border-radius: 9px;
}
.ge-swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 9px;
}
.ge-sw {
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid transparent;
  padding: 0;
  transition: transform 0.12s ease;
}
.ge-sw.on { border-color: var(--text); transform: scale(1.08); box-shadow: inset 0 0 0 2px #fff; }
.ge-custom { display: flex; align-items: center; gap: 10px; }
.ge-picker {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-soft);
  padding: 4px;
  cursor: pointer;
}
.ge-hex { flex: 1 1 auto; text-transform: uppercase; }
.ge-preview {
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ge-preview i { width: 10px; height: 10px; border-radius: 50%; background: var(--bg-screen); }
.ge-del { color: #e5484d !important; }

/* 查重弹窗 */
.dupe-list { display: flex; flex-direction: column; gap: 8px; }
.dupe-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  background: var(--bg-soft);
}
.dupe-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dupe-num { flex: 0 0 auto; font-size: 12px; font-weight: 700; color: var(--accent); }

/* 移动分组弹窗 */
.move-list { display: flex; flex-direction: column; gap: 8px; }
.move-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 11px 12px;
  background: var(--bg-soft);
  text-align: left;
}
.move-row:active { background: var(--accent-soft); }
.move-row .mg-name { font-weight: 600; }
.move-row.act-danger { color: #e5484d; }
.move-row.act-danger .mg-name { color: #e5484d; }

/* 导出方式面板（底部弹出） */
.export-mask {
  position: fixed;
  inset: 0;
  background: rgba(60, 50, 56, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: export-fade 0.15s ease;
}
@keyframes export-fade { from { opacity: 0; } to { opacity: 1; } }
.export-sheet {
  width: 100%;
  max-width: 460px;
  background: var(--bg-screen);
  border-radius: 20px 20px 0 0;
  padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: export-up 0.22s ease;
}
@keyframes export-up { from { transform: translateY(40%); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
.export-head { display: flex; align-items: center; gap: 7px; font-size: 17px; font-weight: 700; color: var(--text); }
.export-sub { font-size: 12px; color: var(--text-soft); margin: -4px 0 2px; }
.export-opt {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  border-radius: 14px;
  padding: 13px 14px;
  text-align: left;
}
.export-opt:active { background: var(--accent-soft); }
.eo-ico {
  flex: 0 0 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--accent-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}
.eo-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.eo-t { font-size: 14px; font-weight: 600; color: var(--text); }
.eo-d { font-size: 11px; color: var(--text-soft); }
.export-glist { display: flex; flex-direction: column; gap: 6px; max-height: 38vh; overflow-y: auto; }
.export-gitem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-soft);
  font-size: 13px;
}
.export-gitem input { accent-color: var(--accent); }
.export-go {
  border: none;
  background: var(--accent);
  color: #fff;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
}
.export-go:disabled { opacity: 0.45; }
.export-cancel {
  border: 1px solid var(--border);
  background: var(--bg-screen);
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  color: var(--text);
}
/* ---- 选择要导出的模块 ---- */
.export-x { margin-left: auto; border: none; background: none; color: var(--text-soft); display: flex; }
.export-mlist { display: flex; flex-direction: column; gap: 8px; max-height: 46vh; overflow-y: auto; }
.export-mitem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-soft);
}
.export-mitem .em-ico {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
}
.em-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.em-cnt { font-size: 11px; color: var(--text-soft); }
/* 开关（面性 checkbox）*/
.em-switch {
  flex: 0 0 auto;
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: #d7d2c9;
  position: relative;
  transition: background 0.18s;
  cursor: pointer;
}
.em-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-screen);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  transition: transform 0.18s;
}
.em-switch:checked { background: var(--accent); }
.em-switch:checked::after { transform: translateX(18px); }
.export-foot { display: flex; gap: 10px; margin-top: 4px; }
.export-foot-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
}
.export-foot-btn.ghost { border: 1px solid var(--border); background: var(--bg-screen); color: var(--text); }
.export-foot-btn.primary { border: none; background: var(--accent); color: #fff; }
.export-foot-btn.primary:disabled { opacity: 0.45; }
</style>
