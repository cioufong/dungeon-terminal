import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

/**
 * Load contract address: deployments first, env fallback.
 */
export function loadContractAddress(): string {
  // 1. Primary: auto-detect from contracts/deployments (works from both src/ and dist/)
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const candidates = [
      resolve(__dirname, '../../contracts/deployments/bscTestnet/DungeonNFA_Proxy.json'),
      resolve(__dirname, '../contracts/deployments/bscTestnet/DungeonNFA_Proxy.json'),
    ]
    for (const proxyPath of candidates) {
      try {
        const json = JSON.parse(readFileSync(proxyPath, 'utf-8'))
        if (json.address) {
          return json.address
        }
      } catch { /* try next */ }
    }
  } catch { /* deployment file not found */ }
  // 2. Fallback: environment variable
  return process.env.NFA_CONTRACT_ADDRESS || ''
}
