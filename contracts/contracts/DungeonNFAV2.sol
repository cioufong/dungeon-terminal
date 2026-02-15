// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./DungeonNFA.sol";

/**
 * @title DungeonNFAV2
 * @dev V2 upgrade adding game server role, adventure logs, and extended progression.
 *      All new state appended after DungeonNFA storage layout.
 */
contract DungeonNFAV2 is DungeonNFA {
    // =============================================
    // STRUCTS
    // =============================================

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
    // STATE (appended after DungeonNFA storage)
    // =============================================

    mapping(address => bool) public gameServers;
    uint8 public maxAdventureLog;
    mapping(uint256 => AdventureEntry[]) internal _adventureLogs;
    mapping(uint256 => uint256) public adventureLogIndex;
    mapping(uint256 => GameStats) public gameStats;

    // =============================================
    // EVENTS
    // =============================================

    event AdventureRecorded(uint256 indexed tokenId, uint16 floor, uint8 result);
    event GameServerUpdated(address indexed server, bool authorized);

    // =============================================
    // MODIFIERS
    // =============================================

    modifier onlyGameServer() {
        require(gameServers[msg.sender], "Not authorized game server");
        _;
    }

    // =============================================
    // INITIALIZATION
    // =============================================

    function initializeV2() public reinitializer(3) {
        maxAdventureLog = 10;
    }

    // =============================================
    // ADMIN FUNCTIONS
    // =============================================

    function setGameServer(address server, bool authorized) external onlyOwner {
        require(server != address(0), "Invalid server address");
        gameServers[server] = authorized;
        emit GameServerUpdated(server, authorized);
    }

    function setMaxAdventureLog(uint8 maxLog) external onlyOwner {
        require(maxLog > 0, "Max log must be > 0");
        maxAdventureLog = maxLog;
    }

    // =============================================
    // GAME SERVER FUNCTIONS
    // =============================================

    /**
     * @dev Override grantXP to use game server role instead of onlyOwner.
     *      Uses the same _xpThresholds table from V1.
     */
    function grantXP(uint256 tokenId, uint32 amount) external override onlyGameServer {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        NFAProgression storage prog = _progression[tokenId];
        require(prog.active, "NFA inactive");

        prog.xp += amount;

        // Auto level-up using V1 threshold table
        while (prog.level < 20 && prog.xp >= _xpThresholds[prog.level]) {
            prog.level++;
        }

        // Update game stats
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

        // Update game stats
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

        // Buffer hasn't wrapped — already chronological
        if (idx <= len) {
            AdventureEntry[] memory result = new AdventureEntry[](len);
            for (uint256 i = 0; i < len; i++) {
                result[i] = logs[i];
            }
            return result;
        }

        // Buffer has wrapped — reorder chronologically
        AdventureEntry[] memory sorted = new AdventureEntry[](len);
        uint256 start = idx % len;
        for (uint256 i = 0; i < len; i++) {
            sorted[i] = logs[(start + i) % len];
        }
        return sorted;
    }

    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
