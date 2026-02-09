// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface INFARenderer {
    function tokenURI(
        uint256 tokenId,
        uint8 race,
        uint8 class_,
        uint8 personality,
        uint8 talentRarity,
        uint8 talentId,
        uint16 level,
        uint8[6] memory baseStats
    ) external view returns (string memory);

    function renderSVG(
        uint8 race,
        uint8 class_,
        uint8 personality,
        uint8 talentRarity
    ) external view returns (string memory);
}
