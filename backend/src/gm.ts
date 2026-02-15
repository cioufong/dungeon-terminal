import { spawn } from 'child_process'
import type { ServerMessage, ConversationMessage } from './types.js'

const MAX_TOKENS = 1024

// Detect auth mode via GM_PROVIDER: openai | gemini | claude-cli | anthropic-sdk (default)
const GM_PROVIDER = process.env.GM_PROVIDER || 'anthropic-sdk'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'sonnet'
const SDK_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

switch (GM_PROVIDER) {
  case 'gemini': console.log(`[GM] Using Gemini CLI (model: ${GEMINI_MODEL})`); break
  case 'claude-cli': console.log(`[GM] Using Claude CLI (model: ${CLAUDE_MODEL})`); break
  case 'openai': console.log(`[GM] Using OpenAI SDK (model: ${OPENAI_MODEL})`); break
  default: console.log(`[GM] Using Anthropic SDK (model: ${SDK_MODEL})`)
}

// --- Response line parser ---

interface ParsedHP {
  name: string
  delta: number
}

interface ParseResult { msg: ServerMessage | null; hp: ParsedHP | null }

function parseLine(line: string): ParseResult[] {
  const results: ParseResult[] = []

  // Extract inline tags that may be embedded in narrative text.
  // We pull out [SCENE:...], [CHOICE:...], [XP:...], [HP:...] from anywhere in the line,
  // then process the remaining text as a normal tagged/untagged line.
  const inlineTags: string[] = []
  const cleaned = line.replace(/\[(?:SCENE|CHOICE|XP|HP|ATTACK|DAMAGE|COMBAT):[^\]]+\]/g, (match) => {
    inlineTags.push(match)
    return ''
  }).trim()

  // Process the remaining text (without inline tags)
  if (cleaned.length > 0) {
    const r = parseSingleTag(cleaned)
    if (r.msg || r.hp) results.push(r)
  }

  // Process extracted inline tags
  for (const tag of inlineTags) {
    const r = parseSingleTag(tag)
    if (r.msg || r.hp) results.push(r)
  }

  return results.length > 0 ? results : [{ msg: null, hp: null }]
}

