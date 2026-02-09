import { ref } from 'vue'

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return audioCtx
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, delay = 0) {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = vol
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime + delay)
  osc.stop(ctx.currentTime + delay + dur)
}

function noise(dur: number, vol = 0.04) {
  const ctx = getCtx()
  const bufSize = ctx.sampleRate * dur
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  const gain = ctx.createGain()
  src.buffer = buf
  gain.gain.value = vol
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start()
}

const enabled = ref(true)

function guard(fn: () => void) {
  if (!enabled.value) return
  try { fn() } catch { /* audio blocked */ }
}

export function useSound() {
  return {
    enabled,

    attack() { guard(() => {
      tone(220, 0.06, 'square')
      tone(160, 0.08, 'square', 0.06, 0.05)
      noise(0.06, 0.03)
    })},

    damage() { guard(() => {
      tone(120, 0.12, 'sawtooth', 0.07)
      tone(80, 0.15, 'square', 0.05, 0.06)
    })},

    heal() { guard(() => {
      tone(440, 0.1, 'sine', 0.06)
      tone(660, 0.12, 'sine', 0.05, 0.08)
      tone(880, 0.1, 'sine', 0.04, 0.16)
    })},

    roll() { guard(() => {
      for (let i = 0; i < 4; i++) {
        tone(300 + Math.random() * 200, 0.04, 'square', 0.03, i * 0.05)
      }
    })},

    door() { guard(() => {
      tone(150, 0.15, 'square', 0.05)
      tone(100, 0.2, 'sawtooth', 0.04, 0.1)
    })},

    victory() { guard(() => {
      tone(523, 0.12, 'square', 0.06)
      tone(659, 0.12, 'square', 0.06, 0.12)
      tone(784, 0.12, 'square', 0.06, 0.24)
      tone(1047, 0.2, 'square', 0.07, 0.36)
    })},

    levelUp() { guard(() => {
      tone(440, 0.1, 'square', 0.06)
      tone(554, 0.1, 'square', 0.06, 0.1)
      tone(659, 0.1, 'square', 0.06, 0.2)
      tone(880, 0.15, 'square', 0.07, 0.3)
      tone(1047, 0.2, 'sine', 0.06, 0.4)
    })},

    gameOver() { guard(() => {
      tone(440, 0.2, 'sawtooth', 0.06)
      tone(370, 0.2, 'sawtooth', 0.06, 0.2)
      tone(311, 0.2, 'sawtooth', 0.06, 0.4)
      tone(220, 0.4, 'sawtooth', 0.07, 0.6)
    })},

    xpGain() { guard(() => {
      tone(600, 0.06, 'sine', 0.04)
      tone(800, 0.08, 'sine', 0.04, 0.06)
    })},

    select() { guard(() => {
      tone(800, 0.04, 'square', 0.03)
    })},
  }
}
