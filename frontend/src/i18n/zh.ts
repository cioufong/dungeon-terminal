export default {
  // Wallet
  connectWallet: '连接钱包',
  connecting: '连接中...',
  wrongChain: '网络错误',
  disconnect: '断开连接',

  // General
  title: '[ 地牢终端 ]',
  subtitle: '角色 & NFA 招募系统 v1.0',
  awaitingWallet: '> 等待钱包连接...',
  connectPrompt: '> 连接钱包以进入地牢。',

  // Character creation (free mint with VRF)
  welcomeNew: '> 欢迎，冒险者。你的旅程从这里开始。',
  createCharDesc: '> 创建你的角色进入地牢。神谕将由命运锻造你的特质。',
  createCharFee: (fee: string) => `> 注册费用：${fee} BNB — 每个钱包一次，灵魂绑定。`,
  createCharBtn: '创建角色',
  requestingChar: '> 正在向神谕提交你的请求...',
  confirmTx: '> 请在钱包中确认交易。',
  awaitingVRF: '> 神谕正在锻造你的命运...',
  vrfDesc: '> 正在等待币安神谕决定你的特质，请稍候。',
  charCreated: '> 角色创建成功！',
  charJoined: (id: number) => `> 角色 #${id} 已降生于世界。`,

  // After character: choice screen
  choosePathTitle: '[ 选择你的道路 ]',
  choosePathDesc: '> 你的角色已就绪。接下来做什么？',
  exploreSolo: '独自探索',
  recruitCompanion: '招募伙伴',

  // Companion recruitment (paid mint with VRF)
  welcomeBack: '> 准备为你的队伍招募伙伴。',
  paidFee: (fee: string) => `> 招募费用：${fee} BNB`,
  companionDesc: '> 伙伴是可交易的 NFA 代理，与你并肩作战。',
  beginRecruitment: '开始招募',
  requestingRecruit: '> 正在向神谕发送招募请求...',
  recruitSuccess: '> 招募成功！',
  companionJoined: (id: number) => `> 伙伴 #${id} 已加入你的队伍。`,

  enterDungeon: '进入地牢',
  retry: '重试',
  switchNetwork: '切换网络',
  wrongNetworkError: '> 错误：检测到错误的网络。',
  switchPrompt: '> 请切换到 BSC 测试网继续。',

  // Trait labels
  race: '种族',
  class_: '职业',
  personality: '性格',
  talent: '天赋',

  // NFAList
  selectCompanion: '[ 选择队伍成员 ]',
  selectPrompt: '选择你的角色或伙伴进入地牢',
  recruitNew: '招募新伙伴',
  inactive: '未激活',
  characterBadge: '本体',

  // NFAList multi-select
  partyCount: (n: number, max: number) => `队伍：已选 ${n}/${max}`,
  soloMode: '独自探索',

  // Stage Select
  selectStage: '[ 选择地牢楼层 ]',
  selectStagePrompt: '选择你要挑战的深度',
  locked: '未解锁',
  stageEnter: '进入',
  difficulty: '难度',
  enemies: '敌人',
  stageBack: '返回',
  yourParty: '[ 你的队伍 ]',
  stage1Name: '暗影走廊',
  stage1Desc: '封印正在崩裂，黑暗生物在深处蠢蠢欲动...',
  stage2Name: '地下密室',
  stage2Desc: '古老的记录中藏着理解封印的关键...',
  stage3Name: '十字路口',
  stage3Desc: '多条路径分叉——每条都藏着真相的碎片...',
  stage4Name: '遗忘神殿',
  stage4Desc: '封印的外层圣殿，一位堕落的守护者在此等候...',
  stage5Name: '深渊王座',
  stage5Desc: '深渊之眼已经苏醒。终结这一切吧...',
  enemySlime: '史莱姆',
  enemySkeleton: '骷髅',
  enemyGoblin: '哥布林',
  enemyWraith: '幽灵',
  enemyGolem: '石像',
  enemyDragon: '龙',
  chapterPrefix: '章节',
  boss: '首领',
  boss1Name: '腐化史莱姆王',
  boss2Name: '亡灵图书管理员',
  boss3Name: '暗影分身',
  boss4Name: '腐化守护者',
  boss5Name: '深渊之眼',

  // Loading
  loadingTitle: '[ 初始化地牢 ]',
  loadingConnect: '> 正在连接地牢终端...',
  loadingParty: (names: string) => `> 队伍集结：${names}`,
  loadingGen: '> 正在生成地牢环境',

  // GameNav
  navParty: '队伍',
  navRecruit: '招募',
  navBack: '返回',

  // Game Over
  gameOverTitle: '[ 全灭 ]',
  gameOverDesc: '你的队伍已经倒下了...',
  gameOverRetry: '返回基地',

  // Floor Cleared
  floorClearedTitle: '[ 楼层通关 ]',
  floorClearedDone: '完成',
  nextFloor: '前进下一层',

  // Victory
  victoryTitle: '[ 通关 ]',
  victoryDesc: '深渊之眼已不复存在。封印因你之手而存续——或破碎。地牢归于沉寂，你的传说将回荡千古。',

  // XP
  xpLabel: '经验',
  levelLabel: 'LV',

  // Exit confirm
  exitConfirmTitle: '[ 离开地牢？ ]',
  exitConfirmDesc: '当前楼层的进度将会丢失。',
  exitConfirmYes: '离开',
  exitConfirmNo: '留下',

  // Disconnect confirm
  disconnectTitle: '[ 断开钱包连接？ ]',
  disconnectDesc: '你将退出地牢，所有进度将会丢失。',
  disconnectYes: '断开',
  disconnectNo: '取消',

  // Sound
  soundOn: '音效 开',
  soundOff: '音效 关',

  // Admin
  adminTitle: '[ 管理面板 ]',
  adminTabStats: '状态',
  adminTabContract: '合约',
  adminTabPrompts: '提示词',
  adminContractStatus: '合约状态',
  adminTokenQuery: 'Token 查询',
  adminQuery: '查询',
  adminStateControl: '状态控制',
  adminDangerZone: '危险区域',
  adminConfirm: '[ 确认 ]',
  adminConfirmYes: '确认',
  adminConfirmNo: '取消',
  adminSections: '段落',
  adminSave: '保存',
  adminReset: '还原',
  adminResetAll: '重置全部为预设',
  adminSelectSection: '选择一个段落进行编辑',
  adminBtn: '管理',

  // Enums
  races: ['人类', '精灵', '矮人', '魔裔', '兽族'],
  classes: ['战士', '法师', '盗贼', '游侠', '牧师', '吟游诗人'],
  personalities: ['热情', '沉着', '狡黠', '善良', '黑暗', '开朗', '学者', '沉默'],
  rarities: ['普通', '稀有', '史诗', '传说', '神话'],
} as const
