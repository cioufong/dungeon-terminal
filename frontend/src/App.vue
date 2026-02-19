<template>
  <WalletButton v-if="!inGame" />

  <!-- Admin button (only visible to contract owner) -->
  <button v-if="isAdmin" class="admin-btn-fixed" @click="showAdmin = true">
    {{ t.adminBtn }}
  </button>
  <AdminPanel v-if="showAdmin" @close="showAdmin = false" />

  <!-- State: loading dungeon (party formed, waiting for AI init) -->
  <div v-if="hasParty && !showStageSelect && initializing" class="loading-screen">
    <div class="loading-box">
      <p class="loading-title">{{ t.loadingTitle }}</p>
      <p class="loading-line">{{ t.loadingConnect }}</p>
      <p class="loading-line">{{ t.loadingParty(partyNames) }}</p>
      <p class="loading-line loading-dots">{{ t.loadingGen }}</p>
    </div>
  </div>

  <!-- State: game playing (party formed + stage selected) -->
  <template v-else-if="hasParty && !showStageSelect">
    <div class="game-layout">
      <div class="game-top">
        <GameScene class="scene" />
        <PartyPanel class="party-side" @exit="onExitDungeon" @disconnect="onDisconnectRequest" />
      </div>
      <ChatPanel class="chat" />
    </div>

    <!-- Floor Cleared overlay -->
    <div v-if="isFloorCleared" class="overlay cleared-overlay">
      <div class="overlay-box cleared-box">
        <p class="cleared-title">{{ t.floorClearedTitle }}</p>
        <p class="cleared-floor">{{ t.chapterPrefix }} {{ currentFloor }} {{ t.floorClearedDone }}</p>
        <div class="cleared-actions">
          <button class="overlay-btn" @click="onNextFloor">{{ t.nextFloor }}</button>
          <button class="overlay-btn secondary" @click="onRetry">{{ t.gameOverRetry }}</button>
        </div>
      </div>
    </div>

    <!-- Victory overlay (all 5 floors cleared) -->
    <div v-if="isVictory" class="overlay victory-overlay">
      <div class="overlay-box victory-box">
        <p class="victory-title">{{ t.victoryTitle }}</p>
        <p class="victory-desc">{{ t.victoryDesc }}</p>
        <p class="victory-stats">{{ t.levelLabel }}.{{ gameStore.level }} — {{ t.xpLabel }}: {{ gameStore.xp }}</p>
        <button class="overlay-btn" @click="onRetry">{{ t.gameOverRetry }}</button>
      </div>
    </div>

    <!-- Exit confirm overlay -->
    <div v-if="showExitConfirm" class="overlay exit-confirm-overlay">
      <div class="overlay-box exit-confirm-box">
        <p class="exit-confirm-title">{{ t.exitConfirmTitle }}</p>
        <p class="exit-confirm-desc">{{ t.exitConfirmDesc }}</p>
        <div class="exit-confirm-actions">
          <button class="overlay-btn exit-leave" @click="confirmExit">{{ t.exitConfirmYes }}</button>
          <button class="overlay-btn" @click="showExitConfirm = false">{{ t.exitConfirmNo }}</button>
        </div>
      </div>
    </div>

    <!-- Disconnect confirm overlay -->
    <div v-if="showDisconnectConfirm" class="overlay exit-confirm-overlay">
      <div class="overlay-box exit-confirm-box">
        <p class="exit-confirm-title">{{ t.disconnectTitle }}</p>
        <p class="exit-confirm-desc">{{ t.disconnectDesc }}</p>
        <div class="exit-confirm-actions">
          <button class="overlay-btn exit-leave" @click="confirmDisconnect">{{ t.disconnectYes }}</button>
          <button class="overlay-btn" @click="showDisconnectConfirm = false">{{ t.disconnectNo }}</button>
        </div>
      </div>
    </div>

    <!-- Game Over overlay -->
    <div v-if="isGameOver" class="overlay game-over-overlay">
      <div class="overlay-box game-over-box">
        <p class="game-over-title">{{ t.gameOverTitle }}</p>
        <p class="game-over-desc">{{ t.gameOverDesc }}</p>
        <button class="overlay-btn" @click="onRetry">{{ t.gameOverRetry }}</button>
      </div>
    </div>
  </template>

  <!-- State: stage selection (party formed, picking floor) -->
  <StageSelect
    v-else-if="showStageSelect"
    @select="onStageSelect"
    @back="onStageBack"
  />

  <!-- State: has character, show party selection -->
  <NFAList
    v-else-if="showList"
    :ownedNFAs="ownedNFAs"
    @enter="onEnterGame"
    @mint="showRecruit = true"
  />

  <!-- State: recruiting companion (paid mint) -->
  <MintPanel
    v-else-if="showRecruit"
    mode="recruit"
    @enter="onMintComplete"
    @back="showRecruit = false"
  />

  <!-- State: no character / not connected -> character creation (free mint) -->
  <MintPanel v-else @enter="onMintComplete" />
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeb3 } from './composables/useWeb3'
import { useNFA } from './composables/useNFA'
import { useAdmin } from './composables/useAdmin'
import { useNFAStore } from './stores/nfa'
import { useGameStore } from './stores/game'
import { useI18n } from './i18n'
import WalletButton from './components/WalletButton.vue'
import MintPanel from './components/MintPanel.vue'
import NFAList from './components/NFAList.vue'
import GameScene from './components/GameScene.vue'
import ChatPanel from './components/ChatPanel.vue'
import PartyPanel from './components/PartyPanel.vue'
import StageSelect from './components/StageSelect.vue'
import AdminPanel from './components/admin/AdminPanel.vue'

