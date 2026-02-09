<template>
  <div class="party-panel">
    <!-- Wallet + Language header -->
    <div class="panel-header">
      <span class="lang-toggle" @click="toggleLocale">{{ locale === 'en' ? '中' : 'EN' }}</span>
      <span class="wallet-addr" @click="disconnect" :title="address">{{ shortAddress(address) }}</span>
    </div>
    <div class="panel-title">[ PARTY ]</div>
    <div
      v-for="(m, i) in party" :key="m.name"
      class="member"
      :class="{ you: m.isCharacter, 'hp-dmg': hpFlash[m.name] === 'dmg', 'hp-heal': hpFlash[m.name] === 'heal' }"
    >
      <div class="member-header">
        <img
          v-if="partyNFAs[i]"
          :src="generateAvatarDataURI(partyNFAs[i]!.traits.race, partyNFAs[i]!.traits.class_, partyNFAs[i]!.traits.personality, partyNFAs[i]!.traits.talentRarity)"
          class="member-avatar"
          alt=""
        />
        <span class="member-name">{{ m.name }}</span>
        <span v-if="m.isCharacter" class="badge">YOU</span>
      </div>
      <span class="member-class">{{ m.className }} LV.{{ m.level }}</span>
      <div class="hp-row">
        <div class="hp-bar">
          <div
            class="hp-fill"
            :class="{ low: m.hp / m.maxHp < 0.3 }"
            :style="{ width: (m.hp / m.maxHp * 100) + '%' }"
          />
        </div>
        <span class="hp-text">{{ m.hp }}/{{ m.maxHp }}</span>
        <span v-if="hpDelta[m.name]" class="hp-delta" :class="hpDelta[m.name]! > 0 ? 'heal' : 'dmg'">
          {{ hpDelta[m.name]! > 0 ? '+' : '' }}{{ hpDelta[m.name] }}
        </span>
      </div>
    </div>
    <!-- XP Bar -->
    <div class="xp-section">
      <div class="xp-label">{{ t.levelLabel }}.{{ level }} — {{ t.xpLabel }}: {{ xp }}/{{ xpToNext }}</div>
      <div class="xp-bar">
        <div class="xp-fill" :style="{ width: (xp / xpToNext * 100) + '%' }" />
      </div>
    </div>
    <div class="nav-actions">
      <button class="nav-btn exit-btn" @click="emit('exit')">{{ t.navBack }}</button>
      <button class="nav-btn sfx-btn" @click="toggleSound">{{ sound.enabled.value ? t.soundOn : t.soundOff }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue'
import { useGameStore } from '../stores/game'
import { useNFAStore } from '../stores/nfa'
import { useWeb3 } from '../composables/useWeb3'
import { useI18n } from '../i18n'
import { storeToRefs } from 'pinia'
import { generateAvatarDataURI } from '../utils/avatarSVG'

const store = useGameStore()
const nfaStore = useNFAStore()
const { party, xp, level, xpToNext } = storeToRefs(store)
const sound = store.sound
const { locale, t, toggleLocale } = useI18n()
const { address, disconnect, shortAddress } = useWeb3()

const partyNFAs = computed(() => nfaStore.party)

function toggleSound() {
  sound.enabled.value = !sound.enabled.value
  if (sound.enabled.value) sound.select()
}

const emit = defineEmits<{
  (e: 'exit'): void
}>()

const prevHP = reactive<Record<string, number>>({})
const hpFlash = reactive<Record<string, 'dmg' | 'heal' | ''>>({})
const hpDelta = reactive<Record<string, number | null>>({})

watch(party, (members) => {
  for (const m of members) {
    const prev = prevHP[m.name]
    if (prev !== undefined && prev !== m.hp) {
      const delta = m.hp - prev
      hpDelta[m.name] = delta
      hpFlash[m.name] = delta < 0 ? 'dmg' : 'heal'
      setTimeout(() => { hpFlash[m.name] = '' }, 600)
      setTimeout(() => { hpDelta[m.name] = null }, 1200)
    }
    prevHP[m.name] = m.hp
  }
}, { deep: true })
</script>

<style scoped>
.party-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 10px;
  border-left: 3px solid var(--white);
  background: var(--black);
  overflow-y: auto;
}
.panel-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}
.lang-toggle {
  color: var(--gray);
  font-size: 10px;
  cursor: pointer;
  border: 1px solid var(--dim);
  padding: 2px 6px;
  letter-spacing: 1px;
}
.lang-toggle:hover {
  color: var(--white);
  border-color: var(--gray);
}
.wallet-addr {
  color: var(--yellow);
  font-size: 10px;
  cursor: pointer;
  border: 1px solid var(--dim);
  padding: 2px 6px;
  letter-spacing: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wallet-addr:hover {
  border-color: var(--yellow);
}
.panel-title {
  color: var(--yellow);
  font-size: 11px;
  letter-spacing: 2px;
  text-align: center;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--dim);
}
.member {
  padding: 6px 8px;
  border: 1px solid var(--dim);
  transition: background 0.3s;
}
.member.you {
  border-color: var(--yellow);
}
.member-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
}
.member-avatar {
  width: 24px;
  height: 24px;
  image-rendering: pixelated;
}
.member-name {
  color: var(--orange);
  font-size: 11px;
  font-weight: bold;
}
.member.you .member-name {
  color: var(--yellow);
}
.badge {
  font-size: 8px;
  color: var(--black);
  background: var(--yellow);
  padding: 0 4px;
  letter-spacing: 1px;
}
.member-class {
  color: var(--gray);
  font-size: 9px;
  display: block;
  margin-bottom: 4px;
}
.hp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.hp-bar {
  flex: 1;
  height: 6px;
  background: var(--red);
  border: 1px solid var(--white);
}
.hp-fill {
  height: 100%;
  background: var(--yellow);
  transition: width 0.4s ease-out;
}
.hp-fill.low {
  background: var(--red);
}
.hp-text {
  color: var(--white);
  font-size: 9px;
  min-width: 40px;
}
.hp-delta {
  font-size: 10px;
  font-weight: bold;
  animation: hpPop 1.2s ease-out forwards;
}
.hp-delta.dmg { color: var(--red); }
.hp-delta.heal { color: #44ff44; }
@keyframes hpPop {
  0%   { opacity: 1; transform: translateY(0); }
  60%  { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 0; transform: translateY(-8px); }
}
.member.hp-dmg {
  animation: flashRed 0.6s;
}
.member.hp-heal {
  animation: flashGreen 0.6s;
}
@keyframes flashRed {
  0%, 100% { background: transparent; }
  30%      { background: rgba(255, 50, 50, 0.25); }
}
@keyframes flashGreen {
  0%, 100% { background: transparent; }
  30%      { background: rgba(50, 255, 50, 0.2); }
}
.xp-section {
  margin-top: 4px;
  padding: 4px 0;
}
.xp-label {
  color: #88ccff;
  font-size: 9px;
  margin-bottom: 3px;
  letter-spacing: 1px;
}
.xp-bar {
  height: 4px;
  background: var(--dim);
  border: 1px solid var(--gray);
}
.xp-fill {
  height: 100%;
  background: #88ccff;
  transition: width 0.4s ease-out;
}
.nav-actions {
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--dim);
}
.exit-btn {
  border-color: var(--red);
  color: var(--red);
}
.exit-btn:hover {
  border-color: var(--red);
  color: var(--white);
  background: var(--red);
}
.sfx-btn {
  font-size: 8px;
}
.nav-btn {
  flex: 1;
  background: transparent;
  border: 1px solid var(--dim);
  color: var(--gray);
  font-family: var(--font);
  font-size: 9px;
  padding: 4px 0;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
}
.nav-btn:hover {
  border-color: var(--yellow);
  color: var(--yellow);
}

/* Mobile RWD */
@media (max-width: 768px) {
  .party-panel {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 8px;
    border-left: none;
    border-top: 2px solid var(--white);
  }
  .panel-header {
    width: auto;
    order: -2;
  }
  .panel-title {
    display: none;
  }
  .member {
    flex: 1;
    min-width: 120px;
    padding: 4px 6px;
  }
  .xp-section {
    flex: 1;
    min-width: 100px;
    margin-top: 0;
  }
  .nav-actions {
    width: auto;
    margin-top: 0;
    padding-top: 0;
    border-top: none;
    order: -1;
  }
}
</style>
