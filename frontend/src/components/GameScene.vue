<template>
  <div class="scene-wrap">
    <canvas ref="canvasEl" class="pixel-canvas" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePixelMap } from '../composables/usePixelMap'
import { useGameStore } from '../stores/game'

const canvasEl = ref<HTMLCanvasElement | null>(null)
const gameStore = useGameStore()

usePixelMap(
  canvasEl,
  computed(() => gameStore.currentMap),
  computed(() => gameStore.sceneEntities),
  computed(() => gameStore.activeEffects),
)
</script>

<style scoped>
.scene-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #08080e;
  overflow: hidden;
}
.pixel-canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
</style>
