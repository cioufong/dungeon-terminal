<template>
  <div class="mint-panel">
    <div class="mint-header">
      <img src="../assets/logo.png" alt="Dungeon Terminal" class="logo" />
      <span class="title">{{ t.title }}</span>
      <span class="sub">{{ t.subtitle }}</span>
    </div>

    <div class="mint-body">
      <!-- Not connected -->
      <template v-if="!isConnected">
        <div class="term-block">
          <p class="dim">{{ t.awaitingWallet }}</p>
          <p class="dim">{{ t.connectPrompt }}</p>
        </div>
        <button class="mint-btn" @click="connect">{{ t.connectWallet }}</button>
      </template>

      <!-- Wrong chain -->
      <template v-else-if="!isCorrectChain">
        <div class="term-block">
          <p class="red">{{ t.wrongNetworkError }}</p>
          <p class="dim">{{ t.switchPrompt }}</p>
        </div>
        <button class="mint-btn warn" @click="switchToBscTestnet">{{ t.switchNetwork }}</button>
      </template>

      <!-- ============ CHARACTER CREATION (free mint) ============ -->
      <template v-else-if="mode === 'createChar' && mintingState === 'idle'">
        <div class="term-block">
          <p>{{ t.welcomeNew }}</p>
          <p class="dim">{{ t.createCharDesc }}</p>
          <p class="yellow">{{ t.createCharFee(freeFeeDisplay) }}</p>
        </div>
        <button class="mint-btn" @click="doCreate">{{ t.createCharBtn }}</button>
      </template>

      <!-- ============ COMPANION RECRUITMENT (paid mint) ============ -->
      <template v-else-if="mode === 'recruit' && mintingState === 'idle'">
        <div class="term-block">
          <p>{{ t.welcomeBack }}</p>
          <p class="dim">{{ t.companionDesc }}</p>
          <p class="yellow">{{ t.paidFee(paidFeeDisplay) }}</p>
        </div>
        <div class="btn-group">
          <button class="mint-btn" @click="doRecruit">{{ t.beginRecruitment }}</button>
          <button class="mint-btn secondary" @click="emit('back')">{{ t.enterDungeon }}</button>
        </div>
      </template>

      <!-- ============ REQUESTING: tx being sent ============ -->
      <template v-else-if="mintingState === 'requesting'">
        <div class="term-block">
          <p class="yellow">{{ lastMintWasFree ? t.requestingChar : t.requestingRecruit }}</p>
          <p class="blink">{{ t.confirmTx }}</p>
        </div>
        <div class="progress">
          <div class="progress-bar anim" style="width: 30%"></div>
        </div>
      </template>

      <!-- ============ AWAITING VRF: Oracle processing ============ -->
      <template v-else-if="mintingState === 'awaitingVRF'">
        <div class="term-block">
          <p class="yellow">{{ t.awaitingVRF }}</p>
          <p class="dim">{{ t.vrfDesc }}</p>
        </div>
        <div class="progress">
          <div class="progress-bar anim" style="width: 70%"></div>
        </div>
      </template>

      <!-- ============ DONE: show result ============ -->
      <template v-else-if="mintingState === 'done' && mintedNFA">
        <div class="term-block result">
          <p class="yellow">{{ lastMintWasFree ? t.charCreated : t.recruitSuccess }}</p>
          <p>{{ lastMintWasFree ? t.charJoined(mintedNFA.tokenId) : t.companionJoined(mintedNFA.tokenId) }}</p>
          <img
            :src="generateAvatarDataURI(mintedNFA.traits.race, mintedNFA.traits.class_, mintedNFA.traits.personality, mintedNFA.traits.talentRarity)"
            class="mint-avatar"
            alt="avatar"
          />
          <div class="trait-grid">
            <div class="trait-row">
              <span class="label">{{ t.race }}</span>
              <span>{{ t.races[mintedNFA.traits.race] }}</span>
            </div>
            <div class="trait-row">
              <span class="label">{{ t.class_ }}</span>
              <span>{{ t.classes[mintedNFA.traits.class_] }}</span>
            </div>
            <div class="trait-row">
              <span class="label">{{ t.personality }}</span>
              <span>{{ t.personalities[mintedNFA.traits.personality] }}</span>
            </div>
            <div class="trait-row">
              <span class="label">{{ t.talent }}</span>
              <span :style="{ color: rarityColor(mintedNFA.traits.talentRarity) }">
                {{ talentName(mintedNFA.traits.talentId) }}
                <small>[{{ t.rarities[mintedNFA.traits.talentRarity] }}]</small>
              </span>
            </div>
            <div class="stat-row">
              <span v-for="(s, i) in effectiveStats(mintedNFA.traits.baseStats, mintedNFA.traits.race)" :key="i" class="stat">
                {{ STAT_NAMES[i] }} {{ s }}
              </span>
            </div>
          </div>
        </div>
        <button class="mint-btn" @click="onContinue">{{ t.enterDungeon }}</button>
      </template>

      <!-- Error -->
      <template v-else-if="mintingState === 'error'">
        <div class="term-block">
          <p class="red">&gt; ERROR: {{ mintError }}</p>
        </div>
        <button class="mint-btn" @click="resetMinting">{{ t.retry }}</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { formatEther } from 'ethers'
