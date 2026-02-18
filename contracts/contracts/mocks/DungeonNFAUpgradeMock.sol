// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../DungeonNFA.sol";

/**
 * @dev Mock contract for testing UUPS upgradeability.
 *      Extends DungeonNFA and adds a new state variable.
 */
contract DungeonNFAUpgradeMock is DungeonNFA {
    uint256 public newStateVar;

    function setNewStateVar(uint256 val) external onlyOwner {
        newStateVar = val;
    }
}
