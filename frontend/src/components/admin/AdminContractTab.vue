<template>
  <div class="admin-contract">
    <!-- Pause Toggle -->
    <div class="contract-section">
      <h3 class="section-title">{{ t.adminStateControl }}</h3>
      <div class="action-row">
        <span class="action-label">
          Contract is {{ store.contractState.paused ? 'PAUSED' : 'ACTIVE' }}
        </span>
        <button
          class="admin-btn"
          :class="store.contractState.paused ? 'green-btn' : 'red-btn'"
          @click="togglePause"
          :disabled="pauseTx.status === 'pending'"
        >
          {{ store.contractState.paused ? 'UNPAUSE' : 'PAUSE' }}
        </button>
      </div>
      <TxStatus :tx="pauseTx" />
    </div>

    <!-- Treasury -->
    <div class="contract-section">
      <h3 class="section-title">Treasury</h3>
      <div class="current-val">Current: {{ store.contractState.treasury }}</div>
      <div class="action-row">
        <input v-model="treasuryAddr" class="admin-input" placeholder="New treasury address" />
        <button class="admin-btn" @click="doSetTreasury" :disabled="treasuryTx.status === 'pending'">
          SET
        </button>
      </div>
      <TxStatus :tx="treasuryTx" />
    </div>

    <!-- Minting -->
    <div class="contract-section">
      <h3 class="section-title">Minting</h3>
      <div class="current-val">Free mints per user: {{ store.contractState.freeMintsPerUser }}</div>
      <div class="action-row">
        <input v-model.number="freeMintsCount" type="number" class="admin-input small" placeholder="Count" min="0" />
        <button class="admin-btn" @click="doSetFreeMints" :disabled="freeMintsTx.status === 'pending'">
          SET FREE MINTS
        </button>
      </div>
      <TxStatus :tx="freeMintsTx" />

      <div class="subsection-divider" />
      <div class="action-row">
        <input v-model="grantAddr" class="admin-input" placeholder="User address" />
        <input v-model.number="grantAmount" type="number" class="admin-input small" placeholder="Amount" min="1" />
        <button class="admin-btn" @click="doGrantMints" :disabled="grantMintsTx.status === 'pending'">
          GRANT
        </button>
      </div>
      <TxStatus :tx="grantMintsTx" />
    </div>

    <!-- Renderer -->
    <div class="contract-section">
      <h3 class="section-title">Renderer</h3>
      <div class="current-val">Current: {{ store.contractState.renderer || '(none)' }}</div>
      <div class="action-row">
        <input v-model="rendererAddr" class="admin-input" placeholder="Renderer address" />
        <button class="admin-btn" @click="doSetRenderer" :disabled="rendererTx.status === 'pending'">
          SET
        </button>
      </div>
      <TxStatus :tx="rendererTx" />
    </div>

    <!-- VRF Config -->
    <div class="contract-section">
      <h3 class="section-title">VRF Config</h3>
      <div class="vrf-grid">
        <label>Coordinator</label>
        <input v-model="vrf.coordinator" class="admin-input" />
        <label>Key Hash</label>
        <input v-model="vrf.keyHash" class="admin-input" />
        <label>Sub ID</label>
        <input v-model.number="vrf.subId" type="number" class="admin-input" />
        <label>Callback Gas</label>
        <input v-model.number="vrf.callbackGasLimit" type="number" class="admin-input" />
        <label>Confirmations</label>
        <input v-model.number="vrf.requestConfirmations" type="number" class="admin-input" />
      </div>
      <button class="admin-btn" @click="doSetVRF" :disabled="vrfTx.status === 'pending'" style="margin-top: 8px">
        UPDATE VRF
      </button>
      <TxStatus :tx="vrfTx" />
    </div>

    <!-- V2: Game Server -->
    <div v-if="admin.isV2.value" class="contract-section">
      <h3 class="section-title">V2 — Game Server</h3>
      <div class="action-row">
        <input v-model="gameServerAddr" class="admin-input" placeholder="Server address" />
        <button class="admin-btn green-btn" @click="doSetGameServer(true)" :disabled="gameServerTx.status === 'pending'">
          AUTHORIZE
        </button>
        <button class="admin-btn red-btn" @click="doSetGameServer(false)" :disabled="gameServerTx.status === 'pending'">
          REVOKE
        </button>
      </div>
      <TxStatus :tx="gameServerTx" />

      <!-- Check game server -->
      <div class="action-row" style="margin-top: 8px">
        <input v-model="checkServerAddr" class="admin-input" placeholder="Check address" />
        <button class="admin-btn" @click="doCheckServer">CHECK</button>
      </div>
      <div v-if="serverCheckResult !== null" class="check-result" :class="serverCheckResult ? 'green' : 'red'">
        {{ serverCheckResult ? 'AUTHORIZED' : 'NOT AUTHORIZED' }}
      </div>

      <div class="subsection-divider" />
      <div class="current-val">Max Adventure Log: {{ store.contractState.maxAdventureLog }}</div>
      <div class="action-row">
        <input v-model.number="maxLogVal" type="number" class="admin-input small" placeholder="Max log" min="1" />
        <button class="admin-btn" @click="doSetMaxLog" :disabled="maxLogTx.status === 'pending'">
          SET MAX LOG
        </button>
      </div>
      <TxStatus :tx="maxLogTx" />
    </div>

    <!-- Danger Zone -->
    <div class="contract-section danger-section">
      <h3 class="section-title red">{{ t.adminDangerZone }}</h3>
      <div class="action-row">
        <span class="action-label danger-label">Withdraw all BNB from contract to owner</span>
        <button class="admin-btn red-btn" @click="confirmWithdraw" :disabled="withdrawTx.status === 'pending'">
          EMERGENCY WITHDRAW
        </button>
      </div>
      <TxStatus :tx="withdrawTx" />
    </div>

    <!-- Confirm dialog -->
    <div v-if="showConfirmDialog" class="confirm-overlay" @click.self="showConfirmDialog = false">
      <div class="confirm-box">
        <p class="confirm-title">{{ t.adminConfirm }}</p>
        <p class="confirm-desc">{{ confirmMessage }}</p>
        <div class="confirm-actions">
          <button class="admin-btn red-btn" @click="executeConfirmed">{{ t.adminConfirmYes }}</button>
          <button class="admin-btn" @click="showConfirmDialog = false">{{ t.adminConfirmNo }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useAdmin, type TxState as TxStateType } from '../../composables/useAdmin'
