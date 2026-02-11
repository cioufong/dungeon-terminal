<template>
  <div v-if="tx.status !== 'idle'" class="tx-status" :class="tx.status">
    <template v-if="tx.status === 'pending'">
      > Tx pending...{{ tx.hash ? ` ${tx.hash.slice(0, 10)}...` : '' }}
    </template>
    <template v-else-if="tx.status === 'confirmed'">
      > Confirmed {{ tx.hash.slice(0, 10) }}...
    </template>
    <template v-else-if="tx.status === 'error'">
      > Error: {{ tx.error }}
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TxState } from '../../composables/useAdmin'

defineProps<{ tx: TxState }>()
</script>

<style scoped>
.tx-status {
  font-size: 11px;
  margin-top: 6px;
  padding: 4px 0;
}
.tx-status.pending { color: var(--yellow); }
.tx-status.confirmed { color: var(--green); }
.tx-status.error { color: var(--red); }
</style>
