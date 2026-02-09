import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { handleConnection } from './ws.js'

const app = express()
const server = createServer(app)

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// WebSocket server on /ws path
const wss = new WebSocketServer({ server, path: '/ws' })
wss.on('connection', handleConnection)

const PORT = parseInt(process.env.PORT || '3001', 10)
server.listen(PORT, () => {
  console.log(`[GM Backend] Running on port ${PORT}`)
  console.log(`[GM Backend] WebSocket: ws://localhost:${PORT}/ws`)
})
