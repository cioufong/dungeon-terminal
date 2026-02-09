// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../DungeonNFA.sol";

/**
 * @title DungeonNFAV2Mock
 * @dev Mock V2 contract for testing UUPS upgradeability
 */
contract DungeonNFAV2Mock is DungeonNFA {
    uint256 public newStateVar;

    function setNewStateVar(uint256 val) external {
        newStateVar = val;
    }

    function version() external pure returns (string memory) {
        return "2.0.0";
    }
}
