<template>
  <div class="os-view">
    <AppHeader title="其他设置" back />
    <div class="os-body">
      <div class="panel sec">
        <div class="sec-title">其他设置</div>
        <p class="hint">TA 与你的一些互动概率。</p>
      </div>
      <div class="panel nav-panel">
        <div class="prob-row" v-for="p in probs" :key="p.key">
          <div class="prob-head">
            <span class="prob-label">{{ p.label }}</span>
            <span class="prob-val">{{ model[p.key] }}%</span>
          </div>
          <input
            class="prob-range"
            type="range"
            min="0"
            max="100"
            step="1"
            v-model.number="model[p.key]"
            @change="onProbChange(p.key)"
          />
        </div>
      </div>
      <p class="tip">
        提示：听歌邀请、游戏邀请、观影邀请为<b>每小时</b>的概率；收藏歌曲概率为对方<b>每次听歌时</b>收藏一首歌的概率。均为 0 时不会触发。
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import { getContactSettings, updateContactSettings } from '@/api/contacts'
import { notify } from '@/utils/dialog'

const route = useRoute()
const id = route.params.id

const model = reactive({
  music_invite_prob: 21,
  music_fav_prob: 1,
  game_invite_prob: 21,
  cinema_invite_prob: 21
})

const probs = [
  { key: 'music_invite_prob', label: '听歌邀请的概率（每小时）' },
  { key: 'music_fav_prob', label: '听歌时收藏歌曲的概率' },
  { key: 'game_invite_prob', label: '邀请玩游戏的概率（每小时）' },
  { key: 'cinema_invite_prob', label: '邀请观影的概率（每小时）' }
]

async function load() {
  try {
    const s = await getContactSettings(id)
    if (s.music_invite_prob != null) model.music_invite_prob = Number(s.music_invite_prob)
    if (s.music_fav_prob != null) model.music_fav_prob = Number(s.music_fav_prob)
    if (s.game_invite_prob != null) model.game_invite_prob = Number(s.game_invite_prob)
    if (s.cinema_invite_prob != null) model.cinema_invite_prob = Number(s.cinema_invite_prob)
  } catch (e) { /* ignore */ }
}

/* 滑杆改动即时保存 */
async function onProbChange(key) {
  try {
    await updateContactSettings(id, { [key]: Number(model[key]) })
  } catch (e) { notify('保存失败：' + e.message) }
}

load()
onActivated(load)
</script>

<style scoped>
.os-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.os-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 12px; }

.panel { background: var(--bg-screen); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); }
.sec { padding: 6px 14px; }
.nav-panel { padding: 10px 14px; display: flex; flex-direction: column; }
.sec-title { font-size: 14px; font-weight: 700; padding: 10px 0 4px; color: var(--text); }
.hint { font-size: 11px; color: var(--text-soft); line-height: 1.6; margin: 0 0 8px; }
.prob-row { padding: 8px 0; }
.prob-row + .prob-row { border-top: 1px solid var(--border); }
.prob-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.prob-label { font-size: 14px; font-weight: 600; color: var(--text); }
.prob-val { font-size: 13px; color: var(--accent); font-weight: 700; font-variant-numeric: tabular-nums; }
.prob-range { width: 100%; accent-color: var(--accent); }

.tip { font-size: 11px; color: var(--text-soft); line-height: 1.6; padding: 0 4px; }
</style>
