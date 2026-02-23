// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ─── V5 Permission struct ────────────────────────────────────────────────────
struct PermissionV5 {
    address   account;       // human wallet
    address   spender;       // this contract
    address   token;         // USDC
    uint256   allowance;     // daily limit (USDC, 6 decimals)
    uint48    period;        // reset cadence in seconds (86400 = daily)
    uint48    start;         // valid from (unix timestamp)
    uint48    end;           // expires at (0 = never expires)
    uint256   salt;          // per-agent uniqueness seed
    uint256   maxPerTx;      // single-tx cap in USDC (0 = no cap)
    address[] allowedTo;     // counterparty whitelist (empty = any address)
    uint8     maxTxPerHour;  // velocity control (0 = unlimited)
    bytes32   parentHash;    // parent credential hash (bytes32(0) = root)
}

/**
 * @title PaySpawnSpenderV5_1
 * @notice EOA-only payment contract with per-credential controls.
 *
 * SECURITY FIX over V5: Removed all legacy Smart Wallet / SPM functions
 * (pay, payWithApprovedPermission, payEOA) which had no access control
 * and could be called by anyone to drain wallets with active approvals.
 *
 * V5.1 is EOA-path only. All write functions require onlyRelayer.
 * Smart Wallet support will be re-introduced in a future version with
 * proper access controls.
 *
 * Security model:
 *   - onlyRelayer: only PaySpawn's trusted relayer submits txs.
 *   - Non-upgradeable: trust through immutability.
 *   - No funds held: USDC goes from account → recipient directly via transferFrom.
 *   - No fallback / receive: cannot receive ETH or tokens accidentally.
 */
