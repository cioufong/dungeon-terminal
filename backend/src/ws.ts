import type { WebSocket } from 'ws'
import { GameSession } from './session.js'
import { streamGMResponse } from './gm.js'
import { buildSystemPrompt } from './prompts.js'
import { postProcessScene } from './scene-postprocessor.js'
import type { ClientMessage, ServerMessage, HPUpdate } from './types.js'

const sessions = new Map<WebSocket, GameSession>()

// Stage floor → room type mapping
const STAGE_ROOMS: Record<number, string> = {
  1: 'corridor',
  2: 'chamber',
  3: 'crossroads',
  4: 'shrine',
  5: 'boss_room',
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(msg))
  }
}

async function handleInit(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: 'init' }>,
): Promise<void> {
  const session = new GameSession(msg.party, msg.locale, msg.floor, msg.stageName)
  sessions.set(ws, session)

  const systemPrompt = buildSystemPrompt(
    session.party,
    session.floor,
    session.inCombat,
    session.partyHP,
    session.locale,
    session.stageName,
  )

  // First turn: ask Claude to generate the opening scene (customized per stage)
  const roomType = STAGE_ROOMS[session.floor] || 'chamber'
  const stageName = session.stageName || 'the Shadowmere Depths'
  const openingPrompt =
    `The party enters ${stageName}, Floor ${session.floor}. Use [SCENE:set_map:${roomType}] to set the starting room, then [SCENE:move_party:9:8] to place the party. Describe the opening scene — the environment, atmosphere, and what the party sees. Have 1-2 companions react.`

  session.addUserMessage(openingPrompt)

  send(ws, { type: 'stream_start' })

  const result = await streamGMResponse(
    systemPrompt,
    session.conversationHistory,
    (msg) => send(ws, msg),
  )

  // Store CLI session ID for resume on subsequent calls
  if (result.sessionId) session.cliSessionId = result.sessionId

  // Apply HP changes
  const hpUpdates: HPUpdate[] = []
  for (const hc of result.hpChanges) {
    const update = session.applyHP(hc.name, hc.delta)
    if (update) hpUpdates.push(update)
  }
  if (hpUpdates.length > 0) {
    send(ws, { type: 'hp_update', updates: hpUpdates })
  }

  // Track scene state from GM response
  for (const m of result.messages) {
    if (m.type === 'scene') {
      const sm = m as { type: 'scene'; command: string; args: string[] }
      session.updateScene(sm.command, sm.args)
    }
  }

  // Post-process: inject missing SCENE commands
  const injected = postProcessScene(result, session, session.floor)
  for (const msg of injected) {
    send(ws, msg)
    const sm = msg as { command: string; args: string[] }
    session.updateScene(sm.command, sm.args)
  }

  session.addAssistantMessage(result.rawText)

  send(ws, { type: 'stream_end' })
}

async function handleCommand(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: 'command' }>,
): Promise<void> {
  const session = sessions.get(ws)
  if (!session) {
    send(ws, { type: 'error', text: 'No active session. Send init first.' })
    return
  }

  // Augment player message with scene + HP context so the AI stays synchronized
  const ctx = session.getFullContext()
  session.addUserMessage(`${ctx}\nPlayer: ${msg.text}`)

  // Rebuild system prompt with current state (HP may have changed)
  const systemPrompt = buildSystemPrompt(
    session.party,
    session.floor,
    session.inCombat,
    session.partyHP,
    session.locale,
    session.stageName,
  )

  send(ws, { type: 'stream_start' })

  const result = await streamGMResponse(
    systemPrompt,
    session.conversationHistory,
    (msg) => send(ws, msg),
    session.cliSessionId,
  )

  // Update CLI session ID
  if (result.sessionId) session.cliSessionId = result.sessionId

  // Apply HP changes
  const hpUpdates: HPUpdate[] = []
  for (const hc of result.hpChanges) {
    const update = session.applyHP(hc.name, hc.delta)
    if (update) hpUpdates.push(update)
  }
  if (hpUpdates.length > 0) {
    send(ws, { type: 'hp_update', updates: hpUpdates })
  }

  // Track scene state + check for state changes
  for (const m of result.messages) {
    if (m.type === 'scene') {
      const sm = m as { type: 'scene'; command: string; args: string[] }
      session.updateScene(sm.command, sm.args)
    }
    if (m.type === 'sys') {
      const text = (m as { type: 'sys'; text: string }).text.toLowerCase()
      if (text.includes('combat initiated') || text.includes('combat start') || text.includes('战斗开始') || text.includes('進入戰鬥')) {
        session.inCombat = true
      } else if (text.includes('combat end') || text.includes('victory') || text.includes('战斗结束') || text.includes('胜利')) {
        session.inCombat = false
      } else if (text.includes('floor') || text.includes('层') || text.includes('樓')) {
        const floorMatch = text.match(/(?:floor|第)\s*(\d+)/)
        if (floorMatch) {
          session.floor = parseInt(floorMatch[1]!, 10)
        }
      }
    }
  }

  // Post-process: inject missing SCENE commands
  const injected = postProcessScene(result, session, session.floor)
  for (const msg of injected) {
    send(ws, msg)
    const sm = msg as { command: string; args: string[] }
    session.updateScene(sm.command, sm.args)
  }

  session.addAssistantMessage(result.rawText)

  send(ws, { type: 'stream_end' })
}

export function handleConnection(ws: WebSocket): void {
  console.log('[WS] Client connected')

  ws.on('message', async (raw: Buffer) => {
    try {
      const msg: ClientMessage = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'init':
          await handleInit(ws, msg)
          break
        case 'command':
          await handleCommand(ws, msg)
          break
        default:
          send(ws, { type: 'error', text: `Unknown message type` })
      }
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Invalid message'
      send(ws, { type: 'error', text })
    }
  })

  ws.on('close', () => {
    sessions.delete(ws)
    console.log('[WS] Client disconnected')
  })

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message)
    sessions.delete(ws)
  })
}

// Session cleanup timer
setInterval(() => {
  for (const [ws, session] of sessions) {
    if (session.isStale()) {
      console.log('[WS] Cleaning up stale session')
      ws.close()
      sessions.delete(ws)
    }
  }
}, 60_000)
