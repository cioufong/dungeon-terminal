import { ref, computed } from 'vue'
import { Contract } from 'ethers'
import { useWeb3 } from './useWeb3'
import V1_ABI from '../abi/DungeonNFA.json'
import V2_ABI from '../abi/DungeonNFAV2.json'
import { getContractAddress } from '../config'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

const isOwner = ref(false)
const isV2 = ref(false)
const checking = ref(false)

// Merge V1 + V2 ABIs so both old and new function names work
const MERGED_ABI = [...V1_ABI, ...V2_ABI.filter((e: any) =>
  !V1_ABI.some((v: any) => v.name === e.name && v.type === e.type)
)]

function getContract(): Contract {
  const { signer } = useWeb3()
  return new Contract(getContractAddress(), MERGED_ABI, signer.value!)
}

function getReadContract(): Contract {
  const { provider } = useWeb3()
  return new Contract(getContractAddress(), MERGED_ABI, provider.value!)
}

/** Check if connected wallet is contract owner */
async function checkOwner(): Promise<boolean> {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) {
    isOwner.value = false
    return false
  }
  checking.value = true
  try {
    const contract = getReadContract()
    const owner: string = await contract.getFunction('owner')()
    isOwner.value = owner.toLowerCase() === addr.value.toLowerCase()

    // Check V2
    try {
      await contract.getFunction('version')()
      isV2.value = true
    } catch {
      isV2.value = false
    }

    return isOwner.value
  } catch (e) {
    console.error('[Admin] checkOwner failed:', e)
    isOwner.value = false
    return false
  } finally {
    checking.value = false
  }
}

// --- Auth headers for prompt API ---

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) throw new Error('Not connected')

  const timestamp = Date.now().toString()
  const message = `admin-auth:${timestamp}`
  const signature = await signer.value.signMessage(message)

  return {
    'x-admin-address': addr.value,
    'x-admin-signature': signature,
    'x-admin-timestamp': timestamp,
    'Content-Type': 'application/json',
  }
}

// --- Prompt REST client ---

export interface PromptSection {
  key: string
  title: string
  content: string
}

async function fetchPromptSections(): Promise<PromptSection[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/admin/prompts`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch prompts: ${res.status}`)
  const data = await res.json()
  return data.sections
}

async function savePromptSection(key: string, content: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/admin/prompts/${key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content }),
  })
  if (!res.ok) throw new Error(`Failed to save prompt: ${res.status}`)
}

