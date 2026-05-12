// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "forge-std/Test.sol";
import "../src/ThreatRegistry.sol";
import "../src/GuardianWallet.sol";
import "../src/ShieldWallFactory.sol";

/**
 * @title ShieldWallTest
 * @notice Comprehensive test suite covering all security hardening in v2:
 *   - Reentrancy protection
 *   - Checks-Effects-Interactions pattern
 *   - ERC-20 transfer/approve detection
 *   - Anti-Sybil voting
 *   - Reward exhaustion protection
 *   - 2-step ownership transfer
 *   - Threat expiry
 */
contract ShieldWallTest is Test {
    ThreatRegistry registry;
    ShieldWallFactory factory;
    GuardianWallet wallet;

    address owner = makeAddr("owner");
    address attacker = makeAddr("attacker");
    address safeContract = makeAddr("safeContract");
    address malicious = makeAddr("malicious");

    // Mock ERC-20 selectors for calldata construction
    bytes4 constant TRANSFER_SEL = 0xa9059cbb;
    bytes4 constant APPROVE_SEL = 0x095ea7b3;
    bytes4 constant TRANSFER_FROM_SEL = 0x23b872dd;

    function setUp() public {
        // Deploy contracts
        registry = new ThreatRegistry();
        factory = new ShieldWallFactory(address(registry));

        // Seed registry with MON for rewards
        vm.deal(address(registry), 1 ether);

        // Create a guardian wallet for the owner
        vm.deal(owner, 100 ether);
        vm.prank(owner);
        address walletAddr = factory.createWallet(1 ether, 5 ether);
        wallet = GuardianWallet(payable(walletAddr));

        // Fund the wallet
        vm.prank(owner);
        (bool ok, ) = payable(walletAddr).call{value: 10 ether}("");
        assertTrue(ok);
    }

    // ===== Factory Tests =====

    function test_createWallet() public view {
        assertEq(factory.walletOf(owner), address(wallet));
        assertEq(factory.totalWallets(), 1);
    }

    function test_cannotCreateDuplicateWallet() public {
        vm.prank(owner);
        vm.expectRevert(ShieldWallFactory.WalletAlreadyExists.selector);
        factory.createWallet(1 ether, 5 ether);
    }

    function test_cannotCreateWithZeroMaxTx() public {
        address user2 = makeAddr("user2");
        vm.prank(user2);
        vm.expectRevert(ShieldWallFactory.InvalidMaxTxValue.selector);
        factory.createWallet(0, 5 ether);
    }

    // ===== Basic Execution =====

    function test_executeTransfer() public {
        vm.prank(owner);
        (bool success, ) = wallet.execute(safeContract, 0.4 ether, "");
        assertTrue(success);
        assertEq(wallet.totalTransactions(), 1);
    }

    function test_onlyOwnerCanExecute() public {
        vm.prank(attacker);
        vm.expectRevert(GuardianWallet.NotOwner.selector);
        wallet.execute(safeContract, 0.5 ether, "");
    }

    // ===== Security Rule: Spending Limits =====

    function test_blockExceedsMaxValue() public {
        vm.prank(owner);
        vm.expectRevert(); // "ShieldWall: Exceeds max transaction value"
        wallet.execute(safeContract, 2 ether, "");
    }

    function test_blockExceedsDailyLimit() public {
        vm.startPrank(owner);
        // Use small amounts below highValueThreshold (0.5 ether)
        for (uint256 i = 0; i < 12; i++) {
            wallet.execute(safeContract, 0.4 ether, "");
        }
        // 13th pushes past 5 ETH daily limit (12 * 0.4 = 4.8, next = 5.2 > 5)
        vm.expectRevert();
        wallet.execute(safeContract, 0.4 ether, "");
        vm.stopPrank();
    }

    // ===== Security Rule: Blacklist / Whitelist =====

    function test_blockBlacklisted() public {
        vm.startPrank(owner);
        wallet.setBlacklist(malicious, true);
        vm.expectRevert();
        wallet.execute(malicious, 0.1 ether, "");
        vm.stopPrank();
    }

    function test_whitelistOnlyMode() public {
        vm.startPrank(owner);
        GuardianWallet.SecurityConfig memory cfg = GuardianWallet.SecurityConfig({
            maxTransactionValue: 1 ether,
            dailySpendLimit: 5 ether,
            highValueCooldown: 5 minutes,
            highValueThreshold: 0.5 ether,
            maxTokenTransferValue: type(uint256).max,
            checkThreatRegistry: true,
            whitelistOnly: true,
            blockUnlimitedApprovals: true
        });
        wallet.updateConfig(cfg);

        // Not whitelisted => blocked
        vm.expectRevert();
        wallet.execute(safeContract, 0.1 ether, "");

        // Whitelist it => allowed
        wallet.setWhitelist(safeContract, true);
        (bool success, ) = wallet.execute(safeContract, 0.1 ether, "");
        assertTrue(success);
        vm.stopPrank();
    }

    // ===== Security Rule: Emergency Pause =====

    function test_emergencyPause() public {
        vm.startPrank(owner);
        wallet.setPaused(true);
        vm.expectRevert();
        wallet.execute(safeContract, 0.1 ether, "");
        vm.stopPrank();
    }

    // ===== Security Rule: Pre-check =====

    function test_preCheck() public view {
        (bool safe, string memory reason) = wallet.preCheck(safeContract, 0.3 ether, "");
        assertTrue(safe);
        assertEq(bytes(reason).length, 0);

        (bool safe2, ) = wallet.preCheck(safeContract, 2 ether, "");
        assertFalse(safe2);
    }

    // ===== REENTRANCY PROTECTION =====

    function test_reentrancyProtected() public {
        // Deploy a reentrancy attacker contract
        ReentrancyAttacker attackerContract = new ReentrancyAttacker(address(wallet));
        vm.deal(address(attackerContract), 0);

        // Owner whitelists the attacker (to simulate a valid target)
        vm.startPrank(owner);
        // Send some ETH to the attacker target so it can receive
        wallet.execute(address(attackerContract), 0.1 ether, "");

        // The attacker contract will try to re-enter on receive
        // nonReentrant should prevent this
        vm.expectRevert();
        wallet.execute(address(attackerContract), 0.1 ether, abi.encodeWithSignature("attack()"));
        vm.stopPrank();
    }

    // ===== ERC-20 SECURITY =====

    function test_blockUnlimitedApproval() public {
        // Construct approve(spender, type(uint256).max) calldata
        bytes memory approveData = abi.encodeWithSelector(
            APPROVE_SEL,
            safeContract,
            type(uint256).max
        );

        vm.prank(owner);
        vm.expectRevert(); // "ShieldWall: Unlimited ERC-20 approval blocked"
        wallet.execute(safeContract, 0, approveData);
    }

    function test_allowLimitedApproval() public {
        // Construct approve(spender, 1000) — reasonable amount
        bytes memory approveData = abi.encodeWithSelector(
            APPROVE_SEL,
            safeContract,
            1000 ether
        );

        vm.prank(owner);
        // This should not revert from security check
        // (It will fail execution since safeContract isn't an ERC20, but the SECURITY check passes)
        // We test via preCheck instead
        (bool safe, ) = wallet.preCheck(safeContract, 0, approveData);
        assertTrue(safe);
    }

    function test_blockApprovalToBlacklistedSpender() public {
        vm.startPrank(owner);
        wallet.setBlacklist(malicious, true);

        bytes memory approveData = abi.encodeWithSelector(
            APPROVE_SEL,
            malicious,  // spender is blacklisted
            100 ether
        );

        (bool safe, string memory reason) = wallet.preCheck(safeContract, 0, approveData);
        assertFalse(safe);
        vm.stopPrank();
    }

    // ===== 2-STEP OWNERSHIP TRANSFER =====

    function test_ownershipTransfer() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        wallet.transferOwnership(newOwner);
        assertEq(wallet.pendingOwner(), newOwner);
        assertEq(wallet.owner(), owner); // Not transferred yet

        vm.prank(newOwner);
        wallet.acceptOwnership();
        assertEq(wallet.owner(), newOwner);
        assertEq(wallet.pendingOwner(), address(0));
    }

    function test_onlyPendingOwnerCanAccept() public {
        address newOwner = makeAddr("newOwner");

        vm.prank(owner);
        wallet.transferOwnership(newOwner);

        vm.prank(attacker);
        vm.expectRevert(GuardianWallet.NotPendingOwner.selector);
        wallet.acceptOwnership();
    }

    // ===== THREAT REGISTRY v2 =====

    function test_submitAndResolveReport() public {
        address reporter = makeAddr("reporter");
        vm.deal(reporter, 1 ether);

        // Submit report with evidence
        vm.prank(reporter);
        uint256 reportId = registry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.CRITICAL,
            "Known drainer contract",
            bytes32(uint256(0xdead))
        );
        assertEq(reportId, 0);

        // Fast forward past voting period
        vm.warp(block.timestamp + 25 hours);

        // Resolve
        registry.resolveReport(reportId);

        // Check threat level
        assertEq(uint(registry.checkThreat(malicious)), uint(ThreatRegistry.ThreatLevel.CRITICAL));
        assertFalse(registry.isSafe(malicious));
    }

    function test_votingRequiresStake() public {
        address reporter = makeAddr("reporter");
        vm.deal(reporter, 1 ether);

        vm.prank(reporter);
        registry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.HIGH,
            "Suspicious",
            bytes32(0)
        );

        // Try to vote without stake
        address voter = makeAddr("voter");
        vm.prank(voter);
        vm.expectRevert(
            abi.encodeWithSelector(
                ThreatRegistry.InsufficientStake.selector,
                0.001 ether,
                0
            )
        );
        registry.vote(0, true);
    }

    function test_votingWithStake() public {
        address reporter = makeAddr("reporter");
        address voter = makeAddr("voter");
        vm.deal(reporter, 1 ether);
        vm.deal(voter, 1 ether);

        vm.prank(reporter);
        registry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.HIGH,
            "Suspicious",
            bytes32(0)
        );

        // Vote with stake - should succeed
        vm.prank(voter);
        registry.vote{value: 0.001 ether}(0, true);
    }

    function test_threatRegistryBlocksTransaction() public {
        // Report and confirm a malicious address
        address reporter = makeAddr("reporter");
        vm.deal(reporter, 1 ether);
        vm.prank(reporter);
        registry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.CRITICAL,
            "Drainer",
            bytes32(0)
        );
        vm.warp(block.timestamp + 25 hours);
        registry.resolveReport(0);

        // Now try to send to malicious address through guardian wallet
        vm.prank(owner);
        vm.expectRevert();
        wallet.execute(malicious, 0.1 ether, "");
    }

    function test_rewardExhaustionProtection() public {
        // Drain the registry balance first (set to almost zero)
        // The registry should still resolve without reverting

        // Deploy fresh registry with minimal balance
        ThreatRegistry freshRegistry = new ThreatRegistry();
        vm.deal(address(freshRegistry), 0.005 ether); // Less than full reward

        address reporter = makeAddr("reporter2");
        vm.deal(reporter, 1 ether);

        vm.prank(reporter);
        freshRegistry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.HIGH,
            "Test",
            bytes32(0)
        );

        vm.warp(block.timestamp + 25 hours);

        // Should not revert despite insufficient reward pool
        // Contract has 0.005 + 0.01 = 0.015 ETH, but reward wants 0.011 ETH
        freshRegistry.resolveReport(0);
    }

    function test_clearExpiredThreat() public {
        // Create and confirm a threat
        address reporter = makeAddr("reporter");
        vm.deal(reporter, 1 ether);
        vm.prank(reporter);
        registry.submitReport{value: 0.01 ether}(
            malicious,
            ThreatRegistry.ThreatLevel.HIGH,
            "Test",
            bytes32(0)
        );
        vm.warp(block.timestamp + 25 hours);
        registry.resolveReport(0);

        // Threat should be flagged
        assertFalse(registry.isSafe(malicious));

        // Try to clear before expiry — should fail
        vm.expectRevert(ThreatRegistry.ThreatNotExpired.selector);
        registry.clearExpiredThreat(malicious);

        // Fast forward past expiry (90 days)
        vm.warp(block.timestamp + 91 days);

        // Now clear should work
        registry.clearExpiredThreat(malicious);
        assertTrue(registry.isSafe(malicious));
    }

    // ===== HISTORY via Events (no storage bloat) =====

    function test_eventBasedHistory() public {
        vm.prank(owner);

        // Events are emitted instead of stored
        vm.expectEmit(false, true, false, false);
        emit GuardianWallet.TransactionExecuted(1, safeContract, 0.1 ether, "", block.timestamp);

        wallet.execute(safeContract, 0.1 ether, "");

        // Counter tracks without storage
        assertEq(wallet.totalTransactions(), 1);
        assertEq(wallet.totalBlocked(), 0);
    }
}

/**
 * @title ReentrancyAttacker
 * @notice Test contract that attempts reentrancy on GuardianWallet
 */
contract ReentrancyAttacker {
    GuardianWallet target;
    uint256 public attackCount;

    constructor(address _target) {
        target = GuardianWallet(payable(_target));
    }

    function attack() external {
        // Try to trigger reentrancy via execute
        target.execute(address(this), 0.1 ether, "");
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            // Attempt re-entry
            try target.execute(address(this), 0.1 ether, "") {} catch {}
        }
    }
}
