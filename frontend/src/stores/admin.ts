import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { useAdmin, type PromptSection, type TxState } from '../composables/useAdmin'

export const useAdminStore = defineStore('admin', () => {
  const admin = useAdmin()

  // --- Contract state ---
  const contractState = reactive({
    owner: '',
    paused: false,
    treasury: '',
    totalSupply: 0,
    freeMintsPerUser: 0,
    renderer: '',
    version: '1.0.0',
    maxAdventureLog: 0,
    freeMintFee: null as bigint | null,
    paidMintFee: null as bigint | null,
  })

  const vrfConfig = reactive({
    coordinator: '',
    keyHash: '',
    subId: 0,
    callbackGasLimit: 0,
    requestConfirmations: 0,
  })

  const loading = ref(false)
  const error = ref('')

  async function loadContractState() {
    loading.value = true
    error.value = ''
    try {
      const state = await admin.readContractState()
      Object.assign(contractState, state)
      const vrf = await admin.readVRFConfig()
      Object.assign(vrfConfig, vrf)
    } catch (e: unknown) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  // --- Token query ---
  const tokenQuery = reactive({
    loading: false,
    error: '',
    data: null as Awaited<ReturnType<typeof admin.queryToken>> | null,
  })

  async function queryToken(tokenId: number) {
    tokenQuery.loading = true
    tokenQuery.error = ''
    tokenQuery.data = null
    try {
      tokenQuery.data = await admin.queryToken(tokenId)
    } catch (e: unknown) {
      tokenQuery.error = (e as Error).message
    } finally {
      tokenQuery.loading = false
    }
  }

  // --- Prompt sections ---
  const promptSections = ref<PromptSection[]>([])
  const promptsLoading = ref(false)
  const promptsError = ref('')
  const selectedPromptKey = ref('')
  const promptSaving = ref(false)

  async function loadPrompts() {
    promptsLoading.value = true
    promptsError.value = ''
    try {
      promptSections.value = await admin.fetchPromptSections()
      if (promptSections.value.length > 0 && !selectedPromptKey.value) {
        selectedPromptKey.value = promptSections.value[0]!.key
      }
    } catch (e: unknown) {
      promptsError.value = (e as Error).message
    } finally {
      promptsLoading.value = false
    }
  }

  async function savePrompt(key: string, content: string) {
    promptSaving.value = true
    promptsError.value = ''
    try {
      await admin.savePromptSection(key, content)
      // Update local cache
      const section = promptSections.value.find(s => s.key === key)
      if (section) section.content = content
    } catch (e: unknown) {
      promptsError.value = (e as Error).message
    } finally {
      promptSaving.value = false
    }
  }

  async function resetAllPrompts() {
    promptSaving.value = true
    promptsError.value = ''
    try {
      promptSections.value = await admin.resetPrompts()
    } catch (e: unknown) {
      promptsError.value = (e as Error).message
    } finally {
      promptSaving.value = false
    }
  }

  // --- Transaction states (one per action type) ---
  const txStates: Record<string, TxState> = reactive({})

  function getTxState(key: string): TxState {
    if (!txStates[key]) {
      txStates[key] = admin.createTxState()
    }
    return txStates[key]!
  }

  return {
    // Contract state
    contractState,
    vrfConfig,
    loading,
    error,
    loadContractState,

    // Token query
    tokenQuery,
    queryToken,

    // Prompts
    promptSections,
    promptsLoading,
    promptsError,
    selectedPromptKey,
    promptSaving,
    loadPrompts,
    savePrompt,
    resetAllPrompts,

    // Tx states
    getTxState,
  }
})
