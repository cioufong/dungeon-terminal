<template>
  <div class="stage-select">
    <div class="stage-header">
      <span class="title">{{ t.selectStage }}</span>
      <span class="sub">{{ t.selectStagePrompt }}</span>
    </div>

    <!-- Party Preview -->
    <div class="party-preview">
      <span class="party-label">{{ t.yourParty }}</span>
      <div class="party-members">
        <div v-for="(m, i) in partyMembers" :key="m.name" class="member">
          <img
            v-if="partyNFAs[i]"
            :src="generateAvatarDataURI(partyNFAs[i]!.traits.race, partyNFAs[i]!.traits.class_, partyNFAs[i]!.traits.personality, partyNFAs[i]!.traits.talentRarity)"
            class="member-avatar"
            alt="avatar"
          />
          <div class="member-info">
            <span class="member-name">{{ m.name }}</span>
            <span class="member-level dim">{{ m.className }} Lv.{{ m.level }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Stage Cards -->
    <div class="stages">
      <div
        v-for="stage in stages"
        :key="stage.id"
        class="stage-card"
        :class="{
          unlocked: stage.unlocked,
          locked: !stage.unlocked,
          selected: selectedId === stage.id,
        }"
        @click="selectStage(stage)"
      >
        <div class="card-top">
          <span class="stage-difficulty">{{ stars(stage.difficulty) }}</span>
          <span class="stage-chapter">{{ t.chapterPrefix }} {{ stage.chapter }}</span>
          <span v-if="!stage.unlocked" class="lock-icon">&#128274;</span>
        </div>
        <div class="stage-name">{{ stage.name }}</div>
        <div v-if="stage.unlocked" class="stage-desc dim">{{ stage.description }}</div>
        <div v-else class="stage-desc dim">???</div>
        <div v-if="stage.unlocked" class="stage-enemies dim">
          {{ t.enemies }}: {{ stage.enemies.join(', ') }}
        </div>
        <div v-if="stage.unlocked" class="stage-boss dim">
          {{ t.boss }}: {{ stage.boss }}
        </div>
        <div v-if="stage.unlocked && selectedId === stage.id" class="enter-hint">
          <span class="enter-arrow">{{ t.stageEnter }} &#8594;</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button
        class="action-btn"
        :disabled="!selectedId"
        @click="enter"
      >
        {{ t.stageEnter }}
      </button>
      <button class="action-btn secondary" @click="emit('back')">
        {{ t.stageBack }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useNFAStore } from '../stores/nfa'
import { useI18n } from '../i18n'
import { getStages, type DungeonStage } from '../data/stages'
import { generateAvatarDataURI } from '../utils/avatarSVG'

const { t } = useI18n()
const nfaStore = useNFAStore()

const emit = defineEmits<{
  (e: 'select', stageId: number): void
  (e: 'back'): void
}>()

const partyMembers = computed(() => nfaStore.partyMembers)
const partyNFAs = computed(() => nfaStore.party)
const stages = computed(() => getStages(t.value as unknown as Record<string, unknown>))
const selectedId = ref<number | null>(null)

// Auto-select the first unlocked stage
onMounted(() => {
  const first = stages.value.find(s => s.unlocked)
  if (first) selectedId.value = first.id
})

function selectStage(stage: DungeonStage) {
  if (!stage.unlocked) return
  selectedId.value = stage.id
}

function enter() {
  if (selectedId.value) emit('select', selectedId.value)
}

function stars(n: number): string {
  return '\u2605'.repeat(n)
}

</script>

<style scoped>
.stage-select {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 24px;
  overflow-y: auto;
}
.stage-header {
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
.dim { color: var(--gray); }

/* Party Preview */
.party-preview {
  margin-bottom: 16px;
  text-align: center;
}
.party-label {
  display: block;
  color: var(--orange);
  font-size: 12px;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.party-members {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}
.member {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--dim);
  padding: 4px 8px;
}
.member-avatar {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
}
.member-info {
  display: flex;
  flex-direction: column;
  font-size: 11px;
}
.member-name {
  color: var(--white);
}
.member-level {
  font-size: 10px;
}

/* Stage Cards */
.stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 480px;
  margin-bottom: 16px;
}
.stage-card {
  border: 1px solid var(--dim);
  padding: 10px 14px;
  position: relative;
  transition: border-color 0.2s;
}
.stage-card.unlocked {
  cursor: pointer;
}
.stage-card.unlocked:hover {
  border-color: var(--gray);
}
.stage-card.selected {
  border-color: var(--yellow);
  box-shadow: 0 0 8px rgba(255, 255, 0, 0.15);
}
.stage-card.locked {
  opacity: 0.4;
  cursor: default;
}
.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.stage-difficulty {
  color: var(--yellow);
  font-size: 12px;
  letter-spacing: 1px;
}
.stage-chapter {
  color: var(--orange);
  font-size: 12px;
  letter-spacing: 1px;
  font-weight: bold;
}
.lock-icon {
  margin-left: auto;
  font-size: 14px;
}
.stage-name {
  color: var(--white);
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 2px;
}
.stage-desc {
  font-size: 11px;
  margin-bottom: 2px;
}
.stage-enemies {
  font-size: 10px;
}
.stage-boss {
  font-size: 10px;
  color: var(--orange);
}
.enter-hint {
  position: absolute;
  bottom: 10px;
  right: 14px;
}
.enter-arrow {
  color: var(--yellow);
  font-size: 12px;
  letter-spacing: 1px;
}

/* Actions */
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
