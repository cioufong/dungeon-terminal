import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { DungeonNFA, DungeonNFAV2Mock, MockVRFCoordinator } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("DungeonNFA", function () {
  let nfa: DungeonNFA;
  let vrfMock: MockVRFCoordinator;
  let owner: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
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
    [owner, treasury, user1, user2] = await ethers.getSigners();

    // Deploy mock VRF coordinator
    const VRFFactory = await ethers.getContractFactory("MockVRFCoordinator");
    vrfMock = (await VRFFactory.deploy()) as unknown as MockVRFCoordinator;
    await vrfMock.waitForDeployment();

    // Deploy DungeonNFA with VRF
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
  // XP & Leveling
  // =========================================

  describe("XP & Leveling", function () {
    beforeEach(async function () {
      await freeMintAndFulfill(user1);
    });

    it("should grant XP (owner only)", async function () {
      await expect(nfa.grantXP(1, 50))
        .to.emit(nfa, "XPGained")
        .withArgs(1, 50, 1);

      const prog = await nfa.getProgression(1);
      expect(prog.xp).to.equal(50);
      expect(prog.level).to.equal(1);
    });

    it("should level up when XP threshold reached", async function () {
      await nfa.grantXP(1, 100);
      expect((await nfa.getProgression(1)).level).to.equal(2);
    });

    it("should support multi-level jumps", async function () {
      await nfa.grantXP(1, 1000);
      expect((await nfa.getProgression(1)).level).to.equal(5);
    });

    it("should reject XP from non-owner", async function () {
      await expect(
        nfa.connect(user1).grantXP(1, 50)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });

    it("should reject XP for inactive NFA", async function () {
      await nfa.connect(user1).setNFAStatus(1, false);
      await expect(nfa.grantXP(1, 50)).to.be.revertedWith("NFA inactive");
    });
  });

  // =========================================
  // Metadata
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
  // UUPS Upgrade
  // =========================================

  describe("UUPS Upgrade", function () {
    it("should upgrade to V2 and preserve state", async function () {
      await freeMintAndFulfill(user1);
      expect(await nfa.totalSupply()).to.equal(1);

      const V2Factory = await ethers.getContractFactory("DungeonNFAV2Mock");
      const upgraded = (await upgrades.upgradeProxy(
        await nfa.getAddress(), V2Factory
      )) as unknown as DungeonNFAV2Mock;

      expect(await upgraded.version()).to.equal("2.0.0");
      await upgraded.setNewStateVar(42);
      expect(await upgraded.newStateVar()).to.equal(42);
      expect(await upgraded.totalSupply()).to.equal(1);
      expect(await upgraded.ownerOf(1)).to.equal(user1.address);
    });

    it("should reject upgrade from non-owner", async function () {
      const V2Factory = await ethers.getContractFactory("DungeonNFAV2Mock", user1);
      await expect(
        upgrades.upgradeProxy(await nfa.getAddress(), V2Factory)
      ).to.be.revertedWithCustomError(nfa, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================
  // Edge Cases
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
      await nfa.grantAdditionalFreeMints(user2.address, 0); // user2 has default 1
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