async function resetPrompts(): Promise<PromptSection[]> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_BASE}/api/admin/prompts/reset`, {
    method: 'POST',
    headers,
  })
  if (!res.ok) throw new Error(`Failed to reset prompts: ${res.status}`)
  const data = await res.json()
  return data.sections
}

// --- Contract write wrappers ---

export type TxStatus = 'idle' | 'pending' | 'confirmed' | 'error'

export interface TxState {
  status: TxStatus
  hash: string
  error: string
}

function createTxState(): TxState {
  return { status: 'idle', hash: '', error: '' }
}

async function execTx(
  state: TxState,
  fn: () => Promise<{ hash: string; wait: () => Promise<unknown> }>,
): Promise<boolean> {
  state.status = 'pending'
  state.hash = ''
  state.error = ''
  try {
    const tx = await fn()
    state.hash = tx.hash
    await tx.wait()
    state.status = 'confirmed'
    return true
  } catch (e: unknown) {
    state.status = 'error'
    const err = e as { reason?: string; message?: string }
    state.error = err.reason || err.message || 'Transaction failed'
    return false
  }
}

// --- Contract read helpers ---

async function tryCall(contract: Contract, ...names: string[]): Promise<unknown> {
  for (const name of names) {
    try { return await contract.getFunction(name)() } catch { /* try next */ }
  }
  return null
}

async function readContractState() {
  const contract = getReadContract()

  // These exist on both V1 and V2
  const [owner, paused, freeMintsPerUser] = await Promise.all([
    contract.getFunction('owner')(),
    contract.getFunction('paused')(),
    contract.getFunction('freeMintsPerUser')(),
  ])

  // These have different names across versions
  const [treasury, totalSupply, renderer] = await Promise.all([
    tryCall(contract, 'treasury', 'treasuryAddress'),
    tryCall(contract, 'getTotalSupply', 'totalSupply'),
    tryCall(contract, 'renderer').catch(() => null),
  ])

  let version = '1.0.0'
  let maxAdventureLog = 0
  if (isV2.value) {
    try {
      const [v, mal] = await Promise.all([
        contract.getFunction('version')(),
        contract.getFunction('maxAdventureLog')(),
      ])
      version = v
      maxAdventureLog = Number(mal)
    } catch { /* V1 fallback */ }
  }

  return {
    owner: owner as string,
    paused: paused as boolean,
    treasury: (treasury as string) || '',
    totalSupply: Number(totalSupply ?? 0),
    freeMintsPerUser: Number(freeMintsPerUser),
    renderer: (renderer as string) || '',
    version,
    maxAdventureLog,
  }
}

async function readVRFConfig() {
  const contract = getReadContract()
  const [coordinator, keyHash, subId, callbackGasLimit, requestConfirmations] = await Promise.all([
    contract.getFunction('vrfCoordinator')(),
    contract.getFunction('vrfKeyHash')(),
    tryCall(contract, 'vrfSubId', 'vrfSubscriptionId'),
    contract.getFunction('vrfCallbackGasLimit')(),
    tryCall(contract, 'vrfRequestConfirmations', 'vrfConfirmations'),
  ])
  return {
    coordinator: coordinator as string,
    keyHash: keyHash as string,
    subId: Number(subId ?? 0),
    callbackGasLimit: Number(callbackGasLimit),
    requestConfirmations: Number(requestConfirmations ?? 0),
  }
}

async function queryToken(tokenId: number) {
  const contract = getReadContract()
  const [traits, progression, ownerAddr, isFree] = await Promise.all([
    contract.getFunction('getTraits')(tokenId),
    contract.getFunction('getProgression')(tokenId),
    contract.getFunction('ownerOf')(tokenId),
    contract.getFunction('isFreeMint')(tokenId),
  ])

  let gameStats = null
  let adventureLog: unknown[] = []
  if (isV2.value) {
    try {
      const [gs, al] = await Promise.all([
        contract.getFunction('getGameStats')(tokenId),
        contract.getFunction('getAdventureLog')(tokenId),
      ])
      gameStats = {
        highestFloor: Number(gs.highestFloor),
        totalRuns: Number(gs.totalRuns),
        totalKills: Number(gs.totalKills),
        lastActiveAt: Number(gs.lastActiveAt),
      }
      adventureLog = Array.from(al).map((e: any) => ({
        floor: Number(e.floor),
        result: Number(e.result),
        xpEarned: Number(e.xpEarned),
        killCount: Number(e.killCount),
        timestamp: Number(e.timestamp),
      }))
    } catch { /* V1 fallback */ }
  }

  return {
    traits: {
      race: Number(traits.race),
      class_: Number(traits.class_),
      personality: Number(traits.personality),
      talentId: Number(traits.talentId),
      talentRarity: Number(traits.talentRarity),
      baseStats: Array.from(traits.baseStats).map((s: any) => Number(s)),
    },
    progression: {
      level: Number(progression.level),
      xp: Number(progression.xp),
      active: Boolean(progression.active),
      createdAt: Number(progression.createdAt),
    },
    owner: ownerAddr as string,
    isFreeMint: isFree as boolean,
    gameStats,
    adventureLog,
  }
}

// --- Contract write functions ---

async function setPaused(state: TxState, paused: boolean) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setPaused')(paused))
}

async function setTreasury(state: TxState, addr: string) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setTreasury')(addr))
}

async function setFreeMintsPerUser(state: TxState, count: number) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setFreeMintsPerUser')(count))
}

async function grantAdditionalFreeMints(state: TxState, user: string, amount: number) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('grantAdditionalFreeMints')(user, amount))
}

async function setRenderer(state: TxState, addr: string) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setRenderer')(addr))
}

async function setVRFConfig(
  state: TxState,
  coordinator: string,
  keyHash: string,
  subId: number,
  callbackGasLimit: number,
  requestConfirmations: number,
) {
  const contract = getContract()
  return execTx(state, () =>
    contract.getFunction('setVRFConfig')(coordinator, keyHash, subId, callbackGasLimit, requestConfirmations))
}

async function setGameServer(state: TxState, server: string, authorized: boolean) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setGameServer')(server, authorized))
}

async function setMaxAdventureLog(state: TxState, maxLog: number) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('setMaxAdventureLog')(maxLog))
}

async function emergencyWithdraw(state: TxState) {
  const contract = getContract()
  return execTx(state, () => contract.getFunction('emergencyWithdraw')())
}

async function checkGameServer(addr: string): Promise<boolean> {
  const contract = getReadContract()
  return contract.getFunction('gameServers')(addr) as Promise<boolean>
}

function resetAdmin() {
  isOwner.value = false
  isV2.value = false
}

export function useAdmin() {
  return {
    isOwner,
    isV2,
    checking,
    checkOwner,
    resetAdmin,
    createTxState,

    // Contract reads
    readContractState,
    readVRFConfig,
    queryToken,
    checkGameServer,

    // Contract writes
    setPaused,
    setTreasury,
    setFreeMintsPerUser,
    grantAdditionalFreeMints,
    setRenderer,
    setVRFConfig,
    setGameServer,
    setMaxAdventureLog,
    emergencyWithdraw,

    // Prompt API
    fetchPromptSections,
    savePromptSection,
    resetPrompts,
  }
}
