/**
 * avatarSVG.ts
 *
 * Generates the same pixel-art SVG avatars as the on-chain NFARenderer,
 * but in TypeScript for instant frontend rendering without contract calls.
 */

import { PALETTE, CHARACTER_RECTS, BACKGROUND_RECTS, type PackedRect } from '../data/pixelData'

const BG_COUNT = BACKGROUND_RECTS.length

function toHexColor(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)
}

function rectsToSVG(rects: PackedRect[]): string {
  return rects
    .map((r) => {
      const [cr, cg, cb] = PALETTE[r.colorIndex]!
      return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${toHexColor(cr, cg, cb)}"/>`
    })
    .join('')
}

/**
 * Generate a complete SVG string for an NFA avatar.
 * Uses the same background selection formula as the on-chain renderer.
 */
export function generateAvatarSVG(
  race: number,
  class_: number,
  personality: number,
  talentRarity: number,
): string {
  const bgIndex = (personality * 2 + talentRarity) % BG_COUNT
  const bgRects = BACKGROUND_RECTS[bgIndex] ?? []
  const charRects = CHARACTER_RECTS[race * 6 + class_] ?? []

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" width="512" height="512">' +
    rectsToSVG(bgRects) +
    rectsToSVG(charRects) +
    '</svg>'
  )
}

/**
 * Generate a data URI for use in <img src="...">.
 */
export function generateAvatarDataURI(
  race: number,
  class_: number,
  personality: number,
  talentRarity: number,
): string {
  const svg = generateAvatarSVG(race, class_, personality, talentRarity)
  return 'data:image/svg+xml;base64,' + btoa(svg)
}
