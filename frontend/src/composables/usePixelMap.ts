import { onMounted, onUnmounted, watch, type Ref } from 'vue'
import { getRoom } from '../data/maps'
import type { SceneEntity, VisualEffect } from '../stores/game'
// Race/class color palettes for full-body sprites

const T = 16 // tile size
const MW = 20, MH = 15

// Movement interpolation speed (tiles per second)
const MOVE_SPEED = 4

// Color palette
const C = {
  s1: '#585868', s2: '#4c4c5c', sH: '#6e6e82', sS: '#404050',
  w1: '#3a3248', w2: '#2e2640', wT: '#4e4660', wE: '#201830',
  cp1: '#882030', cp2: '#6c1828', cpE: '#a83848',
  dr1: '#7a5828', dr2: '#5c4018', drK: '#c8a848',
  wa1: '#2848a0', wa2: '#3058b8',
  ch1: '#a07828', ch2: '#785818', chL: '#d8c048',
  fl1: '#ff8820', fl2: '#ffcc44',
  pl1: '#7878a0', pl2: '#9090b0', plS: '#585878',
  sk: '#f0c090', skM: '#d8a070', hair: '#3838a0',
  armB: '#2850a8', armL: '#5080d8', cape: '#a82030', capeD: '#781828', boot: '#3a2820',
  slG: '#38b048', slD: '#288838', slL: '#58d868',
  bone: '#e0d8c8', boneD: '#a09888',
  npcRobe: '#4848a0', npcSkin: '#e8c898', npcHood: '#383878',
  doorOpen: '#282018',
  chOpen: '#604818', chGold: '#ffe040',
} as const

type Ctx = CanvasRenderingContext2D
type TileFn = (cx: Ctx, x: number, y: number, t: number) => void

function r(cx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  cx.fillStyle = c; cx.fillRect(x, y, w, h)
}

// --- Tile renderers ---

function stone(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, (x + y) % 2 ? C.s1 : C.s2)
  r(cx, p, q, T, 1, C.sH); r(cx, p, q, 1, T, C.sH)
  r(cx, p, q + T - 1, T, 1, C.sS); r(cx, p + T - 1, q, 1, T, C.sS)
  if ((x * 7 + y * 3) % 5 === 0) { r(cx, p + 4, q + 6, 3, 1, C.sS); r(cx, p + 6, q + 7, 1, 2, C.sS) }
  if ((x * 3 + y * 11) % 7 === 0) r(cx, p + 9, q + 3, 2, 1, C.sS)
}

function stone2(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, '#686880'); r(cx, p, q, T, 1, C.sH); r(cx, p, q, 1, T, C.sH)
  r(cx, p, q + T - 1, T, 1, C.sS); r(cx, p + T - 1, q, 1, T, C.sS)
  r(cx, p + 3, q + 7, 10, 2, C.s1); r(cx, p + 7, q + 3, 2, 10, C.s1)
}

function wall(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, C.w1)
  for (let i = 0; i < 3; i++) {
    const b = q + i * 5; r(cx, p, b + 4, T, 1, C.wE)
    if (i % 2 === 0) r(cx, p + 8, b, 1, 5, C.wE)
    else { r(cx, p + 4, b, 1, 5, C.wE); r(cx, p + 12, b, 1, 5, C.wE) }
  }
  r(cx, p, q, T, 2, C.wT); r(cx, p, q + T - 2, T, 2, C.wE)
}

function wallTop(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, C.w2); r(cx, p, q, T, 3, C.wT); r(cx, p, q + T - 1, T, 1, C.wE)
  r(cx, p + 3, q + 5, 4, 3, C.w1); r(cx, p + 9, q + 7, 5, 3, C.w1)
}

function carpet(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, C.cp1); r(cx, p, q, T, 1, C.cpE); r(cx, p, q + T - 1, T, 1, C.cpE)
  if ((x + y) % 2 === 0) r(cx, p + 4, q + 4, 8, 8, C.cp2)
  r(cx, p + 7, q + 3, 2, 1, C.cpE); r(cx, p + 6, q + 4, 4, 1, C.cpE)
  r(cx, p + 5, q + 5, 6, 1, C.cpE); r(cx, p + 6, q + 6, 4, 1, C.cpE); r(cx, p + 7, q + 7, 2, 1, C.cpE)
}

function door(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, C.dr2); r(cx, p + 2, q + 1, 12, 14, C.dr1)
  r(cx, p + 4, q + 3, 4, 4, C.dr2); r(cx, p + 9, q + 3, 4, 4, C.dr2)
  r(cx, p + 4, q + 9, 4, 4, C.dr2); r(cx, p + 9, q + 9, 4, 4, C.dr2)
  r(cx, p + 11, q + 7, 2, 2, C.drK)
}

function chest(cx: Ctx, x: number, y: number, _t: number) {
  stone(cx, x, y, _t)
  const p = x * T, q = y * T
  r(cx, p + 2, q + 5, 12, 8, C.ch2); r(cx, p + 2, q + 3, 12, 4, C.ch1)
  r(cx, p + 3, q + 4, 10, 1, '#b88838'); r(cx, p + 7, q + 6, 2, 3, C.chL)
  r(cx, p + 2, q + 5, 12, 1, '#483010')
}

function pillar(cx: Ctx, x: number, y: number, _t: number) {
  stone(cx, x, y, _t)
  const p = x * T, q = y * T
  r(cx, p + 4, q + 2, 8, 12, C.pl1); r(cx, p + 5, q + 2, 3, 12, C.pl2); r(cx, p + 10, q + 2, 2, 12, C.plS)
  r(cx, p + 3, q + 1, 10, 2, C.pl2); r(cx, p + 3, q + 13, 10, 2, C.pl2)
}

