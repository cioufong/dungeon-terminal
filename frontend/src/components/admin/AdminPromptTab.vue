<template>
  <div class="admin-prompts">
    <div v-if="store.promptsLoading" class="prompts-loading">> Loading prompt sections...</div>
    <div v-else-if="store.promptsError" class="prompts-error">> {{ store.promptsError }}</div>
    <template v-else>
      <div class="prompts-layout">
        <!-- Section list -->
        <div class="section-list">
          <div class="list-header">{{ t.adminSections }}</div>
          <div
            v-for="section in store.promptSections"
            :key="section.key"
            class="section-item"
            :class="{ active: store.selectedPromptKey === section.key }"
            @click="selectSection(section.key)"
          >
            <span class="section-key">{{ section.key }}</span>
            <span class="section-name">{{ section.title }}</span>
          </div>
          <button class="admin-btn reset-all-btn" @click="doResetAll" :disabled="store.promptSaving">
            {{ t.adminResetAll }}
          </button>
        </div>

        <!-- Editor -->
        <div class="editor-pane">
          <template v-if="currentSection">
            <div class="editor-header">
              <span class="editor-title">{{ currentSection.title }}</span>
              <span class="editor-key">{{ currentSection.key }}</span>
            </div>
            <textarea
              ref="editorRef"
              v-model="editContent"
              class="editor-textarea"
              spellcheck="false"
            />
            <div class="editor-actions">
              <span v-if="isDirty" class="dirty-indicator">* modified</span>
              <button
                class="admin-btn"
                @click="doSave"
                :disabled="store.promptSaving || !isDirty"
              >
                {{ store.promptSaving ? '...' : t.adminSave }}
              </button>
              <button class="admin-btn secondary" @click="doReset">
                {{ t.adminReset }}
              </button>
            </div>
          </template>
          <div v-else class="editor-empty">> {{ t.adminSelectSection }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { useI18n } from '../../i18n'

const store = useAdminStore()
const { t } = useI18n()

const editContent = ref('')
const editorRef = ref<HTMLTextAreaElement | null>(null)

const currentSection = computed(() =>
  store.promptSections.find(s => s.key === store.selectedPromptKey)
)

const isDirty = computed(() =>
  currentSection.value ? editContent.value !== currentSection.value.content : false
)

// Sync editor content when selection changes
watch(() => store.selectedPromptKey, () => {
  if (currentSection.value) {
    editContent.value = currentSection.value.content
  }
}, { immediate: true })

function selectSection(key: string) {
  store.selectedPromptKey = key
}

async function doSave() {
  if (!currentSection.value || !isDirty.value) return
  await store.savePrompt(currentSection.value.key, editContent.value)
}

function doReset() {
  if (currentSection.value) {
    editContent.value = currentSection.value.content
  }
}

async function doResetAll() {
  await store.resetAllPrompts()
  // Refresh editor
  if (currentSection.value) {
    editContent.value = currentSection.value.content
  }
}
</script>

<style scoped>
.admin-prompts {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.prompts-loading, .prompts-error {
  color: var(--yellow);
  font-size: 12px;
  padding: 16px;
}
.prompts-error { color: var(--red); }

.prompts-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* Section list */
.section-list {
  width: 30%;
  min-width: 180px;
  max-width: 260px;
  border-right: 1px solid var(--gray);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.list-header {
  color: var(--yellow);
  font-size: 11px;
  letter-spacing: 2px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--gray);
  text-transform: uppercase;
}
.section-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s;
}
.section-item:hover { background: rgba(255,255,255,0.05); }
.section-item.active {
  background: rgba(255, 215, 0, 0.08);
  border-left: 2px solid var(--yellow);
}
.section-key {
  display: block;
  color: var(--green);
  font-size: 10px;
  letter-spacing: 1px;
}
.section-name {
  display: block;
  color: var(--white);
  font-size: 12px;
  margin-top: 2px;
}

.reset-all-btn {
  margin: auto 12px 12px;
  font-size: 10px;
}

/* Editor */
.editor-pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 12px;
}
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
}
.editor-title {
  color: var(--yellow);
  font-size: 13px;
  letter-spacing: 1px;
}
.editor-key {
  color: var(--gray);
  font-size: 10px;
}
.editor-textarea {
  flex: 1;
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--gray);
  color: var(--green);
  font-family: var(--font);
  font-size: 12px;
  line-height: 1.5;
  padding: 10px;
  resize: none;
  min-height: 200px;
}
.editor-textarea:focus {
  border-color: var(--yellow);
  outline: none;
}
.editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  justify-content: flex-end;
}
.dirty-indicator {
  color: var(--yellow);
  font-size: 11px;
  margin-right: auto;
}
.editor-empty {
  color: var(--gray);
  font-size: 12px;
  padding: 20px;
}

.admin-btn {
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 11px;
  padding: 6px 14px;
  cursor: pointer;
  letter-spacing: 1px;
}
.admin-btn:hover { background: var(--yellow); color: var(--black); }
.admin-btn:disabled { opacity: 0.4; cursor: default; }
.admin-btn:disabled:hover { background: transparent; color: var(--yellow); }
.admin-btn.secondary { border-color: var(--gray); color: var(--gray); }
.admin-btn.secondary:hover { background: var(--gray); color: var(--black); }
</style>
