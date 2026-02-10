import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DungeonNFA, DungeonNFAV2, MockVRFCoordinator } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DungeonNFAV2", function () {
  let nfaV2: DungeonNFAV2;
  let vrfMock: MockVRFCoordinator;
  let owner: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let gameServer: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;

  const FREE_MINT_FEE = ethers.parseEther("0.01");
  const VRF_SUB_ID = 1n;
  const VRF_KEY_HASH = ethers.id("test-key-hash");

  async function freeMintAndFulfill(signer: HardhatEthersSigner, seed?: bigint) {
    await nfaV2.connect(signer).freeMint({ value: FREE_MINT_FEE });
    const requestId = await vrfMock.lastRequestId();
    const s = seed ?? BigInt(ethers.keccak256(ethers.toUtf8Bytes(`free-${requestId}`)));
    await vrfMock.fulfillWithSeed(requestId, s);
  }

  beforeEach(async function () {
    [owner, treasury, gameServer, user1, user2] = await ethers.getSigners();

    // Deploy mock VRF coordinator
    const VRFFactory = await ethers.getContractFactory("MockVRFCoordinator");
    vrfMock = (await VRFFactory.deploy()) as unknown as MockVRFCoordinator;
    await vrfMock.waitForDeployment();

    // Deploy DungeonNFA V1 proxy
    const V1Factory = await ethers.getContractFactory("DungeonNFA");
    const nfa = (await upgrades.deployProxy(V1Factory, [
      treasury.address,
      await vrfMock.getAddress(),
      VRF_SUB_ID,
      VRF_KEY_HASH,
    ], {
      initializer: "initialize",
      kind: "uups",
    })) as unknown as DungeonNFA;
    await nfa.waitForDeployment();

    // Upgrade to V2
    const V2Factory = await ethers.getContractFactory("DungeonNFAV2");
    nfaV2 = (await upgrades.upgradeProxy(await nfa.getAddress(), V2Factory, {
      call: { fn: "initializeV2", args: [] },
    })) as unknown as DungeonNFAV2;

    // Authorize game server
    await nfaV2.setGameServer(gameServer.address, true);

    // Create a test NFA for user1
    await freeMintAndFulfill(user1);
  });

  // =========================================
  // Upgrade Safety
  // =========================================

  describe("Upgrade Safety", function () {
    it("should preserve V1 state after upgrade", async function () {
      expect(await nfaV2.name()).to.equal("Dungeon NFA");
      expect(await nfaV2.symbol()).to.equal("DNFA");
      expect(await nfaV2.owner()).to.equal(owner.address);
      expect(await nfaV2.treasuryAddress()).to.equal(treasury.address);
      expect(await nfaV2.totalSupply()).to.equal(1);
      expect(await nfaV2.ownerOf(1)).to.equal(user1.address);
    });

    it("should return version '2.0.0'", async function () {
      expect(await nfaV2.version()).to.equal("2.0.0");
    });

    it("should set maxAdventureLog to 10", async function () {
      expect(await nfaV2.maxAdventureLog()).to.equal(10);
    });

    it("should not allow re-initialization", async function () {
      await expect(nfaV2.initializeV2()).to.be.revertedWithCustomError(
        nfaV2, "InvalidInitialization"
      );
    });

    it("should preserve token progression after upgrade", async function () {
      const prog = await nfaV2.getProgression(1);
      expect(prog.level).to.equal(1);
      expect(prog.xp).to.equal(0);
      expect(prog.active).to.be.true;
    });
  });

  // =========================================
  // Game Server Role
  // =========================================

  describe("Game Server Role", function () {
    it("should allow owner to set game server", async function () {
      await expect(nfaV2.setGameServer(user2.address, true))
        .to.emit(nfaV2, "GameServerUpdated")
        .withArgs(user2.address, true);
      expect(await nfaV2.gameServers(user2.address)).to.be.true;
    });

    it("should allow owner to revoke game server", async function () {
      await nfaV2.setGameServer(user2.address, true);
      await nfaV2.setGameServer(user2.address, false);
      expect(await nfaV2.gameServers(user2.address)).to.be.false;
    });

    it("should reject non-owner setting game server", async function () {
      await expect(
        nfaV2.connect(user1).setGameServer(user2.address, true)
      ).to.be.revertedWithCustomError(nfaV2, "OwnableUnauthorizedAccount");
    });

    it("should reject zero address as game server", async function () {
      await expect(
        nfaV2.setGameServer(ethers.ZeroAddress, true)
      ).to.be.revertedWith("Invalid server address");
    });

    it("should block non-game-server from calling grantXP", async function () {
      await expect(
        nfaV2.connect(user1).grantXP(1, 50)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("should block revoked game server", async function () {
      await nfaV2.setGameServer(gameServer.address, false);
      await expect(
        nfaV2.connect(gameServer).grantXP(1, 50)
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // grantXP (overridden to use game server)
  // =========================================

  describe("grantXP", function () {
    it("should grant XP and update progression", async function () {
      await nfaV2.connect(gameServer).grantXP(1, 50);
      const prog = await nfaV2.getProgression(1);
      expect(prog.xp).to.equal(50);
      expect(prog.level).to.equal(1);
    });

    it("should emit XPGained event", async function () {
      await expect(nfaV2.connect(gameServer).grantXP(1, 50))
        .to.emit(nfaV2, "XPGained")
        .withArgs(1, 50, 1);
    });

    it("should auto level up at 100 XP (level 1→2)", async function () {
      // V1 threshold: level 2 requires 100 cumulative XP
      await nfaV2.connect(gameServer).grantXP(1, 100);
      const prog = await nfaV2.getProgression(1);
      expect(prog.level).to.equal(2);
    });

    it("should handle multi-level jump", async function () {
      // Level 2=100, level 3=300, level 4=600, level 5=1000
      await nfaV2.connect(gameServer).grantXP(1, 1000);
      const prog = await nfaV2.getProgression(1);
      expect(prog.level).to.equal(5);
    });

    it("should accumulate XP across multiple calls", async function () {
      await nfaV2.connect(gameServer).grantXP(1, 30);
      await nfaV2.connect(gameServer).grantXP(1, 30);
      await nfaV2.connect(gameServer).grantXP(1, 30);
      const prog = await nfaV2.getProgression(1);
      expect(prog.xp).to.equal(90);
      expect(prog.level).to.equal(1);
    });

    it("should revert for non-existent token", async function () {
      await expect(
        nfaV2.connect(gameServer).grantXP(999, 50)
      ).to.be.revertedWith("Token does not exist");
    });

    it("should revert for inactive NFA", async function () {
      await nfaV2.connect(user1).setNFAStatus(1, false);
      await expect(
        nfaV2.connect(gameServer).grantXP(1, 50)
      ).to.be.revertedWith("NFA inactive");
    });

    it("should update lastActiveAt in gameStats", async function () {
      await nfaV2.connect(gameServer).grantXP(1, 10);
      const gs = await nfaV2.getGameStats(1);
      expect(gs.lastActiveAt).to.be.gt(0);
    });

    it("should reject owner calling grantXP (no longer onlyOwner)", async function () {
      await expect(nfaV2.grantXP(1, 50)).to.be.revertedWith(
        "Not authorized game server"
      );
    });
  });

  // =========================================
  // recordAdventure
  // =========================================

  describe("recordAdventure", function () {
    it("should record an adventure entry", async function () {
      await nfaV2.connect(gameServer).recordAdventure(1, 1, 1, 50, 3);
      const logs = await nfaV2.getAdventureLog(1);
      expect(logs.length).to.equal(1);
      expect(logs[0].floor).to.equal(1);
      expect(logs[0].result).to.equal(1);
      expect(logs[0].xpEarned).to.equal(50);
      expect(logs[0].killCount).to.equal(3);
    });

    it("should emit AdventureRecorded event", async function () {
      await expect(nfaV2.connect(gameServer).recordAdventure(1, 2, 1, 100, 5))
        .to.emit(nfaV2, "AdventureRecorded")
        .withArgs(1, 2, 1);
    });

    it("should update game stats", async function () {
      await nfaV2.connect(gameServer).recordAdventure(1, 3, 1, 80, 4);
      const gs = await nfaV2.getGameStats(1);
      expect(gs.totalRuns).to.equal(1);
      expect(gs.totalKills).to.equal(4);
      expect(gs.highestFloor).to.equal(3);
      expect(gs.lastActiveAt).to.be.gt(0);
    });

    it("should track highestFloor as max", async function () {
      await nfaV2.connect(gameServer).recordAdventure(1, 3, 1, 50, 2);
      await nfaV2.connect(gameServer).recordAdventure(1, 1, 2, 10, 0);
      const gs = await nfaV2.getGameStats(1);
      expect(gs.highestFloor).to.equal(3);
      expect(gs.totalRuns).to.equal(2);
    });

    it("should reject invalid result value", async function () {
      await expect(
        nfaV2.connect(gameServer).recordAdventure(1, 1, 3, 50, 1)
      ).to.be.revertedWith("Invalid result");
    });

    it("should reject non-existent token", async function () {
      await expect(
        nfaV2.connect(gameServer).recordAdventure(999, 1, 1, 50, 1)
      ).to.be.revertedWith("Token does not exist");
    });

    it("should accept result=0 (fled)", async function () {
      await nfaV2.connect(gameServer).recordAdventure(1, 2, 0, 5, 0);
      const logs = await nfaV2.getAdventureLog(1);
      expect(logs[0].result).to.equal(0);
    });

    it("should accept result=2 (defeated)", async function () {
      await nfaV2.connect(gameServer).recordAdventure(1, 4, 2, 30, 2);
      const logs = await nfaV2.getAdventureLog(1);
      expect(logs[0].result).to.equal(2);
    });
  });

  // =========================================
  // recordAdventureBatch
  // =========================================

  describe("recordAdventureBatch", function () {
    it("should record for multiple tokens", async function () {
      // Create a second NFA
      await nfaV2.grantAdditionalFreeMints(user2.address, 0); // user2 has default 1
      await freeMintAndFulfill(user2);

      await nfaV2.connect(gameServer).recordAdventureBatch([1, 2], 3, 1, 75, 4);

      const logs1 = await nfaV2.getAdventureLog(1);
      const logs2 = await nfaV2.getAdventureLog(2);
      expect(logs1.length).to.equal(1);
      expect(logs2.length).to.equal(1);
      expect(logs1[0].floor).to.equal(3);
      expect(logs2[0].floor).to.equal(3);
    });

    it("should revert if any token does not exist", async function () {
      await expect(
        nfaV2.connect(gameServer).recordAdventureBatch([1, 999], 1, 1, 50, 1)
      ).to.be.revertedWith("Token does not exist");
    });
  });

  // =========================================
  // Circular Buffer
  // =========================================

  describe("Circular Buffer", function () {
    it("should fill buffer up to maxAdventureLog", async function () {
      for (let i = 0; i < 10; i++) {
        await nfaV2.connect(gameServer).recordAdventure(1, i + 1, 1, 10 * (i + 1), i);
      }
      const logs = await nfaV2.getAdventureLog(1);
      expect(logs.length).to.equal(10);
    });

    it("should overwrite oldest entry when buffer is full", async function () {
      for (let i = 0; i < 10; i++) {
        await nfaV2.connect(gameServer).recordAdventure(1, i + 1, 1, 10, i);
      }

      // 11th entry overwrites first
      await nfaV2.connect(gameServer).recordAdventure(1, 99, 2, 999, 99);

      const logs = await nfaV2.getAdventureLog(1);
      expect(logs.length).to.equal(10);
      expect(logs[0].floor).to.equal(2); // oldest surviving
      expect(logs[9].floor).to.equal(99); // newest
    });

    it("should maintain chronological order after multiple wraps", async function () {
      for (let i = 1; i <= 25; i++) {
        await nfaV2.connect(gameServer).recordAdventure(1, i, 1, i * 5, 1);
      }

      const logs = await nfaV2.getAdventureLog(1);
      expect(logs.length).to.equal(10);

      // Should contain entries 16-25 in chronological order
      for (let i = 0; i < 10; i++) {
        expect(logs[i].floor).to.equal(16 + i);
      }
    });

    it("should respect changed maxAdventureLog", async function () {
      await nfaV2.setMaxAdventureLog(3);

      for (let i = 0; i < 3; i++) {
        await nfaV2.connect(gameServer).recordAdventure(1, i + 1, 1, 10, 0);
      }

      const logs = await nfaV2.getAdventureLog(1);
      expect(logs.length).to.equal(3);

      // Overflow
      await nfaV2.connect(gameServer).recordAdventure(1, 99, 0, 5, 0);
      const logs2 = await nfaV2.getAdventureLog(1);
      expect(logs2.length).to.equal(3);
      expect(logs2[0].floor).to.equal(2);
      expect(logs2[2].floor).to.equal(99);
    });

    it("should return empty array for token with no adventures", async function () {
      await nfaV2.grantAdditionalFreeMints(user2.address, 0);
      await freeMintAndFulfill(user2);

      const logs = await nfaV2.getAdventureLog(2);
      expect(logs.length).to.equal(0);
    });
  });

  // =========================================
  // updateVault
  // =========================================

  describe("updateVault", function () {
    it("should update vaultURI and vaultHash", async function () {
      const newHash = ethers.id("newVaultContent");
      await nfaV2.connect(gameServer).updateVault(1, "ipfs://newVault", newHash);

      const result = await nfaV2.getNFA(1);
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
      await nfaV2.connect(user1).updateAgentMetadata(1, meta);

      // Update vault only
      const newHash = ethers.id("updated");
      await nfaV2.connect(gameServer).updateVault(1, "ipfs://updatedVault", newHash);

      const result = await nfaV2.getNFA(1);
      expect(result.agentMeta.persona).to.equal(meta.persona);
      expect(result.agentMeta.experience).to.equal(meta.experience);
      expect(result.agentMeta.voiceHash).to.equal(meta.voiceHash);
      expect(result.agentMeta.animationURI).to.equal(meta.animationURI);
      expect(result.agentMeta.vaultURI).to.equal("ipfs://updatedVault");
      expect(result.agentMeta.vaultHash).to.equal(newHash);
    });

    it("should emit MetadataUpdated event", async function () {
      const hash = ethers.id("h");
      await expect(nfaV2.connect(gameServer).updateVault(1, "ipfs://v", hash))
        .to.emit(nfaV2, "MetadataUpdated")
        .withArgs(1);
    });

    it("should revert for non-existent token", async function () {
      const hash = ethers.id("h");
      await expect(
        nfaV2.connect(gameServer).updateVault(999, "ipfs://v", hash)
      ).to.be.revertedWith("Token does not exist");
    });
  });

  // =========================================
  // Access Control
  // =========================================

  describe("Access Control", function () {
    it("token owner should not be able to call grantXP", async function () {
      await expect(
        nfaV2.connect(user1).grantXP(1, 100)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("token owner should not be able to call recordAdventure", async function () {
      await expect(
        nfaV2.connect(user1).recordAdventure(1, 1, 1, 50, 3)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("token owner should not be able to call updateVault", async function () {
      const hash = ethers.id("h");
      await expect(
        nfaV2.connect(user1).updateVault(1, "ipfs://v", hash)
      ).to.be.revertedWith("Not authorized game server");
    });

    it("game server should not be able to call owner functions", async function () {
      await expect(
        nfaV2.connect(gameServer).setGameServer(user2.address, true)
      ).to.be.revertedWithCustomError(nfaV2, "OwnableUnauthorizedAccount");

      await expect(
        nfaV2.connect(gameServer).setMaxAdventureLog(5)
      ).to.be.revertedWithCustomError(nfaV2, "OwnableUnauthorizedAccount");

      await expect(
        nfaV2.connect(gameServer).setPaused(true)
      ).to.be.revertedWithCustomError(nfaV2, "OwnableUnauthorizedAccount");
    });

    it("random address should not be able to call game server functions", async function () {
      await expect(
        nfaV2.connect(user2).grantXP(1, 10)
      ).to.be.revertedWith("Not authorized game server");

      await expect(
        nfaV2.connect(user2).recordAdventure(1, 1, 1, 10, 1)
      ).to.be.revertedWith("Not authorized game server");
    });
  });

  // =========================================
  // setMaxAdventureLog
  // =========================================

  describe("setMaxAdventureLog", function () {
    it("should update maxAdventureLog", async function () {
      await nfaV2.setMaxAdventureLog(20);
      expect(await nfaV2.maxAdventureLog()).to.equal(20);
    });

    it("should reject zero value", async function () {
      await expect(nfaV2.setMaxAdventureLog(0)).to.be.revertedWith("Max log must be > 0");
    });

    it("should only allow owner", async function () {
      await expect(
        nfaV2.connect(user1).setMaxAdventureLog(5)
      ).to.be.revertedWithCustomError(nfaV2, "OwnableUnauthorizedAccount");
    });
  });
});