function stairs(cx: Ctx, x: number, y: number, _t: number) {
  const p = x * T, q = y * T
  r(cx, p, q, T, T, C.s2)
  for (let i = 0; i < 4; i++) {
    const s = 60 - i * 12
    r(cx, p + 1, q + 1 + i * 4, T - 2, 3, `rgb(${s},${s},${s + 10})`)
    r(cx, p + 1, q + 1 + i * 4, T - 2, 1, C.sH)
  }
}

function water(cx: Ctx, x: number, y: number, t: number) {
  const p = x * T, q = y * T, o = Math.floor(t / 400) % 4
  r(cx, p, q, T, T, C.wa1)
  for (let i = 0; i < 3; i++) {
    const w = q + 3 + i * 5 + ((o + i) % 2)
    r(cx, p + 1 + ((i + o) % 3) * 2, w, 5, 1, C.wa2)
    r(cx, p + 9 + ((i + o) % 2), w, 4, 1, C.wa2)
  }
}

function torch(cx: Ctx, x: number, y: number, t: number) {
  wall(cx, x, y, t)
  const p = x * T, q = y * T
  r(cx, p + 7, q + 6, 2, 5, '#666'); r(cx, p + 5, q + 5, 6, 2, '#666')
  const f = 4 + Math.floor(Math.sin(t / 150 + x * 3) * 1.5)
  r(cx, p + 6, q + 1 + (4 - f), 4, f, C.fl1)
  r(cx, p + 7, q + 2 + (4 - f), 2, Math.max(1, f - 2), C.fl2)
}

function dark(cx: Ctx, x: number, y: number, _t: number) { r(cx, x * T, y * T, T, T, '#08080e') }

const TILE_FN: Record<string, TileFn> = {
  w: wall, W: wallTop, s: stone, S: stone2, c: carpet,
  d: door, p: pillar, x: chest, v: stairs, '~': water, T: torch, '.': dark,
}

// --- Sprite renderers ---

type SpriteFn = (cx: Ctx, px: number, py: number, t: number, moving?: boolean) => void

function drawPlayer(cx: Ctx, px: number, py: number, t: number, moving?: boolean) {
  const b = moving ? (Math.floor(t / 150) % 2 ? -1 : 0) : 0
  const frame = moving ? Math.floor(t / 150) % 2 : 0
  r(cx, px + 2, py + 14, 12, 3, 'rgba(0,0,0,.35)')
  // Boots — alternate legs when walking
  if (moving) {
    r(cx, px + 3 + frame * 2, py + 13 + b, 3, 2, C.boot)
    r(cx, px + 10 - frame * 2, py + 13 + b, 3, 2, C.boot)
  } else {
    r(cx, px + 4, py + 13, 3, 2, C.boot); r(cx, px + 9, py + 13, 3, 2, C.boot)
  }
  r(cx, px + 2, py + 5 + b, 12, 8, C.capeD); r(cx, px + 3, py + 5 + b, 10, 7, C.cape)
  r(cx, px + 4, py + 5 + b, 8, 7, C.armB)
  r(cx, px + 5, py + 6 + b, 2, 3, C.armL); r(cx, px + 9, py + 6 + b, 2, 3, C.armL)
  r(cx, px + 4, py + 10 + b, 8, 1, C.ch2); r(cx, px + 7, py + 10 + b, 2, 1, C.chL)
  // Arms — swing when walking
  if (moving) {
    r(cx, px + 1 + frame, py + 6 + b, 2, 5, C.armB); r(cx, px + 13 - frame, py + 6 + b, 2, 5, C.armB)
  } else {
    r(cx, px + 2, py + 6, 2, 5, C.armB); r(cx, px + 12, py + 6, 2, 5, C.armB)
  }
  r(cx, px + 2, py + 11 + b, 2, 1, C.sk); r(cx, px + 12, py + 11 + b, 2, 1, C.sk)
  r(cx, px + 4, py + 1 + b, 8, 5, C.sk); r(cx, px + 4, py + 4 + b, 8, 2, C.skM)
  r(cx, px + 3, py + b, 10, 3, C.hair); r(cx, px + 3, py + 1 + b, 2, 3, C.hair); r(cx, px + 11, py + 1 + b, 2, 3, C.hair)
  r(cx, px + 5, py + 3 + b, 2, 2, '#fff'); r(cx, px + 9, py + 3 + b, 2, 2, '#fff')
  r(cx, px + 6, py + 3 + b, 1, 2, '#111'); r(cx, px + 10, py + 3 + b, 1, 2, '#111')
}

function drawCompanion(cx: Ctx, px: number, py: number, t: number, moving?: boolean) {
  const b = moving ? (Math.floor(t / 150) % 2 ? -1 : 0) : 0
  const frame = moving ? Math.floor(t / 150) % 2 : 0
  r(cx, px + 2, py + 14, 12, 3, 'rgba(0,0,0,.35)')
  if (moving) {
    r(cx, px + 3 + frame * 2, py + 13 + b, 3, 2, C.boot)
    r(cx, px + 10 - frame * 2, py + 13 + b, 3, 2, C.boot)
  } else {
    r(cx, px + 4, py + 13, 3, 2, C.boot); r(cx, px + 9, py + 13, 3, 2, C.boot)
  }
  r(cx, px + 2, py + 5 + b, 12, 8, '#184828'); r(cx, px + 3, py + 5 + b, 10, 7, '#28783a')
  r(cx, px + 4, py + 5 + b, 8, 7, '#785828')
  r(cx, px + 5, py + 6 + b, 2, 3, '#a08040'); r(cx, px + 9, py + 6 + b, 2, 3, '#a08040')
  r(cx, px + 4, py + 10 + b, 8, 1, C.ch2); r(cx, px + 7, py + 10 + b, 2, 1, C.chL)
  if (moving) {
    r(cx, px + 1 + frame, py + 6 + b, 2, 5, '#785828'); r(cx, px + 13 - frame, py + 6 + b, 2, 5, '#785828')
  } else {
    r(cx, px + 2, py + 6, 2, 5, '#785828'); r(cx, px + 12, py + 6, 2, 5, '#785828')
  }
  r(cx, px + 2, py + 11 + b, 2, 1, C.sk); r(cx, px + 12, py + 11 + b, 2, 1, C.sk)
  r(cx, px + 4, py + 1 + b, 8, 5, C.sk); r(cx, px + 4, py + 4 + b, 8, 2, C.skM)
  r(cx, px + 3, py + b, 10, 3, '#c8a030'); r(cx, px + 3, py + 1 + b, 2, 3, '#c8a030'); r(cx, px + 11, py + 1 + b, 2, 3, '#c8a030')
  r(cx, px + 5, py + 3 + b, 2, 2, '#fff'); r(cx, px + 9, py + 3 + b, 2, 2, '#fff')
  r(cx, px + 6, py + 3 + b, 1, 2, '#111'); r(cx, px + 10, py + 3 + b, 1, 2, '#111')
}