const { isConnected, isCorrectChain, disconnect } = useWeb3()
const { isOwner: isAdmin, checkOwner, resetAdmin } = useAdmin()
const showAdmin = ref(false)
const { ownedNFAs, loadMyNFAs, loadFreeMints, loadMintFees, hasCharacter } = useNFA()
const nfaStore = useNFAStore()
const gameStore = useGameStore()
const { t } = useI18n()
const { initializing, gameOver: isGameOver, floorCleared: isFloorCleared, victory: isVictory, currentFloor } = storeToRefs(gameStore)

const showRecruit = ref(false)
const showStageSelect = ref(false)
const showExitConfirm = ref(false)
const showDisconnectConfirm = ref(false)
const hasParty = computed(() => nfaStore.hasParty)
const inGame = computed(() => hasParty.value && !showStageSelect.value)

const partyNames = computed(() => nfaStore.partyMembers.map(m => m.name).join(', '))

const showList = computed(() => {
  if (showRecruit.value) return false
  return hasCharacter() && !hasParty.value
})

// Load data when wallet connects
watch([isConnected, isCorrectChain], async ([connected, correct]) => {
  if (connected && correct) {
    await loadMyNFAs()
    await loadFreeMints()
    await loadMintFees()
    nfaStore.setOwnedNFAs(ownedNFAs.value)
    checkOwner()
  }
}, { immediate: true })

// Reset all state when wallet disconnects
watch(isConnected, (connected) => {
  if (!connected) {
    if (hasParty.value) gameStore.retryGame()
    nfaStore.clearParty()
    nfaStore.setOwnedNFAs([])
    ownedNFAs.value = []
    showStageSelect.value = false
    showRecruit.value = false
    showAdmin.value = false
    resetAdmin()
  }
})

function onMintComplete() {
  showRecruit.value = false
  nfaStore.setOwnedNFAs(ownedNFAs.value)
}

function onEnterGame() {
  showRecruit.value = false
  showStageSelect.value = true
}

async function onStageSelect(stageId: number) {
  showStageSelect.value = false
  // Re-fetch NFAs from chain to get latest XP/level before starting
  await loadMyNFAs()
  nfaStore.setOwnedNFAs(ownedNFAs.value)
  gameStore.startSession(stageId)
}

function onStageBack() {
  showStageSelect.value = false
  nfaStore.clearParty()
}

function onExitDungeon() {
  showExitConfirm.value = true
}

function onDisconnectRequest() {
  showDisconnectConfirm.value = true
}

function confirmDisconnect() {
  showDisconnectConfirm.value = false
  gameStore.retryGame()
  nfaStore.clearParty()
  showStageSelect.value = false
  showRecruit.value = false
  showAdmin.value = false
  disconnect()
}

async function confirmExit() {
  showExitConfirm.value = false
  gameStore.retryGame()
  nfaStore.clearParty()
  showRecruit.value = false
  await loadMyNFAs()
  nfaStore.setOwnedNFAs(ownedNFAs.value)
}

function onNextFloor() {
  gameStore.continueNextFloor()
}

async function onRetry() {
  gameStore.retryGame()
  nfaStore.clearParty()
  await loadMyNFAs()
  nfaStore.setOwnedNFAs(ownedNFAs.value)
}
</script>

