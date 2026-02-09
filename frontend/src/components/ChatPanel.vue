<template>
  <div class="chat-panel">
    <!-- Dialog log -->
    <div ref="logEl" class="log">
      <div v-for="(entry, i) in log" :key="i" :class="['log-line', 'log-' + entry.type]">
        <template v-if="entry.type === 'sys'">
          <span class="msg-sys">{{ entry.text }}</span>
        </template>
        <template v-else-if="entry.type === 'gm'">
          <span class="msg-gm">* {{ entry.text }}</span>
        </template>
        <template v-else-if="entry.type === 'nfa'">
          <span class="msg-nfa-name">{{ entry.name }}: </span>
          <span class="msg-nfa">{{ entry.text }}</span>
        </template>
        <template v-else-if="entry.type === 'player'">
          <span class="msg-player">&gt; {{ entry.text }}</span>
        </template>
        <template v-else-if="entry.type === 'roll'">
          <span class="msg-roll">{{ entry.text }}</span>
        </template>
        <template v-else-if="entry.type === 'dmg'">
          <span class="msg-dmg">{{ entry.text }}</span>
        </template>
      </div>
    </div>

    <!-- Choice buttons -->
    <div v-if="choices.length > 0 && !streaming" class="choices">
      <button v-for="c in choices" :key="c" class="choice-btn" @click="pickChoice(c)">
        {{ c }}
      </button>
    </div>

    <!-- Command input -->
    <div class="input-row">
      <span class="prompt">&gt;</span>
      <input
        v-model="inputText"
        class="cmd-input"
        type="text"
        :placeholder="streaming ? 'The GM is speaking...' : 'What do you do?'"
        :disabled="streaming"
        @keydown.enter="submit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/game'
import { storeToRefs } from 'pinia'

const store = useGameStore()
const { log, streaming, choices } = storeToRefs(store)

const inputText = ref('')
const logEl = ref<HTMLDivElement | null>(null)

function pickChoice(text: string) {
  store.sendCommand(text)
}

function submit() {
  if (streaming.value) return
  const text = inputText.value.trim()
  if (!text) return
  store.sendCommand(text)
  inputText.value = ''
}

// Auto-scroll to bottom on new messages
watch(log, async () => {
  await nextTick()
  if (logEl.value) {
    logEl.value.scrollTop = logEl.value.scrollHeight
  }
}, { deep: true })
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  background: var(--black);
  overflow: hidden;
}

/* Log */
.log {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  line-height: 1.6;
}
.log-line {
  margin-bottom: 2px;
}
.msg-sys {
  color: var(--gray);
  font-style: italic;
}
.msg-gm {
  color: var(--white);
}
.msg-nfa-name {
  color: var(--orange);
  font-weight: bold;
}
.msg-nfa {
  color: var(--white);
}
.msg-player {
  color: var(--yellow);
}
.msg-roll {
  color: #88ccff;
}
.msg-dmg {
  color: var(--red);
  font-weight: bold;
}

/* Choices */
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--dim);
  flex-shrink: 0;
}
.choice-btn {
  background: transparent;
  border: 1px solid var(--yellow);
  color: var(--yellow);
  font-family: var(--font);
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
  letter-spacing: 1px;
  transition: all 0.2s;
}
.choice-btn:hover {
  background: var(--yellow);
  color: var(--black);
}

/* Input */
.input-row {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-top: 2px solid var(--white);
  flex-shrink: 0;
}
.prompt {
  color: var(--yellow);
  font-size: 16px;
  margin-right: 8px;
}
.cmd-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--yellow);
  font-family: var(--font);
  font-size: 14px;
  caret-color: var(--yellow);
}
.cmd-input::placeholder {
  color: var(--dim);
}
</style>