function drawSlime(cx: Ctx, px: number, py: number, t: number) {
  const s = Math.sin(t / 300), h = 8 + Math.floor(s), w = 10 - Math.floor(s), o = (16 - w) / 2
  r(cx, px + 3, py + 13, 10, 2, 'rgba(0,0,0,.35)')
  r(cx, px + o, py + 14 - h, w, h, C.slG); r(cx, px + o + 1, py + 13 - h, w - 2, 2, C.slG)
  r(cx, px + o + 1, py + 14 - h, 3, 2, C.slL); r(cx, px + o, py + 12, w, 2, C.slD)
  r(cx, px + 5, py + 8, 2, 2, '#fff'); r(cx, px + 9, py + 8, 2, 2, '#fff')
  r(cx, px + 5, py + 9, 2, 1, '#111'); r(cx, px + 9, py + 9, 2, 1, '#111')
}

function drawSkeleton(cx: Ctx, px: number, py: number, t: number) {
  const b = Math.floor(Math.sin(t / 600))
  r(cx, px + 3, py + 14, 10, 2, 'rgba(0,0,0,.35)')
  r(cx, px + 5, py + 11 + b, 2, 4, C.bone); r(cx, px + 9, py + 11 + b, 2, 4, C.bone)
  r(cx, px + 4, py + 5 + b, 8, 6, C.bone)
  r(cx, px + 5, py + 6 + b, 2, 1, C.boneD); r(cx, px + 9, py + 6 + b, 2, 1, C.boneD)
  r(cx, px + 6, py + 9 + b, 4, 2, '#000')
  r(cx, px + 2, py + 6 + b, 2, 5, C.bone); r(cx, px + 12, py + 6 + b, 2, 5, C.bone)
  r(cx, px + 4, py + b, 8, 6, C.bone); r(cx, px + 5, py - 1 + b, 6, 1, C.bone)
  r(cx, px + 5, py + 2 + b, 2, 2, '#000'); r(cx, px + 9, py + 2 + b, 2, 2, '#000')
  r(cx, px + 5, py + 2 + b, 1, 1, '#f33'); r(cx, px + 10, py + 2 + b, 1, 1, '#f33')
  r(cx, px + 5, py + 5 + b, 1, 1, '#000'); r(cx, px + 7, py + 5 + b, 1, 1, '#000'); r(cx, px + 9, py + 5 + b, 1, 1, '#000')
}

function drawGoblin(cx: Ctx, px: number, py: number, t: number, moving?: boolean) {
  const b = moving ? (Math.floor(t / 120) % 2 ? -1 : 0) : 0
  const frame = moving ? Math.floor(t / 120) % 2 : 0
  r(cx, px + 3, py + 14, 10, 2, 'rgba(0,0,0,.35)')
  // Small body — goblins are short
  if (moving) {
    r(cx, px + 5 + frame, py + 12 + b, 2, 3, '#3a2820'); r(cx, px + 9 - frame, py + 12 + b, 2, 3, '#3a2820')
  } else {
    r(cx, px + 5, py + 12, 2, 3, '#3a2820'); r(cx, px + 9, py + 12, 2, 3, '#3a2820')
  }
  r(cx, px + 3, py + 6 + b, 10, 6, '#4a6830') // green tunic
  r(cx, px + 4, py + 7 + b, 8, 4, '#5a7840')
  r(cx, px + 2, py + 7 + b, 2, 4, '#4a6830'); r(cx, px + 12, py + 7 + b, 2, 4, '#4a6830') // arms
  r(cx, px + 2, py + 11 + b, 2, 1, '#78a848'); r(cx, px + 12, py + 11 + b, 2, 1, '#78a848') // hands
  // Head — green skin, big ears, pointy nose
  r(cx, px + 4, py + 1 + b, 8, 6, '#78a848')
  r(cx, px + 2, py + 3 + b, 2, 3, '#78a848'); r(cx, px + 12, py + 3 + b, 2, 3, '#78a848') // ears
  r(cx, px + 1, py + 4 + b, 1, 1, '#5a8830'); r(cx, px + 14, py + 4 + b, 1, 1, '#5a8830') // ear tips
  r(cx, px + 5, py + 3 + b, 2, 2, '#ff0'); r(cx, px + 9, py + 3 + b, 2, 2, '#ff0') // yellow eyes
  r(cx, px + 6, py + 3 + b, 1, 2, '#000'); r(cx, px + 10, py + 3 + b, 1, 2, '#000')
  r(cx, px + 7, py + 5 + b, 2, 2, '#5a8830') // nose
}

