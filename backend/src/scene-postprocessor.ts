import type { StreamResult } from './gm.js'
import type { GameSession } from './session.js'
import type { ServerMessage } from './types.js'

// --- Constants ---

const STAGE_ROOMS: Record<number, string> = {
  1: 'corridor',
  2: 'chamber',
  3: 'crossroads',
  4: 'shrine',
  5: 'boss_room',
}

const FLOOR_ENEMIES: Record<number, string[]> = {
  1: ['slime', 'goblin'],
  2: ['skeleton', 'goblin'],
  3: ['wraith', 'goblin', 'skeleton'],
  4: ['wraith', 'golem'],
  5: ['golem', 'dragon'],
}

const ENEMY_TYPES = new Set([
  'skeleton', 'slime', 'goblin', 'wraith', 'golem', 'dragon',
])

const DEATH_KEYWORDS = /\b(defeat|destroy|kill|slay|collapse|dies|died|slain|vanquish|fall|fallen|perish|消滅|擊敗|死亡|倒下|击败|消灭)\b/i
const EXPLORE_KEYWORDS = /(advance|move|walk|continue|proceed|enter|venture|step|explore|forward|前進|進入|走|繼續|前进|进入|继续|向前|探索|往前|深入)/i
const FLOOR_TRANSITION_KEYWORDS = /\b(floor|descend|next level|deeper|下一層|進入.*層|下一层|进入.*层)\b/i
const COMBAT_START_KEYWORDS = /\b(combat initiated|combat start|ambush|attack|engage|战斗开始|戰鬥開始|進入戰鬥|进入战斗)\b/i

// --- Utility functions ---

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function hasSceneCommand(msgs: ServerMessage[], cmd: string): boolean {
  return msgs.some(
    m => m.type === 'scene' && (m as { command: string }).command === cmd,
  )
}

function hasTagType(msgs: ServerMessage[], type: string): boolean {
  return msgs.some(m => m.type === type)
}

function getEnemyEntities(session: GameSession): string[] {
  return session.sceneEntities.filter(id => {
    const typePart = id.replace(/_\d+$/, '')
    return ENEMY_TYPES.has(typePart)
  })
}

function combatZonePositions(partyPos: [number, number]): [number, number][] {
  const [px, py] = partyPos
  return [
    [clamp(px + 3, 2, 17), clamp(py - 2, 2, 12)],
    [clamp(px - 3, 2, 17), clamp(py - 2, 2, 12)],
  ]
}

function findEnemyPosition(
  result: StreamResult,
  session: GameSession,
): [number, number] {
  // Try to find coordinates from spawn commands in this response
  for (const m of result.messages) {
    if (m.type === 'scene') {
      const sm = m as { type: 'scene'; command: string; args: string[] }
      if (sm.command === 'spawn' && sm.args.length >= 3) {
        const x = parseInt(sm.args[1]!, 10)
        const y = parseInt(sm.args[2]!, 10)
        if (!isNaN(x) && !isNaN(y)) {
          return [clamp(x, 2, 17), clamp(y, 2, 12)]
        }
      }
    }
  }
  // Fallback: offset from party position
  const [px, py] = session.partyPos
  return [clamp(px + 3, 2, 17), clamp(py - 2, 2, 12)]
}

