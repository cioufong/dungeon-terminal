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
 *      BAP-578 compliant agent metadata with game server role,
 *      adventure logging, and optional VRF trait generation.
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

    struct AdventureEntry {
        uint16 floor;
        uint8 result;       // 0=fled, 1=cleared, 2=defeated
        uint16 xpEarned;
        uint16 killCount;
        uint64 timestamp;
    }

    struct GameStats {
        uint16 highestFloor;
        uint32 totalRuns;
        uint32 totalKills;
        uint64 lastActiveAt;
    }

    // =============================================
    // CONSTANTS
    // =============================================

    uint256 public constant MAX_SUPPLY = 10000;

    // =============================================
    // MINT FEES (configurable by owner)
    // =============================================

    uint256 public freeMintFee;
    uint256 public paidMintFee;

    // =============================================
    // STATE
    // =============================================

    uint256 internal _tokenIdCounter;
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
    mapping(uint256 => PendingMint) internal _pendingMints;
    mapping(address => bool) public hasPendingMint;
    uint256 public pendingMintCount;

    // NFA data
    mapping(uint256 => NFATraits) internal _traits;
    mapping(uint256 => NFAProgression) internal _progression;
    mapping(uint256 => AgentMetadata) internal _agentMeta;

    // XP thresholds per level (cumulative)
    uint32[20] internal _xpThresholds;

    // Renderer for on-chain SVG tokenURI
    INFARenderer public renderer;

    // Game server role
    mapping(address => bool) public gameServers;

    // Adventure logs
    uint8 public maxAdventureLog;
    mapping(uint256 => AdventureEntry[]) internal _adventureLogs;
    mapping(uint256 => uint256) public adventureLogIndex;
    mapping(uint256 => GameStats) public gameStats;

    // VRF toggle: when false, uses pseudo-random (no VRF cost)
    bool public vrfEnabled;

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
    event AdventureRecorded(uint256 indexed tokenId, uint16 floor, uint8 result);
    event GameServerUpdated(address indexed server, bool authorized);
    event VRFToggled(bool enabled);

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

    modifier onlyGameServer() {
        require(gameServers[msg.sender], "Not authorized game server");
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
        freeMintFee = 0.01 ether;
        paidMintFee = 0.05 ether;
        freeMintsPerUser = 1;

        vrfCoordinator = VRFCoordinatorInterface(_vrfCoordinator);
        vrfSubscriptionId = _vrfSubId;
        vrfKeyHash = _vrfKeyHash;
        vrfConfirmations = 3;
        vrfCallbackGasLimit = 300000;

        maxAdventureLog = 10;

        // XP thresholds: level 1=0, level 2=100, level 3=300, ...
        _xpThresholds = [
            0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500,
            5500, 6600, 7800, 9100, 10500, 12000, 13600, 15300, 17100, 19000
        ];
    }

    // =============================================
    // FREE MINT (character creation, soulbound)
    // =============================================

    function freeMint() external payable whenNotPaused nonReentrant {
        require(totalSupply() + pendingMintCount < MAX_SUPPLY, "Max supply reached");
        require(msg.value == freeMintFee, "Incorrect fee");
        require(!hasPendingMint[msg.sender], "Pending mint exists");

        uint256 totalFree = freeMintsPerUser + bonusFreeMints[msg.sender];
        require(freeMintsClaimed[msg.sender] < totalFree, "No free mints remaining");
        freeMintsClaimed[msg.sender]++;

        (bool ok, ) = payable(treasuryAddress).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        if (vrfEnabled) {
            uint256 requestId = vrfCoordinator.requestRandomWords(
                vrfKeyHash, vrfSubscriptionId, vrfConfirmations, vrfCallbackGasLimit, 1
            );
            _pendingMints[requestId] = PendingMint(msg.sender, true);
            hasPendingMint[msg.sender] = true;
            pendingMintCount++;
            emit MintRequested(requestId, msg.sender, true);
        } else {
            _instantMint(msg.sender, true);
        }
    }

    // =============================================
    // PAID MINT (companion recruitment, tradeable)
    // =============================================

    function paidMint() external payable whenNotPaused nonReentrant {
        require(totalSupply() + pendingMintCount < MAX_SUPPLY, "Max supply reached");
        require(msg.value == paidMintFee, "Incorrect fee");
        require(!hasPendingMint[msg.sender], "Pending mint exists");

        (bool ok, ) = payable(treasuryAddress).call{value: msg.value}("");
        require(ok, "Treasury transfer failed");

        if (vrfEnabled) {
            uint256 requestId = vrfCoordinator.requestRandomWords(
                vrfKeyHash, vrfSubscriptionId, vrfConfirmations, vrfCallbackGasLimit, 1
            );
            _pendingMints[requestId] = PendingMint(msg.sender, false);
            hasPendingMint[msg.sender] = true;
            pendingMintCount++;
            emit MintRequested(requestId, msg.sender, false);
        } else {
            _instantMint(msg.sender, false);
        }
    }

    // =============================================
    // INSTANT MINT (pseudo-random, no VRF cost)
    // =============================================

    function _instantMint(address minter, bool isFree) internal {
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.prevrandao, block.timestamp, minter, _tokenIdCounter
        )));

        NFATraits memory traits = _deriveTraits(seed);
        uint256 tokenId = ++_tokenIdCounter;

        if (isFree) {
            isFreeMint[tokenId] = true;
        }

        _mint(minter, tokenId);

        _traits[tokenId] = traits;
        _progression[tokenId] = NFAProgression({
            level: 1,
            xp: 0,
            active: true,
            createdAt: block.timestamp
        });

        emit NFAMinted(
            tokenId, minter,
            traits.race, traits.class_, traits.personality,
            traits.talentId, traits.talentRarity, traits.baseStats
        );
    }

    // =============================================
    // VRF CALLBACK
    // =============================================

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

        uint256 rarityRoll = seed % 100;
        seed = seed >> 8;
        if (rarityRoll < 60) t.talentRarity = TalentRarity.Common;
        else if (rarityRoll < 85) t.talentRarity = TalentRarity.Rare;
        else if (rarityRoll < 95) t.talentRarity = TalentRarity.Epic;
        else if (rarityRoll < 99) t.talentRarity = TalentRarity.Legendary;
        else t.talentRarity = TalentRarity.Mythic;

        t.talentId = uint8(seed % 30);
        seed = seed >> 8;

        for (uint256 i = 0; i < 6; i++) {
            t.baseStats[i] = uint8(8 + (seed % 11));
            seed = seed >> 8;
        }

        return t;
    }

    // =============================================
    // GAME SERVER FUNCTIONS
    // =============================================

    function grantXP(uint256 tokenId, uint32 amount) external onlyGameServer {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        NFAProgression storage prog = _progression[tokenId];
        require(prog.active, "NFA inactive");

        prog.xp += amount;

        while (prog.level < 20 && prog.xp >= _xpThresholds[prog.level]) {
            prog.level++;
        }

        gameStats[tokenId].lastActiveAt = uint64(block.timestamp);

        emit XPGained(tokenId, amount, prog.level);
    }

    function recordAdventure(
        uint256 tokenId,
        uint16 floor,
        uint8 result,
        uint16 xpEarned,
        uint16 killCount
    ) external onlyGameServer {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(result <= 2, "Invalid result");
        _recordAdventure(tokenId, floor, result, xpEarned, killCount);
    }

    function recordAdventureBatch(
        uint256[] calldata tokenIds,
        uint16 floor,
        uint8 result,
        uint16 xpEarned,
        uint16 killCount
    ) external onlyGameServer {
        require(result <= 2, "Invalid result");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            require(_ownerOf(tokenIds[i]) != address(0), "Token does not exist");
            _recordAdventure(tokenIds[i], floor, result, xpEarned, killCount);
        }
    }

    function updateVault(
        uint256 tokenId,
        string calldata vaultURI,
        bytes32 vaultHash
    ) external onlyGameServer {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _agentMeta[tokenId].vaultURI = vaultURI;
        _agentMeta[tokenId].vaultHash = vaultHash;
        emit MetadataUpdated(tokenId);
    }

    function updateExperience(
        uint256 tokenId,
        string calldata experience
    ) external onlyGameServer {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _agentMeta[tokenId].experience = experience;
        emit MetadataUpdated(tokenId);
    }

    // =============================================
    // GAMEPLAY (token owner)
    // =============================================

    function updateAgentMetadata(
        uint256 tokenId,
        AgentMetadata calldata metadata
    ) external onlyTokenOwner(tokenId) {
        _agentMeta[tokenId] = metadata;
        emit MetadataUpdated(tokenId);
    }

    function setNFAStatus(uint256 tokenId, bool active) external onlyTokenOwner(tokenId) {
        _progression[tokenId].active = active;
        emit StatusChanged(tokenId, active);
    }

    // =============================================
    // INTERNAL
    // =============================================

    function _recordAdventure(
        uint256 tokenId,
        uint16 floor,
        uint8 result,
        uint16 xpEarned,
        uint16 killCount
    ) internal {
        AdventureEntry memory entry = AdventureEntry({
            floor: floor,
            result: result,
            xpEarned: xpEarned,
            killCount: killCount,
            timestamp: uint64(block.timestamp)
        });

        uint256 idx = adventureLogIndex[tokenId];
        if (_adventureLogs[tokenId].length < maxAdventureLog) {
            _adventureLogs[tokenId].push(entry);
        } else {
            _adventureLogs[tokenId][idx % maxAdventureLog] = entry;
        }
        adventureLogIndex[tokenId] = idx + 1;

        GameStats storage gs = gameStats[tokenId];
        gs.totalRuns++;
        gs.totalKills += uint32(killCount);
        if (floor > gs.highestFloor) {
            gs.highestFloor = floor;
        }
        gs.lastActiveAt = uint64(block.timestamp);

        emit AdventureRecorded(tokenId, floor, result);
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

    function getGameStats(uint256 tokenId) external view returns (GameStats memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return gameStats[tokenId];
    }

    function getAdventureLog(uint256 tokenId) external view returns (AdventureEntry[] memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        AdventureEntry[] storage logs = _adventureLogs[tokenId];
        uint256 len = logs.length;
        if (len == 0) return new AdventureEntry[](0);

        uint256 idx = adventureLogIndex[tokenId];

        if (idx <= len) {
            AdventureEntry[] memory result = new AdventureEntry[](len);
            for (uint256 i = 0; i < len; i++) {
                result[i] = logs[i];
            }
            return result;
        }

        AdventureEntry[] memory sorted = new AdventureEntry[](len);
        uint256 start = idx % len;
        for (uint256 i = 0; i < len; i++) {
            sorted[i] = logs[(start + i) % len];
        }
        return sorted;
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

    function version() external pure returns (string memory) {
        return "2.0.0";
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

    function setFreeMintFee(uint256 fee) external onlyOwner {
        freeMintFee = fee;
    }

    function setPaidMintFee(uint256 fee) external onlyOwner {
        paidMintFee = fee;
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

    function setVRFEnabled(bool enabled) external onlyOwner {
        vrfEnabled = enabled;
        emit VRFToggled(enabled);
    }

    function setGameServer(address server, bool authorized) external onlyOwner {
        require(server != address(0), "Invalid server address");
        gameServers[server] = authorized;
        emit GameServerUpdated(server, authorized);
    }

    function setMaxAdventureLog(uint8 maxLog) external onlyOwner {
        require(maxLog > 0, "Max log must be > 0");
        maxAdventureLog = maxLog;
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
