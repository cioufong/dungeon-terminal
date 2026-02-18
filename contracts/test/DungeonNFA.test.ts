import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DungeonNFA, DungeonNFAUpgradeMock, MockVRFCoordinator } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DungeonNFA", function () {
  let nfa: DungeonNFA;
  let vrfMock: MockVRFCoordinator;
  let owner: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let gameServer: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const FREE_MINT_FEE = ethers.parseEther("0.01");
  const MINT_FEE = ethers.parseEther("0.05");
  const VRF_SUB_ID = 1n;
  const VRF_KEY_HASH = ethers.id("test-key-hash");

  // Helper: free mint + VRF fulfillment
  async function freeMintAndFulfill(signer: HardhatEthersSigner, seed?: bigint) {
    await nfa.connect(signer).freeMint({ value: FREE_MINT_FEE });
    const requestId = await vrfMock.lastRequestId();
    const s = seed ?? BigInt(ethers.keccak256(ethers.toUtf8Bytes(`free-${requestId}`)));
    await vrfMock.fulfillWithSeed(requestId, s);
  }

  // Helper: paid mint + VRF fulfillment
  async function paidMintAndFulfill(signer: HardhatEthersSigner, seed?: bigint) {
    await nfa.connect(signer).paidMint({ value: MINT_FEE });
    const requestId = await vrfMock.lastRequestId();
    const s = seed ?? BigInt(ethers.keccak256(ethers.toUtf8Bytes(`paid-${requestId}`)));
    await vrfMock.fulfillWithSeed(requestId, s);
  }

  beforeEach(async function () {
    [owner, treasury, gameServer, user1, user2] = await ethers.getSigners();

    // Deploy mock VRF coordinator
    const VRFFactory = await ethers.getContractFactory("MockVRFCoordinator");
    vrfMock = (await VRFFactory.deploy()) as unknown as MockVRFCoordinator;
    await vrfMock.waitForDeployment();

    // Deploy DungeonNFA proxy directly
    const Factory = await ethers.getContractFactory("DungeonNFA");
    nfa = (await upgrades.deployProxy(Factory, [
      treasury.address,
      await vrfMock.getAddress(),
      VRF_SUB_ID,
      VRF_KEY_HASH,
    ], {
      initializer: "initialize",
      kind: "uups",
    })) as unknown as DungeonNFA;
    await nfa.waitForDeployment();

    // Authorize game server
    await nfa.setGameServer(gameServer.address, true);

    // Enable VRF for tests
    await nfa.setVRFEnabled(true);
  });

  // =========================================
  // Deployment & Initialization
  // =========================================

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      expect(await nfa.name()).to.equal("Dungeon NFA");
      expect(await nfa.symbol()).to.equal("DNFA");
    });

    it("should set treasury address", async function () {
      expect(await nfa.treasuryAddress()).to.equal(treasury.address);
    });

    it("should set VRF config", async function () {
      expect(await nfa.vrfCoordinator()).to.equal(await vrfMock.getAddress());
      expect(await nfa.vrfSubscriptionId()).to.equal(VRF_SUB_ID);
      expect(await nfa.vrfKeyHash()).to.equal(VRF_KEY_HASH);
      expect(await nfa.vrfConfirmations()).to.equal(3);
      expect(await nfa.vrfCallbackGasLimit()).to.equal(300000);
    });

    it("should set freeMintsPerUser to 1", async function () {
      expect(await nfa.freeMintsPerUser()).to.equal(1);
    });

    it("should start with 0 supply", async function () {
      expect(await nfa.totalSupply()).to.equal(0);
    });

    it("should set owner correctly", async function () {
      expect(await nfa.owner()).to.equal(owner.address);
    });

    it("should set maxAdventureLog to 10", async function () {
      expect(await nfa.maxAdventureLog()).to.equal(10);
    });

    it("should return version '2.0.0'", async function () {
      expect(await nfa.version()).to.equal("2.0.0");
    });

    it("should reject zero treasury address", async function () {
      const Factory = await ethers.getContractFactory("DungeonNFA");
      await expect(
        upgrades.deployProxy(Factory, [
          ethers.ZeroAddress,
          await vrfMock.getAddress(),
          VRF_SUB_ID,
          VRF_KEY_HASH,
        ], {
          initializer: "initialize",
          kind: "uups",
        })
      ).to.be.revertedWith("Invalid treasury");
    });

    it("should reject zero VRF coordinator", async function () {
      const Factory = await ethers.getContractFactory("DungeonNFA");
      await expect(
        upgrades.deployProxy(Factory, [
          treasury.address,
          ethers.ZeroAddress,
          VRF_SUB_ID,
          VRF_KEY_HASH,
        ], {
          initializer: "initialize",
          kind: "uups",
        })
      ).to.be.revertedWith("Invalid VRF coordinator");
    });
  });

  // =========================================
  // Free Mint (character creation, soulbound)
  // =========================================

  describe("Free Mint", function () {
    it("should request VRF and mint after fulfillment", async function () {
      await expect(nfa.connect(user1).freeMint({ value: FREE_MINT_FEE }))
        .to.emit(nfa, "MintRequested");

      // Not yet minted
      expect(await nfa.totalSupply()).to.equal(0);
      expect(await nfa.hasPendingMint(user1.address)).to.be.true;

      // Fulfill VRF
      const requestId = await vrfMock.lastRequestId();
      const seed = BigInt(ethers.keccak256(ethers.toUtf8Bytes("test-seed")));
      await expect(vrfMock.fulfillWithSeed(requestId, seed))
        .to.emit(nfa, "NFAMinted");

      expect(await nfa.totalSupply()).to.equal(1);
      expect(await nfa.ownerOf(1)).to.equal(user1.address);
      expect(await nfa.hasPendingMint(user1.address)).to.be.false;
    });

    it("should derive correct traits from VRF seed", async function () {
      await freeMintAndFulfill(user1);

      const traits = await nfa.getTraits(1);
      expect(Number(traits.race)).to.be.lessThan(5);
      expect(Number(traits.class_)).to.be.lessThan(6);
      expect(Number(traits.personality)).to.be.lessThan(8);
      expect(Number(traits.talentId)).to.be.lessThan(30);
      expect(Number(traits.talentRarity)).to.be.lessThan(5);
      for (let i = 0; i < 6; i++) {
        expect(Number(traits.baseStats[i])).to.be.gte(8).and.lte(18);
      }
    });

    it("should set initial progression", async function () {
      await freeMintAndFulfill(user1);
      const prog = await nfa.getProgression(1);
      expect(prog.level).to.equal(1);
      expect(prog.xp).to.equal(0);
      expect(prog.active).to.be.true;
      expect(prog.createdAt).to.be.gt(0);
    });

    it("should mark as soulbound (non-transferable)", async function () {
      await freeMintAndFulfill(user1);
      expect(await nfa.isFreeMint(1)).to.be.true;

      await expect(
        nfa.connect(user1).transferFrom(user1.address, user2.address, 1)
      ).to.be.revertedWith("Free minted tokens are non-transferable");
    });

    it("should consume the free mint slot", async function () {
      expect(await nfa.getFreeMints(user1.address)).to.equal(1);
      await freeMintAndFulfill(user1);
      expect(await nfa.getFreeMints(user1.address)).to.equal(0);
    });

    it("should reject second free mint", async function () {
      await freeMintAndFulfill(user1);
      await expect(
        nfa.connect(user1).freeMint({ value: FREE_MINT_FEE })
      ).to.be.revertedWith("No free mints remaining");
    });

    it("should reject incorrect fee", async function () {
      await expect(
        nfa.connect(user1).freeMint({ value: 0 })
      ).to.be.revertedWith("Incorrect fee");

      await expect(
        nfa.connect(user1).freeMint({ value: MINT_FEE })
      ).to.be.revertedWith("Incorrect fee");
    });

    it("should reject while pending mint exists", async function () {
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });
      // Don't fulfill — try to mint again
      await nfa.grantAdditionalFreeMints(user1.address, 1);
      await expect(
        nfa.connect(user1).freeMint({ value: FREE_MINT_FEE })
      ).to.be.revertedWith("Pending mint exists");
    });

    it("should send fee to treasury", async function () {
      const balBefore = await ethers.provider.getBalance(treasury.address);
      await freeMintAndFulfill(user1);
      const balAfter = await ethers.provider.getBalance(treasury.address);
      expect(balAfter - balBefore).to.equal(FREE_MINT_FEE);
    });

    it("should allow free mint after bonus granted", async function () {
      await freeMintAndFulfill(user1);
      await nfa.grantAdditionalFreeMints(user1.address, 1);
      await freeMintAndFulfill(user1);
      expect(await nfa.totalSupply()).to.equal(2);
      expect(await nfa.isFreeMint(2)).to.be.true;
    });
  });

  // =========================================
  // Paid Mint (companion, tradeable)
  // =========================================

  describe("Paid Mint", function () {
    it("should request VRF and mint companion after fulfillment", async function () {
      await expect(nfa.connect(user1).paidMint({ value: MINT_FEE }))
        .to.emit(nfa, "MintRequested");

      const requestId = await vrfMock.lastRequestId();
      await vrfMock.fulfillWithSeed(requestId, 12345n);

      expect(await nfa.totalSupply()).to.equal(1);
      expect(await nfa.ownerOf(1)).to.equal(user1.address);
      expect(await nfa.isFreeMint(1)).to.be.false;
    });

    it("should allow transfer of paid NFA", async function () {
      await paidMintAndFulfill(user1);
      await nfa.connect(user1).transferFrom(user1.address, user2.address, 1);
      expect(await nfa.ownerOf(1)).to.equal(user2.address);
    });

    it("should send mint fee to treasury", async function () {
      const balBefore = await ethers.provider.getBalance(treasury.address);
      await paidMintAndFulfill(user1);
      const balAfter = await ethers.provider.getBalance(treasury.address);
      expect(balAfter - balBefore).to.equal(MINT_FEE);
    });

    it("should reject incorrect fee", async function () {
      await expect(
        nfa.connect(user1).paidMint({ value: FREE_MINT_FEE })
      ).to.be.revertedWith("Incorrect fee");

      await expect(
        nfa.connect(user1).paidMint({ value: 0 })
      ).to.be.revertedWith("Incorrect fee");
    });

    it("should reject while pending mint exists", async function () {
      await nfa.connect(user1).paidMint({ value: MINT_FEE });
      await expect(
        nfa.connect(user1).paidMint({ value: MINT_FEE })
      ).to.be.revertedWith("Pending mint exists");
    });
  });

  // =========================================
  // VRF Callback Security
  // =========================================

  describe("VRF Callback", function () {
    it("should reject callback from non-coordinator", async function () {
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });
      const requestId = await vrfMock.lastRequestId();

      await expect(
        nfa.connect(user1).rawFulfillRandomWords(requestId, [12345n])
      ).to.be.revertedWith("Only VRF coordinator");
    });

    it("should reject callback for unknown request", async function () {
      // Fulfill a request ID that doesn't exist
      await expect(
        vrfMock.fulfillWithSeed(999, 12345n)
      ).to.be.revertedWith("Request not found");
    });
  });

  // =========================================
  // Mixed: Free + Paid
  // =========================================

  describe("Free + Paid Mint Flow", function () {
    it("should support free then paid mint for same user", async function () {
      // Free mint (soulbound character)
      await freeMintAndFulfill(user1);
      expect(await nfa.isFreeMint(1)).to.be.true;

      // Paid mint (tradeable companion)
      await paidMintAndFulfill(user1);
      expect(await nfa.isFreeMint(2)).to.be.false;

      const tokens = await nfa.tokensOfOwner(user1.address);
      expect(tokens.length).to.equal(2);
    });

    it("should track pending count correctly", async function () {
      expect(await nfa.pendingMintCount()).to.equal(0);

      // Two users request simultaneously
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });
      expect(await nfa.pendingMintCount()).to.equal(1);

      await nfa.connect(user2).paidMint({ value: MINT_FEE });
      expect(await nfa.pendingMintCount()).to.equal(2);

      // Fulfill first
      await vrfMock.fulfillWithSeed(1n, 111n);
      expect(await nfa.pendingMintCount()).to.equal(1);

      // Fulfill second
      await vrfMock.fulfillWithSeed(2n, 222n);
      expect(await nfa.pendingMintCount()).to.equal(0);
      expect(await nfa.totalSupply()).to.equal(2);
    });
  });

  // =========================================
  // Game Server Role
  // =========================================

  describe("Game Server Role", function () {
    it("should allow owner to set game server", async function () {
      await expect(nfa.setGameServer(user2.address, true))
        .to.emit(nfa, "GameServerUpdated")
        .withArgs(user2.address, true);
      expect(await nfa.gameServers(user2.address)).to.be.true;
    });

    it("should allow owner to revoke game server", async function () {
      await nfa.setGameServer(user2.address, true);
      await nfa.setGameServer(user2.address, false);
      expect(await nfa.gameServers(user2.address)).to.be.false;
    });

    it("should reject non-owner setting game server", async function () {
      await expect(
        nfa.connect(user1).setGameServer(user2.address, true)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });

    it("should reject zero address as game server", async function () {
      await expect(
        nfa.setGameServer(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid server address");
    });

    it("should block non-game-server from calling grantXP", async function () {
      await freeMintAndFulfill(user1);
      await expect(
        nfa.connect(user1).grantXP(1, 50)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("should block revoked game server", async function () {
      await freeMintAndFulfill(user1);
      await nfa.setGameServer(gameServer.address, false);
      await expect(
        nfa.connect(gameServer).grantXP(1, 50)
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // grantXP (uses onlyGameServer)
  // =========================================

  describe("grantXP", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should grant XP and update progression", async function () {
      await nfa.connect(gameServer).grantXP(1, 50);
      const prog = await nfa.getProgression(1);
      expect(prog.xp).to.equal(50);
      expect(prog.level).to.equal(1);
    });

    it("should emit XPGained event", async function () {
      await expect(nfa.connect(gameServer).grantXP(1, 50))
        .to.emit(nfa, "XPGained")
        .withArgs(1, 50, 1);
    });

    it("should auto level up at 100 XP (level 1->2)", async function () {
      await nfa.connect(gameServer).grantXP(1, 100);
      const prog = await nfa.getProgression(1);
      expect(prog.level).to.equal(2);
    });

    it("should handle multi-level jump", async function () {
      // Level 2=100, level 3=300, level 4=600, level 5=1000
      await nfa.connect(gameServer).grantXP(1, 1000);
      const prog = await nfa.getProgression(1);
      expect(prog.level).to.equal(5);
    });

    it("should accumulate XP across multiple calls", async function () {
      await nfa.connect(gameServer).grantXP(1, 30);
      await nfa.connect(gameServer).grantXP(1, 30);
      await nfa.connect(gameServer).grantXP(1, 30);
      const prog = await nfa.getProgression(1);
      expect(prog.xp).to.equal(90);
      expect(prog.level).to.equal(1);
    });

    it("should revert for non-existent token", async function () {
      await expect(
        nfa.connect(gameServer).grantXP(999, 50)
      ).to.be.revertedWith("Token does not exist");
    });

    it("should revert for inactive NFA", async function () {
      await nfa.connect(user1).setNFAStatus(1, false);
      await expect(
        nfa.connect(gameServer).grantXP(1, 50)
      ).to.be.revertedWith("NFA inactive");
    });

    it("should update lastActiveAt in gameStats", async function () {
      await nfa.connect(gameServer).grantXP(1, 10);
      const gs = await nfa.getGameStats(1);
      expect(gs.lastActiveAt).to.be.gt(0);
    });

    it("should reject owner calling grantXP (onlyGameServer, not onlyOwner)", async function () {
      await expect(nfa.grantXP(1, 50)).to.be.revertedWith(
        "Not authorized game server"
      );
    });

    it("should reject token owner calling grantXP", async function () {
      await expect(
        nfa.connect(user1).grantXP(1, 50)
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // recordAdventure
  // =========================================

  describe("recordAdventure", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should record an adventure entry", async function () {
      await nfa.connect(gameServer).recordAdventure(1, 1, 1, 50, 3);
      const logs = await nfa.getAdventureLog(1);
      expect(logs.length).to.equal(1);
      expect(logs[0].floor).to.equal(1);
      expect(logs[0].result).to.equal(1);
      expect(logs[0].xpEarned).to.equal(50);
      expect(logs[0].killCount).to.equal(3);
    });

    it("should emit AdventureRecorded event", async function () {
      await expect(nfa.connect(gameServer).recordAdventure(1, 2, 1, 100, 5))
        .to.emit(nfa, "AdventureRecorded")
        .withArgs(1, 2, 1);
    });

    it("should update game stats", async function () {
      await nfa.connect(gameServer).recordAdventure(1, 3, 1, 80, 4);
      const gs = await nfa.getGameStats(1);
      expect(gs.totalRuns).to.equal(1);
      expect(gs.totalKills).to.equal(4);
      expect(gs.highestFloor).to.equal(3);
      expect(gs.lastActiveAt).to.be.gt(0);
    });

    it("should track highestFloor as max", async function () {
      await nfa.connect(gameServer).recordAdventure(1, 3, 1, 50, 2);
      await nfa.connect(gameServer).recordAdventure(1, 1, 2, 10, 0);
      const gs = await nfa.getGameStats(1);
      expect(gs.highestFloor).to.equal(3);
      expect(gs.totalRuns).to.equal(2);
    });

    it("should reject invalid result value", async function () {
      await expect(
        nfa.connect(gameServer).recordAdventure(1, 1, 3, 50, 1)
      ).to.be.revertedWith("Invalid result");
    });

    it("should reject non-existent token", async function () {
      await expect(
        nfa.connect(gameServer).recordAdventure(999, 1, 1, 50, 1)
      ).to.be.revertedWith("Token does not exist");
    });

    it("should accept result=0 (fled)", async function () {
      await nfa.connect(gameServer).recordAdventure(1, 2, 0, 5, 0);
      const logs = await nfa.getAdventureLog(1);
      expect(logs[0].result).to.equal(0);
    });

    it("should accept result=2 (defeated)", async function () {
      await nfa.connect(gameServer).recordAdventure(1, 4, 2, 30, 2);
      const logs = await nfa.getAdventureLog(1);
      expect(logs[0].result).to.equal(2);
    });
  });

  // =========================================
  // recordAdventureBatch
  // =========================================

  describe("recordAdventureBatch", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should record for multiple tokens", async function () {
      // Create a second NFA
      await freeMintAndFulfill(user2);

      await nfa.connect(gameServer).recordAdventureBatch([1, 2], 3, 1, 75, 4);

      const logs1 = await nfa.getAdventureLog(1);
      const logs2 = await nfa.getAdventureLog(2);
      expect(logs1.length).to.equal(1);
      expect(logs2.length).to.equal(1);
      expect(logs1[0].floor).to.equal(3);
      expect(logs2[0].floor).to.equal(3);
    });

    it("should revert if any token does not exist", async function () {
      await expect(
        nfa.connect(gameServer).recordAdventureBatch([1, 999], 1, 1, 50, 1)
      ).to.be.revertedWith("Token does not exist");
    });
  });

  // =========================================
  // Circular Buffer
  // =========================================

  describe("Circular Buffer", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should fill buffer up to maxAdventureLog", async function () {
      for (let i = 0; i < 10; i++) {
        await nfa.connect(gameServer).recordAdventure(1, i + 1, 1, 10 * (i + 1), i);
      }
      const logs = await nfa.getAdventureLog(1);
      expect(logs.length).to.equal(10);
    });

    it("should overwrite oldest entry when buffer is full", async function () {
      for (let i = 0; i < 10; i++) {
        await nfa.connect(gameServer).recordAdventure(1, i + 1, 1, 10, i);
      }

      // 11th entry overwrites first
      await nfa.connect(gameServer).recordAdventure(1, 99, 2, 999, 99);

      const logs = await nfa.getAdventureLog(1);
      expect(logs.length).to.equal(10);
      expect(logs[0].floor).to.equal(2); // oldest surviving
      expect(logs[9].floor).to.equal(99); // newest
    });

    it("should maintain chronological order after multiple wraps", async function () {
      for (let i = 1; i <= 25; i++) {
        await nfa.connect(gameServer).recordAdventure(1, i, 1, i * 5, 1);
      }

      const logs = await nfa.getAdventureLog(1);
      expect(logs.length).to.equal(10);

      // Should contain entries 16-25 in chronological order
      for (let i = 0; i < 10; i++) {
        expect(logs[i].floor).to.equal(16 + i);
      }
    });

    it("should respect changed maxAdventureLog", async function () {
      await nfa.setMaxAdventureLog(3);

      for (let i = 0; i < 3; i++) {
        await nfa.connect(gameServer).recordAdventure(1, i + 1, 1, 10, 0);
      }

      const logs = await nfa.getAdventureLog(1);
      expect(logs.length).to.equal(3);

      // Overflow
      await nfa.connect(gameServer).recordAdventure(1, 99, 0, 5, 0);
      const logs2 = await nfa.getAdventureLog(1);
      expect(logs2.length).to.equal(3);
      expect(logs2[0].floor).to.equal(2);
      expect(logs2[2].floor).to.equal(99);
    });

    it("should return empty array for token with no adventures", async function () {
      await freeMintAndFulfill(user2);

      const logs = await nfa.getAdventureLog(2);
      expect(logs.length).to.equal(0);
    });
  });

  // =========================================
  // updateVault
  // =========================================

  describe("updateVault", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should update vaultURI and vaultHash", async function () {
      const newHash = ethers.id("newVaultContent");
      await nfa.connect(gameServer).updateVault(1, "ipfs://newVault", newHash);

      const result = await nfa.getNFA(1);
      expect(result.agentMeta.vaultURI).to.equal("ipfs://newVault");
      expect(result.agentMeta.vaultHash).to.equal(newHash);
    });

    it("should not change other metadata fields", async function () {
      // Set some metadata first
      const meta = {
        persona: '{"tone":"bold"}',
        experience: "Seasoned warrior",
        voiceHash: "voice-001",
        animationURI: "ipfs://anim",
        vaultURI: "ipfs://vault",
        vaultHash: ethers.id("vault-content"),
      };
      await nfa.connect(user1).updateAgentMetadata(1, meta);

      // Update vault only
      const newHash = ethers.id("updated");
      await nfa.connect(gameServer).updateVault(1, "ipfs://updatedVault", newHash);

      const result = await nfa.getNFA(1);
      expect(result.agentMeta.persona).to.equal(meta.persona);
      expect(result.agentMeta.experience).to.equal(meta.experience);
      expect(result.agentMeta.voiceHash).to.equal(meta.voiceHash);
      expect(result.agentMeta.animationURI).to.equal(meta.animationURI);
      expect(result.agentMeta.vaultURI).to.equal("ipfs://updatedVault");
      expect(result.agentMeta.vaultHash).to.equal(newHash);
    });

    it("should emit MetadataUpdated event", async function () {
      const hash = ethers.id("h");
      await expect(nfa.connect(gameServer).updateVault(1, "ipfs://v", hash))
        .to.emit(nfa, "MetadataUpdated")
        .withArgs(1);
    });

    it("should revert for non-existent token", async function () {
      const hash = ethers.id("h");
      await expect(
        nfa.connect(gameServer).updateVault(999, "ipfs://v", hash)
      ).to.be.revertedWith("Token does not exist");
    });
  });

  // =========================================
  // updateExperience
  // =========================================

  describe("updateExperience", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should update experience field", async function () {
      await nfa.connect(gameServer).updateExperience(1, "Battled the dragon of floor 5");
      const result = await nfa.getNFA(1);
      expect(result.agentMeta.experience).to.equal("Battled the dragon of floor 5");
    });

    it("should emit MetadataUpdated event", async function () {
      await expect(nfa.connect(gameServer).updateExperience(1, "New experience"))
        .to.emit(nfa, "MetadataUpdated")
        .withArgs(1);
    });

    it("should revert for non-existent token", async function () {
      await expect(
        nfa.connect(gameServer).updateExperience(999, "test")
      ).to.be.revertedWith("Token does not exist");
    });

    it("should reject non-game-server caller", async function () {
      await expect(
        nfa.connect(user1).updateExperience(1, "test")
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // Access Control
  // =========================================

  describe("Access Control", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("token owner should not be able to call grantXP", async function () {
      await expect(
        nfa.connect(user1).grantXP(1, 100)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("token owner should not be able to call recordAdventure", async function () {
      await expect(
        nfa.connect(user1).recordAdventure(1, 1, 1, 50, 3)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("token owner should not be able to call updateVault", async function () {
      const hash = ethers.id("h");
      await expect(
        nfa.connect(user1).updateVault(1, "ipfs://v", hash)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("game server should not be able to call owner functions", async function () {
      await expect(
        nfa.connect(gameServer).setGameServer(user2.address, true)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");

      await expect(
        nfa.connect(gameServer).setMaxAdventureLog(5)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");

      await expect(
        nfa.connect(gameServer).setPaused(true)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });

    it("random address should not be able to call game server functions", async function () {
      await expect(
        nfa.connect(user2).grantXP(1, 10)
      ).to.be.revertedWith("Not authorized game server");

      await expect(
        nfa.connect(user2).recordAdventure(1, 1, 1, 10, 1)
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // setMaxAdventureLog
  // =========================================

  describe("setMaxAdventureLog", function () {
    it("should update maxAdventureLog", async function () {
      await nfa.setMaxAdventureLog(20);
      expect(await nfa.maxAdventureLog()).to.equal(20);
    });

    it("should reject zero value", async function () {
      await expect(nfa.setMaxAdventureLog(0)).to.be.revertedWith("Max log must be > 0");
    });

    it("should only allow owner", async function () {
      await expect(
        nfa.connect(user1).setMaxAdventureLog(5)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================
  // Agent Metadata
  // =========================================

  describe("Agent Metadata", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should update metadata by token owner", async function () {
      const meta = {
        persona: '{"tone":"bold"}',
        experience: "Seasoned warrior",
        voiceHash: "voice-001",
        animationURI: "ipfs://anim",
        vaultURI: "ipfs://vault",
        vaultHash: ethers.id("vault-content"),
      };

      await expect(nfa.connect(user1).updateAgentMetadata(1, meta))
        .to.emit(nfa, "MetadataUpdated")
        .withArgs(1);

      const result = await nfa.getNFA(1);
      expect(result.agentMeta.persona).to.equal(meta.persona);
    });

    it("should reject metadata update from non-owner", async function () {
      const meta = {
        persona: "", experience: "", voiceHash: "",
        animationURI: "", vaultURI: "", vaultHash: ethers.ZeroHash,
      };
      await expect(
        nfa.connect(user2).updateAgentMetadata(1, meta)
      ).to.be.revertedWith("Not token owner");
    });
  });

  // =========================================
  // View Functions
  // =========================================

  describe("View Functions", function () {
    it("should return tokens of owner", async function () {
      await freeMintAndFulfill(user1);
      await paidMintAndFulfill(user1);

      const tokens = await nfa.tokensOfOwner(user1.address);
      expect(tokens.length).to.equal(2);
    });

    it("should return full NFA data", async function () {
      await freeMintAndFulfill(user1);
      const result = await nfa.getNFA(1);
      expect(result.owner).to.equal(user1.address);
      expect(result.progression.level).to.equal(1);
    });

    it("should revert for non-existent token", async function () {
      await expect(nfa.getNFA(999)).to.be.revertedWith("Token does not exist");
    });

    it("should return free mints count", async function () {
      expect(await nfa.getFreeMints(user1.address)).to.equal(1);
      await freeMintAndFulfill(user1);
      expect(await nfa.getFreeMints(user1.address)).to.equal(0);
    });
  });

  // =========================================
  // Admin Functions
  // =========================================

  describe("Admin", function () {
    it("should pause and unpause", async function () {
      await nfa.setPaused(true);
      await expect(
        nfa.connect(user1).freeMint({ value: FREE_MINT_FEE })
      ).to.be.revertedWith("Paused");

      await nfa.setPaused(false);
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });
    });

    it("should update treasury", async function () {
      await nfa.setTreasury(user2.address);
      expect(await nfa.treasuryAddress()).to.equal(user2.address);
    });

    it("should reject zero treasury", async function () {
      await expect(nfa.setTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address");
    });

    it("should set free mints per user", async function () {
      await nfa.setFreeMintsPerUser(5);
      expect(await nfa.freeMintsPerUser()).to.equal(5);
    });

    it("should grant additional free mints", async function () {
      await nfa.grantAdditionalFreeMints(user1.address, 3);
      expect(await nfa.getFreeMints(user1.address)).to.equal(4);
    });

    it("should update VRF config", async function () {
      const newHash = ethers.id("new-key-hash");
      await nfa.setVRFConfig(
        await vrfMock.getAddress(),
        2n,
        newHash,
        5,
        500000
      );
      expect(await nfa.vrfSubscriptionId()).to.equal(2);
      expect(await nfa.vrfKeyHash()).to.equal(newHash);
      expect(await nfa.vrfConfirmations()).to.equal(5);
      expect(await nfa.vrfCallbackGasLimit()).to.equal(500000);
    });

    it("should reject admin calls from non-owner", async function () {
      await expect(
        nfa.connect(user1).setPaused(true)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
      await expect(
        nfa.connect(user1).setTreasury(user1.address)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
      await expect(
        nfa.connect(user1).setFreeMintsPerUser(10)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================
  // VRF Toggle
  // =========================================

  describe("VRF Toggle", function () {
    it("should instant mint when vrfEnabled=false (freeMint)", async function () {
      await nfa.setVRFEnabled(false);

      // freeMint should mint immediately without VRF
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });
      expect(await nfa.totalSupply()).to.equal(1);
      expect(await nfa.ownerOf(1)).to.equal(user1.address);
      expect(await nfa.isFreeMint(1)).to.be.true;
      expect(await nfa.hasPendingMint(user1.address)).to.be.false;
    });

    it("should instant mint when vrfEnabled=false (paidMint)", async function () {
      await nfa.setVRFEnabled(false);

      await nfa.connect(user1).paidMint({ value: MINT_FEE });
      expect(await nfa.totalSupply()).to.equal(1);
      expect(await nfa.ownerOf(1)).to.equal(user1.address);
      expect(await nfa.isFreeMint(1)).to.be.false;
    });

    it("should use VRF when vrfEnabled=true", async function () {
      // vrfEnabled is already true from beforeEach
      expect(await nfa.vrfEnabled()).to.be.true;

      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });

      // Should NOT be minted yet (pending VRF)
      expect(await nfa.totalSupply()).to.equal(0);
      expect(await nfa.hasPendingMint(user1.address)).to.be.true;

      // Fulfill VRF
      const requestId = await vrfMock.lastRequestId();
      await vrfMock.fulfillWithSeed(requestId, 42n);

      expect(await nfa.totalSupply()).to.equal(1);
      expect(await nfa.hasPendingMint(user1.address)).to.be.false;
    });

    it("should emit VRFToggled event", async function () {
      await expect(nfa.setVRFEnabled(false))
        .to.emit(nfa, "VRFToggled")
        .withArgs(false);

      await expect(nfa.setVRFEnabled(true))
        .to.emit(nfa, "VRFToggled")
        .withArgs(true);
    });

    it("should only allow owner to toggle VRF", async function () {
      await expect(
        nfa.connect(user1).setVRFEnabled(false)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");

      await expect(
        nfa.connect(gameServer).setVRFEnabled(false)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });

    it("should derive valid traits with instant mint", async function () {
      await nfa.setVRFEnabled(false);
      await nfa.connect(user1).freeMint({ value: FREE_MINT_FEE });

      const traits = await nfa.getTraits(1);
      expect(Number(traits.race)).to.be.lessThan(5);
      expect(Number(traits.class_)).to.be.lessThan(6);
      expect(Number(traits.personality)).to.be.lessThan(8);
      expect(Number(traits.talentId)).to.be.lessThan(30);
      expect(Number(traits.talentRarity)).to.be.lessThan(5);
      for (let i = 0; i < 6; i++) {
        expect(Number(traits.baseStats[i])).to.be.gte(8).and.lte(18);
      }
    });
  });

  // =========================================
  // UUPS Upgrade
  // =========================================

  describe("UUPS Upgrade", function () {
    it("should upgrade and preserve state", async function () {
      await freeMintAndFulfill(user1);
      expect(await nfa.totalSupply()).to.equal(1);

      const UpgradeFactory = await ethers.getContractFactory("DungeonNFAUpgradeMock");
      const upgraded = (await upgrades.upgradeProxy(
        await nfa.getAddress(), UpgradeFactory
      )) as unknown as DungeonNFAUpgradeMock;

      await upgraded.setNewStateVar(42);
      expect(await upgraded.newStateVar()).to.equal(42);
      expect(await upgraded.totalSupply()).to.equal(1);
      expect(await upgraded.ownerOf(1)).to.equal(user1.address);
    });

    it("should reject upgrade from non-owner", async function () {
      const UpgradeFactory = await ethers.getContractFactory("DungeonNFAUpgradeMock", user1);
      await expect(
        upgrades.upgradeProxy(await nfa.getAddress(), UpgradeFactory)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================
  // Renderer Integration
  // =========================================

  describe("Renderer Integration", function () {
    it("should return empty tokenURI when renderer not set", async function () {
      await freeMintAndFulfill(user1);
      const uri = await nfa.tokenURI(1);
      expect(uri).to.equal("");
    });

    it("should return data URI when renderer is set", async function () {
      await freeMintAndFulfill(user1);

      // Deploy renderer and set it
      const RendererFactory = await ethers.getContractFactory("NFARenderer");
      const renderer = await RendererFactory.deploy();
      await renderer.waitForDeployment();
      await nfa.setRenderer(await renderer.getAddress());

      const uri = await nfa.tokenURI(1);
      expect(uri).to.match(/^data:application\/json;base64,/);

      // Verify metadata content
      const json = JSON.parse(
        Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
      );
      expect(json.name).to.equal("Dungeon NFA #1");
      expect(json.image).to.match(/^data:image\/svg\+xml;base64,/);
      expect(json.attributes).to.be.an("array");
    });

    it("should only allow owner to set renderer", async function () {
      const RendererFactory = await ethers.getContractFactory("NFARenderer");
      const renderer = await RendererFactory.deploy();
      await renderer.waitForDeployment();

      await expect(
        nfa.connect(user1).setRenderer(await renderer.getAddress())
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================
  // Edge Cases
  // =========================================

  describe("Edge Cases", function () {
    it("should reject direct ETH transfer", async function () {
      await expect(
        owner.sendTransaction({
          to: await nfa.getAddress(),
          value: ethers.parseEther("0.1"),
        })
      ).to.be.revertedWith("Use freeMint() or paidMint()");
    });

    it("should produce different traits for different seeds", async function () {
      const seed1 = BigInt(ethers.keccak256(ethers.toUtf8Bytes("seed-alpha")));
      const seed2 = BigInt(ethers.keccak256(ethers.toUtf8Bytes("seed-beta")));

      await freeMintAndFulfill(user1, seed1);
      await freeMintAndFulfill(user2, seed2);

      const t1 = await nfa.getTraits(1);
      const t2 = await nfa.getTraits(2);

      const same =
        t1.race === t2.race &&
        t1.class_ === t2.class_ &&
        t1.personality === t2.personality &&
        t1.talentId === t2.talentId;
      expect(same).to.be.false;
    });

    it("should toggle NFA status", async function () {
      await freeMintAndFulfill(user1);
      await nfa.connect(user1).setNFAStatus(1, false);
      expect((await nfa.getProgression(1)).active).to.be.false;

      await nfa.connect(user1).setNFAStatus(1, true);
      expect((await nfa.getProgression(1)).active).to.be.true;
    });
  });
});