function parseSingleTag(rawLine: string): ParseResult {
  // Strip leading asterisk bullets (* ) that the AI adds as markdown
  const line = rawLine.replace(/^\*\s+/, '')

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
  m = line.match(/\[SCENE:(.+?)\]/)
  if (m) {
    const parts = m[1]!.split(':')
    return { msg: { type: 'scene', command: parts[0]!, args: parts.slice(1) }, hp: null }
  }

  // [CHOICE:option1|option2|option3]
  m = line.match(/\[CHOICE:(.+?)\]/)
  if (m) {
    const options = m[1]!.split('|').map(s => s.trim()).filter(Boolean)
    return { msg: { type: 'choices', options }, hp: null }
  }

  // [XP:amount]
  m = line.match(/\[XP:(\d+)\]/)
  if (m) return { msg: { type: 'xp_gain', amount: parseInt(m[1]!, 10) } as ServerMessage, hp: null }

  // [HP:Name:±N]
  m = line.match(/\[HP:(.+?):([+-]?\d+)\]/)
  if (m) return { msg: null, hp: { name: m[1]!, delta: parseInt(m[2]!, 10) } }

  // Fallback: [ATTACK: attacker → target, 伤害/damage: N]
  // The AI sometimes generates these instead of [HP:Name:-N]
  m = line.match(/\[ATTACK:.*?→\s*(.+?),\s*(?:伤害|damage|傷害)[:\s]*(\d+)\s*\]/)
  if (m) {
    const name = m[1]!.trim()
    const dmg = parseInt(m[2]!, 10)
    return { msg: { type: 'dmg', text: line.replace(/^\[ATTACK:/, '').replace(/\]$/, '').trim() }, hp: { name, delta: -dmg } }
  }

  // Fallback: [COMBAT:enemy_attack:target:N] or [COMBAT:player_attack:target:N]
  m = line.match(/\[COMBAT:(\w+_?\w*):(\w+(?:\s*#\d+)?):(\d+)\]/)
  if (m) {
    const action = m[1]!.toLowerCase()
    const target = m[2]!.trim()
    const amount = parseInt(m[3]!, 10)
    if (action.includes('enemy') || action.includes('monster')) {
      return { msg: { type: 'dmg', text: `${target} takes ${amount} damage` }, hp: { name: target, delta: -amount } }
    }
    return { msg: { type: 'dmg', text: `Attack on ${target} for ${amount} damage` }, hp: null }
  }

  // Fallback: [COMBAT:X 攻击/反击 Y,造成 N 点伤害] (Chinese free-form COMBAT tags)
  m = line.match(/\[COMBAT:(.+?)\s+(?:攻击|攻擊|反击|反擊|attacks?)\s+(.+?)[,，]\s*(?:造成|dealing)\s*(\d+)\s*(?:点|點)?\s*(?:伤害|傷害|damage)/i)
  if (m) {
    const attacker = m[1]!.trim()
    const target = m[2]!.trim()
    const amount = parseInt(m[3]!, 10)
    const text = `${attacker} attacks ${target} for ${amount} damage`
    // If attacker is an enemy (not a party member), apply HP to target
    const isEnemyAttack = !attacker.includes('#') && !attacker.toLowerCase().includes('player')
    return { msg: { type: 'dmg', text }, hp: isEnemyAttack ? { name: target, delta: -amount } : null }
  }

  // Fallback: [COMBAT:X 被击败/defeated] (defeat notices)
  m = line.match(/\[COMBAT:(.+?)(?:被击败|被擊敗|defeated|dies)\]/)
  if (m) {
    return { msg: { type: 'sys', text: `${m[1]!.trim()} defeated` }, hp: null }
  }

  // Fallback: [DAMAGE/DMG/COMBAT: target takes N damage]
  m = line.match(/\[(?:DAMAGE|DMG|COMBAT)[:\s].*?(\S+(?:\s+#\d+)?)\s*(?:takes?|受到|receives?)\s*(\d+)\s*(?:damage|点伤害|點傷害|伤害)?/i)
  if (m) {
    const name = m[1]!.trim()
    const dmg = parseInt(m[2]!, 10)
    return { msg: { type: 'dmg', text: line.replace(/^\[\w+[:\s]/, '').replace(/\]$/, '').trim() }, hp: { name, delta: -dmg } }
  }

  // Ignore invented tags: [REWARD:...], [ITEM:...], [ENEMY:...], [COMBAT:START], [HP Status:...], etc.
  if (/^\[(?:REWARD|ITEM|LOOT|GOLD|QUEST|STATUS|INFO|NOTE|MUSIC|SOUND|BGM|ENEMY|EFFECT|EVENT):/.test(line)) {
    return { msg: null, hp: null }
  }
  if (/^\[COMBAT:(?:START|END|start|end)\]/.test(line)) {
    return { msg: null, hp: null }
  }
  if (/^\[COMBAT:\w+_attack:/.test(line) && !/\d/.test(line)) {
    // [COMBAT:enemy_attack:Well Horror] — no damage number, useless, drop
    return { msg: null, hp: null }
  }
  if (/^\[HP\s*Status:/i.test(line)) {
    return { msg: null, hp: null }
  }

  // Free-text damage: "对{target}造成 {N}点伤害" or "→ 对{target}造成 {N}点伤害"
  m = line.match(/对\s*(.+?)\s*造成\s*(\d+)\s*(?:点|點)\s*(?:伤害|傷害)/)
  if (m) {
    const target = m[1]!.trim()
    const amount = parseInt(m[2]!, 10)
    // Clean display text (strip asterisks and leading symbols)
    const text = line.replace(/^\*\s*/, '').replace(/^\[.*?\]\s*/, '').trim()
    return { msg: { type: 'dmg', text }, hp: { name: target, delta: -amount } }
  }

  // Filter out meta-commentary (AI breaking character)
  if (/^(?:\*\s*)?(?:I can see|Here'?s|This (?:continues|is|shows|demonstrates)|Note:|Let me|Now the|---\s*$)/i.test(line)) {
    return { msg: null, hp: null }
  }

  // Fallback: untagged companion dialogue like 'Name #N: "text"' or 'Name: "text"'
  m = line.match(/^(.+?#\d+)\s*[:：]\s*(.+)$/)
  if (!m) m = line.match(/^([A-Za-z\u4e00-\u9fff]+(?:\s+#\d+)?)\s*[:：]\s*["\"「](.+)$/)
  if (m) {
    const name = m[1]!.trim()
    const text = m[2]!.replace(/[*]/g, '').trim()
    return { msg: { type: 'nfa', name, text }, hp: null }
  }

  // Unrecognized line — treat as GM narration if non-empty
  if (line.length > 0) {
    return { msg: { type: 'gm', text: line.replace(/^\*\s*/, '') }, hp: null }
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
    for (const { msg, hp } of parseLine(line)) {
      if (msg) { messages.push(msg); onMessage(msg) }
      if (hp) hpChanges.push(hp)
    }
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

    const args = ['-p', '--model', CLAUDE_MODEL]

    if (isResume) {
      // Resume: streaming text + session continuation
      args.push('--resume', resumeSessionId!, '--output-format', 'text')
    } else {
      // First call: JSON to capture session_id
      // Embed system prompt in body AND pass via --system-prompt for maximum enforcement
      args.push('--output-format', 'json', '--system-prompt', systemPrompt)
      prompt = `[SYSTEM INSTRUCTIONS — YOU MUST FOLLOW THESE EXACTLY]\n${systemPrompt}\n[END SYSTEM INSTRUCTIONS]\n\n${prompt}`
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
          for (const { msg, hp } of parseLine(line)) {
            if (msg) { messages.push(msg); onMessage(msg) }
            if (hp) hpChanges.push(hp)
          }
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
          for (const { msg, hp } of parseLine(remaining)) {
            if (msg) { messages.push(msg); onMessage(msg) }
            if (hp) hpChanges.push(hp)
          }
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
      model: SDK_MODEL,
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

          for (const { msg, hp } of parseLine(line)) {
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
    }

    const remaining = buffer.trim()
    if (remaining.length > 0) {
      for (const { msg, hp } of parseLine(remaining)) {
        if (msg) {
          messages.push(msg)
          onMessage(msg)
        }
        if (hp) {
          hpChanges.push(hp)
        }
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

// --- OpenAI SDK-based streaming ---

async function streamViaOpenAI(
  systemPrompt: string,
  history: ConversationMessage[],
  onMessage: (msg: ServerMessage) => void,
): Promise<StreamResult> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI()
  const messages: ServerMessage[] = []
  const hpChanges: ParsedHP[] = []
  let rawText = ''

  try {
    const chatMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    ]

    const stream = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: MAX_TOKENS,
      messages: chatMessages,
      stream: true,
    })

    let buffer = ''

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (!delta) continue

      buffer += delta
      rawText += delta

      while (buffer.includes('\n')) {
        const idx = buffer.indexOf('\n')
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)

        if (line.length === 0) continue
        for (const { msg, hp } of parseLine(line)) {
          if (msg) { messages.push(msg); onMessage(msg) }
          if (hp) hpChanges.push(hp)
        }
      }
    }

    const remaining = buffer.trim()
    if (remaining.length > 0) {
      for (const { msg, hp } of parseLine(remaining)) {
        if (msg) { messages.push(msg); onMessage(msg) }
        if (hp) hpChanges.push(hp)
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

// --- Gemini CLI-based streaming ---

function streamViaGeminiCLI(
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

    // Gemini CLI has no --system-prompt flag, so embed it in the prompt
    let prompt: string
    if (isResume) {
      const lastMsg = history[history.length - 1]
      prompt = lastMsg?.role === 'user' ? lastMsg.content : ''
    } else {
      // First call: embed system prompt + conversation history
      const parts: string[] = [
        `[System Instructions — follow these exactly]\n${systemPrompt}\n[End System Instructions]\n`,
      ]
      for (const m of history) {
        if (m.role === 'user') {
          parts.push(`[Player]: ${m.content}`)
        } else {
          parts.push(`[Previous GM Response]:\n${m.content}`)
        }
      }
      prompt = parts.join('\n\n')
    }

    console.log(`[GM:Gemini] ${isResume ? 'Resume ' + resumeSessionId : 'New session'}, prompt length: ${prompt.length}`)

    const args = ['-p', prompt, '-m', GEMINI_MODEL]

    if (isResume) {
      args.push('-r', resumeSessionId!, '-o', 'text')
    } else {
      args.push('-o', 'json')
    }

    const proc = spawn('gemini', args, {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    if (isResume) {
      // Streaming text mode
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        buffer += text
        rawText += text

        while (buffer.includes('\n')) {
          const idx = buffer.indexOf('\n')
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)

          if (line.length === 0) continue
          for (const { msg, hp } of parseLine(line)) {
            if (msg) { messages.push(msg); onMessage(msg) }
            if (hp) hpChanges.push(hp)
          }
        }
      })
    } else {
      // JSON mode — buffer everything
      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
      })
    }

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text && !text.startsWith('Loaded cached') && !text.startsWith('Hook registry')) {
        console.error('[GM:Gemini:stderr]', text)
      }
    })

    proc.on('close', () => {
      if (isResume) {
        const remaining = buffer.trim()
        if (remaining.length > 0) {
          for (const { msg, hp } of parseLine(remaining)) {
            if (msg) { messages.push(msg); onMessage(msg) }
            if (hp) hpChanges.push(hp)
          }
        }
      } else {
        // Parse JSON response
        try {
          const json = JSON.parse(buffer)
          sessionId = json.session_id
          const resultText: string = json.response || ''
          rawText = resultText
          parseLines(resultText, messages, hpChanges, onMessage)
          console.log('[GM:Gemini] Got session_id:', sessionId)
        } catch {
          console.error('[GM:Gemini] JSON parse failed, falling back to text')
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

// --- Public API ---

export async function streamGMResponse(
  systemPrompt: string,
  history: ConversationMessage[],
  onMessage: (msg: ServerMessage) => void,
  resumeSessionId?: string,
): Promise<StreamResult> {
  switch (GM_PROVIDER) {
    case 'openai':
      return streamViaOpenAI(systemPrompt, history, onMessage)
    case 'gemini':
      return streamViaGeminiCLI(systemPrompt, history, onMessage, resumeSessionId)
    case 'claude-cli':
      return streamViaCLI(systemPrompt, history, onMessage, resumeSessionId)
    default:
      return streamViaSDK(systemPrompt, history, onMessage)
  }
}