function drawWraith(cx: Ctx, px: number, py: number, t: number) {
  // Floating ghost — bobs up and down, semi-transparent
  const bob = Math.sin(t / 400) * 2
  const alpha = 0.6 + Math.sin(t / 500) * 0.15
  const py2 = py + bob
  r(cx, px + 3, py + 14, 10, 2, 'rgba(0,0,0,.15)')
  // Wispy robe bottom
  const wispOffset = Math.floor(t / 200) % 2
  r(cx, px + 3, py2 + 9, 2, 4 + wispOffset, `rgba(100,80,160,${alpha})`)
  r(cx, px + 6, py2 + 10, 2, 3 - wispOffset, `rgba(100,80,160,${alpha})`)
  r(cx, px + 9, py2 + 9, 2, 4 - wispOffset, `rgba(100,80,160,${alpha})`)
  r(cx, px + 11, py2 + 10, 2, 3 + wispOffset, `rgba(100,80,160,${alpha})`)
  // Body — dark purple translucent
  r(cx, px + 3, py2 + 4, 10, 6, `rgba(80,50,130,${alpha})`)
  r(cx, px + 4, py2 + 5, 8, 4, `rgba(100,70,160,${alpha})`)
  // Hood/head
  r(cx, px + 4, py2, 8, 5, `rgba(60,30,100,${alpha})`)
  r(cx, px + 3, py2 + 1, 10, 3, `rgba(60,30,100,${alpha})`)
  // Glowing eyes
  r(cx, px + 5, py2 + 2, 2, 2, '#ff3030'); r(cx, px + 9, py2 + 2, 2, 2, '#ff3030')
  r(cx, px + 6, py2 + 2, 1, 1, '#ff8080'); r(cx, px + 10, py2 + 2, 1, 1, '#ff8080')
}

function drawGolem(cx: Ctx, px: number, py: number, t: number) {
  const b = Math.floor(Math.sin(t / 800))
  r(cx, px + 2, py + 14, 12, 3, 'rgba(0,0,0,.4)')
  // Thick legs
  r(cx, px + 3, py + 11 + b, 4, 4, '#686880'); r(cx, px + 9, py + 11 + b, 4, 4, '#686880')
  r(cx, px + 4, py + 12 + b, 2, 3, '#585868'); r(cx, px + 10, py + 12 + b, 2, 3, '#585868')
  // Massive body
  r(cx, px + 2, py + 4 + b, 12, 8, '#787898'); r(cx, px + 3, py + 5 + b, 10, 6, '#8888a8')
  // Cracks/runes
  r(cx, px + 5, py + 6 + b, 1, 3, '#4040a0'); r(cx, px + 8, py + 7 + b, 2, 1, '#4040a0')
  r(cx, px + 10, py + 5 + b, 1, 4, '#4040a0')
  // Arms — thick stone
  r(cx, px + 0, py + 5 + b, 3, 6, '#787898'); r(cx, px + 13, py + 5 + b, 3, 6, '#787898')
  r(cx, px + 0, py + 10 + b, 3, 2, '#686880'); r(cx, px + 13, py + 10 + b, 3, 2, '#686880')
  // Head — blocky
  r(cx, px + 4, py + b, 8, 5, '#8888a8'); r(cx, px + 5, py + 1 + b, 6, 3, '#9898b8')
  // Glowing rune eyes
  r(cx, px + 5, py + 2 + b, 2, 2, '#6060ff'); r(cx, px + 9, py + 2 + b, 2, 2, '#6060ff')
  r(cx, px + 6, py + 2 + b, 1, 1, '#a0a0ff'); r(cx, px + 10, py + 2 + b, 1, 1, '#a0a0ff')
}

function drawDragon(cx: Ctx, px: number, py: number, t: number) {
  const b = Math.floor(Math.sin(t / 500))
  const wingPhase = Math.sin(t / 300) * 2
  r(cx, px + 2, py + 14, 12, 3, 'rgba(0,0,0,.4)')
  // Tail
  r(cx, px + 0, py + 11 + b, 3, 2, '#a02020'); r(cx, px - 1, py + 10 + b, 2, 2, '#801818')
  // Legs
  r(cx, px + 4, py + 11 + b, 3, 4, '#901818'); r(cx, px + 9, py + 11 + b, 3, 4, '#901818')
  // Body — red/crimson
  r(cx, px + 3, py + 5 + b, 10, 7, '#a02020'); r(cx, px + 4, py + 6 + b, 8, 5, '#c03030')
  // Belly scales
  r(cx, px + 5, py + 8 + b, 6, 3, '#d8a030')
  // Wings
  const wy = Math.floor(wingPhase)
  r(cx, px + 0, py + 3 + b + wy, 3, 5, '#801818'); r(cx, px + 13, py + 3 + b + wy, 3, 5, '#801818')
  r(cx, px - 1, py + 4 + b + wy, 2, 3, '#601010'); r(cx, px + 15, py + 4 + b + wy, 2, 3, '#601010')
  // Head — dragon snout
  r(cx, px + 4, py + b, 8, 6, '#a02020'); r(cx, px + 5, py + 1 + b, 6, 4, '#c03030')
  r(cx, px + 3, py - 1 + b, 2, 2, '#c03030') // horn left
  r(cx, px + 11, py - 1 + b, 2, 2, '#c03030') // horn right
  // Eyes
  r(cx, px + 5, py + 2 + b, 2, 2, '#ff8800'); r(cx, px + 9, py + 2 + b, 2, 2, '#ff8800')
  r(cx, px + 6, py + 2 + b, 1, 2, '#000'); r(cx, px + 10, py + 2 + b, 1, 2, '#000')
  // Nostril glow
  r(cx, px + 7, py + 4 + b, 1, 1, '#ff4400'); r(cx, px + 8, py + 4 + b, 1, 1, '#ff4400')
}

