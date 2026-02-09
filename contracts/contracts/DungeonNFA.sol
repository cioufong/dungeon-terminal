// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./INFARenderer.sol";

/// @dev Binance Oracle VRF Coordinator interface
///      https://oracle.binance.com/docs/vrf/request-workflow/
interface VRFCoordinatorInterface {
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 minimumRequestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);
}

/**
 * @title DungeonNFA
 * @dev Non-Fungible Agent for Dungeon Terminal RPG
 *      Uses Binance Oracle VRF for provably fair trait generation
 *      BAP-578 compliant agent metadata
 */
contract DungeonNFA is
    ERC721Upgradeable,
    ERC721EnumerableUpgradeable,
    ERC721URIStorageUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // =============================================
    // ENUMS
    // =============================================

    enum Race { Human, Elf, Dwarf, Tiefling, Beastkin }
    enum Class { Warrior, Mage, Rogue, Ranger, Cleric, Bard }
    enum Personality { Passionate, Calm, Cunning, Kind, Dark, Cheerful, Scholar, Silent }
    enum TalentRarity { Common, Rare, Epic, Legendary, Mythic }

    // =============================================
    // STRUCTS
    // =============================================

    struct NFATraits {
        Race race;
        Class class_;
        Personality personality;
        uint8 talentId;
        TalentRarity talentRarity;
        uint8[6] baseStats; // [STR, DEX, CON, INT, WIS, CHA] range 8-18
    }

    struct NFAProgression {
        uint16 level;
        uint32 xp;
        bool active;
        uint256 createdAt;
    }

    struct AgentMetadata {
        string persona;
        string experience;
        string voiceHash;
        string animationURI;
        string vaultURI;
        bytes32 vaultHash;
    }

    struct PendingMint {
        address minter;
        bool isFree;
    }

    // =============================================
    // CONSTANTS
    // =============================================

    uint256 public constant FREE_MINT_FEE = 0.01 ether;
    uint256 public constant MINT_FEE = 0.05 ether;
    uint256 public constant MAX_SUPPLY = 10000;

    // =============================================
    // STATE
    // =============================================

    uint256 private _tokenIdCounter;
    address public treasuryAddress;
    bool public paused;

    // Free mints
    uint256 public freeMintsPerUser;
    mapping(address => uint256) public freeMintsClaimed;
    mapping(uint256 => bool) public isFreeMint;
    mapping(address => uint256) public bonusFreeMints;

    // VRF (Binance Oracle)
    VRFCoordinatorInterface public vrfCoordinator;
    uint64 public vrfSubscriptionId;
    bytes32 public vrfKeyHash;
    uint16 public vrfConfirmations;
    uint32 public vrfCallbackGasLimit;
    mapping(uint256 => PendingMint) private _pendingMints;
    mapping(address => bool) public hasPendingMint;
    uint256 public pendingMintCount;

    // NFA data
    mapping(uint256 => NFATraits) private _traits;
    mapping(uint256 => NFAProgression) private _progression;
    mapping(uint256 => AgentMetadata) private _agentMeta;

    // XP thresholds per level (cumulative)
    uint32[20] private _xpThresholds;

    // Renderer for on-chain SVG tokenURI (added in upgrade)
    INFARenderer public renderer;

    // =============================================
    // EVENTS
    // =============================================

    event MintRequested(uint256 indexed requestId, address indexed minter, bool isFree);
    event NFAMinted(
        uint256 indexed tokenId,
        address indexed owner,
        Race race,
        Class class_,
        Personality personality,
        uint8 talentId,
        TalentRarity talentRarity,
        uint8[6] baseStats
    );
    event XPGained(uint256 indexed tokenId, uint32 amount, uint16 newLevel);
    event MetadataUpdated(uint256 indexed tokenId);
    event StatusChanged(uint256 indexed tokenId, bool active);
    event TreasuryUpdated(address newTreasury);
    event ContractPaused(bool paused);
    event FreeMintGranted(address indexed user, uint256 amount);
    event RendererUpdated(address renderer);

    // =============================================
    // MODIFIERS
    // =============================================

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    modifier onlyTokenOwner(uint256 tokenId) {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    // =============================================
    // INITIALIZATION
    // =============================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address treasury,
        address _vrfCoordinator,
        uint64 _vrfSubId,
        bytes32 _vrfKeyHash
    ) public initializer {
        require(treasury != address(0), "Invalid treasury");
        require(_vrfCoordinator != address(0), "Invalid VRF coordinator");

        __ERC721_init("Dungeon NFA", "DNFA");
        __ERC721Enumerable_init();
        __ERC721URIStorage_init();
        __ReentrancyGuard_init();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();

        treasuryAddress = treasury;
        freeMintsPerUser = 1;

        vrfCoordinator = VRFCoordinatorInterface(_vrfCoordinator);
        vrfSubscriptionId = _vrfSubId;
        vrfKeyHash = _vrfKeyHash;
        vrfConfirmations = 3;
        vrfCallbackGasLimit = 300000;

        // XP thresholds: level 1=0, level 2=100, level 3=300, ...
        _xpThresholds = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500,
            5500, 6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
    }

    // =============================================
    // FREE MINT (character creation, soulbound)
    // =============================================

    /**
     * @dev Create your character. Costs FREE_MINT_FEE (0.01 BNB).
     *      One per wallet (soulbound, non-transferable).
     *      Traits are determined by Binance Oracle VRF.
     */
    function freeMint() external payable whenNotPaused nonReentrant {
        require(totalSupply() + pendingMintCount < MAX_SUPPLY, "Max supply reached");
        require(msg.value == FREE_MINT_FEE, "Incorrect fee");
        require(!hasPendingMint[msg.sender], "Pending mint exists");

        uint256 totalFree = freeMintsPerUser + bonusFreeMints[msg.sender];
        require(
            freeMintsClaimed[msg.sender] < totalFree,
            "No free mints remaining"
        );

        // Consume free mint slot upfront
        freeMintsClaimed[msg.sender]++;

        // Send fee to treasury
        (bool ok, ) = payable(treasuryAddress).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        // Request VRF randomness
        uint256 requestId = vrfCoordinator.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            vrfConfirmations,
            vrfCallbackGasLimit,
            1
        );

        _pendingMints[requestId] = PendingMint(msg.sender, true);
        hasPendingMint[msg.sender] = true;
        pendingMintCount++;

        emit MintRequested(requestId, msg.sender, true);
    }

    // =============================================
    // PAID MINT (companion recruitment, tradeable)
    // =============================================

    /**
     * @dev Recruit an NFA companion. Costs MINT_FEE (0.05 BNB).
     *      Companions are transferable and tradeable.
     *      Traits are determined by Binance Oracle VRF.
     */
    function paidMint() external payable whenNotPaused nonReentrant {
        require(totalSupply() + pendingMintCount < MAX_SUPPLY, "Max supply reached");
        require(msg.value == MINT_FEE, "Incorrect fee");
        require(!hasPendingMint[msg.sender], "Pending mint exists");

        // Send fee to treasury
        (bool ok, ) = payable(treasuryAddress).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        // Request VRF randomness
        uint256 requestId = vrfCoordinator.requestRandomWords(
            vrfKeyHash,
            vrfSubscriptionId,
            vrfConfirmations,
            vrfCallbackGasLimit,
            1
        );

        _pendingMints[requestId] = PendingMint(msg.sender, false);
        hasPendingMint[msg.sender] = true;
        pendingMintCount++;

        emit MintRequested(requestId, msg.sender, false);
    }

    // =============================================
    // VRF CALLBACK
    // =============================================

    /**
     * @dev Called by the Binance Oracle VRF Coordinator when randomness is ready.
     *      We implement this directly (not via VRFConsumerBase) because
     *      VRFConsumerBase uses constructor/immutable which conflicts with UUPS proxy.
     */
    function rawFulfillRandomWords(
        uint256 requestId,
        uint256[] memory randomWords
    ) external {
        require(msg.sender == address(vrfCoordinator), "Only VRF coordinator");

        PendingMint memory pending = _pendingMints[requestId];
        require(pending.minter != address(0), "Unknown request");

        uint256 seed = randomWords[0];
        NFATraits memory traits = _deriveTraits(seed);
        uint256 tokenId = ++_tokenIdCounter;

        if (pending.isFree) {
            isFreeMint[tokenId] = true;
        }

        // Use _mint (not _safeMint) to avoid callback failures in VRF context
        _mint(pending.minter, tokenId);

        _traits[tokenId] = traits;
        _progression[tokenId] = NFAProgression({
            level: 1,
            xp: 0,
            active: true,
            createdAt: block.timestamp
        });

        delete _pendingMints[requestId];
        hasPendingMint[pending.minter] = false;
        pendingMintCount--;

        emit NFAMinted(
            tokenId,
            pending.minter,
            traits.race,
            traits.class_,
            traits.personality,
            traits.talentId,
            traits.talentRarity,
            traits.baseStats
        );
    }

    // =============================================
    // TRAIT DERIVATION
    // =============================================

    function _deriveTraits(uint256 seed) internal pure returns (NFATraits memory) {
        NFATraits memory t;

        t.race = Race(seed % 5);
        seed = seed >> 8;

        t.class_ = Class(seed % 6);
        seed = seed >> 8;

        t.personality = Personality(seed % 8);
        seed = seed >> 8;

        // Talent rarity: Common 60%, Rare 25%, Epic 10%, Legendary 4%, Mythic 1%
        uint256 rarityRoll = seed % 100;
        seed = seed >> 8;
        if (rarityRoll < 60) t.talentRarity = TalentRarity.Common;
        else if (rarityRoll < 85) t.talentRarity = TalentRarity.Rare;
        else if (rarityRoll < 95) t.talentRarity = TalentRarity.Epic;
        else if (rarityRoll < 99) t.talentRarity = TalentRarity.Legendary;
        else t.talentRarity = TalentRarity.Mythic;

        // Talent ID (0-29, 30 different talents)
        t.talentId = uint8(seed % 30);
        seed = seed >> 8;

        // Base stats: 8-18 range (11 values)
        for (uint256 i = 0; i < 6; i++) {
            t.baseStats[i] = uint8(8 + (seed % 11));
            seed = seed >> 8;
        }

        return t;
    }

    // =============================================
    // GAMEPLAY
    // =============================================

    /**
     * @dev Grant XP to an NFA. MVP: only owner (game server wallet).
     */
    function grantXP(uint256 tokenId, uint32 amount) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        NFAProgression storage prog = _progression[tokenId];
        require(prog.active, "NFA inactive");

        prog.xp += amount;

        // Auto level-up
        while (prog.level < 20 && prog.xp >= _xpThresholds[prog.level]) {
            prog.level++;
        }

        emit XPGained(tokenId, amount, prog.level);
    }

    /**
     * @dev Update BAP-578 agent metadata (token owner only).
     */
    function updateAgentMetadata(
        uint256 tokenId,
        AgentMetadata calldata metadata
    ) external onlyTokenOwner(tokenId) {
        _agentMeta[tokenId] = metadata;
        emit MetadataUpdated(tokenId);
    }

    /**
     * @dev Set NFA active/inactive.
     */
    function setNFAStatus(uint256 tokenId, bool active) external onlyTokenOwner(tokenId) {
        _progression[tokenId].active = active;
        emit StatusChanged(tokenId, active);
    }

    // =============================================
    // VIEW FUNCTIONS
    // =============================================

    function getNFA(uint256 tokenId)
        external
        view
        returns (
            NFATraits memory traits,
            NFAProgression memory progression,
            AgentMetadata memory agentMeta,
            address owner
        )
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return (
            _traits[tokenId],
            _progression[tokenId],
            _agentMeta[tokenId],
            ownerOf(tokenId)
        );
    }

    function getTraits(uint256 tokenId) external view returns (NFATraits memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _traits[tokenId];
    }

    function getProgression(uint256 tokenId) external view returns (NFAProgression memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _progression[tokenId];
    }

    function tokensOfOwner(address account) external view returns (uint256[] memory) {
        uint256 count = balanceOf(account);
        uint256[] memory tokens = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            tokens[i] = tokenOfOwnerByIndex(account, i);
        }
        return tokens;
    }

    function getFreeMints(address user) external view returns (uint256) {
        uint256 total = freeMintsPerUser + bonusFreeMints[user];
        uint256 claimed = freeMintsClaimed[user];
        return claimed >= total ? 0 : total - claimed;
    }

    // =============================================
    // ADMIN
    // =============================================

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit ContractPaused(_paused);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Zero address");
        treasuryAddress = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setFreeMintsPerUser(uint256 amount) external onlyOwner {
        freeMintsPerUser = amount;
    }

    function grantAdditionalFreeMints(address user, uint256 amount) external onlyOwner {
        bonusFreeMints[user] += amount;
        emit FreeMintGranted(user, amount);
    }

    function setRenderer(address _renderer) external onlyOwner {
        renderer = INFARenderer(_renderer);
        emit RendererUpdated(_renderer);
    }

    function setVRFConfig(
        address _vrfCoordinator,
        uint64 _vrfSubId,
        bytes32 _vrfKeyHash,
        uint16 _vrfConfirmations,
        uint32 _vrfCallbackGasLimit
    ) external onlyOwner {
        require(_vrfCoordinator != address(0), "Invalid coordinator");
        vrfCoordinator = VRFCoordinatorInterface(_vrfCoordinator);
        vrfSubscriptionId = _vrfSubId;
        vrfKeyHash = _vrfKeyHash;
        vrfConfirmations = _vrfConfirmations;
        vrfCallbackGasLimit = _vrfCallbackGasLimit;
    }

    function emergencyWithdraw() external onlyOwner {
        uint256 bal = address(this).balance;
        require(bal > 0, "No balance");
        (bool ok, ) = payable(owner()).call{value: bal}("");
        require(ok, "Withdraw failed");
    }

    // =============================================
    // OVERRIDES
    // =============================================

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Soulbound: free minted tokens cannot be transferred (except mint/burn)
        if (isFreeMint[tokenId]) {
            require(
                from == address(0) || to == address(0),
                "Free minted tokens are non-transferable"
            );
        }
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount)
        internal
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable)
    {
        super._increaseBalance(account, amount);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721Upgradeable, ERC721URIStorageUpgradeable)
        returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        // If renderer is set, generate dynamic on-chain metadata
        if (address(renderer) != address(0)) {
            NFATraits memory t = _traits[tokenId];
            NFAProgression memory p = _progression[tokenId];
            return renderer.tokenURI(
                tokenId,
                uint8(t.race),
                uint8(t.class_),
                uint8(t.personality),
                uint8(t.talentRarity),
                t.talentId,
                p.level,
                t.baseStats
            );
        }

        // Fallback to stored URI
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ERC721EnumerableUpgradeable, ERC721URIStorageUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    receive() external payable {
        revert("Use freeMint() or paidMint()");
    }
}
