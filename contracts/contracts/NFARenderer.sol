// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./INFARenderer.sol";
import "./generated/PixelData.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title NFARenderer
 * @dev Generates on-chain SVG pixel art + JSON metadata for Dungeon NFA tokens.
 *      Characters are 16×16 pixel art with swappable backgrounds.
 */
contract NFARenderer is INFARenderer {
    using Strings for uint256;
    using Strings for uint8;

    // Trait name arrays
    string[5] private _raceNames;
    string[6] private _classNames;
    string[8] private _personalityNames;
    string[5] private _rarityNames;

    constructor() {
        _raceNames = ["Human", "Elf", "Dwarf", "Tiefling", "Beastkin"];
        _classNames = ["Warrior", "Mage", "Rogue", "Ranger", "Cleric", "Bard"];
        _personalityNames = ["Passionate", "Calm", "Cunning", "Kind", "Dark", "Cheerful", "Scholar", "Silent"];
        _rarityNames = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
    }

    // ═══════════════════════════════════════════
    // SVG RENDERING
    // ═══════════════════════════════════════════

    function renderSVG(
        uint8 race,
        uint8 class_,
        uint8 personality,
        uint8 talentRarity
    ) external view returns (string memory) {
        return _renderSVG(race, class_, personality, talentRarity);
    }

    function _renderSVG(
        uint8 race,
        uint8 class_,
        uint8 personality,
        uint8 talentRarity
    ) internal pure returns (string memory) {
        bytes memory pal = PixelData.palette();

        // Select background: (personality * 2 + talentRarity) % BG_COUNT
        uint8 bgIndex = uint8((uint256(personality) * 2 + uint256(talentRarity)) % PixelData.BG_COUNT);

        // Start SVG
        bytes memory svg = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" width="512" height="512">'
        );

        // Draw background rects
        {
            bytes memory bgData = PixelData.backgroundData();
            uint256 bgStart = PixelData.backgroundOffset(bgIndex);
            uint256 bgEnd = bgIndex + 1 < PixelData.BG_COUNT
                ? PixelData.backgroundOffset(bgIndex + 1)
                : bgData.length;
            svg = abi.encodePacked(svg, _renderRects(bgData, bgStart, bgEnd, pal));
        }

        // Draw character rects
        {
            bytes memory charData = PixelData.characterData();
            uint256 charIdx = uint256(race) * 6 + uint256(class_);
            uint256 charStart = PixelData.characterOffset(race, class_);
            uint256 charEnd = charIdx < 29
                ? PixelData.characterOffset(uint8((charIdx + 1) / 6), uint8((charIdx + 1) % 6))
                : charData.length;
            svg = abi.encodePacked(svg, _renderRects(charData, charStart, charEnd, pal));
        }

        svg = abi.encodePacked(svg, '</svg>');
        return string(svg);
    }

    function _renderRects(
        bytes memory data,
        uint256 startOffset,
        uint256 endOffset,
        bytes memory pal
    ) internal pure returns (bytes memory) {
        bytes memory result;
        uint256 ptr = startOffset;

        while (ptr + 2 < endOffset) {
            uint8 byte0 = uint8(data[ptr]);
            uint8 byte1 = uint8(data[ptr + 1]);
            uint8 colorIdx = uint8(data[ptr + 2]);
            ptr += 3;

            uint8 x = byte0 >> 4;
            uint8 y = byte0 & 0x0F;
            uint8 w = (byte1 >> 4) + 1;
            uint8 h = (byte1 & 0x0F) + 1;

            // Get RGB from palette
            uint256 palPtr = uint256(colorIdx) * 3;
            uint8 r = uint8(pal[palPtr]);
            uint8 g = uint8(pal[palPtr + 1]);
            uint8 b = uint8(pal[palPtr + 2]);

            result = abi.encodePacked(
                result,
                '<rect x="', uint256(x).toString(),
                '" y="', uint256(y).toString(),
                '" width="', uint256(w).toString(),
                '" height="', uint256(h).toString(),
                '" fill="#', _toHexColor(r, g, b),
                '"/>'
            );
        }
        return result;
    }

    // ═══════════════════════════════════════════
    // TOKEN URI (full metadata)
    // ═══════════════════════════════════════════

    function tokenURI(
        uint256 tokenId,
        uint8 race,
        uint8 class_,
        uint8 personality,
        uint8 talentRarity,
        uint8 talentId,
        uint16 level,
        uint8[6] memory baseStats
    ) external view returns (string memory) {
        string memory svg = _renderSVG(race, class_, personality, talentRarity);
        string memory svgBase64 = Base64.encode(bytes(svg));
        string memory imageURI = string(abi.encodePacked("data:image/svg+xml;base64,", svgBase64));

        string memory json = string(abi.encodePacked(
            '{"name":"Dungeon NFA #', tokenId.toString(),
            '","description":"', _raceNames[race], ' ', _classNames[class_],
            ' - On-chain pixel art NFA for Dungeon Terminal RPG"',
            ',"image":"', imageURI, '"'
        ));

        json = string(abi.encodePacked(
            json,
            ',"attributes":[',
            _attr("Race", _raceNames[race]), ',',
            _attr("Class", _classNames[class_]), ',',
            _attr("Personality", _personalityNames[personality]), ','
        ));

        json = string(abi.encodePacked(
            json,
            _numAttr("Talent ID", uint256(talentId)), ',',
            _attr("Talent Rarity", _rarityNames[talentRarity]), ',',
            _numAttr("Level", uint256(level)), ','
        ));

        // Stats
        string[6] memory statNames = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
        json = string(abi.encodePacked(
            json,
            _numAttr(statNames[0], uint256(baseStats[0])), ',',
            _numAttr(statNames[1], uint256(baseStats[1])), ',',
            _numAttr(statNames[2], uint256(baseStats[2])), ','
        ));

        json = string(abi.encodePacked(
            json,
            _numAttr(statNames[3], uint256(baseStats[3])), ',',
            _numAttr(statNames[4], uint256(baseStats[4])), ',',
            _numAttr(statNames[5], uint256(baseStats[5])),
            ']}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    // ═══════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════

    function _attr(string memory key, string memory value) internal pure returns (string memory) {
        return string(abi.encodePacked('{"trait_type":"', key, '","value":"', value, '"}'));
    }

    function _numAttr(string memory key, uint256 value) internal pure returns (string memory) {
        return string(abi.encodePacked('{"trait_type":"', key, '","value":', value.toString(), '}'));
    }

    bytes16 private constant _HEX = "0123456789abcdef";

    function _toHexColor(uint8 r, uint8 g, uint8 b) internal pure returns (string memory) {
        bytes memory hex_ = new bytes(6);
        hex_[0] = _HEX[r >> 4];
        hex_[1] = _HEX[r & 0x0F];
        hex_[2] = _HEX[g >> 4];
        hex_[3] = _HEX[g & 0x0F];
        hex_[4] = _HEX[b >> 4];
        hex_[5] = _HEX[b & 0x0F];
        return string(hex_);
    }
}