function drawChestEntity(cx: Ctx, px: number, py: number, _t: number, state?: string) {
  r(cx, px + 2, py + 13, 12, 3, 'rgba(0,0,0,.35)')
  if (state === 'open') {
    r(cx, px + 2, py + 7, 12, 6, C.chOpen)
    r(cx, px + 2, py + 3, 12, 5, C.ch1)
    r(cx, px + 3, py + 2, 10, 2, C.ch1)
    r(cx, px + 3, py + 4, 10, 1, '#b88838')
    r(cx, px + 4, py + 8, 2, 2, C.chGold)
    r(cx, px + 8, py + 9, 3, 1, C.chGold)
    r(cx, px + 10, py + 8, 2, 1, C.chGold)
    r(cx, px + 6, py + 10, 2, 1, C.chGold)
  } else {
    r(cx, px + 2, py + 7, 12, 6, C.ch2)
    r(cx, px + 2, py + 5, 12, 4, C.ch1)
    r(cx, px + 3, py + 6, 10, 1, '#b88838')
    r(cx, px + 7, py + 8, 2, 3, C.chL)
    r(cx, px + 2, py + 7, 12, 1, '#483010')
  }
}

function drawDoorEntity(cx: Ctx, px: number, py: number, _t: number, state?: string) {
  if (state === 'open') {
    r(cx, px, py, T, T, C.dr2)
    r(cx, px + 2, py + 1, 12, 14, C.doorOpen)
    r(cx, px + 1, py, 14, 2, C.dr1)
    r(cx, px + 1, py + 1, 2, 14, C.dr1)
    r(cx, px + 13, py + 1, 2, 14, C.dr1)
  } else {
    r(cx, px, py, T, T, C.dr2); r(cx, px + 2, py + 1, 12, 14, C.dr1)
    r(cx, px + 4, py + 3, 4, 4, C.dr2); r(cx, px + 9, py + 3, 4, 4, C.dr2)
    r(cx, px + 4, py + 9, 4, 4, C.dr2); r(cx, px + 9, py + 9, 4, 4, C.dr2)
    r(cx, px + 11, py + 7, 2, 2, C.drK)
  }
}

function drawNPC(cx: Ctx, px: number, py: number, t: number) {
  const b = Math.floor(t / 700) % 2 ? -1 : 0
  r(cx, px + 3, py + 14, 10, 2, 'rgba(0,0,0,.35)')
  r(cx, px + 3, py + 5 + b, 10, 10, C.npcRobe)
  r(cx, px + 4, py + 5 + b, 8, 9, '#5858b8')
  r(cx, px + 4, py + 10 + b, 8, 1, C.chL)
  r(cx, px + 2, py + 6 + b, 2, 5, C.npcRobe); r(cx, px + 12, py + 6 + b, 2, 5, C.npcRobe)
  r(cx, px + 4, py + 1 + b, 8, 5, C.npcSkin)
  r(cx, px + 3, py + b, 10, 3, C.npcHood)
  r(cx, px + 3, py + 1 + b, 2, 3, C.npcHood); r(cx, px + 11, py + 1 + b, 2, 3, C.npcHood)
  r(cx, px + 5, py + 3 + b, 2, 2, '#fff'); r(cx, px + 9, py + 3 + b, 2, 2, '#fff')
  r(cx, px + 6, py + 3 + b, 1, 2, '#44f'); r(cx, px + 10, py + 3 + b, 1, 2, '#44f')
}

const SPRITE_FN: Record<string, SpriteFn> = {
  player: drawPlayer, companion: drawCompanion,
  slime: drawSlime, skeleton: drawSkeleton, goblin: drawGoblin,
  wraith: drawWraith, golem: drawGolem, dragon: drawDragon,
}

// --- Race/Class full-body sprite colors ---

// Skin colors by race: Human, Elf, Dwarf, Tiefling, Beastkin
const SKIN = ['#d8a878', '#f0d8b0', '#c89868', '#c04848', '#a88848'] as const
const SKIN_M = ['#c09060', '#e0c898', '#b08050', '#a03838', '#907838'] as const

// Hair colors by race
const HAIR = ['#4a3020', '#e8d888', '#c06820', '#301030', '#786038'] as const

// Outfit colors by class: Warrior, Mage, Rogue, Ranger, Cleric, Bard
const OUTFIT = [
  { body: '#707888', inner: '#8898a8', cape: '#505868', accent: '#a0a8b8' }, // Warrior — steel
  { body: '#5040a0', inner: '#6858b8', cape: '#3a2878', accent: '#9080d0' }, // Mage — purple
  { body: '#483828', inner: '#685848', cape: '#302018', accent: '#887058' }, // Rogue — leather
  { body: '#2a5820', inner: '#3a7830', cape: '#184818', accent: '#58a848' }, // Ranger — green
  { body: '#c8b870', inner: '#e0d8a0', cape: '#a89848', accent: '#f0e8c0' }, // Cleric — white/gold
  { body: '#982838', inner: '#c04858', cape: '#701828', accent: '#d87888' }, // Bard — red
] as const