import { useWeb3 } from '../composables/useWeb3'
import { useNFA } from '../composables/useNFA'
import { useNFAStore } from '../stores/nfa'
import { useI18n } from '../i18n'
import { STAT_NAMES, effectiveStats, talentName, rarityColor } from '../data/traits'
import { generateAvatarDataURI } from '../utils/avatarSVG'

const { t } = useI18n()
const { isConnected, isCorrectChain, connect, switchToBscTestnet } = useWeb3()
const {
  mintingState, mintError, lastMintedId, lastMintWasFree, ownedNFAs,
  freeMintFee, paidMintFee,
  loadFreeMints, loadMyNFAs, doFreeMint, doPaidMint, resetMinting, hasCharacter,
} = useNFA()

const freeFeeDisplay = computed(() => freeMintFee.value === 0n ? '0' : formatEther(freeMintFee.value))
const paidFeeDisplay = computed(() => paidMintFee.value === 0n ? '0' : formatEther(paidMintFee.value))
const nfaStore = useNFAStore()

const props = defineProps<{
  /** 'createChar' = free mint (first time), 'recruit' = paid companion */
  mode?: 'createChar' | 'recruit'
}>()

const emit = defineEmits<{
  (e: 'enter'): void
  (e: 'back'): void
}>()

/** Determine mode: if user has no character yet -> createChar, otherwise recruit */
const mode = computed(() => {
  if (props.mode) return props.mode
  return hasCharacter() ? 'recruit' : 'createChar'
})

const mintedNFA = computed(() =>
  ownedNFAs.value.find(n => n.tokenId === lastMintedId.value) || null
)

onMounted(async () => {
  if (isConnected.value && isCorrectChain.value) {
    await loadFreeMints()
    await loadMyNFAs()
  }
})

async function doCreate() {
  try {
    await doFreeMint()
  } catch {
    // error already set in useNFA
  }
}

async function doRecruit() {
  try {
    await doPaidMint()
  } catch {
    // error already set in useNFA
  }
}

function onContinue() {
  nfaStore.setOwnedNFAs(ownedNFAs.value)
  resetMinting()
  emit('enter')
}
</script>

<style scoped>
.mint-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.mint-header {
  text-align: center;
  margin-bottom: 24px;
}
.logo {
  width: 80px;
  height: 80px;
  image-rendering: pixelated;
  margin-bottom: 12px;
}
.title {
  display: block;
  color: var(--yellow);
  font-size: 20px;
  letter-spacing: 3px;
}
.sub {
  display: block;
  color: var(--gray);
  font-size: 11px;
  margin-top: 4px;
}
.mint-body {
  max-width: 460px;
  width: 100%;
}
.term-block {
  border: 1px solid var(--dim);
  padding: 12px 16px;
  margin-bottom: 16px;
  line-height: 1.8;
  font-size: 13px;
}
.term-block p {
  margin: 0;
}
.dim { color: var(--gray); }
.yellow { color: var(--yellow); }
.red { color: var(--red); }
.blink { animation: blink 1s infinite; }

.progress {
  height: 4px;
  background: var(--dim);
  margin-bottom: 16px;
}
.progress-bar {
  height: 100%;
  background: var(--yellow);
  transition: width 0.3s;
}
.progress-bar.anim {
  animation: pulse 1.5s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.btn-group {
  display: flex;
  gap: 12px;
}
.btn-group .mint-btn {
  flex: 1;
}

.mint-btn {
  display: block;
  width: 100%;
  background: transparent;
  border: 2px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 14px;
  padding: 10px;
  cursor: pointer;
  letter-spacing: 2px;
  transition: all 0.2s;
}
.mint-btn:hover {
  background: var(--yellow);
  color: var(--black);
}
.mint-btn.warn {
  border-color: var(--red);
  color: var(--red);
}
.mint-btn.warn:hover {
  background: var(--red);
  color: var(--white);
}
.mint-btn.secondary {
  border-color: var(--dim);
  color: var(--gray);
}
.mint-btn.secondary:hover {
  border-color: var(--gray);
  color: var(--white);
  background: transparent;
}

/* Result */
.mint-avatar {
  width: 128px;
  height: 128px;
  image-rendering: pixelated;
  display: block;
  margin: 12px auto;
}
.result {
  border-color: var(--yellow);
}
.trait-grid {
  margin-top: 8px;
}
.trait-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  font-size: 13px;
}
.trait-row .label {
  color: var(--gray);
  min-width: 100px;
}
.stat-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--orange);
}
.stat {
  border: 1px solid var(--dim);
  padding: 2px 6px;
}

@keyframes blink {
  50% { opacity: 0.4; }
}
</style>
