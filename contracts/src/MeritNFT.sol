// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title MeritNFT
 * @notice On-chain SVG "Merit" NFT — minted when a threat report is confirmed.
 *         Each NFT has a unique merit level, visual style, and on-chain metadata.
 *
 *         "赛博功德" — Staking as Merit.
 *         Users who correctly report malicious contracts earn eternal on-chain merit.
 *
 * @dev Minimal ERC-721 implementation with fully on-chain SVG + JSON metadata.
 *      No external dependencies — everything lives on Monad.
 */
contract MeritNFT {
    // ---- Custom Errors ----
    error NotAuthorized();
    error TokenNotFound();
    error TransferToZero();
    error ApprovalToSelf();
    error NotOwnerOrApproved();

    // ---- Types ----
    struct MeritData {
        address reporter;          // Who earned this merit
        uint256 threatLevel;       // 1-4 (LOW to CRITICAL)
        uint256 meritPoints;       // Cumulative merit at mint time
        uint256 stakeAmount;       // How much was staked
        uint256 reportId;          // Which report earned this
        uint256 mintedAt;          // Timestamp
    }

    // ---- State ----
    string public name = "ShieldWall Merit";
    string public symbol = "MERIT";

    address public registry;       // Only ThreatRegistry can mint
    uint256 public totalSupply;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => MeritData) public meritData;

    /// @notice Total merit points per address
    mapping(address => uint256) public totalMerit;

    // ---- Events ----
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event MeritEarned(address indexed reporter, uint256 indexed tokenId, uint256 meritPoints, uint256 threatLevel);

    // ---- Constructor ----
    constructor(address _registry) {
        registry = _registry;
    }

    // ---- Mint (only callable by ThreatRegistry) ----

    /**
     * @notice Mint a Merit NFT to a reporter who successfully confirmed a threat.
     * @param to The reporter address
     * @param threatLevel 1-4 (LOW to CRITICAL)
     * @param stakeAmount How much MON was staked
     * @param reportId The report ID
     */
    function mint(
        address to,
        uint256 threatLevel,
        uint256 stakeAmount,
        uint256 reportId
    ) external returns (uint256 tokenId) {
        if (msg.sender != registry) revert NotAuthorized();

        tokenId = totalSupply + 1;
        totalSupply = tokenId;

        // Merit points: higher threat = more merit, higher stake = more merit
        uint256 meritPoints = threatLevel * 100 + (stakeAmount / 0.01 ether) * 10;
        totalMerit[to] += meritPoints;

        ownerOf[tokenId] = to;
        balanceOf[to]++;

        meritData[tokenId] = MeritData({
            reporter: to,
            threatLevel: threatLevel,
            meritPoints: meritPoints,
            stakeAmount: stakeAmount,
            reportId: reportId,
            mintedAt: block.timestamp
        });

        emit Transfer(address(0), to, tokenId);
        emit MeritEarned(to, tokenId, meritPoints, threatLevel);
    }

    // ---- ERC-721 Core ----

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenNotFound();
        if (to == tokenOwner) revert ApprovalToSelf();
        if (msg.sender != tokenOwner && !isApprovedForAll[tokenOwner][msg.sender]) {
            revert NotOwnerOrApproved();
        }
        getApproved[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        if (to == address(0)) revert TransferToZero();
        address tokenOwner = ownerOf[tokenId];
        if (tokenOwner == address(0)) revert TokenNotFound();
        if (tokenOwner != from) revert NotOwnerOrApproved();
        if (
            msg.sender != from &&
            getApproved[tokenId] != msg.sender &&
            !isApprovedForAll[from][msg.sender]
        ) revert NotOwnerOrApproved();

        balanceOf[from]--;
        balanceOf[to]++;
        ownerOf[tokenId] = to;
        delete getApproved[tokenId];

        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        transferFrom(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        transferFrom(from, to, tokenId);
    }

    // ---- On-Chain Metadata ----

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (ownerOf[tokenId] == address(0)) revert TokenNotFound();
        MeritData memory m = meritData[tokenId];

        string memory levelName = _levelName(m.threatLevel);
        string memory svg = _generateSVG(tokenId, m);

        return string.concat(
            'data:application/json;base64,',
            _base64Encode(bytes(string.concat(
                '{"name":"Merit #', _toString(tokenId), ' - ', levelName, '"',
                ',"description":"ShieldWall Cyber Merit NFT. Earned by staking MON to report malicious contracts on Monad."',
                ',"attributes":[',
                    '{"trait_type":"Threat Level","value":"', levelName, '"}',
                    ',{"trait_type":"Merit Points","value":', _toString(m.meritPoints), '}',
                    ',{"trait_type":"Stake Amount","value":"', _toString(m.stakeAmount / 1e15), ' finney"}',
                    ',{"trait_type":"Report ID","value":', _toString(m.reportId), '}',
                ']',
                ',"image":"data:image/svg+xml;base64,', _base64Encode(bytes(svg)), '"}'
            )))
        );
    }

    // ---- SVG Generation ----

    function _generateSVG(uint256 tokenId, MeritData memory m) internal pure returns (string memory) {
        // Color based on threat level
        string memory color1;
        string memory color2;
        string memory glowColor;
        string memory levelLabel;

        if (m.threatLevel == 4) {
            color1 = "#f43f5e"; color2 = "#e11d48"; glowColor = "#f43f5e"; levelLabel = "CRITICAL";
        } else if (m.threatLevel == 3) {
            color1 = "#f97316"; color2 = "#ea580c"; glowColor = "#f97316"; levelLabel = "HIGH";
        } else if (m.threatLevel == 2) {
            color1 = "#eab308"; color2 = "#ca8a04"; glowColor = "#eab308"; levelLabel = "MEDIUM";
        } else {
            color1 = "#3b82f6"; color2 = "#2563eb"; glowColor = "#3b82f6"; levelLabel = "LOW";
        }

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<defs>',
                '<radialGradient id="bg"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#0a0a15"/></radialGradient>',
                '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="', color1, '"/><stop offset="100%" stop-color="', color2, '"/></linearGradient>',
                '<filter id="glow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>',
            '</defs>',
            '<rect width="400" height="400" fill="url(#bg)" rx="20"/>',
            // Decorative circle
            '<circle cx="200" cy="160" r="80" fill="none" stroke="', glowColor, '" stroke-width="1" opacity="0.3" filter="url(#glow)"/>',
            '<circle cx="200" cy="160" r="60" fill="none" stroke="', glowColor, '" stroke-width="0.5" opacity="0.2"/>',
            // Wooden fish shape (mokugyo)
            '<path d="M200 100 C240 100 270 125 270 160 C270 195 240 220 200 220 C160 220 130 195 130 160 C130 125 160 100 200 100Z" fill="url(#g)" opacity="0.9" filter="url(#glow)"/>',
            '<path d="M175 145 Q200 130 225 145 Q200 160 175 145Z" fill="#fff" opacity="0.3"/>',
            // Merit text
            '<text x="200" y="270" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14" font-weight="bold" opacity="0.9">CYBER MERIT #', _toString(tokenId), '</text>',
            '<text x="200" y="295" text-anchor="middle" fill="', color1, '" font-family="sans-serif" font-size="20" font-weight="bold" filter="url(#glow)">', _toString(m.meritPoints), ' MERIT</text>',
            '<text x="200" y="320" text-anchor="middle" fill="white" font-family="sans-serif" font-size="11" opacity="0.5">', levelLabel, ' THREAT REPORTED</text>',
            // Bottom branding
            '<text x="200" y="370" text-anchor="middle" fill="white" font-family="sans-serif" font-size="10" opacity="0.3">ShieldWall on Monad</text>',
            '</svg>'
        );
    }

    // ---- Helpers ----

    function _levelName(uint256 level) internal pure returns (string memory) {
        if (level == 4) return "Critical";
        if (level == 3) return "High";
        if (level == 2) return "Medium";
        return "Low";
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        if (data.length == 0) return "";
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encodedLen + 32);
        uint256 resultPtr;
        uint256 dataPtr;
        uint256 endPtr;
        assembly {
            resultPtr := add(result, 32)
            dataPtr := data
            endPtr := add(dataPtr, mload(data))
        }
        uint256 tablePtr;
        assembly { tablePtr := add(TABLE, 1) }
        for (uint256 i = 0; i < data.length; i += 3) {
            uint256 input;
            assembly { input := and(mload(add(dataPtr, add(i, 3))), 0xFFFFFF) }
            uint256 out;
            assembly {
                out := or(
                    or(
                        shl(24, mload(add(tablePtr, and(shr(18, input), 0x3F)))),
                        shl(16, mload(add(tablePtr, and(shr(12, input), 0x3F))))
                    ),
                    or(
                        shl(8, mload(add(tablePtr, and(shr(6, input), 0x3F)))),
                        mload(add(tablePtr, and(input, 0x3F)))
                    )
                )
                out := shl(224, out)
                mstore(resultPtr, out)
            }
            resultPtr += 4;
        }
        uint256 mod = data.length % 3;
        if (mod > 0) {
            uint256 padding = 3 - mod;
            for (uint256 i = 0; i < padding; i++) {
                result[encodedLen - 1 - i] = "=";
            }
        }
        assembly { mstore(result, encodedLen) }
        return string(result);
    }

    // ---- ERC-165 ----
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x80ac58cd || // ERC-721
               interfaceId == 0x5b5e139f || // ERC-721 Metadata
               interfaceId == 0x01ffc9a7;   // ERC-165
    }
}
