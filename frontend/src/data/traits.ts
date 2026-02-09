// Race enum → display
export const RACES = ['Human', 'Elf', 'Dwarf', 'Tiefling', 'Beastkin'] as const
export type RaceName = typeof RACES[number]

// Class enum → display
export const CLASSES = ['Warrior', 'Mage', 'Rogue', 'Ranger', 'Cleric', 'Bard'] as const
export type ClassName = typeof CLASSES[number]

// Personality enum → display
export const PERSONALITIES = [
  'Passionate', 'Calm', 'Cunning', 'Kind', 'Dark', 'Cheerful', 'Scholar', 'Silent',
] as const

// Talent rarity enum → display
export const TALENT_RARITIES = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const

export const RARITY_COLORS: Record<string, string> = {
  Common: '#aaa',
  Rare: '#4488ff',
  Epic: '#aa44ff',
  Legendary: '#ffaa00',
  Mythic: '#ff4444',
}

// Stat names
export const STAT_NAMES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const

// Race stat bonuses (applied on top of base stats for display)
export const RACE_BONUSES: Record<number, number[]> = {
  0: [0, 0, 0, 0, 0, 0],  // Human — balanced
  1: [0, 2, 0, 1, 0, 0],  // Elf — +DEX, +INT
  2: [1, 0, 2, 0, 0, 0],  // Dwarf — +STR, +CON
  3: [0, 0, 0, 1, 0, 2],  // Tiefling — +INT, +CHA
  4: [2, 1, 0, 0, 0, 0],  // Beastkin — +STR, +DEX
}

// Talent names (30 talents)
export const TALENTS = [
  'Iron Will', 'Quick Draw', 'Mana Surge', 'Shadow Step', 'Battle Cry',
  'Arcane Shield', 'Poison Blade', 'Healing Touch', 'Eagle Eye', 'Stone Skin',
  'Fire Breath', 'Frost Nova', 'Lightning Reflexes', 'Dark Pact', 'Holy Light',
  'Beast Form', 'Time Warp', 'Blood Rage', 'Wind Walk', 'Earth Shatter',
  'Spirit Link', 'Void Step', 'Solar Flare', 'Lunar Blessing', 'Thorn Armor',
  'Chain Lightning', 'Death Grip', 'Life Drain', 'Mirror Image', 'Berserker Rage',
] as const

// Safe accessors for template use (avoids TS strict undefined errors)
export function raceName(id: number): string { return RACES[id] ?? 'Unknown' }
export function className(id: number): string { return CLASSES[id] ?? 'Unknown' }
export function personalityName(id: number): string { return PERSONALITIES[id] ?? 'Unknown' }
export function talentName(id: number): string { return TALENTS[id] ?? 'Unknown' }
export function rarityName(id: number): string { return TALENT_RARITIES[id] ?? 'Common' }
export function rarityColor(id: number): string { return RARITY_COLORS[rarityName(id)] ?? '#aaa' }

// Helper: get display-friendly NFA summary
export function traitSummary(race: number, class_: number, personality: number) {
  return `${raceName(race)} ${className(class_)} — ${personalityName(personality)}`
}

// Compute effective stats with race bonus
export function effectiveStats(baseStats: number[], race: number): number[] {
  const bonus = RACE_BONUSES[race] ?? RACE_BONUSES[0]!
  return baseStats.map((s, i) => s + (bonus[i] ?? 0))
}

// Compute HP from CON + level
export function computeHP(con: number, level: number): number {
  return con * 3 + level * 5
}

// Compute max HP
export function computeMaxHP(con: number, level: number): number {
  return computeHP(con, level)
}