<style scoped>
.loading-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-box {
  text-align: left;
  max-width: 480px;
  padding: 24px;
}
.loading-title {
  color: var(--yellow);
  font-size: 16px;
  letter-spacing: 2px;
  margin-bottom: 16px;
}
.loading-line {
  color: var(--green);
  font-size: 13px;
  margin: 6px 0;
  opacity: 0.9;
}
.loading-dots::after {
  content: '';
  animation: dots 1.5s steps(3, end) infinite;
}
@keyframes dots {
  0%   { content: ''; }
  33%  { content: '.'; }
  66%  { content: '..'; }
  100% { content: '...'; }
}
.game-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.game-top {
  flex: 1;
  min-height: 0;
  display: flex;
  border-bottom: 3px solid var(--white);
}
.scene {
  flex: 1;
  min-width: 0;
}
.party-side {
  width: 180px;
  flex-shrink: 0;
}
.chat {
  height: 40%;
  min-height: 180px;
  max-height: 45%;
}

/* Shared overlay */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.5s ease-out;
}
.overlay-box {
  text-align: center;
  padding: 32px 48px;
}
.overlay-btn {
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 13px;
  padding: 8px 24px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: all 0.2s;
}
.overlay-btn:hover {
  background: var(--yellow);
  color: var(--black);
}
.overlay-btn.secondary {
  border-color: var(--gray);
  color: var(--gray);
}
.overlay-btn.secondary:hover {
  background: var(--gray);
  color: var(--black);
}

/* Exit Confirm */
.exit-confirm-box { border: 2px solid var(--yellow); }
.exit-confirm-title {
  color: var(--yellow);
  font-size: 20px;
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.exit-confirm-desc {
  color: var(--gray);
  font-size: 13px;
  margin-bottom: 24px;
}
.exit-confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.exit-leave {
  border-color: var(--red);
  color: var(--red);
}
.exit-leave:hover {
  background: var(--red);
  color: var(--black);
}

/* Game Over */
.game-over-box { border: 2px solid var(--red); }
.game-over-title {
  color: var(--red);
  font-size: 24px;
  letter-spacing: 4px;
  margin-bottom: 12px;
  animation: pulse 1.5s ease-in-out infinite;
}
.game-over-desc {
  color: var(--gray);
  font-size: 13px;
  margin-bottom: 24px;
}

/* Floor Cleared */
.cleared-box { border: 2px solid var(--yellow); }
.cleared-title {
  color: var(--yellow);
  font-size: 22px;
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.cleared-floor {
  color: var(--white);
  font-size: 14px;
  margin-bottom: 24px;
}
.cleared-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

/* Victory */
.victory-box { border: 2px solid #ffd700; }
.victory-title {
  color: #ffd700;
  font-size: 28px;
  letter-spacing: 6px;
  margin-bottom: 12px;
  animation: victoryGlow 2s ease-in-out infinite;
}
.victory-desc {
  color: var(--white);
  font-size: 14px;
  margin-bottom: 8px;
}
.victory-stats {
  color: #88ccff;
  font-size: 12px;
  margin-bottom: 24px;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
@keyframes victoryGlow {
  0%, 100% { text-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
  50% { text-shadow: 0 0 20px rgba(255, 215, 0, 0.6); }
}

/* Admin button */
.admin-btn-fixed {
  position: fixed;
  top: 8px;
  left: 12px;
  z-index: 120;
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 10px;
  letter-spacing: 2px;
  padding: 4px 10px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
}
.admin-btn-fixed:hover {
  opacity: 1;
  background: var(--yellow);
  color: var(--black);
}

/* Mobile RWD */
@media (max-width: 768px) {
  .game-top {
    flex-direction: column;
  }
  .scene {
    min-height: 200px;
    height: 40vh;
  }
  .party-side {
    width: 100%;
    max-height: 120px;
    overflow-y: auto;
    border-left: none;
    border-top: 2px solid var(--white);
    flex-direction: row;
    flex-wrap: wrap;
  }
  .chat {
    height: auto;
    flex: 1;
    min-height: 120px;
    max-height: none;
  }
  .loading-box {
    padding: 16px;
  }
  .game-over-box {
    padding: 24px 20px;
    margin: 0 16px;
  }
  .game-over-title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .scene {
    min-height: 160px;
    height: 35vh;
  }
  .party-side {
    max-height: 100px;
  }
}
</style>
