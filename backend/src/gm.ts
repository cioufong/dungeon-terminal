import { spawn } from 'child_process'
import type { ServerMessage, ConversationMessage } from './types.js'

const MODEL = 'sonnet'
const MAX_TOKENS = 1024

// Detect auth mode
const USE_CLI = !!process.env.ANTHROPIC_AUTH_TOKEN
if (USE_CLI) {
  console.log('[GM] Using claude CLI proxy (OAuth token)')
} else {
  console.log('[GM] Using Anthropic SDK (API key)')
}

// --- Response line parser ---

interface ParsedHP {
  name: string
  delta: number
}

function parseLine(line: string): { msg: ServerMessage | null; hp: ParsedHP | null } {
  // [GM] text
  let m = line.match(/^\[GM\]\s*(.+)$/)
  if (m) return { msg: { type: 'gm', text: m[1]! }, hp: null }

  // [NFA:Name] text
  m = line.match(/^\[NFA:(.+?)\]\s*(.+)$/)
  if (m) return { msg: { type: 'nfa', name: m[1]!, text: m[2]! }, hp: null }

  // [ROLL] text
  m = line.match(/^\[ROLL\]\s*(.+)$/)
  if (m) return { msg: { type: 'roll', text: m[1]! }, hp: null }

  // [DMG] text
  m = line.match(/^\[DMG\]\s*(.+)$/)
  if (m) return { msg: { type: 'dmg', text: m[1]! }, hp: null }

  // [SYS] text
  m = line.match(/^\[SYS\]\s*(.+)$/)
  if (m) return { msg: { type: 'sys', text: m[1]! }, hp: null }

  // [SCENE:command:arg1:arg2:...]
  m = line.match(/^\[SCENE:(.+)\]$/)
  if (m) {
    const parts = m[1]!.split(':')
    return { msg: { type: 'scene', command: parts[0]!, args: parts.slice(1) }, hp: null }
  }

  // [CHOICE:option1|option2|option3]
  m = line.match(/^\[CHOICE:(.+)\]$/)
  if (m) {
    const options = m[1]!.split('|').map(s => s.trim()).filter(Boolean)
    return { msg: { type: 'choices', options }, hp: null }
  }

  // [XP:amount]
  m = line.match(/^\[XP:(\d+)\]$/)
  if (m) return { msg: { type: 'xp_gain', amount: parseInt(m[1]!, 10) } as ServerMessage, hp: null }

  // [HP:Name:±N]
  m = line.match(/^\[HP:(.+?):([+-]?\d+)\]$/)
  if (m) return { msg: null, hp: { name: m[1]!, delta: parseInt(m[2]!, 10) } }

  // Unrecognized line — treat as GM narration if non-empty
  if (line.length > 0) {
    return { msg: { type: 'gm', text: line }, hp: null }
  }

  return { msg: null, hp: null }
}

// --- Streaming GM response ---

export interface StreamResult {
  messages: ServerMessage[]
  hpChanges: ParsedHP[]
  rawText: string
  sessionId?: string
}

// Build a single prompt string from system prompt + conversation history
function buildFullPrompt(systemPrompt: string, history: ConversationMessage[]): string {
  // Combine system prompt + conversation into a single prompt for claude CLI
  const parts: string[] = []
  for (const m of history) {
    if (m.role === 'user') {
      parts.push(`[Player]: ${m.content}`)
    } else {
      parts.push(`[Previous GM Response]:\n${m.content}`)
    }
  }
  return parts.join('\n\n')
}

// --- Parse lines helper (shared by CLI modes) ---

function parseLines(
  text: string,
  messages: ServerMessage[],
  hpChanges: ParsedHP[],
  onMessage: (msg: ServerMessage) => void,
): void {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue
    const { msg, hp } = parseLine(line)
    if (msg) { messages.push(msg); onMessage(msg) }
    if (hp) hpChanges.push(hp)
  }
}

// --- CLI-based streaming (for OAuth token) ---

