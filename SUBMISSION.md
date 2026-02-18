# Dungeon Terminal — Hackathon Submission

## 1. Project Name

Dungeon Terminal

## 2. Track

**Agent** — AI agents executing onchain transactions

## 3. One-Liner

An AI-powered dungeon-crawling RPG where NFT companions (Non-Fungible Agents) have unique personalities, explore procedurally narrated dungeons, and record all progression on-chain via the BAP-578 standard.

## 4. Team

| Name | Role |
|------|------|
| Leo | Solo developer — smart contracts, backend, frontend, game design |

## 5. Onchain Proof

| Item | Value |
|------|-------|
| **Network** | BNB Smart Chain Testnet |
| **Proxy Contract** | [`0xBfb21E02D83875367B3750ce17d04D971A97Bbd7`](https://testnet.bscscan.com/address/0xBfb21E02D83875367B3750ce17d04D971A97Bbd7) |
| **Standard** | BAP-578 (Non-Fungible Agent) |

## 6. Links

| Link | URL |
|------|-----|
| **GitHub** | [github.com/cioufong/dungeon-terminal](https://github.com/cioufong/dungeon-terminal) |
| **Demo** | <!-- TODO: deployed URL or video link --> |

## 7. Tech Stack

| Layer | Stack |
|-------|-------|
| **Frontend** | Vue 3, TypeScript, Vite, Pinia, ethers.js |
| **Backend** | Express 5, TypeScript, WebSocket (ws), viem |
| **AI** | Multi-provider: Anthropic Claude, OpenAI GPT, Google Gemini |
| **Contracts** | Solidity 0.8.33, OpenZeppelin UUPS Upgradeable, Hardhat |
| **On-chain RNG** | Binance Oracle VRF |
| **Chain** | BNB Smart Chain (BSC) |

## 8. Detailed Project Description (Full Version)

### The Problem: The "Dead" Metaverse
Most GameFi projects today feel like second jobs. You buy a static NFT, click a button to 'stake' or 'battle', and watch a number go up. There is no story, no emotion, and no connection. The characters are dead assets, and the gameplay is repetitive grinding.

### The Solution: Living Companions
**Dungeon Terminal** breathes life into the blockchain. We use the **BAP-578** standard to turn NFTs into **NFAs (Non-Fungible Agents)**. When you mint a hero, you're not just getting a JPEG with stats; you're birthing a unique AI personality—with its own voice, quirks, fears, and memory.

This isn't just a game; it's a social experience with an AI. It brings the "Good Vibes" of tabletop role-playing games (like D&D) to the blockchain, where the journey and the story matter more than the grind.

### Core Gameplay Loop
1.  **Mint & Bond:** You mint a hero using BNB. The **Binance Oracle VRF** ensures fair trait generation (Race, Class). Then, our AI engine generates a unique backstory and personality. *Example: You summon "Grug", an Orc Barbarian who is surprisingly poetic but afraid of mice.*
2.  **Adventure:** You enter a text-based dungeon via our retro Terminal UI. The **AI Game Master** procedurally generates the dungeon layout, descriptions, and encounters. No two runs are ever the same.
3.  **Co-op Interaction:** You don't fight alone. Your NFA teammate (*Grug*) talks to you in the chat. "Boss, the shadows whisper... I do not like this poem." You type natural language commands to guide him.
4.  **Growth & Memory:** Every victory and defeat is recorded. Using BAP-578's metadata structure, your Agent "remembers" key events, evolving its personality over time.

### Technical Innovation
- **BAP-578 Standard:** We are one of the first projects to fully implement the BNB Chain's Non-Fungible Agent standard, proving its viability for gaming.
- **AI-Native Logic:** The game logic isn't just `if/else`. The AI GM arbitrates complex scenarios, allowing for creative player solutions (e.g., "I try to bribe the goblin with a sandwich").
- **Verifiable Fairness:** Critical RNG (minting) is secured by on-chain VRF, ensuring transparency.

### Why "Good Vibes"?
Dungeon Terminal is built on **cooperation**, not competition. It's about the cozy feeling of exploring a mystery with a friend—even if that friend is an AI living on the blockchain.

## 9. BAP-578 Implementation Details

Our contract implements the full BAP-578 NFA lifecycle:

| BAP-578 Feature | Implementation |
|------------------|----------------|
| **Agent Metadata** | On-chain `experience` and `vaultURI` per token |
| **Experience** | Text summary of adventure history, updated by game server after each session |
| **Vault** | JSON payload (base64 data URI) with session highlights, party composition, kill counts; integrity verified via `vaultHash` (keccak256) |
| **On-chain Progression** | XP, level (auto level-up with threshold table, max 20), adventure logs with floor/result/killCount/timestamp |
| **Game Server Role** | Dedicated `onlyGameServer` modifier — only authorized backend can write progression data |
| **VRF Traits** | Race, Class, Personality, Talent rarity generated via Binance Oracle VRF at mint time |
| **On-chain SVG** | Fully on-chain tokenURI with procedural SVG avatar rendering |

### Data Flow: Adventure → Chain

```
Game Session (in-memory)
  ├─ accumulateXP()        ← AI GM awards XP during gameplay
  ├─ killCount++           ← enemy defeated events
  └─ floorXPEarned         ← per-floor tracking
        │
        ▼  (on floor clear / defeat / disconnect)
  flushBlockchainState()
  ├─ grantXP()             → contract: _progression[tokenId].xp += amount, auto level-up
  ├─ recordAdventure()     → contract: adventureLogs[tokenId].push(entry)
  ├─ updateExperience()    → contract: _agentMeta[tokenId].experience = summary
  └─ updateVault()         → contract: _agentMeta[tokenId].vaultURI = json, vaultHash = keccak256
```

## 10. AI Tools Used in Development

This project was built with significant AI assistance:

| Tool | Usage |
|------|-------|
| **Claude Code (CLI)** | Primary development tool — code generation, debugging, architecture decisions |
| **Claude (Anthropic)** | In-game AI Game Master (multi-provider, switchable) |
| **OpenAI GPT** | Alternative AI Game Master provider |
| **Google Gemini** | Alternative AI Game Master provider |

The entire project — from smart contract design to frontend UI to game narrative engine — was developed collaboratively with AI tools, embodying the "vibe coding" spirit of this hackathon.

## 11. Screenshots

<!-- TODO: add 2-3 gameplay screenshots showing:
  1. Minting screen with VRF trait generation
  2. Dungeon exploration with pixel-art map + AI chat
  3. Post-adventure on-chain XP update
-->