function drawNFACharacter(
  cx: Ctx, px: number, py: number, t: number, moving: boolean,
  race: number, class_: number,
) {
  const b = moving ? (Math.floor(t / 150) % 2 ? -1 : 0) : 0
  const frame = moving ? Math.floor(t / 150) % 2 : 0
  const sk = SKIN[race] ?? SKIN[0]!
  const skm = SKIN_M[race] ?? SKIN_M[0]!
  const hr = HAIR[race] ?? HAIR[0]!
  const o = OUTFIT[class_] ?? OUTFIT[0]!

  // Shadow
  r(cx, px + 2, py + 14, 12, 3, 'rgba(0,0,0,.35)')
  // Boots
  if (moving) {
    r(cx, px + 3 + frame * 2, py + 13 + b, 3, 2, '#3a2820')
    r(cx, px + 10 - frame * 2, py + 13 + b, 3, 2, '#3a2820')
  } else {
    r(cx, px + 4, py + 13, 3, 2, '#3a2820'); r(cx, px + 9, py + 13, 3, 2, '#3a2820')
  }
  // Cape/outer
  r(cx, px + 2, py + 5 + b, 12, 8, o.cape); r(cx, px + 3, py + 5 + b, 10, 7, o.body)
  // Inner torso
  r(cx, px + 4, py + 5 + b, 8, 7, o.inner)
  // Chest detail
  r(cx, px + 5, py + 6 + b, 2, 3, o.accent); r(cx, px + 9, py + 6 + b, 2, 3, o.accent)
  // Belt
  r(cx, px + 4, py + 10 + b, 8, 1, '#5a4828'); r(cx, px + 7, py + 10 + b, 2, 1, '#c8a848')
  // Arms
  if (moving) {
    r(cx, px + 1 + frame, py + 6 + b, 2, 5, o.body); r(cx, px + 13 - frame, py + 6 + b, 2, 5, o.body)
  } else {
    r(cx, px + 2, py + 6, 2, 5, o.body); r(cx, px + 12, py + 6, 2, 5, o.body)
  }
  // Hands
  r(cx, px + 2, py + 11 + b, 2, 1, sk); r(cx, px + 12, py + 11 + b, 2, 1, sk)
  // Head — face
  r(cx, px + 4, py + 1 + b, 8, 5, sk); r(cx, px + 4, py + 4 + b, 8, 2, skm)
  // Hair
  r(cx, px + 3, py + b, 10, 3, hr)
  r(cx, px + 3, py + 1 + b, 2, 3, hr); r(cx, px + 11, py + 1 + b, 2, 3, hr)
  // Eyes
  r(cx, px + 5, py + 3 + b, 2, 2, '#fff'); r(cx, px + 9, py + 3 + b, 2, 2, '#fff')
  // Pupil color by race: Human=brown, Elf=green, Dwarf=brown, Tiefling=red, Beastkin=amber
  const pupil = ['#331100', '#116622', '#331100', '#cc2222', '#886600'][race] ?? '#111'
  r(cx, px + 6, py + 3 + b, 1, 2, pupil); r(cx, px + 10, py + 3 + b, 1, 2, pupil)

  // Race-specific features
  if (race === 1) {
    // Elf — pointed ears
    r(cx, px + 2, py + 2 + b, 2, 2, sk); r(cx, px + 12, py + 2 + b, 2, 2, sk)
  } else if (race === 2) {
    // Dwarf — wider jaw / beard
    r(cx, px + 4, py + 5 + b, 8, 2, hr)
    r(cx, px + 3, py + 4 + b, 2, 2, hr); r(cx, px + 11, py + 4 + b, 2, 2, hr)
  } else if (race === 3) {
    // Tiefling — horns
    r(cx, px + 3, py - 1 + b, 2, 2, '#801830')
    r(cx, px + 11, py - 1 + b, 2, 2, '#801830')
  } else if (race === 4) {
    // Beastkin — ear tufts
    r(cx, px + 3, py - 1 + b, 3, 2, hr); r(cx, px + 10, py - 1 + b, 3, 2, hr)
  }

  // Class-specific weapon/detail
  if (class_ === 0) {
    // Warrior — sword on side
    r(cx, px + 14, py + 5 + b, 1, 6, '#a0a8b8'); r(cx, px + 14, py + 4 + b, 1, 1, '#c8a848')
  } else if (class_ === 1) {
    // Mage — staff
    r(cx, px + 14, py + 2 + b, 1, 10, '#8a6828'); r(cx, px + 13, py + 1 + b, 3, 2, '#9080d0')
  } else if (class_ === 3) {
    // Ranger — bow
    r(cx, px + 14, py + 3 + b, 1, 8, '#6a5020')
    r(cx, px + 15, py + 4 + b, 1, 6, '#887048')
  } else if (class_ === 4) {
    // Cleric — shield glow
    r(cx, px + 0, py + 7 + b, 2, 4, '#e0d890'); r(cx, px + 1, py + 8 + b, 1, 2, '#f0e8c0')
  }
}

function drawEntitySprite(
  cx: Ctx, px: number, py: number, t: number,
  type: string, state?: string, moving?: boolean,
  hitTime?: number, removing?: boolean,
  traits?: { race: number; class_: number; personality: number; talentRarity: number },
) {
  // Death fade — reduce alpha over 400ms
  if (removing && hitTime) {
    const elapsed = t - hitTime
    const alpha = Math.max(0, 1 - elapsed / 400)
    cx.save()
    cx.globalAlpha = alpha
  }

  switch (type) {
    case 'chest': drawChestEntity(cx, px, py, t, state); break
    case 'door': drawDoorEntity(cx, px, py, t, state); break
    case 'npc': drawNPC(cx, px, py, t); break
    default: {
      // Use race/class full-body sprite for party members with traits
      if (traits && (type === 'player' || type === 'companion')) {
        drawNFACharacter(cx, px, py, t, !!moving, traits.race, traits.class_)
        break
      }
      const fn = SPRITE_FN[type]
      if (fn) fn(cx, px, py, t, moving)
    }
  }

  // Hit flash — white overlay for 200ms
  if (hitTime && !removing) {
    const elapsed = t - hitTime
    if (elapsed < 200) {
      const alpha = 0.7 * (1 - elapsed / 200)
      cx.fillStyle = `rgba(255,255,255,${alpha})`
      cx.fillRect(px, py - 2, T, T + 2)
    }
  }

  // Entity shake — slight horizontal jitter for 300ms after hit
  // (Applied before this function via position offset in render loop)

  if (removing && hitTime) {
    cx.restore()
  }
}

