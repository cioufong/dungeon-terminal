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
      <span v-else class="wallet-addr" @click="disconnect">
        {{ shortAddress(address) }}
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useWeb3 } from '../composables/useWeb3'
import { useI18n } from '../i18n'

const { isConnected, isConnecting, isCorrectChain, address, connect, disconnect, switchToBscTestnet, shortAddress } = useWeb3()
const { locale, t, toggleLocale } = useI18n()
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
</style>
