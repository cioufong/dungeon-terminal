// --- NFA trait data (mirrors smart contract enums) ---

export interface NFATraitData {
  race: number        // 0-4: Human, Elf, Dwarf, Tiefling, Beastkin
  class_: number      // 0-5: Warrior, Mage, Rogue, Ranger, Cleric, Bard
  personality: number  // 0-7: Passionate..Silent
  talentId: number     // 0-29
  talentRarity: number // 0-4: Common..Mythic
  baseStats: number[]  // [STR, DEX, CON, INT, WIS, CHA] with race bonuses applied
}

// --- Party member sent during init (extends frontend PartyMember) ---

export interface InitPartyMember {
  name: string
  level: number
  className: string
  hp: number
  maxHp: number
  isCharacter?: boolean
  traits: NFATraitData
}

// --- WebSocket protocol: Client → Server ---

export type ClientMessage =
  | { type: 'init'; party: InitPartyMember[]; locale?: string; floor?: number; stageName?: string }
  | { type: 'command'; text: string }

// --- WebSocket protocol: Server → Client ---

export interface HPUpdate {
  name: string
  hp: number
  maxHp: number
}

export type ServerMessage =
  | { type: 'stream_start' }
  | { type: 'gm'; text: string }
  | { type: 'nfa'; name: string; text: string }
  | { type: 'roll'; text: string }
  | { type: 'dmg'; text: string }
  | { type: 'sys'; text: string }
  | { type: 'hp_update'; updates: HPUpdate[] }
  | { type: 'scene'; command: string; args: string[] }
  | { type: 'choices'; options: string[] }
  | { type: 'xp_gain'; amount: number }
  | { type: 'stream_end' }
  | { type: 'error'; text: string }

// --- Internal conversation history for Claude ---

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}
