export default {
  // Wallet
  connectWallet: 'CONNECT WALLET',
  connecting: 'CONNECTING...',
  wrongChain: 'WRONG CHAIN',
  disconnect: 'Disconnect',

  // General
  title: '[ DUNGEON TERMINAL ]',
  subtitle: 'Character & NFA Recruitment System v1.0',
  awaitingWallet: '> Awaiting wallet connection...',
  connectPrompt: '> Connect your wallet to enter the dungeon.',

  // Character creation (free mint with VRF)
  welcomeNew: '> Welcome, Adventurer. Your journey begins here.',
  createCharDesc: '> Create your character to enter the dungeon. The Oracle will forge your traits by fate.',
  createCharFee: '> Registration fee: 0.01 BNB — one per wallet, bound to your soul.',
  createCharBtn: 'CREATE CHARACTER',
  requestingChar: '> Submitting your request to the Oracle...',
  confirmTx: '> Confirm transaction in wallet.',
  awaitingVRF: '> The Oracle is forging your destiny...',
  vrfDesc: '> Waiting for the Binance Oracle to determine your traits. This may take a moment.',
  charCreated: '> CHARACTER CREATED!',
  charJoined: (id: number) => `> Character #${id} has been born into the world.`,

  // After character: choice screen
  choosePathTitle: '[ CHOOSE YOUR PATH ]',
  choosePathDesc: '> Your character awaits. What will you do?',
  exploreSolo: 'EXPLORE SOLO',
  recruitCompanion: 'RECRUIT COMPANION',

  // Companion recruitment (paid mint with VRF)
  welcomeBack: '> Ready to recruit a companion for your party.',
  paidFee: '> Recruitment fee: 0.05 BNB',
  companionDesc: '> Companions are tradeable NFA agents that fight alongside you.',
  beginRecruitment: 'BEGIN RECRUITMENT',
  requestingRecruit: '> Sending recruitment request to the Oracle...',
  recruitSuccess: '> RECRUITMENT SUCCESSFUL!',
  companionJoined: (id: number) => `> Companion #${id} has joined your party.`,

  enterDungeon: 'ENTER DUNGEON',
  retry: 'RETRY',
  switchNetwork: 'SWITCH NETWORK',
  wrongNetworkError: '> ERROR: Wrong network detected.',
  switchPrompt: '> Switch to BSC Testnet to continue.',

  // Trait labels
  race: 'Race',
  class_: 'Class',
  personality: 'Personality',
  talent: 'Talent',

  // NFAList
  selectCompanion: '[ SELECT PARTY MEMBER ]',
  selectPrompt: 'Choose your character or companion to enter the dungeon',
  recruitNew: 'RECRUIT NEW',
  inactive: 'INACTIVE',
  characterBadge: 'YOU',

  // NFAList multi-select
  partyCount: (n: number, max: number) => `Party: ${n}/${max} selected`,
  soloMode: 'EXPLORE SOLO',

  // Stage Select
  selectStage: '[ SELECT DUNGEON FLOOR ]',
  selectStagePrompt: 'Choose the depth you dare to explore',
  locked: 'LOCKED',
  stageEnter: 'ENTER',
  difficulty: 'Difficulty',
  enemies: 'Enemies',
  stageBack: 'BACK',
  yourParty: '[ YOUR PARTY ]',
  stage1Name: 'Shadow Corridor',
  stage1Desc: 'The seal is breaking. Dark creatures stir in the depths...',
  stage2Name: 'Underground Chamber',
  stage2Desc: 'Ancient records hold the key to understanding the seal...',
  stage3Name: 'The Crossroads',
  stage3Desc: 'Multiple paths diverge — each hides a fragment of truth...',
  stage4Name: 'Forgotten Shrine',
  stage4Desc: 'The outer sanctum of the seal. A fallen guardian awaits...',
  stage5Name: 'Abyssal Throne',
  stage5Desc: 'The Abyss Eye awakens. End this, once and for all...',
  enemySlime: 'Slime',
  enemySkeleton: 'Skeleton',
  enemyGoblin: 'Goblin',
  enemyWraith: 'Wraith',
  enemyGolem: 'Golem',
  enemyDragon: 'Dragon',
  chapterPrefix: 'CHAPTER',
  boss: 'Boss',
  boss1Name: 'Corrupted Slime King',
  boss2Name: 'Undead Librarian',
  boss3Name: 'Shadow Doppelganger',
  boss4Name: 'Corrupted Guardian',
  boss5Name: 'The Abyss Eye',

  // Loading
  loadingTitle: '[ INITIALIZING DUNGEON ]',
  loadingConnect: '> Establishing connection to Dungeon Terminal...',
  loadingParty: (names: string) => `> Party assembled: ${names}`,
  loadingGen: '> Generating dungeon environment',

  // GameNav
  navParty: 'PARTY',
  navRecruit: 'RECRUIT',
  navBack: 'BACK',

  // Game Over
  gameOverTitle: '[ GAME OVER ]',
  gameOverDesc: 'Your party has fallen...',
  gameOverRetry: 'RETURN TO BASE',

  // Floor Cleared
  floorClearedTitle: '[ FLOOR CLEARED ]',
  floorClearedDone: 'COMPLETE',
  nextFloor: 'NEXT FLOOR',

  // Victory
  victoryTitle: '[ VICTORY ]',
  victoryDesc: 'The Abyss Eye is no more. The seal holds — or shatters — by your hand. The dungeon falls silent. Your legend echoes through the ages.',

  // XP
  xpLabel: 'XP',
  levelLabel: 'LV',

  // Exit confirm
  exitConfirmTitle: '[ LEAVE DUNGEON? ]',
  exitConfirmDesc: 'Progress on this floor will be lost.',
  exitConfirmYes: 'LEAVE',
  exitConfirmNo: 'STAY',

  // Disconnect confirm
  disconnectTitle: '[ DISCONNECT WALLET? ]',
  disconnectDesc: 'You will exit the dungeon and all progress will be lost.',
  disconnectYes: 'DISCONNECT',
  disconnectNo: 'CANCEL',

  // Sound
  soundOn: 'SFX ON',
  soundOff: 'SFX OFF',

  // Admin
  adminTitle: '[ ADMIN PANEL ]',
  adminTabStats: 'STATS',
  adminTabContract: 'CONTRACT',
  adminTabPrompts: 'PROMPTS',
  adminContractStatus: 'Contract Status',
  adminTokenQuery: 'Token Query',
  adminQuery: 'QUERY',
  adminStateControl: 'State Control',
  adminDangerZone: 'Danger Zone',
  adminConfirm: '[ CONFIRM ]',
  adminConfirmYes: 'CONFIRM',
  adminConfirmNo: 'CANCEL',
  adminSections: 'SECTIONS',
  adminSave: 'SAVE',
  adminReset: 'REVERT',
  adminResetAll: 'RESET ALL TO DEFAULT',
  adminSelectSection: 'Select a section to edit',
  adminBtn: 'ADMIN',

  // Enums
  races: ['Human', 'Elf', 'Dwarf', 'Tiefling', 'Beastkin'],
  classes: ['Warrior', 'Mage', 'Rogue', 'Ranger', 'Cleric', 'Bard'],
  personalities: ['Passionate', 'Calm', 'Cunning', 'Kind', 'Dark', 'Cheerful', 'Scholar', 'Silent'],
  rarities: ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'],
} as const