function streamViaCLI(
  systemPrompt: string,
  history: ConversationMessage[],
  onMessage: (msg: ServerMessage) => void,
  resumeSessionId?: string,
): Promise<StreamResult> {
  return new Promise((resolve) => {
    const messages: ServerMessage[] = []
    const hpChanges: ParsedHP[] = []
    let rawText = ''
    let buffer = ''
    let sessionId = resumeSessionId

    const isResume = !!resumeSessionId

    // Resume: only send latest user message (session has history)
    // New session: send full conversation history
    let prompt: string
    if (isResume) {
      const lastMsg = history[history.length - 1]
      prompt = lastMsg?.role === 'user' ? lastMsg.content : ''
    } else {
      prompt = buildFullPrompt(systemPrompt, history)
    }

    console.log(`[GM:CLI] ${isResume ? 'Resume ' + resumeSessionId : 'New session'}, prompt length: ${prompt.length}`)

    const args = ['-p', '--model', MODEL]

    if (isResume) {
      // Resume: streaming text + session continuation
      args.push('--resume', resumeSessionId!, '--output-format', 'text')
    } else {
      // First call: JSON to capture session_id
      args.push('--output-format', 'json', '--system-prompt', systemPrompt)
    }

    const proc = spawn('claude', args, {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CLAUDE_CODE_OAUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdin.write(prompt)
    proc.stdin.end()

    if (isResume) {
      // Streaming text mode — emit messages as lines arrive
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        buffer += text
        rawText += text

        while (buffer.includes('\n')) {
          const idx = buffer.indexOf('\n')
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)

          if (line.length === 0) continue
          const { msg, hp } = parseLine(line)
          if (msg) { messages.push(msg); onMessage(msg) }
          if (hp) hpChanges.push(hp)
        }
      })
    } else {
      // JSON mode — buffer everything for final parse
      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
      })
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.error('[GM:CLI:stderr]', text)
    })

    proc.on('close', () => {
      if (isResume) {
        // Process remaining streaming buffer
        const remaining = buffer.trim()
        if (remaining.length > 0) {
          const { msg, hp } = parseLine(remaining)
          if (msg) { messages.push(msg); onMessage(msg) }
          if (hp) hpChanges.push(hp)
        }
      } else {
        // Parse JSON response to extract session_id + result text
        try {
          const json = JSON.parse(buffer)
          sessionId = json.session_id || json.sessionId
          const resultText: string = json.result || ''
          rawText = resultText
          parseLines(resultText, messages, hpChanges, onMessage)
          console.log('[GM:CLI] Got session_id:', sessionId)
        } catch {
          // Fallback: treat buffer as plain text (json parse failed)
          console.error('[GM:CLI] JSON parse failed, falling back to text')
          rawText = buffer
          parseLines(buffer, messages, hpChanges, onMessage)
        }
      }

      resolve({ messages, hpChanges, rawText, sessionId })
    })

    proc.on('error', (err) => {
      const errorMsg: ServerMessage = { type: 'error', text: err.message }
      messages.push(errorMsg)
      onMessage(errorMsg)
      resolve({ messages, hpChanges, rawText, sessionId })
    })
  })
}

// --- SDK-based streaming (for API key) ---

async function streamViaSDK(
  systemPrompt: string,
  history: ConversationMessage[],
  onMessage: (msg: ServerMessage) => void,
): Promise<StreamResult> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic()
  const messages: ServerMessage[] = []
  const hpChanges: ParsedHP[] = []
  let rawText = ''

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: history.map(m => ({ role: m.role, content: m.content })),
    })

    let buffer = ''

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        buffer += event.delta.text
        rawText += event.delta.text

        while (buffer.includes('\n')) {
          const idx = buffer.indexOf('\n')
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)

          if (line.length === 0) continue

          const { msg, hp } = parseLine(line)
          if (msg) {
            messages.push(msg)
            onMessage(msg)
          }
          if (hp) {
            hpChanges.push(hp)
          }
        }
      }
    }

    const remaining = buffer.trim()
    if (remaining.length > 0) {
      const { msg, hp } = parseLine(remaining)
      if (msg) {
        messages.push(msg)
        onMessage(msg)
      }
      if (hp) {
        hpChanges.push(hp)
      }
    }
  } catch (err) {
    const errorText = err instanceof Error ? err.message : 'Unknown error'
    const errorMsg: ServerMessage = { type: 'error', text: errorText }
    messages.push(errorMsg)
    onMessage(errorMsg)
  }

  return { messages, hpChanges, rawText }
}

// --- Public API ---

export async function streamGMResponse(
  systemPrompt: string,
  history: ConversationMessage[],
  onMessage: (msg: ServerMessage) => void,
  resumeSessionId?: string,
): Promise<StreamResult> {
  if (USE_CLI) {
    return streamViaCLI(systemPrompt, history, onMessage, resumeSessionId)
  }
  return streamViaSDK(systemPrompt, history, onMessage)
}
