<template>
  <div class="admin-overlay" @keyup.escape="$emit('close')">
    <div class="admin-panel">
      <!-- Header -->
      <div class="admin-header">
        <span class="admin-title">{{ t.adminTitle }}</span>
        <button class="close-btn" @click="$emit('close')">[ X ]</button>
      </div>

      <!-- Tabs -->
      <div class="admin-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab content -->
      <div class="admin-content">
        <AdminStatsTab v-if="activeTab === 'stats'" />
        <AdminContractTab v-else-if="activeTab === 'contract'" />
        <AdminPromptTab v-else-if="activeTab === 'prompts'" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useI18n } from '../../i18n'
import AdminStatsTab from './AdminStatsTab.vue'
import AdminContractTab from './AdminContractTab.vue'
import AdminPromptTab from './AdminPromptTab.vue'

defineEmits<{ close: [] }>()

const store = useAdminStore()
const { t } = useI18n()

const activeTab = ref('stats')

const tabs = computed(() => [
  { key: 'stats', label: t.value.adminTabStats },
  { key: 'contract', label: t.value.adminTabContract },
  { key: 'prompts', label: t.value.adminTabPrompts },
])

function switchTab(key: string) {
  activeTab.value = key
  if (key === 'prompts' && store.promptSections.length === 0) {
    store.loadPrompts()
  }
}

onMounted(() => {
  store.loadContractState()
})
</script>

<style scoped>
.admin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  z-index: 150;
  display: flex;
  align-items: stretch;
  justify-content: center;
  animation: fadeIn 0.2s ease-out;
}

.admin-panel {
  width: 100%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--gray);
  border-right: 1px solid var(--gray);
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 2px solid var(--yellow);
}
.admin-title {
  color: var(--yellow);
  font-size: 14px;
  letter-spacing: 4px;
}
.close-btn {
  background: none;
  border: none;
  color: var(--gray);
  font-family: var(--font);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
}
.close-btn:hover { color: var(--white); }

.admin-tabs {
  display: flex;
  border-bottom: 1px solid var(--gray);
}
.tab-btn {
  flex: 1;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--gray);
  font-family: var(--font);
  font-size: 12px;
  letter-spacing: 2px;
  padding: 10px 16px;
  cursor: pointer;
  text-transform: uppercase;
  transition: all 0.15s;
}
.tab-btn:hover { color: var(--white); }
.tab-btn.active {
  color: var(--yellow);
  border-bottom-color: var(--yellow);
}

.admin-content {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
.admin-content > * {
  height: 100%;
  overflow-y: auto;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (max-width: 768px) {
  .admin-panel { max-width: 100%; }
  .tab-btn {
    font-size: 10px;
    padding: 8px 10px;
    letter-spacing: 1px;
  }
}
</style>