contract PaySpawnSpenderV5_1 {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // ─── Roles ───────────────────────────────────────────────────────────────
    address public owner;
    address public relayer;

    // ─── Fee config (currently zero) ─────────────────────────────────────────
    address public feeCollector;
    uint256 public feeRateBps = 0;
    uint256 public minFee     = 0;

    // ─── V5 State ─────────────────────────────────────────────────────────────
    mapping(bytes32 => bool)                          public paused;
    mapping(bytes32 => mapping(uint256 => uint256))   public dailySpentV5;
    mapping(bytes32 => mapping(uint256 => uint256))   public hourlyTxCountV5;

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentExecutedV5(
        bytes32 indexed credentialHash,
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 memo,
        uint256 dailyRemaining,
        uint256 hourlyTxRemaining
    );
    event CredentialPaused(bytes32 indexed credentialHash);
    event CredentialUnpaused(bytes32 indexed credentialHash);
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotOwner();
    error NotRelayer();
    error InvalidRecipient();
    error InvalidAmount();
    error OnlyUSDCSupported();
    error CredentialPausedError();
    error CredentialExpired();
    error CredentialNotStarted();
    error ExceedsPerTxLimit(uint256 amount, uint256 maxPerTx);
    error RecipientNotWhitelisted(address to);
    error VelocityLimitExceeded();
    error ExceedsDailyLimit(uint256 requested, uint256 remaining);
    error ArrayLengthMismatch();

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(address _feeCollector, address _relayer) {
        owner        = msg.sender;
        feeCollector = _feeCollector;
        relayer      = _relayer;
    }

    // ─── No fallback — contract cannot hold funds ─────────────────────────────
    receive() external payable { revert("no ETH"); }
    fallback() external { revert("no fallback"); }

    // ══════════════════════════════════════════════════════════════════════════
    //  PAYMENT FUNCTIONS (all onlyRelayer)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Execute a payment from a V5 EOA credential.
     */
    function payEOAV5(
        PermissionV5 calldata permission,
        address to,
        uint256 amount,
        bytes32 memo
    ) external onlyRelayer {
        _validateAndExecuteV5(permission, to, amount, memo);
    }

    /**
     * @notice Batch payment from a single V5 credential.
     */
    function batchPayEOAV5(
        PermissionV5 calldata permission,
        address[]    calldata recipients,
        uint256[]    calldata amounts,
        bytes32[]    calldata memos
    ) external onlyRelayer {
        if (recipients.length != amounts.length || amounts.length != memos.length) {
            revert ArrayLengthMismatch();
        }
        for (uint256 i = 0; i < recipients.length; i++) {
            _validateAndExecuteV5(permission, recipients[i], amounts[i], memos[i]);
        }
    }

    /**
     * @notice Pause a V5 credential. All future payments revert until unpaused.
     */
    function pauseCredential(bytes32 credentialHash) external onlyRelayer {
        paused[credentialHash] = true;
        emit CredentialPaused(credentialHash);
    }

    /**
     * @notice Unpause a previously paused credential.
     */
    function unpauseCredential(bytes32 credentialHash) external onlyRelayer {
        paused[credentialHash] = false;
        emit CredentialUnpaused(credentialHash);
    }

    // ─── Internal execution ───────────────────────────────────────────────────

    function _validateAndExecuteV5(
        PermissionV5 calldata permission,
        address to,
        uint256 amount,
        bytes32 memo
    ) internal {
        if (to == address(0))             revert InvalidRecipient();
        if (amount == 0)                  revert InvalidAmount();
        if (permission.token != USDC)     revert OnlyUSDCSupported();

        bytes32 credHash = computeCredentialHash(permission);

        if (paused[credHash])                                   revert CredentialPausedError();
        if (block.timestamp < permission.start)                 revert CredentialNotStarted();
        if (permission.end != 0 && block.timestamp > permission.end) revert CredentialExpired();

        if (permission.maxPerTx > 0 && amount > permission.maxPerTx) {
            revert ExceedsPerTxLimit(amount, permission.maxPerTx);
        }

        if (permission.allowedTo.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < permission.allowedTo.length; i++) {
                if (permission.allowedTo[i] == to) { allowed = true; break; }
            }
            if (!allowed) revert RecipientNotWhitelisted(to);
        }

        uint256 hourKey = block.timestamp / 3600;
        if (permission.maxTxPerHour > 0) {
            if (hourlyTxCountV5[credHash][hourKey] >= permission.maxTxPerHour) {
                revert VelocityLimitExceeded();
            }
            hourlyTxCountV5[credHash][hourKey]++;
        }

        uint256 dayKey = block.timestamp / 86400;
        uint256 spent  = dailySpentV5[credHash][dayKey];
        if (spent + amount > permission.allowance) {
            revert ExceedsDailyLimit(amount, permission.allowance - spent);
        }
        dailySpentV5[credHash][dayKey] = spent + amount;

        // Direct transferFrom: no intermediate holding, account → to
        IERC20(USDC).safeTransferFrom(permission.account, to, amount);

        uint256 dailyRemaining    = permission.allowance - dailySpentV5[credHash][dayKey];
        uint256 hourlyTxRemaining = permission.maxTxPerHour > 0
            ? permission.maxTxPerHour - hourlyTxCountV5[credHash][hourKey]
            : type(uint256).max;

        emit PaymentExecutedV5(credHash, permission.account, to, amount, memo, dailyRemaining, hourlyTxRemaining);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function computeCredentialHash(PermissionV5 calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(p));
    }

    function dailyRemainingV5(PermissionV5 calldata permission) external view returns (uint256) {
        bytes32 credHash = computeCredentialHash(permission);
        uint256 dayKey   = block.timestamp / 86400;
        uint256 spent    = dailySpentV5[credHash][dayKey];
        return spent >= permission.allowance ? 0 : permission.allowance - spent;
    }

    function canSpendV5(
        PermissionV5 calldata permission,
        address to,
        uint256 amount
    ) external view returns (bool, string memory) {
        if (block.timestamp < permission.start) return (false, "not_started");
        if (permission.end != 0 && block.timestamp > permission.end) return (false, "expired");

        bytes32 credHash = computeCredentialHash(permission);
        if (paused[credHash]) return (false, "paused");
        if (permission.maxPerTx > 0 && amount > permission.maxPerTx) return (false, "per_tx_limit");

        if (permission.allowedTo.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < permission.allowedTo.length; i++) {
                if (permission.allowedTo[i] == to) { allowed = true; break; }
            }
            if (!allowed) return (false, "not_whitelisted");
        }

        uint256 hourKey = block.timestamp / 3600;
        if (permission.maxTxPerHour > 0 && hourlyTxCountV5[credHash][hourKey] >= permission.maxTxPerHour) {
            return (false, "velocity_limit");
        }

        uint256 dayKey = block.timestamp / 86400;
        if (dailySpentV5[credHash][dayKey] + amount > permission.allowance) return (false, "daily_limit");

        return (true, "ok");
    }

    function calculateFee(uint256) external pure returns (uint256) {
        return 0; // fees currently zero
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════════════════════

    function setRelayer(address _relayer) external onlyOwner {
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }

    function setFeeRate(uint256 _feeRateBps) external onlyOwner {
        require(_feeRateBps <= 1000, "Fee too high");
        feeRateBps = _feeRateBps;
    }

    function setMinFee(uint256 _minFee) external onlyOwner {
        minFee = _minFee;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
