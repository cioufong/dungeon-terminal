import WebSocket from 'ws'

const ws = new WebSocket('ws://localhost:3001/ws')

ws.on('open', () => {
  console.log('[TEST] Connected to ws://localhost:3001/ws')
  const init = {
    type: 'init',
    party: [{
      name: 'Elf Mage #42',
      level: 1,
      className: 'Mage',
      hp: 18,
      maxHp: 18,
      traits: {
        race: 1,
        class_: 1,
        personality: 2,
        talentId: 5,
        talentRarity: 1,
        baseStats: [8, 12, 10, 16, 14, 11]
      }
    }]
  }
  ws.send(JSON.stringify(init))
  console.log('[TEST] Sent init, waiting for GM response...\n')
})

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString())
  if (msg.type === 'stream_start') {
    console.log('--- STREAM START ---')
  } else if (msg.type === 'stream_end') {
    console.log('--- STREAM END ---')
    console.log('\n[TEST] Sending player command...\n')
    ws.send(JSON.stringify({ type: 'command', text: 'I look around the room carefully.' }))
  } else if (msg.type === 'gm') {
    console.log(`[GM] ${msg.text}`)
  } else if (msg.type === 'nfa') {
    console.log(`[NFA:${msg.name}] ${msg.text}`)
  } else if (msg.type === 'roll') {
    console.log(`[ROLL] ${msg.text}`)
  } else if (msg.type === 'dmg') {
    console.log(`[DMG] ${msg.text}`)
  } else if (msg.type === 'sys') {
    console.log(`[SYS] ${msg.text}`)
  } else if (msg.type === 'hp_update') {
    console.log(`[HP] ${JSON.stringify(msg.updates)}`)
  } else if (msg.type === 'error') {
    console.error(`[ERROR] ${msg.text}`)
  } else {
    console.log('[MSG]', JSON.stringify(msg))
  }
})

ws.on('error', (err) => console.error('[ERR]', err.message))
ws.on('close', () => { console.log('\n[TEST] Connection closed'); process.exit(0) })

// Auto-close after 3 minutes
setTimeout(() => {
  console.log('\n[TEST] Timeout reached, closing')
  ws.close()
  process.exit(0)
}, 180000)