// --- Effect renderers ---

function renderEffects(cx: Ctx, effects: VisualEffect[], t: number, cw: number, ch: number) {
  for (const eff of effects) {
    const elapsed = t - eff.startTime
    const progress = Math.min(1, elapsed / eff.duration)

    switch (eff.type) {
      case 'damage_flash': {
        const alpha = 0.4 * (1 - progress)
        cx.fillStyle = `rgba(255,0,0,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }

      case 'shake':
        break // Applied via canvas transform in render loop

      case 'heal_glow': {
        const px = (eff.x + 0.5) * T, py = (eff.y + 0.5) * T
        const radius = T * 2 * (0.5 + progress * 0.5)
        const alpha = 0.3 * (1 - progress)
        const g = cx.createRadialGradient(px, py, 0, px, py, radius)
        g.addColorStop(0, `rgba(68,255,68,${alpha})`)
        g.addColorStop(1, 'rgba(68,255,68,0)')
        cx.fillStyle = g
        cx.fillRect(px - radius, py - radius, radius * 2, radius * 2)
        break
      }

      case 'fireball': {
        const px = (eff.x + 0.5) * T, py = (eff.y + 0.5) * T
        const radius = T * 1.5 * progress
        const alpha = 0.8 * (1 - progress)
        const g = cx.createRadialGradient(px, py, 0, px, py, radius)
        g.addColorStop(0, `rgba(255,200,50,${alpha})`)
        g.addColorStop(0.4, `rgba(255,100,20,${alpha * 0.7})`)
        g.addColorStop(1, 'rgba(255,50,0,0)')
        cx.fillStyle = g
        cx.fillRect(px - radius, py - radius, radius * 2, radius * 2)
        break
      }

      case 'lightning': {
        const alpha = progress < 0.5 ? 0.8 : 0.8 * (1 - (progress - 0.5) * 2)
        cx.fillStyle = `rgba(200,220,255,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }

      case 'smoke': {
        const px = (eff.x + 0.5) * T, py = (eff.y + 0.5) * T
        const radius = T * (0.5 + progress)
        const alpha = 0.5 * (1 - progress)
        const g = cx.createRadialGradient(px, py, 0, px, py, radius)
        g.addColorStop(0, `rgba(128,128,128,${alpha})`)
        g.addColorStop(1, 'rgba(80,80,80,0)')
        cx.fillStyle = g
        cx.fillRect(px - radius, py - radius, radius * 2, radius * 2)
        break
      }

      case 'explosion': {
        const px = (eff.x + 0.5) * T, py = (eff.y + 0.5) * T
        const radius = T * 2 * progress
        const alpha = 0.9 * (1 - progress)
        const g = cx.createRadialGradient(px, py, 0, px, py, radius)
        g.addColorStop(0, `rgba(255,255,200,${alpha})`)
        g.addColorStop(0.3, `rgba(255,150,50,${alpha * 0.8})`)
        g.addColorStop(0.6, `rgba(255,60,20,${alpha * 0.5})`)
        g.addColorStop(1, 'rgba(100,20,0,0)')
        cx.fillStyle = g
        cx.fillRect(px - radius, py - radius, radius * 2, radius * 2)
        break
      }

      case 'floating_number': {
        const px = (eff.x + 0.5) * T, py = eff.y * T - progress * T * 1.5
        const alpha = 1 - progress * 0.8
        cx.save()
        cx.font = 'bold 8px monospace'
        cx.textAlign = 'center'
        cx.fillStyle = eff.color || '#fff'
        cx.globalAlpha = alpha
        cx.fillText(eff.value || '', px, py)
        cx.restore()
        break
      }

      case 'combat_tint': {
        const alpha = 0.1 * (1 - progress)
        cx.fillStyle = `rgba(200,30,30,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }

      case 'victory_flash': {
        const alpha = 0.4 * (progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7)
        cx.fillStyle = `rgba(255,215,0,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }

      case 'dice_icon': {
        const px = (eff.x + 0.5) * T, py = (eff.y + 0.5) * T - progress * T
        const alpha = 1 - progress
        cx.save()
        cx.globalAlpha = alpha
        const s = 6
        r(cx, px - s / 2, py - s / 2, s, s, '#fff')
        r(cx, px - s / 2 + 1, py - s / 2 + 1, s - 2, s - 2, '#222')
        r(cx, px - 1, py - 1, 2, 2, '#fff')
        cx.restore()
        break
      }

      case 'map_fade_out': {
        const alpha = progress
        cx.fillStyle = `rgba(0,0,0,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }

      case 'map_fade_in': {
        const alpha = 1 - progress
        cx.fillStyle = `rgba(0,0,0,${alpha})`
        cx.fillRect(0, 0, cw, ch)
        break
      }
    }
  }
}

// --- Lighting ---

function drawLighting(cx: Ctx, cw: number, ch: number, torches: { x: number; y: number }[]) {
  const g = cx.createRadialGradient(cw / 2, ch / 2, 50, cw / 2, ch / 2, 180)
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.7, 'rgba(0,0,0,.15)'); g.addColorStop(1, 'rgba(0,0,0,.4)')
  cx.fillStyle = g; cx.fillRect(0, 0, cw, ch)

  torches.forEach(({ x, y }) => {
    const a = (x + 0.5) * T, b = (y + 0.5) * T
    const gl = cx.createRadialGradient(a, b, 0, a, b, T * 3)
    gl.addColorStop(0, 'rgba(255,160,40,.10)'); gl.addColorStop(1, 'rgba(0,0,0,0)')
    cx.fillStyle = gl; cx.fillRect(a - T * 3, b - T * 3, T * 6, T * 6)
  })
}

// --- Entity movement interpolation ---

interface AnimState {
  px: number
  py: number
  moving: boolean
}

export function usePixelMap(
  canvasRef: Ref<HTMLCanvasElement | null>,
  mapId: Ref<string>,
  entities: Ref<SceneEntity[]>,
  effects: Ref<VisualEffect[]>,
) {
  let animId: number | null = null
  let lastTime = 0
  const entityAnimState = new Map<string, AnimState>()

  function getOrCreateAnimState(e: SceneEntity): AnimState {
    let state = entityAnimState.get(e.id)
    if (!state) {
      state = { px: e.x * T, py: e.y * T - 2, moving: false }
      entityAnimState.set(e.id, state)
    }
    return state
  }

  function updateEntityPositions(dt: number) {
    const ents = entities.value
    const speed = MOVE_SPEED * T * dt / 1000

    // Clean up anim states for removed entities
    const activeIds = new Set(ents.map(e => e.id))
    for (const id of entityAnimState.keys()) {
      if (!activeIds.has(id)) entityAnimState.delete(id)
    }

    for (const e of ents) {
      const state = getOrCreateAnimState(e)
      const tx = (e.targetX ?? e.x) * T
      const ty = (e.targetY ?? e.y) * T - 2
      const dx = tx - state.px
      const dy = ty - state.py
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < speed || dist < 0.5) {
        state.px = tx
        state.py = ty
        state.moving = false
        if (e.targetX !== undefined && e.targetY !== undefined) {
          e.x = e.targetX
          e.y = e.targetY
          e.targetX = undefined
          e.targetY = undefined
        }
      } else {
        state.px += (dx / dist) * speed
        state.py += (dy / dist) * speed
        state.moving = true
      }
    }
  }

  function render(t: number) {
    const cv = canvasRef.value
    if (!cv) return
    const cx = cv.getContext('2d')!
    const dt = lastTime ? t - lastTime : 16
    lastTime = t

    // Compute shake offset
    let shakeX = 0, shakeY = 0
    for (const eff of effects.value) {
      if (eff.type === 'shake') {
        const progress = Math.min(1, (t - eff.startTime) / eff.duration)
        const intensity = 3 * (1 - progress)
        shakeX += Math.sin(t * 0.05) * intensity
        shakeY += Math.cos(t * 0.07) * intensity
      }
    }

    cx.save()
    cx.setTransform(1, 0, 0, 1, shakeX, shakeY)

    // Get current room template
    const room = getRoom(mapId.value)
    const tileAt = (x: number, y: number): string => (room.tiles[y] || '')[x] || 'w'

    // Layer 1: Tiles
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        const fn = TILE_FN[tileAt(x, y)]
        if (fn) fn(cx, x, y, t)
        else dark(cx, x, y, t)
      }
    }

    // Update entity movement
    updateEntityPositions(dt)

    // Layer 2: Entities (Y-sorted)
    const ents = [...entities.value]
    ents.sort((a, b) => {
      const ay = entityAnimState.get(a.id)?.py ?? (a.y * T)
      const by = entityAnimState.get(b.id)?.py ?? (b.y * T)
      return ay - by
    })
    for (const e of ents) {
      const state = entityAnimState.get(e.id)
      if (!state) continue
      // Hit shake — jitter position for 300ms after hit
      let drawX = state.px, drawY = state.py
      if (e.hitTime && !e.removing) {
        const elapsed = t - e.hitTime
        if (elapsed < 300) {
          const intensity = 2 * (1 - elapsed / 300)
          drawX += Math.sin(t * 0.1) * intensity
        }
      }
      drawEntitySprite(cx, drawX, drawY, t, e.type, e.state, state.moving, e.hitTime, e.removing, e.traits)

      // Enemy HP bar
      if (e.hp != null && e.maxHp != null && e.maxHp > 0 && !e.removing) {
        const barW = 12, barH = 2
        const barX = drawX + (T - barW) / 2
        const barY = drawY - 3
        const ratio = Math.max(0, e.hp / e.maxHp)
        // Background
        r(cx, barX, barY, barW, barH, '#333')
        // Fill
        const color = ratio > 0.5 ? '#3a3' : ratio > 0.25 ? '#da3' : '#d33'
        if (ratio > 0) r(cx, barX, barY, Math.round(barW * ratio), barH, color)
      }
    }

    // Layer 3: Lighting
    drawLighting(cx, cv.width, cv.height, room.torches)

    cx.restore()

    // Layer 4: Effects (rendered after restore so overlays aren't shaken)
    renderEffects(cx, effects.value, t, cv.width, cv.height)

    animId = requestAnimationFrame(render)
  }

  function fitCanvas() {
    const cv = canvasRef.value
    if (!cv) return
    const parent = cv.parentElement
    if (!parent) return
    const scale = Math.min(parent.clientWidth / cv.width, parent.clientHeight / cv.height)
    cv.style.width = Math.floor(cv.width * scale) + 'px'
    cv.style.height = Math.floor(cv.height * scale) + 'px'
  }

  onMounted(() => {
    const cv = canvasRef.value
    if (!cv) return
    cv.width = MW * T
    cv.height = MH * T
    cv.getContext('2d')!.imageSmoothingEnabled = false
    fitCanvas()
    window.addEventListener('resize', fitCanvas)
    animId = requestAnimationFrame(render)
  })

  onUnmounted(() => {
    if (animId) cancelAnimationFrame(animId)
    window.removeEventListener('resize', fitCanvas)
  })

  watch(mapId, () => {
    entityAnimState.clear()
  })

  return { fitCanvas }
}
