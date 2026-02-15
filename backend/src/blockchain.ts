import { createPublicClient, createWalletClient, http } from 'viem'
import type { PublicClient, WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bscTestnet } from 'viem/chains'
import { loadContractAddress } from './load-contract-address.js'

const grantXPAbi = [{
  type: 'function',
  name: 'grantXP',
  inputs: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'amount', type: 'uint32' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const

const recordAdventureAbi = [{
  type: 'function',
  name: 'recordAdventure',
  inputs: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'floor', type: 'uint16' },
    { name: 'result', type: 'uint8' },
    { name: 'xpEarned', type: 'uint16' },
    { name: 'killCount', type: 'uint16' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const

const updateVaultAbi = [{
  type: 'function',
  name: 'updateVault',
  inputs: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'vaultURI', type: 'string' },
    { name: 'vaultHash', type: 'bytes32' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}] as const

let walletClient: WalletClient | null = null
let publicClient: PublicClient | null = null
let contractAddress: `0x${string}` | null = null
let account: ReturnType<typeof privateKeyToAccount> | null = null
let enabled = false

const MAX_RETRIES = 3

export function isBlockchainEnabled(): boolean {
  return enabled
}

export function initBlockchain(): void {
  const privateKey = process.env.GAME_SERVER_PRIVATE_KEY
  const address = loadContractAddress()
  const rpcUrl = process.env.BSC_RPC_URL

  if (!privateKey || !address) {
    console.warn('[Blockchain] Missing GAME_SERVER_PRIVATE_KEY or contract address — XP granting disabled')
    return
  }

  account = privateKeyToAccount(privateKey as `0x${string}`)
  contractAddress = address as `0x${string}`

  const transport = http(rpcUrl || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545')

  publicClient = createPublicClient({
    chain: bscTestnet,
    transport,
  })

  walletClient = createWalletClient({
    chain: bscTestnet,
    account,
    transport,
  })

  enabled = true
  console.log(`[Blockchain] Connected, XP granting enabled (account: ${account.address})`)
}

export async function grantXP(tokenId: number, amount: number): Promise<void> {
  if (!enabled || !walletClient || !publicClient || !contractAddress || !account) return
  if (amount <= 0) return

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const hash = await walletClient.writeContract({
        chain: bscTestnet,
        account: account!,
        address: contractAddress,
        abi: grantXPAbi,
        functionName: 'grantXP',
        args: [BigInt(tokenId), amount],
      })

      console.log(`[Blockchain] grantXP(tokenId=${tokenId}, amount=${amount}) tx: ${hash}`)

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`[Blockchain] grantXP confirmed: ${hash}`)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Blockchain] grantXP attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`)
      if (attempt === MAX_RETRIES) {
        console.error(`[Blockchain] grantXP gave up after ${MAX_RETRIES} retries (tokenId=${tokenId}, amount=${amount})`)
      }
    }
  }
}

export async function grantXPBatch(grants: { tokenId: number; amount: number }[]): Promise<void> {
  for (const g of grants) {
    await grantXP(g.tokenId, g.amount)
  }
}

export async function recordAdventure(
  tokenId: number,
  floor: number,
  result: number,
  xpEarned: number,
  killCount: number,
): Promise<void> {
  if (!enabled || !walletClient || !publicClient || !contractAddress || !account) return

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const hash = await walletClient.writeContract({
        chain: bscTestnet,
        account: account!,
        address: contractAddress,
        abi: recordAdventureAbi,
        functionName: 'recordAdventure',
        args: [BigInt(tokenId), floor, result, xpEarned, killCount],
      })

      console.log(`[Blockchain] recordAdventure(tokenId=${tokenId}, floor=${floor}, result=${result}) tx: ${hash}`)

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`[Blockchain] recordAdventure confirmed: ${hash}`)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Blockchain] recordAdventure attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`)
      if (attempt === MAX_RETRIES) {
        console.error(`[Blockchain] recordAdventure gave up after ${MAX_RETRIES} retries`)
      }
    }
  }
}

export async function updateVault(
  tokenId: number,
  vaultURI: string,
  vaultHash: `0x${string}`,
): Promise<void> {
  if (!enabled || !walletClient || !publicClient || !contractAddress || !account) return

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const hash = await walletClient.writeContract({
        chain: bscTestnet,
        account: account!,
        address: contractAddress,
        abi: updateVaultAbi,
        functionName: 'updateVault',
        args: [BigInt(tokenId), vaultURI, vaultHash],
      })

      console.log(`[Blockchain] updateVault(tokenId=${tokenId}) tx: ${hash}`)

      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`[Blockchain] updateVault confirmed: ${hash}`)
      return
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[Blockchain] updateVault attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`)
      if (attempt === MAX_RETRIES) {
        console.error(`[Blockchain] updateVault gave up after ${MAX_RETRIES} retries`)
      }
    }
  }
}