function sceneMsg(command: string, args: string[]): ServerMessage {
  return { type: 'scene', command, args }
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function findMatchingEnemy(rawText: string, entities: string[]): string | null {
  const lower = rawText.toLowerCase()
  for (const id of entities) {
    const typePart = id.replace(/_\d+$/, '')
    if (lower.includes(typePart)) return id
  }
  // If no match, return the first enemy (most likely target)
  return entities[0] ?? null
}

function detectEnemyTypeFromText(rawText: string): string | null {
  const lower = rawText.toLowerCase()
  for (const type of ENEMY_TYPES) {
    if (lower.includes(type)) return type
  }
  return null
}

// --- Main post-processor ---

export function postProcessScene(
  result: StreamResult,
  session: GameSession,
  floor: number,
): ServerMessage[] {
  const injected: ServerMessage[] = []
  const msgs = result.messages
  const rawText = result.rawText
  let skipMoveParty = false

  // Rule 4: Room transition (checked first so it can set skipMoveParty flag)
  if (!hasSceneCommand(msgs, 'set_map')) {
    const hasSysFloor = msgs.some(m => {
      if (m.type !== 'sys') return false
      const text = (m as { type: 'sys'; text: string }).text
      return FLOOR_TRANSITION_KEYWORDS.test(text)
    })

    if (hasSysFloor) {
      const targetRoom = STAGE_ROOMS[floor] || 'chamber'
      if (targetRoom !== session.sceneMap) {
        injected.push(sceneMsg('set_map', [targetRoom]))
        injected.push(sceneMsg('move_party', ['9', '8']))
        skipMoveParty = true
        console.log(`[PostProcessor] Rule 4: set_map:${targetRoom} + move_party:9:8`)
      }
    }
  }

  // Rule 1: Combat effects
  if (
    (hasTagType(msgs, 'dmg') || hasTagType(msgs, 'roll')) &&
    !hasSceneCommand(msgs, 'effect')
  ) {
    // Check if healing (positive HP change in raw text)
    const healMatch = rawText.match(/\[HP:.+?:\+(\d+)\]/)
    if (healMatch) {
      const [px, py] = session.partyPos
      injected.push(sceneMsg('effect', ['heal', String(px), String(py)]))
      console.log(`[PostProcessor] Rule 1: effect:heal:${px}:${py}`)
    } else {
      const [ex, ey] = findEnemyPosition(result, session)
      injected.push(sceneMsg('effect', ['fireball', String(ex), String(ey)]))
      console.log(`[PostProcessor] Rule 1: effect:fireball:${ex}:${ey}`)
    }
  }

  // Rule 2: Enemy death removal
  if (DEATH_KEYWORDS.test(rawText) && !hasSceneCommand(msgs, 'remove')) {
    const enemies = getEnemyEntities(session)
    if (enemies.length > 0) {
      const target = findMatchingEnemy(rawText, enemies)
      if (target) {
        // Find entity position from session (approximate from party offset)
        const [px, py] = session.partyPos
        const ex = clamp(px + 3, 2, 17)
        const ey = clamp(py - 2, 2, 12)
        injected.push(sceneMsg('effect', ['smoke', String(ex), String(ey)]))
        injected.push(sceneMsg('remove', [target]))
        console.log(`[PostProcessor] Rule 2: smoke + remove:${target}`)
      }
    }
  }

  // Auto-clear inCombat when no enemies remain on scene
  if (session.inCombat && getEnemyEntities(session).length === 0) {
    session.inCombat = false
    console.log('[PostProcessor] Auto-cleared inCombat (no enemies remain)')
  }

  // Rule 3: Party movement (exploration only)
  if (
    !skipMoveParty &&
    !hasSceneCommand(msgs, 'move_party') &&
    !hasSceneCommand(msgs, 'set_map') &&
    !session.inCombat &&
    EXPLORE_KEYWORDS.test(rawText)
  ) {
    const [px, py] = session.partyPos
    if (py > 2) {
      injected.push(sceneMsg('move_party', [String(px), String(py - 1)]))
      console.log(`[PostProcessor] Rule 3: move_party:${px}:${py - 1}`)
    }
  }

  // Rule 5: Combat spawn
  if (!hasSceneCommand(msgs, 'spawn')) {
    const hasCombatStart = msgs.some(m => {
      if (m.type !== 'sys') return false
      const text = (m as { type: 'sys'; text: string }).text
      return COMBAT_START_KEYWORDS.test(text)
    })

    if (hasCombatStart && getEnemyEntities(session).length === 0) {
      const detectedType = detectEnemyTypeFromText(rawText)
      const floorEnemies = FLOOR_ENEMIES[floor] || ['slime']
      const positions = combatZonePositions(session.partyPos)

      // Spawn 1-2 enemies
      const count = Math.random() < 0.5 ? 1 : 2
      for (let i = 0; i < count; i++) {
        const type = detectedType || pickRandom(floorEnemies)
        const [x, y] = positions[i]!
        injected.push(sceneMsg('spawn', [type, String(x), String(y)]))
        console.log(`[PostProcessor] Rule 5: spawn:${type}:${x}:${y}`)
      }
    }
  }

  return injected
}
