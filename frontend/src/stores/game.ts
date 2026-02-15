import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { useNFAStore } from './nfa'
import { useGameWS, type ServerMessage, type HPUpdate } from '../composables/useGameWS'
import { useI18n } from '../i18n'
import { useSound } from '../composables/useSound'
import { getStageById, unlockStage } from '../data/stages'
import { isWalkable, findNearestWalkable } from '../data/maps'

// Cumulative XP thresholds per level (must match contract _xpThresholds)
const XP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000]

export interface LogEntry {
  type: 'sys' | 'gm' | 'nfa' | 'player' | 'roll' | 'dmg'
  text: string
  name?: string
}

export interface PartyMember {
  name: string
  level: number
  className: string
  hp: number
  maxHp: number
  isCharacter?: boolean
}

export interface SceneEntity {
  id: string           // 'skeleton_1', 'player'
  type: string         // 'skeleton', 'slime', 'player', 'chest', 'door', 'npc'
  x: number; y: number // tile coordinates
  state?: string       // 'idle', 'open', 'dead'
  targetX?: number; targetY?: number  // movement animation target
  hitTime?: number     // performance.now() of last hit (for flash animation)
  removing?: boolean   // true = death fade in progress
  traits?: { race: number; class_: number; personality: number; talentRarity: number }
  hp?: number; maxHp?: number // enemy HP for health bar display
}

// Default HP by enemy type
const ENEMY_HP: Record<string, number> = {
  slime: 20, skeleton: 30, goblin: 25, wraith: 35, golem: 60, dragon: 100,
}

export interface VisualEffect {
  type: string         // 'fireball', 'heal', 'damage_flash', 'shake', 'floating_number', etc.
  x: number; y: number
  startTime: number
  duration: number
  value?: string       // for floating numbers
  color?: string       // effect color override
}

// Formation offsets (tile coords relative to leader)
const PARTY_FORMATION: [number, number][] = [[0, 0], [1, 1], [-1, 1], [2, 0]]

