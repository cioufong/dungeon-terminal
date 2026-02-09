import { ref, readonly } from 'vue'

// Server message types (matches backend ServerMessage)
export interface HPUpdate {
  name: string
  hp: number
  maxHp: number
}

export type ServerMessage =
  | { type: 'stream_start' }
  | { type: 'gm'; text: string }
  | { type: 'nfa'; name: string; text: string }
  | { type: 'roll'; text: string }
  | { type: 'dmg'; text: string }
  | { type: 'sys'; text: string }
  | { type: 'hp_update'; updates: HPUpdate[] }
  | { type: 'scene'; command: string; args: string[] }
  | { type: 'choices'; options: string[] }
  | { type: 'xp_gain'; amount: number }
  | { type: 'stream_end' }
  | { type: 'error'; text: string }

let ws: WebSocket | null = null
let messageHandler: ((msg: ServerMessage) => void) | null = null

const connected = ref(false)
const streaming = ref(false)

export function useGameWS() {
  function connect(url?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = url || import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws'

      if (ws && ws.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      ws = new WebSocket(wsUrl)

      ws.onopen = () => {
        connected.value = true
        resolve()
      }

      ws.onclose = () => {
        connected.value = false
        streaming.value = false
        ws = null
      }

      ws.onerror = () => {
        connected.value = false
        reject(new Error('WebSocket connection failed'))
      }

      ws.onmessage = (event) => {
        const msg: ServerMessage = JSON.parse(event.data as string)

        if (msg.type === 'stream_start') {
          streaming.value = true
        } else if (msg.type === 'stream_end') {
          streaming.value = false
        }

        if (messageHandler) messageHandler(msg)
      }
    })
  }

  function disconnect(): void {
    ws?.close()
    ws = null
  }

  function sendInit(party: unknown[], locale?: string, floor?: number, stageName?: string): void {
    ws?.send(JSON.stringify({ type: 'init', party, locale, floor, stageName }))
  }

  function sendCommand(text: string): void {
    ws?.send(JSON.stringify({ type: 'command', text }))
  }

  function setMessageHandler(handler: (msg: ServerMessage) => void): void {
    messageHandler = handler
  }

  return {
    connected: readonly(connected),
    streaming: readonly(streaming),
    connect,
    disconnect,
    sendInit,
    sendCommand,
    setMessageHandler,
  }
}
