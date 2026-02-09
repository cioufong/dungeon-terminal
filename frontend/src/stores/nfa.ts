import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFAData } from '../composables/useNFA'
import type { PartyMember } from './game'
import { effectiveStats, computeMaxHP } from '../data/traits'
import { useI18n } from '../i18n'

export const useNFAStore = defineStore('nfa', () => {
  const { t } = useI18n()
  const partyIds = ref<number[]>([])
  const ownedNFAs = ref<NFAData[]>([])

  /** Whether a party has been formed (at least the character) */
  const hasParty = computed(() => partyIds.value.length > 0)

  /** All NFAs currently in the party */
  const party = computed(() =>
    partyIds.value
      .map(id => ownedNFAs.value.find(n => n.tokenId === id))
      .filter((n): n is NFAData => !!n)
  )

  /** For backwards compat — the character (free mint) in the party */
  const selectedNFA = computed(() =>
    party.value.find(n => n.isFreeMint) || party.value[0] || null
  )

  function setParty(ids: number[]) {
    partyIds.value = ids
  }

  function clearParty() {
    partyIds.value = []
  }

  function setOwnedNFAs(nfas: NFAData[]) {
    ownedNFAs.value = nfas
  }

  // Map NFA to game's PartyMember interface (uses i18n for localized names)
  function nfaToPartyMember(nfa: NFAData): PartyMember {
    const stats = effectiveStats(nfa.traits.baseStats, nfa.traits.race)
    const con = stats[2] ?? 10 // CON index
    const maxHp = computeMaxHP(con, nfa.progression.level)
    const race = t.value.races[nfa.traits.race] || 'Unknown'
    const cls = t.value.classes[nfa.traits.class_] || 'Unknown'

    return {
      name: `${race} #${nfa.tokenId}`,
      level: nfa.progression.level,
      className: cls,
      hp: maxHp,
      maxHp,
      isCharacter: nfa.isFreeMint,
    }
  }

  // Get party members from selected party
  const partyMembers = computed<PartyMember[]>(() =>
    party.value
      .filter(n => n.progression.active)
      .map(nfaToPartyMember)
  )

  /** Extended party member with full traits for WS init message */
  function nfaToInitPartyMember(nfa: NFAData) {
    const pm = nfaToPartyMember(nfa)
    return {
      ...pm,
      traits: {
        race: nfa.traits.race,
        class_: nfa.traits.class_,
        personality: nfa.traits.personality,
        talentId: nfa.traits.talentId,
        talentRarity: nfa.traits.talentRarity,
        baseStats: effectiveStats(nfa.traits.baseStats, nfa.traits.race),
      },
    }
  }

  /** Init party array for WebSocket (includes traits for AI prompts) */
  const initParty = computed(() =>
    party.value
      .filter(n => n.progression.active)
      .map(nfaToInitPartyMember)
  )

  return {
    partyIds,
    ownedNFAs,
    hasParty,
    party,
    selectedNFA,
    partyMembers,
    initParty,
    setParty,
    clearParty,
    setOwnedNFAs,
    nfaToPartyMember,
    nfaToInitPartyMember,
  }
})
