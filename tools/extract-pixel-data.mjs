#!/usr/bin/env node
/**
 * extract-pixel-data.mjs
 *
 * Parses generate-avatars.html, extracts pixel draw instructions for all 30 avatars
 * and 16 backgrounds, then outputs:
 *   - contracts/contracts/generated/PixelData.sol  (Solidity bytes constants)
 *   - frontend/src/data/pixelData.ts               (TypeScript version)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import vm from 'vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const HTML_PATH = join(__dirname, 'generate-avatars.html')

// ── Parse the HTML to extract JS code ──

const html = readFileSync(HTML_PATH, 'utf-8')

// Extract the entire <script> block
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
if (!scriptMatch) throw new Error('Could not find <script> in HTML')

// Mock canvas context that captures rects
class MockContext {
  constructor() {
    this.rects = []
    this.fillStyle = '#000'
    this._saveStack = []
    this._translateX = 0
    this._translateY = 0
  }
  fillRect(x, y, w, h) {
    this.rects.push({
      x: x + this._translateX,
      y: y + this._translateY,
      w, h,
      color: this.fillStyle,
    })
  }
  clearRect() {}
  save() {
    this._saveStack.push({ tx: this._translateX, ty: this._translateY })
  }
  restore() {
    const s = this._saveStack.pop()
    if (s) { this._translateX = s.tx; this._translateY = s.ty }
  }
  translate(x, y) {
    this._translateX += x
    this._translateY += y
  }
  set imageSmoothingEnabled(_) {}
  drawImage() {}
}

// Create a sandbox that provides minimal DOM-like stubs
const sandbox = {
  console,
  Math,
  document: {
    getElementById: () => ({
      appendChild: () => {},
    }),
    createElement: (tag) => {
      if (tag === 'canvas') {
        const ctx = new MockContext()
        return {
          width: 16, height: 16,
          getContext: () => ctx,
          _ctx: ctx,
          toDataURL: () => '',
          style: {},
        }
      }
      return {
        className: '',
        textContent: '',
        onclick: null,
        appendChild: () => {},
        classList: { toggle: () => {} },
        style: {},
      }
    },
    querySelectorAll: () => [],
  },
  setTimeout: () => {},
  // We'll capture these after script runs
  _capturedAvatars: null,
  _capturedBackgrounds: null,
}

// Modify the script to export avatars and backgrounds
const modifiedScript = scriptMatch[1] + `
_capturedAvatars = avatars;
_capturedBackgrounds = backgrounds;
`

vm.createContext(sandbox)
vm.runInContext(modifiedScript, sandbox)

const avatars = sandbox._capturedAvatars
const backgrounds = sandbox._capturedBackgrounds

if (!avatars || !backgrounds) throw new Error('Failed to capture avatars/backgrounds')

console.log(`Found ${avatars.length} avatars`)
console.log(`Found ${backgrounds.length} backgrounds`)

// ── Sort avatars into race×class order ──

const RACES = ['Human', 'Elf', 'Dwarf', 'Tiefling', 'Beastkin']
const CLASSES = ['Warrior', 'Mage', 'Rogue', 'Ranger', 'Cleric', 'Bard']

const sortedAvatars = []
for (const race of RACES) {
  for (const cls of CLASSES) {
    const av = avatars.find(a => a.race === race && a.class_ === cls)
    if (!av) {
      console.error(`Missing avatar: ${race} ${cls}`)
      process.exit(1)
    }
    sortedAvatars.push(av)
  }
}

// ── Execute each drawChar to capture rects ──

const CHAR_OFFSET_Y = 4 // matches the HTML

const avatarRects = sortedAvatars.map(av => {
  const ctx = new MockContext()
  // Apply the character offset (matches drawComposite)
  ctx._translateY = CHAR_OFFSET_Y
  av.drawChar(ctx)
  return ctx.rects
})

// Execute each background draw
const bgRects = backgrounds.map(bg => {
  const ctx = new MockContext()
  bg.draw(ctx)
  return ctx.rects
})

// ── Build unified color palette ──

function parseColor(color) {
  const rgbMatch = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])]
  }
  const rgbaMatch = color.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  if (rgbaMatch) {
    return null // skip alpha rects for on-chain
  }
  const hex = color.replace('#', '')
  if (hex.length === 3) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ]
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  console.warn(`Unknown color format: ${color}`)
  return null
}

const paletteMap = new Map()
const paletteRGB = []

// Find nearest existing palette color within threshold, or add new
const COLOR_THRESHOLD = 12 // max Euclidean distance per channel to merge

function findNearest(rgb) {
  let bestIdx = -1
  let bestDist = Infinity
  for (let i = 0; i < paletteRGB.length; i++) {
    const p = paletteRGB[i]
    const dr = rgb[0] - p[0], dg = rgb[1] - p[1], db = rgb[2] - p[2]
    const dist = Math.sqrt(dr * dr + dg * dg + db * db)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  return bestDist <= COLOR_THRESHOLD ? bestIdx : -1
}

function getPaletteIndex(color) {
  const rgb = parseColor(color)
  if (!rgb) return -1

  // Exact match first
  const key = rgb.join(',')
  if (paletteMap.has(key)) return paletteMap.get(key)

  // Try to find a nearby color if palette is getting full
  if (paletteRGB.length >= 240) {
    const near = findNearest(rgb)
    if (near >= 0) {
      paletteMap.set(key, near)
      return near
    }
  }

  const idx = paletteRGB.length
  if (idx >= 256) {
    // Force-merge with nearest
    const near = findNearest(rgb)
    if (near >= 0) {
      paletteMap.set(key, near)
      return near
    }
    // Increase threshold and try again
    const bestIdx = paletteRGB.reduce((best, p, i) => {
      const dr = rgb[0] - p[0], dg = rgb[1] - p[1], db = rgb[2] - p[2]
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      return dist < best.dist ? { idx: i, dist } : best
    }, { idx: 0, dist: Infinity })
    paletteMap.set(key, bestIdx.idx)
    return bestIdx.idx
  }

  paletteRGB.push(rgb)
  paletteMap.set(key, idx)
  return idx
}

// Index all rects
const avatarPacked = avatarRects.map(rects => {
  const packed = []
  for (const rect of rects) {
    const ci = getPaletteIndex(rect.color)
    if (ci < 0) continue
    // Clamp to 16×16 grid
    const x = Math.round(rect.x)
    const y = Math.round(rect.y)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    if (x < 0 || y < 0 || x >= 16 || y >= 16 || w < 1 || h < 1) continue
    packed.push({ x, y, w: Math.min(w, 16 - x), h: Math.min(h, 16 - y), colorIndex: ci })
  }
  return packed
})

const bgPacked = bgRects.map(rects => {
  const packed = []
  for (const rect of rects) {
    const ci = getPaletteIndex(rect.color)
    if (ci < 0) continue
    const x = Math.round(rect.x)
    const y = Math.round(rect.y)
    const w = Math.round(rect.w)
    const h = Math.round(rect.h)
    if (x < 0 || y < 0 || x >= 16 || y >= 16 || w < 1 || h < 1) continue
    packed.push({ x, y, w: Math.min(w, 16 - x), h: Math.min(h, 16 - y), colorIndex: ci })
  }
  return packed
})

console.log(`Palette: ${paletteRGB.length} colors`)
console.log(`Avatar rects: ${avatarPacked.map(a => a.length).join(', ')}`)
console.log(`Background rects: ${bgPacked.map(b => b.length).join(', ')}`)

// ── Pack into bytes ──
// Each rect = 3 bytes: (x<<4|y), ((w-1)<<4|(h-1)), colorIndex

function packRects(rects) {
  const bytes = []
  for (const r of rects) {
    if (r.x > 15 || r.y > 15 || r.w > 16 || r.h > 16) {
      console.warn(`Rect out of range: x=${r.x} y=${r.y} w=${r.w} h=${r.h}`)
      continue
    }
    bytes.push((r.x << 4) | (r.y & 0xF))
    bytes.push(((r.w - 1) << 4) | ((r.h - 1) & 0xF))
    bytes.push(r.colorIndex & 0xFF)
  }
  return bytes
}

function toHexBytes(bytes) {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Generate Solidity output ──

function generateSolidity() {
  const lines = []
  lines.push('// SPDX-License-Identifier: MIT')
  lines.push('// AUTO-GENERATED by extract-pixel-data.mjs — DO NOT EDIT')
  lines.push('pragma solidity ^0.8.28;')
  lines.push('')
  lines.push('library PixelData {')
  lines.push('')

  // Palette
  const paletteBytes = []
  for (const [r, g, b] of paletteRGB) {
    paletteBytes.push(r, g, b)
  }
  lines.push('    function palette() internal pure returns (bytes memory) {')
  lines.push(`        return hex"${toHexBytes(paletteBytes)}";`)
  lines.push('    }')
  lines.push('')
  lines.push(`    uint256 internal constant PALETTE_SIZE = ${paletteRGB.length};`)
  lines.push('')

  // Character data blob with offset table
  const charOffsets = []
  const charBlob = []
  for (let i = 0; i < 30; i++) {
    charOffsets.push(charBlob.length)
    const packed = packRects(avatarPacked[i])
    charBlob.push(...packed)
  }
  charOffsets.push(charBlob.length)

  lines.push('    function characterData() internal pure returns (bytes memory) {')
  lines.push(`        return hex"${toHexBytes(charBlob)}";`)
  lines.push('    }')
  lines.push('')

  // Character offset lookup
  const offsetBytes = []
  for (const off of charOffsets) {
    offsetBytes.push((off >> 8) & 0xFF, off & 0xFF)
  }
  lines.push('    function characterOffset(uint8 race, uint8 class_) internal pure returns (uint256) {')
  lines.push('        uint256 idx = uint256(race) * 6 + uint256(class_);')
  lines.push(`        bytes memory offsets = hex"${toHexBytes(offsetBytes)}";`)
  lines.push('        uint256 ptr = idx * 2;')
  lines.push('        return (uint256(uint8(offsets[ptr])) << 8) | uint256(uint8(offsets[ptr + 1]));')
  lines.push('    }')
  lines.push('')

  // Background data blob
  const bgOffsets = []
  const bgBlob = []
  for (let i = 0; i < backgrounds.length; i++) {
    bgOffsets.push(bgBlob.length)
    const packed = packRects(bgPacked[i])
    bgBlob.push(...packed)
  }
  bgOffsets.push(bgBlob.length)

  lines.push('    function backgroundData() internal pure returns (bytes memory) {')
  lines.push(`        return hex"${toHexBytes(bgBlob)}";`)
  lines.push('    }')
  lines.push('')

  const bgOffsetBytes = []
  for (const off of bgOffsets) {
    bgOffsetBytes.push((off >> 8) & 0xFF, off & 0xFF)
  }
  lines.push(`    uint256 internal constant BG_COUNT = ${backgrounds.length};`)
  lines.push('')
  lines.push('    function backgroundOffset(uint8 bgIndex) internal pure returns (uint256) {')
  lines.push(`        bytes memory offsets = hex"${toHexBytes(bgOffsetBytes)}";`)
  lines.push('        uint256 ptr = uint256(bgIndex) * 2;')
  lines.push('        return (uint256(uint8(offsets[ptr])) << 8) | uint256(uint8(offsets[ptr + 1]));')
  lines.push('    }')

  lines.push('}')
  return lines.join('\n')
}

// ── Generate TypeScript output ──

function generateTypeScript() {
  const lines = []
  lines.push('// AUTO-GENERATED by extract-pixel-data.mjs — DO NOT EDIT')
  lines.push('')
  lines.push('export interface PackedRect {')
  lines.push('  x: number; y: number; w: number; h: number; colorIndex: number')
  lines.push('}')
  lines.push('')

  // Palette
  lines.push('export const PALETTE: [number, number, number][] = [')
  for (const [r, g, b] of paletteRGB) {
    lines.push(`  [${r}, ${g}, ${b}],`)
  }
  lines.push(']')
  lines.push('')

  // Character rects
  lines.push('/** Character pixel rects indexed by race*6+class (30 entries) */')
  lines.push('export const CHARACTER_RECTS: PackedRect[][] = [')
  for (let i = 0; i < 30; i++) {
    const av = sortedAvatars[i]
    lines.push(`  // ${i}: ${av.name}`)
    lines.push('  [')
    for (const r of avatarPacked[i]) {
      lines.push(`    { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}, colorIndex: ${r.colorIndex} },`)
    }
    lines.push('  ],')
  }
  lines.push(']')
  lines.push('')

  // Background rects
  lines.push('/** Background names */')
  lines.push(`export const BG_NAMES = [${backgrounds.map(b => `'${b.name}'`).join(', ')}] as const`)
  lines.push('')
  lines.push('/** Background pixel rects (16 entries) */')
  lines.push('export const BACKGROUND_RECTS: PackedRect[][] = [')
  for (let i = 0; i < backgrounds.length; i++) {
    lines.push(`  // ${i}: ${backgrounds[i].name}`)
    lines.push('  [')
    for (const r of bgPacked[i]) {
      lines.push(`    { x: ${r.x}, y: ${r.y}, w: ${r.w}, h: ${r.h}, colorIndex: ${r.colorIndex} },`)
    }
    lines.push('  ],')
  }
  lines.push(']')
  lines.push('')

  return lines.join('\n')
}

// ── Write outputs ──

const solDir = join(ROOT, 'contracts', 'contracts', 'generated')
mkdirSync(solDir, { recursive: true })
writeFileSync(join(solDir, 'PixelData.sol'), generateSolidity())
console.log(`\nWrote ${join(solDir, 'PixelData.sol')}`)

const tsDir = join(ROOT, 'frontend', 'src', 'data')
mkdirSync(tsDir, { recursive: true })
writeFileSync(join(tsDir, 'pixelData.ts'), generateTypeScript())
console.log(`Wrote ${join(tsDir, 'pixelData.ts')}`)

// Stats
const totalCharBytes = avatarPacked.reduce((sum, a) => sum + a.length * 3 + 1, 0)
const totalBgBytes = bgPacked.reduce((sum, b) => sum + b.length * 3 + 1, 0)
const totalPaletteBytes = paletteRGB.length * 3
console.log(`\nSize summary:`)
console.log(`  Palette: ${totalPaletteBytes} bytes (${paletteRGB.length} colors)`)
console.log(`  Characters: ${totalCharBytes} bytes`)
console.log(`  Backgrounds: ${totalBgBytes} bytes`)
console.log(`  Total: ${totalPaletteBytes + totalCharBytes + totalBgBytes} bytes`)