import { useI18n } from '../../i18n'
import TxStatus from './TxStatus.vue'

const store = useAdminStore()
const admin = useAdmin()
const { t } = useI18n()

// TX states
const pauseTx = reactive(admin.createTxState())
const treasuryTx = reactive(admin.createTxState())
const freeMintsTx = reactive(admin.createTxState())
const grantMintsTx = reactive(admin.createTxState())
const rendererTx = reactive(admin.createTxState())
const vrfTx = reactive(admin.createTxState())
const gameServerTx = reactive(admin.createTxState())
const maxLogTx = reactive(admin.createTxState())
const withdrawTx = reactive(admin.createTxState())

// Form values
const treasuryAddr = ref('')
const freeMintsCount = ref(3)
const grantAddr = ref('')
const grantAmount = ref(1)
const rendererAddr = ref('')
const gameServerAddr = ref('')
const checkServerAddr = ref('')
const serverCheckResult = ref<boolean | null>(null)
const maxLogVal = ref(10)
const vrf = reactive({
  coordinator: '',
  keyHash: '',
  subId: 0,
  callbackGasLimit: 0,
  requestConfirmations: 0,
})

// Confirm dialog
const showConfirmDialog = ref(false)
const confirmMessage = ref('')
let pendingAction: (() => Promise<void>) | null = null

onMounted(() => {
  // Pre-fill VRF from current state
  Object.assign(vrf, store.vrfConfig)
})

async function togglePause() {
  const ok = await admin.setPaused(pauseTx, !store.contractState.paused)
  if (ok) store.loadContractState()
}

async function doSetTreasury() {
  if (!treasuryAddr.value) return
  const ok = await admin.setTreasury(treasuryTx, treasuryAddr.value)
  if (ok) store.loadContractState()
}