export const useGameStore = defineStore('game', () => {
  const nfaStore = useNFAStore()
  const gameWS = useGameWS()
  const { locale } = useI18n()
  const sound = useSound()

  const log = ref<LogEntry[]>([])
  const choices = ref<string[]>([])
  const initializing = ref(false)
  const gameOver = ref(false)
  const floorCleared = ref(false)
  const victory = ref(false)
  const currentFloor = ref(1)
  const partyHP = ref<Map<string, { hp: number; maxHp: number }>>(new Map())

  // XP / Leveling
  const xp = ref(0)
  const level = ref(1)
  const xpToNext = computed(() => level.value * 100)

  // --- Scene state ---
  const currentMap = ref<string>('chamber')
  const sceneEntities = ref<SceneEntity[]>([])
  const activeEffects = ref<VisualEffect[]>([])

  // Auto-increment counters for entity IDs from GM
  let entityCounter = 0

  // Party with live HP from server (both hp and maxHp)
  const party = computed<PartyMember[]>(() =>
    nfaStore.partyMembers.map(m => {
      const hp = partyHP.value.get(m.name)
      return hp ? { ...m, hp: hp.hp, maxHp: hp.maxHp } : m
    })
  )

  const streaming = computed(() => gameWS.streaming.value)

  function addMessage(type: LogEntry['type'], text: string, name?: string) {
    log.value.push({ type, text, name })
  }

  function applyHPUpdates(updates: HPUpdate[]) {
    for (const u of updates) {
      partyHP.value.set(u.name, { hp: u.hp, maxHp: u.maxHp })
    }
    // Trigger reactivity
    partyHP.value = new Map(partyHP.value)
    // Check party wipe
    checkPartyWipe()
  }

  function checkPartyWipe() {
    if (partyHP.value.size === 0) return
    for (const [, hp] of partyHP.value) {
      if (hp.hp > 0) return
    }
    gameOver.value = true
    sound.gameOver()
  }

  function addXP(amount: number) {
    xp.value += amount
    sound.xpGain()
    addMessage('sys', `— +${amount} XP —`)
    // Check level up
    while (xp.value >= xpToNext.value) {
      xp.value -= xpToNext.value
      level.value++
      sound.levelUp()
      addMessage('sys', `— LEVEL UP! Party is now Level ${level.value} —`)
      // Heal party on level up (+5 max HP)
      for (const [name, hp] of partyHP.value) {
        const newMax = hp.maxHp + 5
        partyHP.value.set(name, { hp: newMax, maxHp: newMax })
      }
      partyHP.value = new Map(partyHP.value)
      addEffect('victory_flash', 0, 0, 800)
    }
  }

  // --- Scene command handlers ---

  function handleSceneCommand(command: string, args: string[]) {
    switch (command) {
      case 'set_map': {
        const newMap = args[0] || 'chamber'
        // Fade out → switch map → fade in
        addEffect('map_fade_out', 0, 0, 300)
        setTimeout(() => {
          currentMap.value = newMap
          // Keep all party_* entities, remove everything else
          // Snap positions to walkable tiles on the new map
          sceneEntities.value = sceneEntities.value
            .filter(e => e.id.startsWith('party_'))
            .map(e => {
              const [nx, ny] = findNearestWalkable(newMap, e.x, e.y)
              return { ...e, x: nx, y: ny, targetX: undefined, targetY: undefined }
            })
          addEffect('map_fade_in', 0, 0, 300)
        }, 300)
        break
      }

      case 'spawn': {
        const type = args[0] || 'skeleton'
        let x = parseInt(args[1] || '0', 10)
        let y = parseInt(args[2] || '0', 10)
        // Clamp and snap to walkable tile
        const [sx, sy] = findNearestWalkable(currentMap.value, x, y)
        x = sx; y = sy
        entityCounter++
        const id = `${type}_${entityCounter}`
        const baseHp = ENEMY_HP[type]
        const floorScale = 1 + (currentFloor.value - 1) * 0.3
        const hp = baseHp ? Math.round(baseHp * floorScale) : undefined
        sceneEntities.value = [...sceneEntities.value, { id, type, x, y, state: 'idle', hp, maxHp: hp }]
        break
      }

      case 'move': {
        const entityId = args[0] || ''
        const rawX = parseInt(args[1] || '0', 10)
        const rawY = parseInt(args[2] || '0', 10)
        const [tx, ty] = findNearestWalkable(currentMap.value, rawX, rawY)
        sceneEntities.value = sceneEntities.value.map(e =>
          e.id === entityId ? { ...e, targetX: tx, targetY: ty } : e
        )
        break
      }

      case 'remove': {
        const removeId = args[0] || ''
        const entity = sceneEntities.value.find(e => e.id === removeId)
        if (entity) {
          addEffect('smoke', entity.x, entity.y, 500)
          // Mark as removing for death fade animation
          sceneEntities.value = sceneEntities.value.map(e =>
            e.id === removeId ? { ...e, removing: true, hitTime: performance.now() } : e
          )
          // Actually remove after fade
          setTimeout(() => {
            sceneEntities.value = sceneEntities.value.filter(e => e.id !== removeId)
          }, 400)
        } else {
          sceneEntities.value = sceneEntities.value.filter(e => e.id !== removeId)
        }
        break
      }

      case 'interact': {
        const intId = args[0] || ''
        const action = args[1] || 'open'
        sceneEntities.value = sceneEntities.value.map(e =>
          e.id === intId ? { ...e, state: action } : e
        )
        break
      }

      case 'effect': {
        const effectType = args[0] || 'fireball'
        const ex = parseInt(args[1] || '0', 10)
        const ey = parseInt(args[2] || '0', 10)
        const durations: Record<string, number> = {
          fireball: 600, heal: 500, lightning: 200, smoke: 500, explosion: 600,
        }
        addEffect(effectType, ex, ey, durations[effectType] || 500)
        // Mark entity at this position as "hit" for flash animation
        const hitEntity = sceneEntities.value.find(e =>
          !e.id.startsWith('party_') && Math.abs(e.x - ex) <= 1 && Math.abs(e.y - ey) <= 1
        )
        if (hitEntity) {
          // Reduce enemy HP on hit (estimate damage as ~25% of maxHp per hit)
          let newHp = hitEntity.hp
          if (hitEntity.hp != null && hitEntity.maxHp != null) {
            const dmg = Math.max(1, Math.round(hitEntity.maxHp * 0.25))
            newHp = Math.max(0, hitEntity.hp - dmg)
          }
          sceneEntities.value = sceneEntities.value.map(e =>
            e.id === hitEntity.id ? { ...e, hitTime: performance.now(), hp: newHp } : e
          )
        }
        break
      }

      case 'move_party': {
        const rawPx = parseInt(args[0] || '9', 10)
        const rawPy = parseInt(args[1] || '8', 10)
        const map = currentMap.value
        // Snap leader to nearest walkable tile
        const [px, py] = findNearestWalkable(map, rawPx, rawPy)
        const members = nfaStore.partyMembers
        const existing = sceneEntities.value.find(e => e.id === 'party_0')

        // Find a valid walkable position for each member's formation offset
        function resolvePos(ox: number, oy: number): [number, number] {
          const tx = px + ox, ty = py + oy
          if (isWalkable(map, tx, ty)) return [tx, ty]
          const fallbacks: [number, number][] = [[1,0],[-1,0],[0,-1],[0,1],[2,0],[-2,0]]
          for (const [fx, fy] of fallbacks) {
            if (isWalkable(map, px + fx, py + fy)) return [px + fx, py + fy]
          }
          return [px, py] // last resort: same as leader
        }

        if (existing) {
          sceneEntities.value = sceneEntities.value.map(e => {
            if (!e.id.startsWith('party_')) return e
            const idx = parseInt(e.id.split('_')[1] ?? '0', 10)
            const [ox, oy] = PARTY_FORMATION[idx] ?? [0, 0]
            const [tx, ty] = idx === 0 ? [px, py] : resolvePos(ox, oy)
            return { ...e, targetX: tx, targetY: ty }
          })
        } else {
          // Get NFA trait data for avatar rendering
          const nfaParty = nfaStore.party
          const partyEntities: SceneEntity[] = members.map((m, i) => {
            const [ox, oy] = PARTY_FORMATION[i] ?? [0, 0]
            const [ex, ey] = i === 0 ? [px, py] : resolvePos(ox, oy)
            const nfa = nfaParty[i]
            return {
              id: `party_${i}`,
              type: m.isCharacter ? 'player' : 'companion',
              x: ex, y: ey,
              traits: nfa ? { race: nfa.traits.race, class_: nfa.traits.class_, personality: nfa.traits.personality, talentRarity: nfa.traits.talentRarity } : undefined,
            }
          })
          sceneEntities.value = [...sceneEntities.value, ...partyEntities]
        }
        break
      }
    }
  }

  function addEffect(type: string, x: number, y: number, duration: number, value?: string, color?: string) {
    const effect: VisualEffect = { type, x, y, startTime: performance.now(), duration, value, color }
    activeEffects.value = [...activeEffects.value, effect]
    // Auto-remove after duration (use toRaw to compare through Vue proxies)
    setTimeout(() => {
      activeEffects.value = activeEffects.value.filter(e => toRaw(e) !== effect)
    }, duration)
  }

  // --- Auto-effects based on message types ---

  function triggerAutoEffects(msg: ServerMessage) {
    if (msg.type === 'dmg') {
      // Remove existing flash to prevent red overlay stacking
      activeEffects.value = activeEffects.value.filter(e => e.type !== 'damage_flash')
      addEffect('damage_flash', 0, 0, 300)
      addEffect('shake', 0, 0, 400)
      sound.damage()
    }

    if (msg.type === 'hp_update') {
      const updates = (msg as { type: 'hp_update'; updates: HPUpdate[] }).updates
      for (const u of updates) {
        const prev = partyHP.value.get(u.name)
        if (prev) {
          const delta = u.hp - prev.hp
          const partyEntity = sceneEntities.value.find(e => e.id === 'party_0')
          const ex = partyEntity?.x ?? 9
          const ey = partyEntity?.y ?? 8
          if (delta < 0) {
            addEffect('floating_number', ex, ey, 800, `${delta}`, '#ff4444')
          } else if (delta > 0) {
            addEffect('floating_number', ex, ey, 800, `+${delta}`, '#44ff44')
            addEffect('heal_glow', ex, ey, 500)
            sound.heal()
          }
        }
      }
    }

    if (msg.type === 'sys') {
      const text = (msg as { type: 'sys'; text: string }).text.toLowerCase()
      if (text.includes('combat')) {
        // Remove any existing combat_tint to prevent red overlay stacking
        activeEffects.value = activeEffects.value.filter(e => e.type !== 'combat_tint')
        addEffect('combat_tint', 0, 0, 2000)
        sound.attack()
      }
      if (text.includes('victory')) {
        addEffect('victory_flash', 0, 0, 800)
        sound.victory()
      }
      // Floor cleared detection
      if (text.includes('floor cleared') || text.includes('floor complete') ||
          text.includes('楼层通关') || text.includes('樓層通關') || text.includes('通关')) {
        onFloorCleared()
      }
    }

    if (msg.type === 'roll') {
      addEffect('dice_icon', 10, 4, 600)
      sound.roll()
    }

    if (msg.type === 'scene') {
      const cmd = (msg as { type: 'scene'; command: string }).command
      if (cmd === 'interact') sound.door()
    }
  }

  function handleServerMessage(msg: ServerMessage) {
    // Trigger visual auto-effects before processing
    triggerAutoEffects(msg)

    switch (msg.type) {
      case 'stream_start':
        break
      case 'gm':
        addMessage('gm', msg.text)
        break
      case 'nfa':
        addMessage('nfa', (msg as { type: 'nfa'; name: string; text: string }).text, (msg as { type: 'nfa'; name: string; text: string }).name)
        break
      case 'roll':
        addMessage('roll', msg.text)
        break
      case 'dmg':
        addMessage('dmg', msg.text)
        break
      case 'sys':
        addMessage('sys', msg.text)
        break
      case 'hp_update':
        applyHPUpdates((msg as { type: 'hp_update'; updates: HPUpdate[] }).updates)
        break
      case 'scene':
        handleSceneCommand(
          (msg as { type: 'scene'; command: string; args: string[] }).command,
          (msg as { type: 'scene'; command: string; args: string[] }).args,
        )
        break
      case 'choices':
        choices.value = (msg as { type: 'choices'; options: string[] }).options
        break
      case 'xp_gain':
        addXP((msg as { type: 'xp_gain'; amount: number }).amount)
        break
      case 'stream_end':
        if (initializing.value) initializing.value = false
        break
      case 'error':
        addMessage('sys', `Error: ${msg.text}`)
        break
    }
  }

  /** Connect WS and start the dungeon session */
  async function startSession(stageId: number = 1) {
    const stage = getStageById(stageId)
    const startRoom = stage?.startRoom ?? 'chamber'
    const floor = stage?.id ?? 1

    log.value = []
    partyHP.value = new Map()
    sceneEntities.value = []
    activeEffects.value = []
    currentMap.value = startRoom
    entityCounter = 0
    initializing.value = true
    gameOver.value = false
    floorCleared.value = false
    victory.value = false
    currentFloor.value = floor

    // Load on-chain XP/level from the character NFA
    const charNFA = nfaStore.selectedNFA
    if (charNFA && charNFA.progression.level > 0) {
      level.value = charNFA.progression.level
      const prevThreshold = XP_THRESHOLDS[level.value - 1] ?? 0
      xp.value = charNFA.progression.xp - prevThreshold
    } else {
      xp.value = 0
      level.value = 1
    }

    // Initialize HP from party members
    for (const m of nfaStore.partyMembers) {
      partyHP.value.set(m.name, { hp: m.hp, maxHp: m.maxHp })
    }

    const names = nfaStore.partyMembers.map(m => m.name).join(', ')
    addMessage('sys', `— Party formed: ${names} —`)
    addMessage('sys', '— Connecting to Dungeon Terminal... —')

    // Set up WS message handler + close handler for auto-exit
    gameWS.setMessageHandler(handleServerMessage)
    gameWS.setCloseHandler(() => {
      // Server disconnected during gameplay — exit to menu
      addMessage('sys', '— Server disconnected —')
      nfaStore.clearParty()
      retryGame()
    })

    try {
      await gameWS.connect()
      // Send init with full party traits + stage info
      gameWS.sendInit(nfaStore.initParty, locale.value, floor, stage?.nameKey)
    } catch {
      initializing.value = false
      addMessage('sys', '— Connection failed. Using offline mode. —')
      // Fallback: add some hardcoded opening text
      addMessage('gm', 'The passage opens into a vast underground chamber. Ancient pillars line the way forward.')
      addMessage('gm', 'What do you do?')
      // Place party in default position with walkable formation
      const nfaPartyFallback = nfaStore.party
      sceneEntities.value = nfaStore.partyMembers.map((m, i) => {
        const [ox, oy] = PARTY_FORMATION[i] ?? [0, 0]
        let ex = 9 + ox, ey = 8 + oy
        if (i > 0 && !isWalkable(startRoom, ex, ey)) {
          const fallbacks: [number, number][] = [[1,0],[-1,0],[0,-1],[0,1]]
          for (const [fx, fy] of fallbacks) {
            if (isWalkable(startRoom, 9 + fx, 8 + fy)) { ex = 9 + fx; ey = 8 + fy; break }
          }
        }
        const nfa = nfaPartyFallback[i]
        return {
          id: `party_${i}`, type: m.isCharacter ? 'player' : 'companion', x: ex, y: ey,
          traits: nfa ? { race: nfa.traits.race, class_: nfa.traits.class_, personality: nfa.traits.personality, talentRarity: nfa.traits.talentRarity } : undefined,
        }
      })
    }
  }

  function sendCommand(text: string) {
    if (!text.trim()) return
    choices.value = []
    addMessage('player', text)

    if (gameWS.connected.value) {
      // Send current HP state so backend stays in sync with frontend level-ups
      const hpState: Record<string, { hp: number; maxHp: number }> = {}
      for (const [name, hp] of partyHP.value) {
        hpState[name] = { hp: hp.hp, maxHp: hp.maxHp }
      }
      gameWS.sendCommand(text, hpState)
    } else {
      addMessage('sys', '— Not connected to server. —')
    }
  }

  function onFloorCleared() {
    const floor = currentFloor.value
    // Unlock next stage
    unlockStage(floor + 1)
    addEffect('victory_flash', 0, 0, 1200)
    sound.victory()

    if (floor >= 5) {
      // Final floor — full victory
      victory.value = true
    } else {
      floorCleared.value = true
    }
  }

  function continueNextFloor() {
    floorCleared.value = false
    activeEffects.value = []
    currentFloor.value++
    // Tell the AI GM to advance to next floor
    sendCommand(`[Advance to Floor ${currentFloor.value}]`)
  }

  function retryGame() {
    gameOver.value = false
    floorCleared.value = false
    victory.value = false
    activeEffects.value = []
    cleanup()
  }

  function cleanup() {
    gameWS.setCloseHandler(null)
    gameWS.disconnect()
  }

  return {
    log, party, streaming, choices, initializing, gameOver, floorCleared, victory, currentFloor,
    xp, level, xpToNext,
    currentMap, sceneEntities, activeEffects,
    sound,
    addMessage, sendCommand, startSession, continueNextFloor, retryGame, cleanup,
  }
})
