// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "./MeritNFT.sol";

/**
 * @title ThreatRegistry
 * @notice Decentralized, community-driven threat intelligence database on Monad.
 *         Users stake MON to report malicious contracts. Community votes to confirm.
 *         Correct reporters earn rewards; false reporters lose their stake.
 *
 *         Leverages Monad's low gas costs for on-chain governance that would be
 *         prohibitively expensive on Ethereum mainnet.
 *
 * @dev Security hardening v2:
 *   - Voting requires stake (anti-Sybil)
 *   - Reputation-weighted voting
 *   - Reward pool exhaustion protection
 *   - Threat level expiry / clearing mechanism
 *   - Reentrancy guard on resolve
 */
contract ThreatRegistry {
    // ---- Custom Errors (gas-optimized) ----

    error InvalidTarget();
    error InvalidThreatLevel();
    error InsufficientStake(uint256 required, uint256 provided);
    error InvalidReasonLength();
    error ReportNotFound();
    error AlreadyResolved();
    error AlreadyVoted();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error TransferFailed();
    error NotAdmin();
    error ThreatNotExpired();

    // ---- Types ----

    enum ThreatLevel { NONE, LOW, MEDIUM, HIGH, CRITICAL }

    struct ThreatReport {
        address reporter;
        address target;
        ThreatLevel level;
        string reason;
        bytes32 evidenceTxHash;      // Structured evidence: related tx hash
        uint256 stakeAmount;
        uint256 weightedVotesFor;    // Reputation-weighted votes
        uint256 weightedVotesAgainst;
        uint256 rawVotersFor;        // Raw voter count
        uint256 rawVotersAgainst;
        uint256 totalVoteStake;      // Total MON staked by voters
        uint256 createdAt;
        bool resolved;
        bool confirmed;
    }

    struct ThreatInfo {
        ThreatLevel level;
        uint256 confirmedAt;         // Timestamp when threat was confirmed
        uint256 reportCount;         // Number of confirmed reports
    }

    // ---- Constants ----

    /// @notice Minimum stake to submit a threat report
    uint256 public constant MIN_REPORT_STAKE = 0.01 ether;

    /// @notice Minimum stake to vote on a report (anti-Sybil)
    uint256 public constant MIN_VOTE_STAKE = 0.001 ether;

    /// @notice Duration of voting period (24 hours)
    uint256 public constant VOTING_PERIOD = 24 hours;

    /// @notice Threat level expiry duration (90 days) — stale threats can be cleared
    uint256 public constant THREAT_EXPIRY = 90 days;

    // ---- State ----

    /// @notice Admin who can perform emergency actions
    address public admin;

    /// @notice Merit NFT contract — mints on-chain SVG NFTs for confirmed reports
    MeritNFT public meritNFT;

    /// @notice Reentrancy lock
    bool private _locked;

    /// @notice All reports
    ThreatReport[] public reports;

    /// @notice Enriched threat info per address
    mapping(address => ThreatInfo) public threats;

    /// @notice Track who voted on which report
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice Track vote stakes for refund
    mapping(uint256 => mapping(address => uint256)) public voteStakes;

    /// @notice Reporter reputation (successful reports count)
    mapping(address => uint256) public reputation;

    // ---- Events ----

    event ReportSubmitted(
        uint256 indexed reportId,
        address indexed target,
        address indexed reporter,
        ThreatLevel level,
        string reason,
        bytes32 evidenceTxHash,
        uint256 stake
    );

    event Voted(
        uint256 indexed reportId,
        address indexed voter,
        bool inFavor,
        uint256 weight,
        uint256 stake
    );

    event ReportResolved(
        uint256 indexed reportId,
        address indexed target,
        bool confirmed,
        ThreatLevel level
    );

    event ThreatCleared(address indexed target, ThreatLevel previousLevel);
    event MeritMinted(address indexed reporter, uint256 indexed tokenId, uint256 meritPoints);

    // ---- Modifiers ----

    modifier reportExists(uint256 reportId) {
        if (reportId >= reports.length) revert ReportNotFound();
        _;
    }

    modifier nonReentrant() {
        require(!_locked, "ReentrancyGuard: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ---- Constructor ----

    constructor() {
        admin = msg.sender;
    }

    /**
     * @notice Set the MeritNFT contract address. Only admin.
     * @param _meritNFT The MeritNFT contract
     */
    function setMeritNFT(address _meritNFT) external onlyAdmin {
        meritNFT = MeritNFT(_meritNFT);
    }

    // ---- External Functions ----

    /**
     * @notice Submit a threat report against a contract address.
     *         Must stake at least MIN_REPORT_STAKE MON.
     * @param target The suspicious contract address
     * @param level Assessed threat level
     * @param reason Human-readable reason for the report
     * @param evidenceTxHash Optional tx hash as structured evidence
     */
    function submitReport(
        address target,
        ThreatLevel level,
        string calldata reason,
        bytes32 evidenceTxHash
    ) external payable returns (uint256 reportId) {
        if (target == address(0)) revert InvalidTarget();
        if (level == ThreatLevel.NONE) revert InvalidThreatLevel();
        if (msg.value < MIN_REPORT_STAKE) {
            revert InsufficientStake(MIN_REPORT_STAKE, msg.value);
        }
        if (bytes(reason).length == 0 || bytes(reason).length > 500) {
            revert InvalidReasonLength();
        }

        // Reporter's vote weight = 1 + reputation bonus
        uint256 reporterWeight = 1 + reputation[msg.sender];

        reportId = reports.length;
        reports.push(ThreatReport({
            reporter: msg.sender,
            target: target,
            level: level,
            reason: reason,
            evidenceTxHash: evidenceTxHash,
            stakeAmount: msg.value,
            weightedVotesFor: reporterWeight,  // Reporter votes for their own report
            weightedVotesAgainst: 0,
            rawVotersFor: 1,
            rawVotersAgainst: 0,
            totalVoteStake: 0,
            createdAt: block.timestamp,
            resolved: false,
            confirmed: false
        }));

        hasVoted[reportId][msg.sender] = true;

        emit ReportSubmitted(reportId, target, msg.sender, level, reason, evidenceTxHash, msg.value);
    }

    /**
     * @notice Vote on a pending threat report.
     *         Requires staking MIN_VOTE_STAKE to prevent Sybil attacks.
     *         Vote weight is increased by the voter's reputation.
     * @param reportId The report to vote on
     * @param inFavor True to confirm the threat, false to reject
     */
    function vote(uint256 reportId, bool inFavor)
        external
        payable
        reportExists(reportId)
    {
        ThreatReport storage report = reports[reportId];
        if (report.resolved) revert AlreadyResolved();
        if (hasVoted[reportId][msg.sender]) revert AlreadyVoted();
        if (block.timestamp > report.createdAt + VOTING_PERIOD) {
            revert VotingPeriodEnded();
        }
        if (msg.value < MIN_VOTE_STAKE) {
            revert InsufficientStake(MIN_VOTE_STAKE, msg.value);
        }

        hasVoted[reportId][msg.sender] = true;
        voteStakes[reportId][msg.sender] = msg.value;
        report.totalVoteStake += msg.value;

        // Reputation-weighted voting: weight = 1 + reputation
        uint256 weight = 1 + reputation[msg.sender];

        if (inFavor) {
            report.weightedVotesFor += weight;
            report.rawVotersFor++;
        } else {
            report.weightedVotesAgainst += weight;
            report.rawVotersAgainst++;
        }

        emit Voted(reportId, msg.sender, inFavor, weight, msg.value);
    }

    /**
     * @notice Resolve a report after voting period ends.
     *         Anyone can call this after the voting period.
     *         Reentrancy-protected since it transfers funds.
     * @param reportId The report to resolve
     */
    function resolveReport(uint256 reportId)
        external
        nonReentrant
        reportExists(reportId)
    {
        ThreatReport storage report = reports[reportId];
        if (report.resolved) revert AlreadyResolved();
        if (block.timestamp <= report.createdAt + VOTING_PERIOD) {
            revert VotingPeriodNotEnded();
        }

        report.resolved = true;

        if (report.weightedVotesFor > report.weightedVotesAgainst) {
            // Report confirmed — update threat level
            report.confirmed = true;

            ThreatInfo storage info = threats[report.target];
            if (report.level > info.level) {
                info.level = report.level;
            }
            info.confirmedAt = block.timestamp;
            info.reportCount++;

            // Return stake + reward to reporter (with exhaustion protection)
            reputation[report.reporter]++;
            uint256 bonus = report.stakeAmount / 10; // 10% bonus
            uint256 contractBalance = address(this).balance;
            uint256 totalNeeded = report.stakeAmount + bonus;

            // Exhaustion protection: if contract can't afford bonus, just return stake
            uint256 reward;
            if (contractBalance >= totalNeeded) {
                reward = totalNeeded;
            } else if (contractBalance >= report.stakeAmount) {
                reward = report.stakeAmount; // Return stake only, no bonus
            } else {
                reward = contractBalance; // Partial return (edge case)
            }

            if (reward > 0) {
                (bool ok, ) = payable(report.reporter).call{value: reward}("");
                if (!ok) revert TransferFailed();
            }

            // Mint Merit NFT — 赛博功德
            if (address(meritNFT) != address(0)) {
                uint256 tokenId = meritNFT.mint(
                    report.reporter,
                    uint256(report.level),
                    report.stakeAmount,
                    reportId
                );
                emit MeritMinted(report.reporter, tokenId, meritNFT.totalMerit(report.reporter));
            }
        } else {
            // Report rejected — reporter's stake is forfeited
            report.confirmed = false;
        }

        emit ReportResolved(reportId, report.target, report.confirmed, report.level);
    }

    /**
     * @notice Clear an expired threat designation.
     *         Can only be called after THREAT_EXPIRY has passed since last confirmation.
     *         This prevents stale threat flags from permanently blocking legitimate contracts.
     * @param target The address to clear
     */
    function clearExpiredThreat(address target) external {
        ThreatInfo storage info = threats[target];
        if (info.level == ThreatLevel.NONE) revert InvalidTarget();
        if (block.timestamp < info.confirmedAt + THREAT_EXPIRY) {
            revert ThreatNotExpired();
        }

        ThreatLevel prev = info.level;
        info.level = ThreatLevel.NONE;
        info.confirmedAt = 0;
        info.reportCount = 0;

        emit ThreatCleared(target, prev);
    }

    /**
     * @notice Emergency clear by admin (for false positives).
     * @param target The address to clear
     */
    function adminClearThreat(address target) external onlyAdmin {
        ThreatLevel prev = threats[target].level;
        threats[target].level = ThreatLevel.NONE;
        threats[target].confirmedAt = 0;

        emit ThreatCleared(target, prev);
    }

    // ---- View Functions ----

    /**
     * @notice Check if an address is flagged as a threat.
     * @param target The address to check
     * @return level The threat level (NONE if not flagged)
     */
    function checkThreat(address target) external view returns (ThreatLevel level) {
        return threats[target].level;
    }

    /**
     * @notice Check if an address is safe (not flagged).
     */
    function isSafe(address target) external view returns (bool) {
        return threats[target].level == ThreatLevel.NONE;
    }

    /**
     * @notice Get total number of reports.
     */
    function totalReports() external view returns (uint256) {
        return reports.length;
    }

    /**
     * @notice Get recent reports (paginated).
     * @param offset Start index
     * @param limit Max number of reports to return
     */
    function getReports(uint256 offset, uint256 limit)
        external
        view
        returns (ThreatReport[] memory result)
    {
        uint256 total = reports.length;
        if (offset >= total) return new ThreatReport[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 count = end - offset;

        result = new ThreatReport[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = reports[offset + i];
        }
    }

    /**
     * @notice Allow the contract to receive MON for rewards pool.
     */
    receive() external payable {}
}
