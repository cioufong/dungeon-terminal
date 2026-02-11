import { Router } from 'express'
import { verifyMessage } from 'viem'
import { getAllSections, updateSection, resetAll } from './prompt-store.js'

const CONTRACT_ADDRESS = (process.env.NFA_CONTRACT_ADDRESS || '') as `0x${string}`

// Minimal ABI — only need owner() view function
const ownerAbi = [{
  type: 'function',
  name: 'owner',
  inputs: [],
  outputs: [{ name: '', type: 'address' }],
  stateMutability: 'view',
}] as const

let cachedOwner: string | null = null
let ownerCacheTime = 0
const OWNER_CACHE_TTL = 60_000 // 1 minute

async function getContractOwner(): Promise<string> {
  const now = Date.now()
  if (cachedOwner && now - ownerCacheTime < OWNER_CACHE_TTL) {
    return cachedOwner
  }

  // Dynamic import to avoid circular dependency with blockchain.ts
  const { createPublicClient, http } = await import('viem')
  const { bscTestnet } = await import('viem/chains')

  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(process.env.BSC_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545'),
  })

  const owner = await client.readContract({
    address: CONTRACT_ADDRESS,
    abi: ownerAbi,
    functionName: 'owner',
  }) as string

  cachedOwner = owner.toLowerCase()
  ownerCacheTime = now
  return cachedOwner
}

/**
 * Verify admin request: x-admin-address + x-admin-signature headers.
 * Signature message format: "admin-auth:{timestamp}"
 * Timestamp must be within 5 minutes.
 */
async function verifyAdmin(req: { headers: Record<string, string | string[] | undefined> }): Promise<boolean> {
  const addr = req.headers['x-admin-address'] as string | undefined
  const sig = req.headers['x-admin-signature'] as string | undefined
  const ts = req.headers['x-admin-timestamp'] as string | undefined

  if (!addr || !sig || !ts) return false

  // Verify timestamp freshness (5-minute window)
  const timestamp = parseInt(ts, 10)
  if (isNaN(timestamp) || Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false

  // Verify signature
  const message = `admin-auth:${ts}`
  try {
    const valid = await verifyMessage({
      address: addr as `0x${string}`,
      message,
      signature: sig as `0x${string}`,
    })
    if (!valid) return false
  } catch {
    return false
  }

  // Verify address is contract owner
  const owner = await getContractOwner()
  return addr.toLowerCase() === owner
}

export function createAdminRouter(): Router {
  const router = Router()

  // GET /api/admin/prompts — list all prompt sections
  router.get('/prompts', async (req, res) => {
    if (!(await verifyAdmin(req))) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }
    res.json({ sections: getAllSections() })
  })

  // PUT /api/admin/prompts/:key — update a section
  router.put('/prompts/:key', async (req, res) => {
    if (!(await verifyAdmin(req))) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }
    const { key } = req.params
    const { content } = req.body
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' })
      return
    }
    const ok = updateSection(key!, content)
    if (!ok) {
      res.status(404).json({ error: 'Section not found' })
      return
    }
    console.log(`[Admin] Prompt section "${key}" updated`)
    res.json({ ok: true })
  })

  // POST /api/admin/prompts/reset — reset all sections to defaults
  router.post('/prompts/reset', async (req, res) => {
    if (!(await verifyAdmin(req))) {
      res.status(403).json({ error: 'Unauthorized' })
      return
    }
    resetAll()
    console.log('[Admin] All prompt sections reset to defaults')
    res.json({ ok: true, sections: getAllSections() })
  })

  return router
}
