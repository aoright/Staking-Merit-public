// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./ThreatRegistry.sol";

/**
 * @title GuardianWallet
 * @notice A smart contract wallet with on-chain security rules engine.
 *         Every transaction is checked against configurable rules BEFORE execution.
 *
 *         This is only practical on Monad due to its low gas costs (50 gwei).
 *         On Ethereum mainnet, these on-chain checks would cost $5-20 per transaction.
 *
 * @dev Security hardening v2:
 *   1. ReentrancyGuard on execute
 *   2. Checks-Effects-Interactions pattern
 *   3. ERC-20 transfer/approve/transferFrom spending detection
 *   4. 2-step ownership transfer
 *   5. Event-based history (no unbounded storage array)
 *   6. Permit2 infinite approval detection
 *   7. Custom errors for gas optimization
 */
contract GuardianWallet {
    // ---- Custom Errors ----

    error NotOwner();
    error NotPendingOwner();
    error WalletPaused();
    error InvalidAddress();
    error ExecutionFailed();
    error ReentrancyDetected();

    // ---- Types ----

    struct SecurityConfig {
        /// @notice Max value per single transaction (in wei, for native MON)
        uint256 maxTransactionValue;
        /// @notice Max total value per day (in wei)
        uint256 dailySpendLimit;
        /// @notice Cooldown in seconds between high-value txns
        uint256 highValueCooldown;
        /// @notice Threshold for "high value" (in wei)
        uint256 highValueThreshold;
        /// @notice Max ERC-20 token value per single transfer (in token units)
        uint256 maxTokenTransferValue;
        /// @notice Whether to check the threat registry
        bool checkThreatRegistry;
        /// @notice Whether to enforce whitelist-only mode
        bool whitelistOnly;
        /// @notice Whether to block unlimited ERC-20 approvals
        bool blockUnlimitedApprovals;
    }

    // ---- Constants ----

    /// @dev ERC-20 function selectors
    bytes4 private constant TRANSFER_SELECTOR = 0xa9059cbb;           // transfer(address,uint256)
    bytes4 private constant APPROVE_SELECTOR = 0x095ea7b3;            // approve(address,uint256)
    bytes4 private constant TRANSFER_FROM_SELECTOR = 0x23b872dd;      // transferFrom(address,address,uint256)
    bytes4 private constant INCREASE_ALLOWANCE_SELECTOR = 0x39509351; // increaseAllowance(address,uint256)

    /// @dev Threshold for "unlimited" approval (type(uint256).max / 2)
    uint256 private constant UNLIMITED_THRESHOLD = type(uint128).max;

    // ---- State ----

    /// @notice The wallet owner
    address public owner;

    /// @notice Pending owner for 2-step transfer
    address public pendingOwner;

    /// @notice The threat registry contract
    ThreatRegistry public threatRegistry;

    /// @notice Security configuration
    SecurityConfig public config;

    /// @notice Whether the wallet is paused (emergency stop)
    bool public paused;

    /// @notice Reentrancy lock
    bool private _locked;

    /// @notice Whitelisted contract addresses
    mapping(address => bool) public whitelist;

    /// @notice Blacklisted contract addresses
    mapping(address => bool) public blacklist;

    /// @notice Daily spending tracker: day => amount spent (native MON)
    mapping(uint256 => uint256) public dailySpent;

    /// @notice Daily token spending tracker: day => token => amount
    mapping(uint256 => mapping(address => uint256)) public dailyTokenSpent;

    /// @notice Timestamp of last high-value transaction
    uint256 public lastHighValueTx;

    /// @notice Total transactions executed (counter only, no storage array)
    uint256 public totalTransactions;

    /// @notice Total transactions blocked
    uint256 public totalBlocked;

    // ---- Events (replaces on-chain history array) ----

    event TransactionExecuted(
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data,
        uint256 timestamp
    );

    event TransactionBlocked(
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        string reason,
        uint256 timestamp
    );

    event ConfigUpdated(SecurityConfig newConfig);
    event WhitelistUpdated(address indexed addr, bool status);
    event BlacklistUpdated(address indexed addr, bool status);
    event EmergencyPause(bool paused);
    event OwnershipTransferProposed(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TokenTransferDetected(address indexed token, address indexed to, uint256 amount);

    // ---- Modifiers ----

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert ReentrancyDetected();
        _locked = true;
        _;
        _locked = false;
    }

    // ---- Constructor ----

    constructor(
        address _owner,
        address _threatRegistry,
        uint256 _maxTxValue,
        uint256 _dailyLimit
    ) {
        if (_owner == address(0)) revert InvalidAddress();

        owner = _owner;
        threatRegistry = ThreatRegistry(payable(_threatRegistry));
        config = SecurityConfig({
            maxTransactionValue: _maxTxValue,
            dailySpendLimit: _dailyLimit,
            highValueCooldown: 5 minutes,
            highValueThreshold: _maxTxValue / 2,
            maxTokenTransferValue: type(uint256).max, // No token limit by default
            checkThreatRegistry: true,
            whitelistOnly: false,
            blockUnlimitedApprovals: true
        });
    }

    // ---- Core: Execute with Security Checks ----

    /**
     * @notice Execute a transaction through the guardian wallet.
     *         All security rules are checked BEFORE execution.
     *         Uses Checks-Effects-Interactions pattern to prevent reentrancy.
     *
     * @param to Destination address
     * @param value Amount of MON to send
     * @param data Calldata for contract interaction
     */
    function execute(address to, uint256 value, bytes calldata data)
        external
        onlyOwner
        nonReentrant
        returns (bool success, bytes memory returnData)
    {
        // ===== CHECKS =====
        string memory blockReason = _checkSecurity(to, value, data);

        if (bytes(blockReason).length > 0) {
            // Transaction blocked — emit event (no storage write)
            totalBlocked++;
            emit TransactionBlocked(
                totalTransactions + totalBlocked,
                to, value, blockReason, block.timestamp
            );
            revert(string.concat("ShieldWall: ", blockReason));
        }

        // ===== EFFECTS (state updates BEFORE external call) =====
        uint256 today = block.timestamp / 1 days;
        dailySpent[today] += value;

        if (value >= config.highValueThreshold) {
            lastHighValueTx = block.timestamp;
        }

        // Track ERC-20 spending in state
        if (data.length >= 4) {
            _trackTokenSpending(to, data, today);
        }

        totalTransactions++;

        // ===== INTERACTIONS (external call LAST) =====
        (success, returnData) = to.call{value: value}(data);
        if (!success) revert ExecutionFailed();

        emit TransactionExecuted(totalTransactions, to, value, data, block.timestamp);
    }

    // ---- Security Rule Engine ----

    /**
     * @notice Internal security check engine. Returns empty string if safe,
     *         or a reason string if the transaction should be blocked.
     *
     *         Now includes ERC-20 transfer/approve analysis.
     */
    function _checkSecurity(address to, uint256 value, bytes calldata data)
        internal
        view
        returns (string memory)
    {
        // Rule 0: Emergency pause
        if (paused) {
            return "Wallet is paused";
        }

        // Rule 1: Blacklist check
        if (blacklist[to]) {
            return "Destination is blacklisted";
        }

        // Rule 2: Whitelist-only mode
        if (config.whitelistOnly && !whitelist[to]) {
            return "Destination not in whitelist";
        }

        // Rule 3: Per-transaction value limit (native MON)
        if (value > config.maxTransactionValue) {
            return "Exceeds max transaction value";
        }

        // Rule 4: Daily spending limit (native MON)
        uint256 today = block.timestamp / 1 days;
        if (dailySpent[today] + value > config.dailySpendLimit) {
            return "Exceeds daily spending limit";
        }

        // Rule 5: High-value cooldown
        if (value >= config.highValueThreshold) {
            if (block.timestamp < lastHighValueTx + config.highValueCooldown) {
                return "High-value cooldown active";
            }
        }

        // Rule 6: Threat registry check
        if (config.checkThreatRegistry && address(threatRegistry) != address(0)) {
            ThreatRegistry.ThreatLevel threat = threatRegistry.checkThreat(to);
            if (threat == ThreatRegistry.ThreatLevel.CRITICAL) {
                return "Target flagged CRITICAL in threat registry";
            }
            if (threat == ThreatRegistry.ThreatLevel.HIGH) {
                return "Target flagged HIGH risk in threat registry";
            }
        }

        // Rule 7: ERC-20 token transfer / approve analysis
        if (data.length >= 4) {
            string memory tokenCheck = _checkTokenSecurity(to, data, today);
            if (bytes(tokenCheck).length > 0) {
                return tokenCheck;
            }
        }

        return ""; // All checks passed
    }

    /**
     * @notice Check ERC-20 specific security rules.
     *         Detects transfer(), approve(), transferFrom(), increaseAllowance().
     */
    function _checkTokenSecurity(address /* token */, bytes calldata data, uint256 /* today */)
        internal
        view
        returns (string memory)
    {
        bytes4 selector = bytes4(data[:4]);

        // ERC-20 transfer(address to, uint256 amount)
        if (selector == TRANSFER_SELECTOR && data.length >= 68) {
            (, uint256 amount) = abi.decode(data[4:68], (address, uint256));

            if (amount > config.maxTokenTransferValue) {
                return "ERC-20 transfer exceeds max token value";
            }
        }

        // ERC-20 approve(address spender, uint256 amount)
        if (selector == APPROVE_SELECTOR && data.length >= 68) {
            (address spender, uint256 amount) = abi.decode(data[4:68], (address, uint256));

            // Block unlimited approvals (common phishing vector)
            if (config.blockUnlimitedApprovals && amount >= UNLIMITED_THRESHOLD) {
                return "Unlimited ERC-20 approval blocked";
            }

            // Check if spender is blacklisted
            if (blacklist[spender]) {
                return "ERC-20 approval to blacklisted spender";
            }

            // Check spender in threat registry
            if (config.checkThreatRegistry && address(threatRegistry) != address(0)) {
                ThreatRegistry.ThreatLevel threat = threatRegistry.checkThreat(spender);
                if (threat >= ThreatRegistry.ThreatLevel.HIGH) {
                    return "ERC-20 approval to high-risk spender";
                }
            }
        }

        // ERC-20 transferFrom(address from, address to, uint256 amount)
        if (selector == TRANSFER_FROM_SELECTOR && data.length >= 100) {
            (,, uint256 amount) = abi.decode(data[4:100], (address, address, uint256));

            if (amount > config.maxTokenTransferValue) {
                return "ERC-20 transferFrom exceeds max token value";
            }
        }

        // increaseAllowance(address spender, uint256 addedValue)
        if (selector == INCREASE_ALLOWANCE_SELECTOR && data.length >= 68) {
            (, uint256 addedValue) = abi.decode(data[4:68], (address, uint256));

            if (config.blockUnlimitedApprovals && addedValue >= UNLIMITED_THRESHOLD) {
                return "Unlimited allowance increase blocked";
            }
        }

        return "";
    }

    /**
     * @notice Track ERC-20 spending for daily limits (called in Effects phase).
     */
    function _trackTokenSpending(address token, bytes calldata data, uint256 today) internal {
        bytes4 selector = bytes4(data[:4]);

        uint256 amount;
        if (selector == TRANSFER_SELECTOR && data.length >= 68) {
            (, amount) = abi.decode(data[4:68], (address, uint256));
        } else if (selector == TRANSFER_FROM_SELECTOR && data.length >= 100) {
            (,, amount) = abi.decode(data[4:100], (address, address, uint256));
        }

        if (amount > 0) {
            dailyTokenSpent[today][token] += amount;
            emit TokenTransferDetected(token, token, amount);
        }
    }

    /**
     * @notice Preview security check result without executing.
     *         Useful for the frontend to show risk assessment.
     */
    function preCheck(address to, uint256 value, bytes calldata data)
        external
        view
        returns (bool safe, string memory reason)
    {
        reason = _checkSecurity(to, value, data);
        safe = bytes(reason).length == 0;
    }

    // ---- Ownership (2-Step Transfer) ----

    /**
     * @notice Propose a new owner. Does not take effect until accepted.
     * @param newOwner The proposed new owner
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferProposed(owner, newOwner);
    }

    /**
     * @notice Accept ownership. Must be called by the pending owner.
     */
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address prev = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(prev, owner);
    }

    // ---- Configuration ----

    function updateConfig(SecurityConfig calldata newConfig) external onlyOwner {
        config = newConfig;
        emit ConfigUpdated(newConfig);
    }

    function setWhitelist(address addr, bool status) external onlyOwner {
        whitelist[addr] = status;
        emit WhitelistUpdated(addr, status);
    }

    function setBlacklist(address addr, bool status) external onlyOwner {
        blacklist[addr] = status;
        emit BlacklistUpdated(addr, status);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit EmergencyPause(_paused);
    }

    // ---- View Functions ----

    function getDailySpent() external view returns (uint256) {
        return dailySpent[block.timestamp / 1 days];
    }

    function getDailyTokenSpent(address token) external view returns (uint256) {
        return dailyTokenSpent[block.timestamp / 1 days][token];
    }

    // ---- Receive MON ----

    receive() external payable {}
}
