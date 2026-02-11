import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { handleConnection } from './ws.js'
import { initBlockchain } from './blockchain.js'
import { createAdminRouter } from './admin-api.js'

// Ensure prompt defaults are registered before anything uses them
import './prompts.js'

const app = express()
const server = createServer(app)

// Middleware
app.use(express.json())
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-address, x-admin-signature, x-admin-timestamp')
  res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS')
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Admin API
app.use('/api/admin', createAdminRouter())

// WebSocket server on /ws path
const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', handleConnection)

initBlockchain()

const PORT = parseInt(process.env.PORT || '3001', 10)
server.listen(PORT, () => {
  console.log(`[GM Backend] Running on port ${PORT}`)
  console.log(`[GM Backend] WebSocket: ws://localhost:${PORT}/ws`)
  console.log(`[GM Backend] Admin API: http://localhost:${PORT}/api/admin`)
})
