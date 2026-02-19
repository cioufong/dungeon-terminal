import { ref, computed, markRaw } from 'vue'
import { BrowserProvider, JsonRpcSigner } from 'ethers'

const CHAIN_CONFIGS: Record<number, { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  56: {
    chainId: '0x38',
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed1.binance.org/'],
    blockExplorerUrls: ['https://bscscan.com'],
  },
  97: {
    chainId: '0x61',
    chainName: 'BNB Smart Chain Testnet',
    nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
    rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545/'],
    blockExplorerUrls: ['https://testnet.bscscan.com'],
  },
}

const EXPECTED_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID || 56)
const TARGET_CHAIN = CHAIN_CONFIGS[EXPECTED_CHAIN_ID] || CHAIN_CONFIGS[56]!

const provider = ref<BrowserProvider | null>(null)
const signer = ref<JsonRpcSigner | null>(null)
const address = ref('')
const chainId = ref(0)
const isConnecting = ref(false)

const isConnected = computed(() => !!address.value)
const isCorrectChain = computed(() => chainId.value === EXPECTED_CHAIN_ID)

function getEthereum(): any {
  return (window as any).ethereum
}

async function connect() {
  const eth = getEthereum()
  if (!eth) {
    alert('Please install MetaMask')
    return
  }

  isConnecting.value = true
  try {
    const p = markRaw(new BrowserProvider(eth))
    provider.value = p

    await eth.request({ method: 'eth_requestAccounts' })
    const s = await p.getSigner()
    signer.value = markRaw(s)
    address.value = await s.getAddress()

    const network = await p.getNetwork()
    chainId.value = Number(network.chainId)

    // Listen for changes
    eth.on('accountsChanged', handleAccountsChanged)
    eth.on('chainChanged', handleChainChanged)
  } catch (e) {
    console.error('Connect failed:', e)
  } finally {
    isConnecting.value = false
  }
}

function disconnect() {
  const eth = getEthereum()
  if (eth) {
    eth.removeListener('accountsChanged', handleAccountsChanged)
    eth.removeListener('chainChanged', handleChainChanged)
  }
  provider.value = null
  signer.value = null
  address.value = ''
  chainId.value = 0
}

async function switchToCorrectChain() {
  const eth = getEthereum()
  if (!eth) return

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: TARGET_CHAIN.chainId }],
    })
  } catch (err: any) {
    // Chain not added yet → add it
    if (err.code === 4902) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [TARGET_CHAIN],
      })
    }
  }
}

function handleAccountsChanged(accounts: string[]) {
  if (accounts.length === 0) {
    disconnect()
  } else {
    address.value = accounts[0] ?? ''
  }
}

function handleChainChanged(_chainIdHex: string) {
  // Reload on chain change (recommended by MetaMask)
  window.location.reload()
}

function shortAddress(addr: string): string {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export function useWeb3() {
  return {
    provider,
    signer,
    address,
    chainId,
    isConnected,
    isCorrectChain,
    isConnecting,
    connect,
    disconnect,
    switchToCorrectChain,
    shortAddress,
  }
}
