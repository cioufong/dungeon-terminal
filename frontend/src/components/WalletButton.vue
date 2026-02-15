<template>
  <div class="wallet-btn-wrap">
    <span class="lang-toggle" @click="toggleLocale">{{ locale === 'en' ? '中' : 'EN' }}</span>
    <button v-if="!isConnected" class="wallet-btn" :disabled="isConnecting" @click="connect">
      {{ isConnecting ? t.connecting : t.connectWallet }}
    </button>
    <template v-else>
      <span v-if="!isCorrectChain" class="chain-warn" @click="switchToBscTestnet">
        {{ t.wrongChain }}
      </span>
      <span v-else class="wallet-addr" @click="showConfirm = true">
        {{ shortAddress(address) }}
      </span>
    </template>
  </div>

  <!-- Disconnect confirm overlay -->
  <div v-if="showConfirm" class="dc-overlay" @click.self="showConfirm = false">
    <div class="dc-box">
      <p class="dc-title">{{ t.disconnectTitle }}</p>
      <p class="dc-desc">{{ t.disconnectDesc }}</p>
      <div class="dc-actions">
        <button class="dc-btn dc-leave" @click="onConfirm">{{ t.disconnectYes }}</button>
        <button class="dc-btn" @click="showConfirm = false">{{ t.disconnectNo }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useWeb3 } from '../composables/useWeb3'
import { useI18n } from '../i18n'

const { isConnected, isConnecting, isCorrectChain, address, connect, disconnect, switchToBscTestnet, shortAddress } = useWeb3()
const { locale, t, toggleLocale } = useI18n()

const showConfirm = ref(false)

function onConfirm() {
  showConfirm.value = false
  disconnect()
}
</script>

<style scoped>
.wallet-btn-wrap {
  position: fixed;
  top: 8px;
  right: 12px;
  z-index: 100;
}
.wallet-btn {
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  letter-spacing: 1px;
}
.wallet-btn:hover {
  background: var(--yellow);
  color: var(--black);
}
.wallet-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.wallet-addr {
  color: var(--yellow);
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--dim);
  padding: 4px 10px;
  letter-spacing: 1px;
}
.wallet-addr:hover {
  border-color: var(--yellow);
}
.chain-warn {
  color: var(--red);
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--red);
  padding: 4px 10px;
  letter-spacing: 1px;
  animation: blink 1s infinite;
}
.lang-toggle {
  color: var(--gray);
  font-size: 11px;
  cursor: pointer;
  border: 1px solid var(--dim);
  padding: 4px 8px;
  margin-right: 8px;
  letter-spacing: 1px;
}
.lang-toggle:hover {
  color: var(--white);
  border-color: var(--gray);
}
@keyframes blink {
  50% { opacity: 0.4; }
}

/* Disconnect confirm overlay */
.dc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: dcFadeIn 0.3s ease-out;
}
.dc-box {
  text-align: center;
  padding: 32px 48px;
  border: 2px solid var(--yellow);
}
.dc-title {
  color: var(--yellow);
  font-size: 18px;
  letter-spacing: 4px;
  margin-bottom: 8px;
}
.dc-desc {
  color: var(--gray);
  font-size: 13px;
  margin-bottom: 24px;
}
.dc-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
.dc-btn {
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
.dc-btn:hover {
  background: var(--yellow);
  color: var(--black);
}
.dc-leave {
  border-color: var(--red);
  color: var(--red);
}
.dc-leave:hover {
  background: var(--red);
  color: var(--black);
}
@keyframes dcFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
