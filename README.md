# Dungeon Terminal

**AI-Powered RPG on BNB Chain | BAP-578 Non-Fungible Agent Standard**

Dungeon Terminal is an AI-driven dungeon-crawling RPG where players mint NFT companions (Non-Fungible Agents) with unique, VRF-generated traits and explore procedurally narrated dungeons guided by an AI Game Master. Every adventure is different, every companion has personality, and all progression is recorded on-chain.

## Highlights

- **AI Game Master** — LLM-powered narrator creates unique dungeons, encounters, and dialogue every session
- **Living NFT Companions (NFA)** — Each agent has randomized Race, Class, Personality, and Talents generated via Binance Oracle VRF
- **On-Chain Progression** — XP, levels, adventure logs, and kill counts recorded on BSC smart contracts
- **Retro Terminal UI** — Pixel-art dungeon map + real-time chat in a cyberpunk terminal aesthetic
- **BAP-578 Standard** — Implements BNB Chain's official Non-Fungible Agent application-layer proposal

## Architecture

```
┌─────────────┐    WebSocket     ┌─────────────┐    viem/ethers    ┌─────────────┐
│  Frontend   │◄───────────────►│   Backend   │◄────────────────►│  BSC Chain  │
│  Vue 3 + TS │                 │ Express + TS │                  │  Solidity   │
└─────────────┘                 └──────┬──────┘                  └─────────────┘
                                       │
                                ┌──────┴──────┐
                                │  AI Layer   │
                                │ Claude/GPT  │
                                └─────────────┘
```

| Layer | Stack |
|-------|-------|
| **Frontend** | Vue 3, TypeScript, Vite, Pinia, ethers.js |
| **Backend** | Express 5, TypeScript, WebSocket (ws), viem |
| **AI** | Anthropic Claude / OpenAI GPT (multi-provider) |
| **Contracts** | Solidity 0.8.33, OpenZeppelin UUPS Upgradeable, Binance Oracle VRF |
| **Chain** | BNB Smart Chain (BSC) |

## Smart Contracts

**BSC Testnet** — Proxy: [`0xBfb21E02D83875367B3750ce17d04D971A97Bbd7`](https://testnet.bscscan.com/address/0xBfb21E02D83875367B3750ce17d04D971A97Bbd7)

| Contract | Description |
|----------|-------------|
| **DungeonNFA** | ERC-721 + BAP-578 NFA with VRF minting, XP/leveling, on-chain SVG renderer |
| **DungeonNFAV2** | Game server role, adventure logs, game stats tracking |
| **NFARenderer** | On-chain SVG tokenURI generation |

### NFA Traits (VRF-Generated)

- **5 Races** — Human, Elf, Dwarf, Tiefling, Beastkin (each with stat bonuses)
- **6 Classes** — Warrior, Mage, Rogue, Ranger, Cleric, Bard
- **8 Personalities** — Passionate, Calm, Cunning, Kind, Dark, Cheerful, Scholar, Silent
- **5 Talent Rarities** — Common (60%) / Rare (25%) / Epic (10%) / Legendary (4%) / Mythic (1%)

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+
- An AI provider API key (Anthropic or OpenAI)
- MetaMask wallet with BSC Testnet BNB ([faucet](https://www.bnbchain.org/en/testnet-faucet))

### 1. Clone & Install

```bash
git clone https://github.com/anthropic-sol/dungeon-terminal.git
cd dungeon-terminal
npm install
```

### 2. Configure Environment

```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env — set your AI provider key and blockchain config

# Frontend (optional, auto-fetches from backend)
cp frontend/.env.example frontend/.env.local
```

**Backend `.env` key settings:**

```env
# AI Provider (choose one)
GM_PROVIDER=claude-cli          # or: openai | anthropic-sdk | gemini
ANTHROPIC_API_KEY=sk-ant-...    # if using anthropic-sdk
OPENAI_API_KEY=sk-...           # if using openai

# Blockchain (optional — XP granting disabled if missing)
GAME_SERVER_PRIVATE_KEY=0x...
NFA_CONTRACT_ADDRESS=0xBfb21E02D83875367B3750ce17d04D971A97Bbd7
BSC_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
```

### 3. Run Development Server

```bash
npm run dev
```

This starts both frontend (http://localhost:5173) and backend (http://localhost:3001) concurrently.

### 4. Play

1. Open http://localhost:5173
2. Connect MetaMask (BSC Testnet)
3. Mint your first NFA character (free mint)
4. Select your party and enter the dungeon

## Contract Deployment

```bash
cd contracts
cp .env.example .env
# Edit .env with deployer key, treasury address, VRF settings

npm run compile
npm run deploy:testnet    # BSC Testnet
npm run deploy:mainnet    # BSC Mainnet
```

Deploy scripts run in order:
1. `00_deploy_dungeon_nfa.ts` — UUPS proxy + initialize
2. `01_add_vrf_consumer.ts` — Register with Binance Oracle VRF
3. `02_deploy_renderer.ts` — On-chain SVG renderer
4. `03_upgrade_v2.ts` — V2 upgrade (game server, adventure logs)

## Project Structure

```
dungeon-terminal/
├── frontend/          # Vue 3 + Vite SPA
│   └── src/
│       ├── components/    # UI components (PartyPanel, MintPanel, ChatPanel...)
│       ├── composables/   # useNFA, useWeb3, useGameWS, usePixelMap...
│       ├── stores/        # Pinia stores (game, nfa, admin)
│       ├── data/          # Maps, traits, stages, pixel art
│       └── abi/           # Contract ABIs
├── backend/           # Express + WebSocket server
│   └── src/
│       ├── gm/            # AI Game Master (multi-provider)
│       ├── blockchain.ts  # On-chain XP granting & adventure recording
│       └── index.ts       # Server entry point
├── contracts/         # Hardhat + Solidity
│   ├── contracts/         # DungeonNFA, V2, NFARenderer
│   └── deploy/            # Deployment scripts
├── WHITEPAPER.md      # Full game design document
└── SUBMISSION.md      # Hackathon submission details
```

## How It Works

1. **Mint** — Player mints an NFA on BSC. Binance Oracle VRF generates random traits (race, class, personality, stats, talent). On-chain SVG is rendered as tokenURI.

2. **Form Party** — Player selects NFAs from their wallet to form a dungeon party. Each NFA's traits and personality influence gameplay.

3. **Enter Dungeon** — Frontend connects to backend via WebSocket. The AI Game Master receives party composition and generates a unique dungeon session with narration, combat, puzzles, and boss encounters.

4. **Play** — Player types natural language commands. The AI GM responds with story progression, dice rolls, damage events, and map transitions. The pixel-art map and visual effects update in real-time.

5. **Record** — After the session, the backend writes XP and adventure results to the smart contract. Progress persists across sessions.

## License

MIT
