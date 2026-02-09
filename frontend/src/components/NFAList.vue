<template>
  <div class="nfa-list">
    <div class="list-header">
      <span class="title">{{ t.selectCompanion }}</span>
      <span class="sub">{{ t.selectPrompt }}</span>
    </div>

    <div class="party-status">
      <span class="dim">{{ t.partyCount(selectedIds.length, ownedNFAs.length) }}</span>
    </div>

    <div class="cards">
      <div
        v-for="nfa in ownedNFAs"
        :key="nfa.tokenId"
        class="nfa-card"
        :class="{
          selected: selectedIds.includes(nfa.tokenId),
          locked: nfa.isFreeMint,
        }"
        @click="toggle(nfa)"
      >
        <div class="card-head">
          <span class="token-id">#{{ nfa.tokenId }}</span>
          <span class="level">LV.{{ nfa.progression.level }}</span>
        </div>
        <img
          :src="generateAvatarDataURI(nfa.traits.race, nfa.traits.class_, nfa.traits.personality, nfa.traits.talentRarity)"
          class="nfa-avatar"
          alt="avatar"
        />
        <div class="card-body">
          <div class="race-class">
            {{ t.races[nfa.traits.race] }} {{ t.classes[nfa.traits.class_] }}
          </div>
          <div class="personality dim">
            {{ t.personalities[nfa.traits.personality] }}
          </div>
          <div class="talent" :style="{ color: rarityColor(nfa.traits.talentRarity) }">
            {{ talentName(nfa.traits.talentId) }}
          </div>
          <div class="stats">
            <span v-for="(s, i) in effectiveStats(nfa.traits.baseStats, nfa.traits.race)" :key="i" class="stat">
              {{ STAT_NAMES[i] }}:{{ s }}
            </span>
          </div>
          <div class="hp-row">
            <span class="hp-label">HP</span>
            <div class="hp-bar">
              <div class="hp-fill" style="width: 100%"></div>
            </div>
            <span class="hp-val">{{ computeMaxHP(effectiveStats(nfa.traits.baseStats, nfa.traits.race)[2] ?? 10, nfa.progression.level) }}</span>
          </div>
        </div>
        <div v-if="nfa.isFreeMint" class="char-badge">{{ t.characterBadge }}</div>
        <div v-if="selectedIds.includes(nfa.tokenId)" class="check-badge">&#10003;</div>
        <div v-if="!nfa.progression.active" class="inactive-badge">{{ t.inactive }}</div>
      </div>
    </div>

    <div class="actions">
      <button class="action-btn" :disabled="selectedIds.length === 0" @click="enter">
        {{ t.enterDungeon }}
      </button>
      <button class="action-btn secondary" @click="emit('mint')">
        {{ t.recruitNew }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { NFAData } from '../composables/useNFA'
import { useNFAStore } from '../stores/nfa'
import { useI18n } from '../i18n'
import { STAT_NAMES, effectiveStats, computeMaxHP, talentName, rarityColor } from '../data/traits'
import { generateAvatarDataURI } from '../utils/avatarSVG'

const { t } = useI18n()

const props = defineProps<{
  ownedNFAs: NFAData[]
}>()

const emit = defineEmits<{
  (e: 'enter'): void
  (e: 'mint'): void
}>()

const nfaStore = useNFAStore()
const selectedIds = ref<number[]>([])

// Auto-include the character (free mint) on mount
onMounted(() => {
  const char = props.ownedNFAs.find(n => n.isFreeMint)
  if (char) {
    selectedIds.value = [char.tokenId]
  }
})

function toggle(nfa: NFAData) {
  // Character (free mint) is always in party, can't deselect
  if (nfa.isFreeMint) return

  const idx = selectedIds.value.indexOf(nfa.tokenId)
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1)
  } else {
    selectedIds.value.push(nfa.tokenId)
  }
}

function enter() {
  if (selectedIds.value.length === 0) return
  nfaStore.setParty(selectedIds.value)
  emit('enter')
}
</script>

<style scoped>
.nfa-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.list-header {
  text-align: center;
  margin-bottom: 12px;
}
.title {
  display: block;
  color: var(--yellow);
  font-size: 16px;
  letter-spacing: 2px;
}
.sub {
  display: block;
  color: var(--gray);
  font-size: 11px;
  margin-top: 4px;
}
.party-status {
  margin-bottom: 12px;
  font-size: 12px;
}
.dim { color: var(--gray); }
.cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 680px;
  margin-bottom: 20px;
}
.nfa-card {
  width: 200px;
  border: 1px solid var(--dim);
  padding: 10px;
  cursor: pointer;
  position: relative;
  transition: border-color 0.2s;
}
.nfa-card:hover {
  border-color: var(--gray);
}
.nfa-card.selected {
  border-color: var(--yellow);
  box-shadow: 0 0 8px rgba(255, 255, 0, 0.15);
}
.nfa-card.locked {
  cursor: default;
}
.nfa-card.locked.selected {
  border-color: var(--yellow);
}
.nfa-avatar {
  width: 64px;
  height: 64px;
  image-rendering: pixelated;
  display: block;
  margin: 0 auto 6px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}
.token-id {
  color: var(--orange);
  font-size: 12px;
  font-weight: bold;
}
.level {
  color: var(--yellow);
  font-size: 11px;
}
.card-body {
  font-size: 12px;
  line-height: 1.6;
}
.race-class {
  color: var(--white);
  font-weight: bold;
}
.talent {
  font-size: 11px;
  margin: 2px 0;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  font-size: 10px;
  color: var(--orange);
}
.stat {
  background: rgba(255, 153, 51, 0.1);
  padding: 1px 4px;
}
.hp-row {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}
.hp-label {
  color: var(--gray);
  font-size: 10px;
  min-width: 18px;
}
.hp-bar {
  flex: 1;
  height: 4px;
  background: var(--red);
  border: 1px solid var(--dim);
}
.hp-fill {
  height: 100%;
  background: var(--yellow);
}
.hp-val {
  color: var(--white);
  font-size: 10px;
  min-width: 24px;
  text-align: right;
}
.char-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: var(--yellow);
  color: var(--black);
  font-size: 9px;
  padding: 1px 4px;
  font-weight: bold;
}
.check-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  color: var(--yellow);
  font-size: 14px;
  line-height: 1;
}
.inactive-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  background: var(--red);
  color: var(--white);
  font-size: 9px;
  padding: 1px 4px;
}
.actions {
  display: flex;
  gap: 12px;
}
.action-btn {
  background: transparent;
  border: 2px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: all 0.2s;
}
.action-btn:hover:not(:disabled) {
  background: var(--yellow);
  color: var(--black);
}
.action-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.action-btn.secondary {
  border-color: var(--dim);
  color: var(--gray);
}
.action-btn.secondary:hover {
  border-color: var(--gray);
  color: var(--white);
  background: transparent;
}
</style>
