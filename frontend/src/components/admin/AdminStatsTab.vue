<template>
  <div class="admin-stats">
    <div v-if="store.loading" class="stats-loading">> Loading contract state...</div>
    <div v-else-if="store.error" class="stats-error">> Error: {{ store.error }}</div>
    <template v-else>
      <!-- Contract Overview -->
      <div class="stats-section">
        <h3 class="section-title">{{ t.adminContractStatus }}</h3>
        <div class="stat-row">
          <span class="stat-label">Owner</span>
          <span class="stat-value mono">{{ store.contractState.owner }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Paused</span>
          <span class="stat-value" :class="store.contractState.paused ? 'red' : 'green'">
            {{ store.contractState.paused ? 'YES' : 'NO' }}
          </span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Supply</span>
          <span class="stat-value">{{ store.contractState.totalSupply }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Version</span>
          <span class="stat-value">{{ store.contractState.version }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Free Mints/User</span>
          <span class="stat-value">{{ store.contractState.freeMintsPerUser }}</span>
        </div>
      </div>

      <!-- Treasury -->
      <div class="stats-section">
        <h3 class="section-title">Treasury</h3>
        <div class="stat-row">
          <span class="stat-label">Address</span>
          <span class="stat-value mono">{{ store.contractState.treasury }}</span>
        </div>
      </div>

      <!-- Renderer -->
      <div class="stats-section">
        <h3 class="section-title">Renderer</h3>
        <div class="stat-row">
          <span class="stat-label">Address</span>
          <span class="stat-value mono">{{ store.contractState.renderer || '(none)' }}</span>
        </div>
      </div>

      <!-- VRF Config -->
      <div class="stats-section">
        <h3 class="section-title">VRF Config</h3>
        <div class="stat-row">
          <span class="stat-label">Coordinator</span>
          <span class="stat-value mono">{{ store.vrfConfig.coordinator }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Sub ID</span>
          <span class="stat-value">{{ store.vrfConfig.subId }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Callback Gas</span>
          <span class="stat-value">{{ store.vrfConfig.callbackGasLimit }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Confirmations</span>
          <span class="stat-value">{{ store.vrfConfig.requestConfirmations }}</span>
        </div>
      </div>

      <!-- Game Config -->
      <div class="stats-section">
        <h3 class="section-title">Game Config</h3>
        <div class="stat-row">
          <span class="stat-label">Max Adventure Log</span>
          <span class="stat-value">{{ store.contractState.maxAdventureLog }}</span>
        </div>
      </div>

      <!-- Token Query -->
      <div class="stats-section">
        <h3 class="section-title">{{ t.adminTokenQuery }}</h3>
        <div class="query-row">
          <input
            v-model="tokenIdInput"
            type="number"
            class="admin-input"
            placeholder="Token ID"
            min="0"
            @keyup.enter="doQuery"
          />
          <button class="admin-btn" @click="doQuery" :disabled="store.tokenQuery.loading">
            {{ store.tokenQuery.loading ? '...' : t.adminQuery }}
          </button>
        </div>

        <div v-if="store.tokenQuery.error" class="stats-error">> {{ store.tokenQuery.error }}</div>

        <template v-if="store.tokenQuery.data">
          <div class="stat-row">
            <span class="stat-label">Owner</span>
            <span class="stat-value mono">{{ store.tokenQuery.data.owner }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Free Mint</span>
            <span class="stat-value">{{ store.tokenQuery.data.isFreeMint ? 'Yes' : 'No' }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Race</span>
            <span class="stat-value">{{ races[store.tokenQuery.data.traits.race] }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Class</span>
            <span class="stat-value">{{ classes[store.tokenQuery.data.traits.class_] }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Level</span>
            <span class="stat-value">{{ store.tokenQuery.data.progression.level }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">XP</span>
            <span class="stat-value">{{ store.tokenQuery.data.progression.xp }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Active</span>
            <span class="stat-value" :class="store.tokenQuery.data.progression.active ? 'green' : 'red'">
              {{ store.tokenQuery.data.progression.active ? 'YES' : 'NO' }}
            </span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Stats</span>
            <span class="stat-value">
              {{ statNames.map((n, i) => `${n}:${store.tokenQuery.data!.traits.baseStats[i]}`).join(' ') }}
            </span>
          </div>

          <!-- V2 Game Stats -->
          <template v-if="store.tokenQuery.data.gameStats">
            <div class="stat-row">
              <span class="stat-label">Highest Floor</span>
              <span class="stat-value">{{ store.tokenQuery.data.gameStats.highestFloor }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Runs</span>
              <span class="stat-value">{{ store.tokenQuery.data.gameStats.totalRuns }}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Total Kills</span>
              <span class="stat-value">{{ store.tokenQuery.data.gameStats.totalKills }}</span>
            </div>
          </template>

          <!-- Adventure Log -->
          <template v-if="store.tokenQuery.data.adventureLog.length > 0">
            <h4 class="subsection-title">Adventure Log</h4>
            <div
              v-for="(entry, i) in (store.tokenQuery.data.adventureLog as any[])"
              :key="i"
              class="log-entry"
            >
              Floor {{ entry.floor }} —
              {{ ['Fled', 'Cleared', 'Defeated'][entry.result] || '?' }} —
              {{ entry.xpEarned }} XP —
              {{ entry.killCount }} kills
            </div>
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useAdmin } from '../../composables/useAdmin'
import { useI18n } from '../../i18n'

const store = useAdminStore()
const admin = useAdmin()
const { t } = useI18n()

const tokenIdInput = ref('')
const races = ['Human', 'Elf', 'Dwarf', 'Tiefling', 'Beastkin']
const classes = ['Warrior', 'Mage', 'Rogue', 'Ranger', 'Cleric', 'Bard']
const statNames = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

function doQuery() {
  const id = parseInt(tokenIdInput.value)
  if (!isNaN(id) && id >= 0) {
    store.queryToken(id)
  }
}
</script>

<style scoped>
.admin-stats {
  padding: 16px;
  overflow-y: auto;
  max-height: 100%;
}
.stats-loading, .stats-error {
  color: var(--yellow);
  font-size: 12px;
  padding: 8px;
}
.stats-error { color: var(--red); }

.stats-section {
  margin-bottom: 20px;
  border: 1px solid var(--gray);
  padding: 12px;
}
.section-title {
  color: var(--yellow);
  font-size: 13px;
  letter-spacing: 2px;
  margin: 0 0 10px;
  text-transform: uppercase;
}
.subsection-title {
  color: var(--yellow);
  font-size: 11px;
  letter-spacing: 1px;
  margin: 12px 0 6px;
}
.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  gap: 12px;
}
.stat-label {
  color: var(--gray);
  flex-shrink: 0;
}
.stat-value {
  color: var(--white);
  text-align: right;
  word-break: break-all;
}
.stat-value.mono { font-size: 11px; }
.stat-value.green { color: var(--green); }
.stat-value.red { color: var(--red); }

.query-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.admin-input {
  flex: 1;
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--white);
  font-family: var(--font);
  font-size: 12px;
  padding: 6px 8px;
}
.admin-input:focus { border-color: var(--yellow); outline: none; }

.admin-btn {
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 11px;
  padding: 6px 14px;
  cursor: pointer;
  letter-spacing: 1px;
  white-space: nowrap;
}
.admin-btn:hover { background: var(--yellow); color: var(--black); }
.admin-btn:disabled { opacity: 0.4; cursor: default; }
.admin-btn:disabled:hover { background: transparent; color: var(--yellow); }

.log-entry {
  font-size: 11px;
  color: var(--green);
  padding: 2px 0;
}
</style>