async function doSetFreeMints() {
  const ok = await admin.setFreeMintsPerUser(freeMintsTx, freeMintsCount.value)
  if (ok) store.loadContractState()
}

async function doGrantMints() {
  if (!grantAddr.value || grantAmount.value < 1) return
  await admin.grantAdditionalFreeMints(grantMintsTx, grantAddr.value, grantAmount.value)
}

async function doSetRenderer() {
  if (!rendererAddr.value) return
  const ok = await admin.setRenderer(rendererTx, rendererAddr.value)
  if (ok) store.loadContractState()
}

async function doSetVRF() {
  const ok = await admin.setVRFConfig(
    vrfTx,
    vrf.coordinator,
    vrf.keyHash,
    vrf.subId,
    vrf.callbackGasLimit,
    vrf.requestConfirmations,
  )
  if (ok) store.loadContractState()
}

async function doSetGameServer(authorized: boolean) {
  if (!gameServerAddr.value) return
  const ok = await admin.setGameServer(gameServerTx, gameServerAddr.value, authorized)
  if (ok) store.loadContractState()
}

async function doCheckServer() {
  if (!checkServerAddr.value) return
  serverCheckResult.value = await admin.checkGameServer(checkServerAddr.value)
}

async function doSetMaxLog() {
  if (maxLogVal.value < 1) return
  const ok = await admin.setMaxAdventureLog(maxLogTx, maxLogVal.value)
  if (ok) store.loadContractState()
}

function confirmWithdraw() {
  confirmMessage.value = 'This will withdraw ALL BNB from the contract to the owner address. This action cannot be undone.'
  pendingAction = async () => {
    await admin.emergencyWithdraw(withdrawTx)
  }
  showConfirmDialog.value = true
}

async function executeConfirmed() {
  showConfirmDialog.value = false
  if (pendingAction) {
    await pendingAction()
    pendingAction = null
  }
}
</script>

<style scoped>
.admin-contract {
  padding: 16px;
  overflow-y: auto;
  max-height: 100%;
}
.contract-section {
  margin-bottom: 16px;
  border: 1px solid var(--gray);
  padding: 12px;
}
.danger-section { border-color: var(--red); }
.section-title {
  color: var(--yellow);
  font-size: 13px;
  letter-spacing: 2px;
  margin: 0 0 10px;
  text-transform: uppercase;
}
.section-title.red { color: var(--red); }

.current-val {
  color: var(--gray);
  font-size: 11px;
  margin-bottom: 8px;
  word-break: break-all;
}

.action-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.action-label {
  color: var(--white);
  font-size: 12px;
  flex: 1;
}
.danger-label { color: var(--red); }

.admin-input {
  flex: 1;
  min-width: 100px;
  background: transparent;
  border: 1px solid var(--gray);
  color: var(--white);
  font-family: var(--font);
  font-size: 12px;
  padding: 6px 8px;
}
.admin-input.small { max-width: 80px; flex: 0 0 80px; }
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
.admin-btn.green-btn { border-color: var(--green); color: var(--green); }
.admin-btn.green-btn:hover { background: var(--green); color: var(--black); }
.admin-btn.red-btn { border-color: var(--red); color: var(--red); }
.admin-btn.red-btn:hover { background: var(--red); color: var(--black); }

.vrf-grid {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 6px 8px;
  align-items: center;
}
.vrf-grid label {
  color: var(--gray);
  font-size: 11px;
}

.subsection-divider {
  height: 1px;
  background: var(--gray);
  opacity: 0.3;
  margin: 10px 0;
}

.check-result {
  font-size: 11px;
  letter-spacing: 1px;
  margin-top: 4px;
}
.check-result.green { color: var(--green); }
.check-result.red { color: var(--red); }

/* Confirm overlay */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.confirm-box {
  border: 2px solid var(--red);
  padding: 24px 32px;
  max-width: 400px;
  text-align: center;
}
.confirm-title {
  color: var(--red);
  font-size: 16px;
  letter-spacing: 2px;
  margin-bottom: 8px;
}
.confirm-desc {
  color: var(--gray);
  font-size: 12px;
  margin-bottom: 20px;
}
.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>
