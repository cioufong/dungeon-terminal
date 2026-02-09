// Room template definitions for the dungeon scene engine

export interface RoomTemplate {
  tiles: string[]                       // 20×15 tile grid
  torches: { x: number; y: number }[]   // torch/light source positions
  name: string                          // display name
}

// Legend:
//  w = wall, W = wall top, T = torch (on wall), . = dark/void
//  s = stone floor, S = stone floor alt, c = carpet, p = pillar
//  d = door, x = chest, v = stairs, ~ = water

export const ROOM_TEMPLATES: Record<string, RoomTemplate> = {
  // --- Chamber: the original default room (extracted from usePixelMap) ---
  chamber: {
    name: 'Stone Chamber',
    tiles: [
      'wwTwwwwwwwwwwwwwwTww',
      'WWWWWWWWWWWWWWWWWWWW',
      'w.ssSssspSsSsssSs.w',
      'w.sscccccccccccss.w',
      'w.sscccccccccccss.w',
      'w.ssSSSSSSSSSSSss.w',
      'w.ssssssssssssssss.w',
      'wTsp..sssssss..psTw',
      'w.ss..sssssss..ss.w',
      'w.ssssssssssssssss.w',
      'w.sxsssssvssssxss.w',
      'w.ssssss~~ssssssss.w',
      'wTsssssd~~dssssssTw',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
    ],
    torches: [
      { x: 2, y: 0 }, { x: 17, y: 0 },
      { x: 1, y: 7 }, { x: 18, y: 7 },
      { x: 1, y: 12 }, { x: 18, y: 12 },
    ],
  },

  // --- Corridor: narrow linear passage ---
  corridor: {
    name: 'Dark Corridor',
    tiles: [
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwTwwwwwTwwwTwwwwTww',
      'WWWWWWWWWWWWWWWWWWwW',
      'w.ssssssssssssssss.w',
      'dsssSssssSssssSsssd',
      'w.ssssssssssssssss.w',
      'WWWWWWWWWWWWWWWWWWwW',
      'wwTwwwwwTwwwTwwwwTww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
    ],
    torches: [
      { x: 2, y: 4 }, { x: 8, y: 4 },
      { x: 11, y: 4 }, { x: 17, y: 4 },
      { x: 2, y: 10 }, { x: 8, y: 10 },
      { x: 11, y: 10 }, { x: 17, y: 10 },
    ],
  },

  // --- Treasure Room: ornate with carpet and chests ---
  treasure_room: {
    name: 'Treasure Vault',
    tiles: [
      'wwTwwwwwTwwwTwwwwTww',
      'WWWWWWWWWWWWWWWWWWWW',
      'w.ssssssssssssssss.w',
      'w.sxccccccccccccxs.w',
      'w.sccccccccccccccss.w',
      'w.sccccccccccccccss.w',
      'w.sccccccccccccccs.w',
      'wTspccccccccccccpsTw',
      'w.sccccccccccccccs.w',
      'w.sccccccccccccccss.w',
      'w.sccccccccccccccss.w',
      'w.sxccccccccccccxs.w',
      'wTsssssssddssssssTw',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
    ],
    torches: [
      { x: 2, y: 0 }, { x: 8, y: 0 },
      { x: 11, y: 0 }, { x: 17, y: 0 },
      { x: 1, y: 7 }, { x: 18, y: 7 },
      { x: 1, y: 12 }, { x: 18, y: 12 },
    ],
  },

  // --- Boss Room: large open arena with pillars ---
  boss_room: {
    name: 'Boss Arena',
    tiles: [
      'wwTwwwwwwwwwwwwwwTww',
      'WWWWWWWWWWWWWWWWWWWW',
      'w.ssssssssssssssss.w',
      'w.sspsssssssssspss.w',
      'w.ssssssssssssssss.w',
      'w.ssssssssssssssss.w',
      'w.ssssssssssssssss.w',
      'wTsssssssssssssssTw',
      'w.ssssssssssssssss.w',
      'w.ssssssssssssssss.w',
      'w.ssssssssssssssss.w',
      'w.sspsssssssssspss.w',
      'wTsssssssddssssssTw',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
    ],
    torches: [
      { x: 2, y: 0 }, { x: 17, y: 0 },
      { x: 1, y: 7 }, { x: 18, y: 7 },
      { x: 1, y: 12 }, { x: 18, y: 12 },
    ],
  },

  // --- Crossroads: four-way intersection ---
  crossroads: {
    name: 'Crossroads',
    tiles: [
      'wwwwwwwwddsswwwwwwww',
      'wwwwwwwwssssswwwwwww',
      'wwwwwwwTsssssTwwwwww',
      'wwwwwwwWssssswwwwwww',
      'wwTwwwwwssssswwwwTww',
      'WWWWWWWWssssWWWWWWWW',
      'dsssssssssssssssssd',
      'ssssSsssSssSssssSss',
      'dsssssssssssssssssd',
      'WWWWWWWWssssWWWWWWWW',
      'wwTwwwwwssssswwwwTww',
      'wwwwwwwWssssswwwwwww',
      'wwwwwwwTsssssTwwwwww',
      'wwwwwwwwssssswwwwwww',
      'wwwwwwwwddsswwwwwwww',
    ],
    torches: [
      { x: 7, y: 2 }, { x: 12, y: 2 },
      { x: 2, y: 4 }, { x: 17, y: 4 },
      { x: 2, y: 10 }, { x: 17, y: 10 },
      { x: 7, y: 12 }, { x: 12, y: 12 },
    ],
  },

  // --- Shrine: healing sanctuary with water pool ---
  shrine: {
    name: 'Ancient Shrine',
    tiles: [
      'wwTwwwwwwwwwwwwwwTww',
      'WWWWWWWWWWWWWWWWWWWW',
      'w.ssssssssssssssss.w',
      'w.sspsssSSSSSsspss.w',
      'w.ssssSSSSSSSSssss.w',
      'w.ssSS~~SS~~SSSss.w',
      'w.ssSSS~~SS~~SSSss.w',
      'wTspSSSS~~~~SSSpsTw',
      'w.ssSSS~~SS~~SSSss.w',
      'w.ssSS~~SS~~SSSss.w',
      'w.ssssSSSSSSSSssss.w',
      'w.sspsssSSSSSsspss.w',
      'wTsssssssddssssssTw',
      'wwwwwwwwwwwwwwwwwwww',
      'wwwwwwwwwwwwwwwwwwww',
    ],
    torches: [
      { x: 2, y: 0 }, { x: 17, y: 0 },
      { x: 1, y: 7 }, { x: 18, y: 7 },
      { x: 1, y: 12 }, { x: 18, y: 12 },
    ],
  },
}

export function getRoom(id: string): RoomTemplate {
  return ROOM_TEMPLATES[id] ?? ROOM_TEMPLATES['chamber']!
}

// Walkable tile characters (floor-like tiles entities can stand on)
const WALKABLE = new Set(['s', 'S', 'c', 'd', 'v', 'p', 'x'])

export function isWalkable(mapId: string, x: number, y: number): boolean {
  const room = getRoom(mapId)
  const ch = (room.tiles[y] || '')[x] || 'w'
  return WALKABLE.has(ch)
}
