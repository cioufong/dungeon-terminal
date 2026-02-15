const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Contract address: fetch from backend (reads deployments), fallback to .env
let _address = import.meta.env.VITE_NFA_CONTRACT_ADDRESS || ''

export const configReady: Promise<void> = fetch(`${API_BASE}/api/config`)
  .then(r => r.json())
  .then(data => {
    if (data.contractAddress) _address = data.contractAddress
  })
  .catch(() => { /* use env fallback */ })

export function getContractAddress(): string {
  return _address
}
