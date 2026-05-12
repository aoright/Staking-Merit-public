// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./GuardianWallet.sol";
import "./ThreatRegistry.sol";

/**
 * @title ShieldWallFactory
 * @notice Factory contract to deploy GuardianWallet instances.
 *         Uses CREATE2 for deterministic addresses.
 *         Tracks all deployed wallets for the frontend dashboard.
 *
 * @dev Security hardening v2:
 *   - Salt includes msg.sender for isolation
 *   - Input validation on constructor args
 *   - No reentrancy risk (no external calls / value transfers)
 */
contract ShieldWallFactory {
    // ---- Custom Errors ----

    error WalletAlreadyExists();
    error InvalidMaxTxValue();
    error InvalidDailyLimit();

    // ---- State ----

    /// @notice The shared ThreatRegistry instance
    ThreatRegistry public immutable threatRegistry;

    /// @notice All deployed guardian wallets
    address[] public allWallets;

    /// @notice User => their guardian wallet address
    mapping(address => address) public walletOf;

    // ---- Events ----

    event WalletCreated(
        address indexed owner,
        address indexed wallet,
        uint256 maxTxValue,
        uint256 dailyLimit
    );

    // ---- Constructor ----

    constructor(address _threatRegistry) {
        threatRegistry = ThreatRegistry(payable(_threatRegistry));
    }

    // ---- Factory Functions ----

    /**
     * @notice Deploy a new GuardianWallet for the caller.
     * @param maxTxValue Maximum value per single transaction
     * @param dailyLimit Maximum total daily spending
     * @return wallet The deployed wallet address
     */
    function createWallet(uint256 maxTxValue, uint256 dailyLimit)
        external
        returns (address wallet)
    {
        if (walletOf[msg.sender] != address(0)) revert WalletAlreadyExists();
        if (maxTxValue == 0) revert InvalidMaxTxValue();
        if (dailyLimit < maxTxValue) revert InvalidDailyLimit();

        // Deploy with CREATE2 for deterministic address
        // Salt includes msg.sender for per-user isolation
        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        GuardianWallet w = new GuardianWallet{salt: salt}(
            msg.sender,
            address(threatRegistry),
            maxTxValue,
            dailyLimit
        );

        wallet = address(w);
        walletOf[msg.sender] = wallet;
        allWallets.push(wallet);

        emit WalletCreated(msg.sender, wallet, maxTxValue, dailyLimit);
    }

    /**
     * @notice Predict the wallet address before deployment.
     * @param user The future wallet owner
     */
    function predictWalletAddress(
        address user,
        uint256 maxTxValue,
        uint256 dailyLimit
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(user));
        bytes memory bytecode = abi.encodePacked(
            type(GuardianWallet).creationCode,
            abi.encode(user, address(threatRegistry), maxTxValue, dailyLimit)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }

    // ---- View Functions ----

    function totalWallets() external view returns (uint256) {
        return allWallets.length;
    }

    function getWallets(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory result)
    {
        uint256 total = allWallets.length;
        if (offset >= total) return new address[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;
        result = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = allWallets[offset + i];
        }
    }
}
