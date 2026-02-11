import { ref, computed } from 'vue'
import en from './en'
import zh from './zh'

export type Locale = 'en' | 'zh'

export interface Messages {
  connectWallet: string
  connecting: string
  wrongChain: string
  disconnect: string
  title: string
  subtitle: string
  awaitingWallet: string
  connectPrompt: string

  // Character creation (free mint)
  welcomeNew: string
  createCharDesc: string
  createCharFee: string
  createCharBtn: string
  requestingChar: string
  confirmTx: string
  awaitingVRF: string
  vrfDesc: string
  charCreated: string
  charJoined: (id: number) => string

  // After character: choice screen
  choosePathTitle: string
  choosePathDesc: string
  exploreSolo: string
  recruitCompanion: string

  // Companion recruitment (paid mint)
  welcomeBack: string
  paidFee: string
  companionDesc: string
  beginRecruitment: string
  requestingRecruit: string
  recruitSuccess: string
  companionJoined: (id: number) => string

  enterDungeon: string
  retry: string
  switchNetwork: string
  wrongNetworkError: string
  switchPrompt: string

  // Trait labels
  race: string
  class_: string
  personality: string
  talent: string

  // NFAList
  selectCompanion: string
  selectPrompt: string
  recruitNew: string
  inactive: string
  characterBadge: string

  // NFAList multi-select
  partyCount: (n: number, max: number) => string
  soloMode: string

  // Stage Select
  selectStage: string
  selectStagePrompt: string
  locked: string
  stageEnter: string
  difficulty: string
  enemies: string
  stageBack: string
  yourParty: string
  stage1Name: string
  stage1Desc: string
  stage2Name: string
  stage2Desc: string
  stage3Name: string
  stage3Desc: string
  stage4Name: string
  stage4Desc: string
  stage5Name: string
  stage5Desc: string
  enemySlime: string
  enemySkeleton: string
  enemyGoblin: string
  enemyWraith: string
  enemyGolem: string
  enemyDragon: string
  chapterPrefix: string
  boss: string
  boss1Name: string
  boss2Name: string
  boss3Name: string
  boss4Name: string
  boss5Name: string

  // Loading
  loadingTitle: string
  loadingConnect: string
  loadingParty: (names: string) => string
  loadingGen: string

  // GameNav
  navParty: string
  navRecruit: string
  navBack: string

  // Game Over
  gameOverTitle: string
  gameOverDesc: string
  gameOverRetry: string

  // Floor Cleared
  floorClearedTitle: string
  floorClearedDone: string
  nextFloor: string

  // Victory
  victoryTitle: string
  victoryDesc: string

  // XP
  xpLabel: string
  levelLabel: string

  // Exit confirm
  exitConfirmTitle: string
  exitConfirmDesc: string
  exitConfirmYes: string
  exitConfirmNo: string

  // Sound
  soundOn: string
  soundOff: string

  // Admin
  adminTitle: string
  adminTabStats: string
  adminTabContract: string
  adminTabPrompts: string
  adminContractStatus: string
  adminTokenQuery: string
  adminQuery: string
  adminStateControl: string
  adminDangerZone: string
  adminConfirm: string
  adminConfirmYes: string
  adminConfirmNo: string
  adminSections: string
  adminSave: string
  adminReset: string
  adminResetAll: string
  adminSelectSection: string
  adminBtn: string

  races: readonly string[]
  classes: readonly string[]
  personalities: readonly string[]
  rarities: readonly string[]
}

const messages: Record<Locale, Messages> = { en, zh }

const LOCALE_KEY = 'dnfa_locale'

function detectLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY)
  if (saved === 'en' || saved === 'zh') return saved
  const lang = navigator.language.toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

const locale = ref<Locale>(detectLocale())

export function useI18n() {
  const t = computed(() => messages[locale.value])

  function setLocale(l: Locale) {
    locale.value = l
    localStorage.setItem(LOCALE_KEY, l)
  }

  function toggleLocale() {
    setLocale(locale.value === 'en' ? 'zh' : 'en')
  }

  return { locale, t, setLocale, toggleLocale }
}
