import { ref } from 'vue'
import { Contract, parseEther } from 'ethers'
import { useWeb3 } from './useWeb3'
import ABI from '../abi/DungeonNFA.json'
import { getContractAddress } from '../config'

const FREE_MINT_FEE = parseEther('0.01')
const PAID_MINT_FEE = parseEther('0.05')

export type MintingState =
  | 'idle'
  | 'requesting'    // tx being sent/confirmed
  | 'awaitingVRF'   // waiting for VRF callback
  | 'done'
  | 'error'

export interface NFAData {
  tokenId: number
  isFreeMint: boolean
  traits: {
    race: number
    class_: number
    personality: number
    talentId: number
    talentRarity: number
    baseStats: number[]
  }
  progression: {
    level: number
    xp: number
    active: boolean
    createdAt: number
  }
}

const ownedNFAs = ref<NFAData[]>([])
const freeMints = ref(0)
const mintingState = ref<MintingState>('idle')
const mintError = ref('')
const lastMintedId = ref(0)
const lastMintWasFree = ref(false)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getContract(signerOrProvider: any): Contract {
  return new Contract(getContractAddress(), ABI, signerOrProvider)
}

async function loadFreeMints() {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) return
  const contract = getContract(signer.value)
  const count = await (contract as Contract).getFunction('getFreeMints')(addr.value)
  freeMints.value = Number(count)
}

async function loadMyNFAs() {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) return

  const contract = getContract(signer.value)
  const tokenIds: bigint[] = await contract.getFunction('tokensOfOwner')(addr.value)

  const nfas: NFAData[] = []
  for (const id of tokenIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await contract.getFunction('getNFA')(id)
    const isFree: boolean = await contract.getFunction('isFreeMint')(id)
    nfas.push({
      tokenId: Number(id),
      isFreeMint: isFree,
      traits: {
        race: Number(result.traits.race),
        class_: Number(result.traits.class_),
        personality: Number(result.traits.personality),
        talentId: Number(result.traits.talentId),
        talentRarity: Number(result.traits.talentRarity),
        baseStats: Array.from(result.traits.baseStats).map((s) => Number(s)),
      },
      progression: {
        level: Number(result.progression.level),
        xp: Number(result.progression.xp),
        active: Boolean(result.progression.active),
        createdAt: Number(result.progression.createdAt),
      },
    })
  }

  ownedNFAs.value = nfas
}

/**
 * Poll hasPendingMint until VRF fulfills, then load the minted NFA.
 */
async function waitForVRF(contract: Contract, addr: string): Promise<void> {
  const POLL_INTERVAL = 3000
  const MAX_POLLS = 100 // ~5 minutes

  for (let i = 0; i < MAX_POLLS; i++) {
    const pending: boolean = await contract.getFunction('hasPendingMint')(addr)
    if (!pending) return // instant mint (vrfEnabled=false) returns immediately
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  throw new Error('VRF fulfillment timeout')
}

/**
 * Find the newly minted token ID by comparing before/after token lists.
 */
async function findNewTokenId(contract: Contract, addr: string, beforeIds: Set<number>): Promise<number> {
  const tokenIds: bigint[] = await contract.getFunction('tokensOfOwner')(addr)
  for (const id of tokenIds) {
    if (!beforeIds.has(Number(id))) return Number(id)
  }
  return 0
}

/**
 * Free mint: pays 0.01 BNB, requests VRF, waits for callback.
 * Creates the player's own character (soulbound).
 */
async function doFreeMint() {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) throw new Error('Not connected')

  mintingState.value = 'requesting'
  mintError.value = ''
  lastMintWasFree.value = true

  try {
    const contract = getContract(signer.value)
    const beforeIds = new Set(ownedNFAs.value.map(n => n.tokenId))

    const tx = await contract.getFunction('freeMint')({ value: FREE_MINT_FEE })
    await tx.wait()

    mintingState.value = 'awaitingVRF'
    await waitForVRF(contract, addr.value)

    lastMintedId.value = await findNewTokenId(contract, addr.value, beforeIds)
    mintingState.value = 'done'
    await loadMyNFAs()
    await loadFreeMints()
  } catch (e: unknown) {
    mintingState.value = 'error'
    const err = e as { reason?: string; message?: string }
    mintError.value = err.reason || err.message || 'Free mint failed'
    throw e
  }
}

/**
 * Paid mint: pays 0.05 BNB, requests VRF, waits for callback.
 * Recruits a tradeable NFA companion.
 */
async function doPaidMint() {
  const { signer, address: addr } = useWeb3()
  if (!signer.value || !addr.value) throw new Error('Not connected')

  mintingState.value = 'requesting'
  mintError.value = ''
  lastMintWasFree.value = false

  try {
    const contract = getContract(signer.value)
    const beforeIds = new Set(ownedNFAs.value.map(n => n.tokenId))

    const tx = await contract.getFunction('paidMint')({ value: PAID_MINT_FEE })
    await tx.wait()

    mintingState.value = 'awaitingVRF'
    await waitForVRF(contract, addr.value)

    lastMintedId.value = await findNewTokenId(contract, addr.value, beforeIds)
    mintingState.value = 'done'
    await loadMyNFAs()
    await loadFreeMints()
  } catch (e: unknown) {
    mintingState.value = 'error'
    const err = e as { reason?: string; message?: string }
    mintError.value = err.reason || err.message || 'Paid mint failed'
    throw e
  }
}

function resetMinting() {
  mintingState.value = 'idle'
  mintError.value = ''
  lastMintedId.value = 0
  lastMintWasFree.value = false
}

/** Check if user has created their character (has a free-minted NFA) */
function hasCharacter(): boolean {
  return ownedNFAs.value.some(n => n.isFreeMint)
}

export function useNFA() {
  return {
    ownedNFAs,
    freeMints,
    mintingState,
    mintError,
    lastMintedId,
    lastMintWasFree,
    loadFreeMints,
    loadMyNFAs,
    doFreeMint,
    doPaidMint,
    resetMinting,
    hasCharacter,
  }
}
