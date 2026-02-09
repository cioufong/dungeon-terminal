<template>
  <div class="game-nav">
    <div class="nav-party">
      <span v-for="m in party" :key="m.tokenId" class="party-member" :class="{ you: m.isFreeMint }">
        {{ raceLabel(m) }} LV.{{ m.progression.level }}
      </span>
    </div>
    <div class="nav-actions">
      <button class="nav-btn" @click="emit('party')">{{ t.navParty }}</button>
      <button class="nav-btn" @click="emit('recruit')">{{ t.navRecruit }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NFAData } from '../composables/useNFA'
import { useI18n } from '../i18n'

const { t } = useI18n()

defineProps<{
  party: NFAData[]
}>()

const emit = defineEmits<{
  (e: 'party'): void
  (e: 'recruit'): void
}>()

function raceLabel(nfa: NFAData): string {
  return t.value.races[nfa.traits.race] || '???'
}
</script>

<style scoped>
.game-nav {
  position: fixed;
  top: 8px;
  left: 12px;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 8px;
}
.nav-party {
  display: flex;
  gap: 4px;
}
.party-member {
  border: 1px solid var(--dim);
  padding: 2px 8px;
  font-size: 10px;
  color: var(--gray);
  letter-spacing: 1px;
}
.party-member.you {
  border-color: var(--yellow);
  color: var(--yellow);
}
.nav-actions {
  display: flex;
  gap: 4px;
}
.nav-btn {
  background: transparent;
  border: 1px solid var(--dim);
  color: var(--gray);
  font-family: var(--font);
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
}
.nav-btn:hover {
  border-color: var(--yellow);
  color: var(--yellow);
}
</style>
