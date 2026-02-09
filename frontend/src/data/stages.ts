export interface DungeonStage {
  id: number              // floor number (1-based)
  chapter: string         // "Chapter I"
  name: string            // stage name (i18n key)
  description: string     // story description (i18n key)
  difficulty: number      // 1-5 stars
  startRoom: string       // maps.ts room type
  enemies: string[]       // main enemy types (i18n keys, display only)
  boss: string            // boss name (localized)
  unlocked: boolean       // whether unlocked (filled by getStages)
}

interface StageDefinition {
  id: number
  chapter: string
  nameKey: string
  descKey: string
  difficulty: number
  startRoom: string
  enemyKeys: string[]
  bossKey: string
}

const STAGE_DEFS: StageDefinition[] = [
  {
    id: 1,
    chapter: 'I',
    nameKey: 'stage1Name',
    descKey: 'stage1Desc',
    difficulty: 1,
    startRoom: 'corridor',
    enemyKeys: ['enemySlime', 'enemySkeleton'],
    bossKey: 'boss1Name',
  },
  {
    id: 2,
    chapter: 'II',
    nameKey: 'stage2Name',
    descKey: 'stage2Desc',
    difficulty: 2,
    startRoom: 'chamber',
    enemyKeys: ['enemySkeleton', 'enemyWraith'],
    bossKey: 'boss2Name',
  },
  {
    id: 3,
    chapter: 'III',
    nameKey: 'stage3Name',
    descKey: 'stage3Desc',
    difficulty: 3,
    startRoom: 'crossroads',
    enemyKeys: ['enemyGoblin', 'enemyWraith'],
    bossKey: 'boss3Name',
  },
  {
    id: 4,
    chapter: 'IV',
    nameKey: 'stage4Name',
    descKey: 'stage4Desc',
    difficulty: 4,
    startRoom: 'shrine',
    enemyKeys: ['enemyWraith', 'enemyGolem'],
    bossKey: 'boss4Name',
  },
  {
    id: 5,
    chapter: 'V',
    nameKey: 'stage5Name',
    descKey: 'stage5Desc',
    difficulty: 5,
    startRoom: 'boss_room',
    enemyKeys: ['enemyGolem', 'enemyDragon'],
    bossKey: 'boss5Name',
  },
]

const STORAGE_KEY = 'dungeon_progress'

function getMaxUnlocked(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? parseInt(v, 10) || 1 : 1
  } catch {
    return 1
  }
}

function setMaxUnlocked(floor: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(floor))
  } catch { /* ignore */ }
}

export function getStages(t: Record<string, unknown>): DungeonStage[] {
  const maxUnlocked = getMaxUnlocked()
  return STAGE_DEFS.map(def => ({
    id: def.id,
    chapter: def.chapter,
    name: (t as Record<string, string>)[def.nameKey] ?? def.nameKey,
    description: (t as Record<string, string>)[def.descKey] ?? def.descKey,
    difficulty: def.difficulty,
    startRoom: def.startRoom,
    enemies: def.enemyKeys.map(k => (t as Record<string, string>)[k] ?? k),
    boss: (t as Record<string, string>)[def.bossKey] ?? def.bossKey,
    unlocked: def.id <= maxUnlocked,
  }))
}

export function unlockStage(id: number): void {
  const current = getMaxUnlocked()
  if (id > current) {
    setMaxUnlocked(id)
  }
}

export function getStageById(id: number): StageDefinition | undefined {
  return STAGE_DEFS.find(s => s.id === id)
}
