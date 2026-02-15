import type { InitPartyMember, ConversationMessage, HPUpdate } from './types.js'

const MAX_HISTORY = 50
const STALE_MS = 30 * 60 * 1000 // 30 minutes

export class GameSession {
  party: InitPartyMember[]
  partyHP: Map<string, { hp: number; maxHp: number }>
  conversationHistory: ConversationMessage[]
  floor: number
  inCombat: boolean
  locale: string
  stageName?: string
  cliSessionId?: string
  lastActivity: number

  // Scene state tracking (mirrors frontend visual state)
  sceneMap: string
  sceneEntities: string[] = []
  partyPos: [number, number] = [9, 8]

  // Blockchain XP accumulator
  tokenIds: number[]
  pendingXP: Map<number, number>

  // Adventure tracking (per-floor stats, flushed on floor clear/defeat/disconnect)
  killCount: number = 0
  floorXPEarned: number = 0

  constructor(party: InitPartyMember[], locale?: string, floor?: number, stageName?: string) {
    this.party = party
    this.locale = locale || 'en'
    this.partyHP = new Map()
    this.conversationHistory = []
    this.floor = floor || 1
    this.inCombat = false
    this.stageName = stageName
    this.sceneMap = 'chamber'
    this.lastActivity = Date.now()

    // Initialize blockchain XP tracking
    this.tokenIds = party.map(m => m.tokenId).filter(id => id > 0)
    this.pendingXP = new Map()

    // Initialize HP from party data
    for (const m of party) {
      this.partyHP.set(m.name, { hp: m.hp, maxHp: m.maxHp })
    }
  }

  accumulateXP(amount: number): void {
    for (const tokenId of this.tokenIds) {
      const current = this.pendingXP.get(tokenId) || 0
      this.pendingXP.set(tokenId, current + amount)
    }
    this.floorXPEarned += amount
  }

  flushPendingXP(): { tokenId: number; amount: number }[] {
    const grants: { tokenId: number; amount: number }[] = []
    for (const [tokenId, amount] of this.pendingXP) {
      if (amount > 0) {
        grants.push({ tokenId, amount })
      }
    }
    this.pendingXP.clear()
    return grants
  }

  updateScene(command: string, args: string[]): void {
    switch (command) {
      case 'set_map':
        this.sceneMap = args[0] || 'chamber'
        this.sceneEntities = []
        break
      case 'spawn': {
        const type = args[0] || 'entity'
        const count = this.sceneEntities.filter(id => id.startsWith(type + '_')).length
        this.sceneEntities.push(`${type}_${count + 1}`)
        break
      }
      case 'remove': {
        const removeId = args[0] || ''
        // Only count enemy kills, not NPC/chest/door removes
        const ENEMY_TYPES = ['skeleton', 'slime', 'goblin', 'wraith', 'golem', 'dragon']
        const entityType = removeId.replace(/_\d+$/, '')
        if (ENEMY_TYPES.includes(entityType)) {
          this.killCount++
        }
        this.sceneEntities = this.sceneEntities.filter(id => id !== removeId)
        break
      }
      case 'move_party':
        this.partyPos = [parseInt(args[0] || '9', 10), parseInt(args[1] || '8', 10)]
        break
    }
  }

  getSceneContext(): string {
    const entities = this.sceneEntities.length > 0
      ? this.sceneEntities.join(', ')
      : 'none'
    return `[Scene: map=${this.sceneMap}, entities=[${entities}], party=(${this.partyPos[0]},${this.partyPos[1]})]`
  }

  getHPContext(): string {
    const parts: string[] = []
    for (const [name, hp] of this.partyHP) {
      parts.push(`${name}: ${hp.hp}/${hp.maxHp}`)
    }
    return `[HP Status: ${parts.join(', ')}]`
  }

  getFullContext(): string {
    return `${this.getSceneContext()}\n${this.getHPContext()}`
  }

  applyHP(name: string, delta: number): HPUpdate | null {
    let entry = this.partyHP.get(name)

    // Resolve generic "player" to actual player character name
    if (!entry && name.toLowerCase() === 'player') {
      const pc = this.party.find(m => m.isCharacter)
      if (pc) {
        entry = this.partyHP.get(pc.name)
        if (entry) name = pc.name
      }
    }

    // Fuzzy match: try partial name matching (e.g. "兽族" matches "兽族 #1")
    if (!entry) {
      for (const [memberName, hp] of this.partyHP) {
        if (memberName.includes(name) || name.includes(memberName)) {
          entry = hp
          name = memberName
          break
        }
      }
    }

    if (!entry) return null

    entry.hp = Math.max(0, Math.min(entry.maxHp, entry.hp + delta))
    return { name, hp: entry.hp, maxHp: entry.maxHp }
  }

  addUserMessage(text: string): void {
    this.conversationHistory.push({ role: 'user', content: text })
    this.trimHistory()
    this.touch()
  }

  addAssistantMessage(text: string): void {
    this.conversationHistory.push({ role: 'assistant', content: text })
    this.trimHistory()
    this.touch()
  }

  private trimHistory(): void {
    if (this.conversationHistory.length > MAX_HISTORY) {
      // Keep the most recent messages, trim oldest
      this.conversationHistory = this.conversationHistory.slice(-MAX_HISTORY)
    }
  }

  touch(): void {
    this.lastActivity = Date.now()
  }

  isStale(): boolean {
    return Date.now() - this.lastActivity > STALE_MS
  }

  getAdventureData(floor: number, result: number): {
    tokenIds: number[]
    floor: number
    result: number
    xpEarned: number
    killCount: number
  } {
    return {
      tokenIds: this.tokenIds,
      floor,
      result,
      xpEarned: this.floorXPEarned,
      killCount: this.killCount,
    }
  }

  resetFloorTracking(): void {
    this.killCount = 0
    this.floorXPEarned = 0
  }
}
