// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

struct PermissionV5 {
    address   account;
    address   spender;
    address   token;
    uint256   allowance;
    uint48    period;
    uint48    start;
    uint48    end;
    uint256   salt;
    uint256   maxPerTx;
    address[] allowedTo;
    uint8     maxTxPerHour;
    bytes32   parentHash;
}

/**
 * @title PaySpawnSpenderV5_3
 * @notice Restores fee collection (dropped in V5.1), retains all V5.2 security improvements.
 *
 * Fee model (matches V4 original behavior):
 *   - Fee is ADDITIVE: recipient gets `amount`, payer sends `amount + fee`
 *   - Daily allowance tracks `amount + fee` total to prevent gaming
 *   - Two safeTransferFrom calls — contract holds zero funds
 *   - Initial fees set in constructor (trusted deployment)
 *   - Runtime fee changes require 48-hour timelock (M-5)
 *
 * Security model (V5.1+):
 *   - onlyRelayer on all payment/pause functions
 *   - No payEOA open drain vector
 *   - Two-step ownership (M-3)
 *   - receive()/fallback() both revert
 */
contract PaySpawnSpenderV5_3 {
    using SafeERC20 for IERC20;

    // ─── Constants ────────────────────────────────────────────────────────────
    address public constant USDC         = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    uint256 public constant FEE_TIMELOCK = 48 hours;
    uint256 public constant MAX_FEE_BPS  = 1000; // 10% hard cap

    // ─── Roles ────────────────────────────────────────────────────────────────
    address public owner;
    address public pendingOwner;
    address public relayer;

    // ─── Fee config ───────────────────────────────────────────────────────────
    address public feeCollector;
    uint256 public feeRateBps;    // e.g. 10 = 0.1%
    uint256 public minFee;        // e.g. 5000 = $0.005 USDC

    // Pending fee change (timelock)
    uint256 public pendingFeeRateBps;
    uint256 public pendingMinFee;
    uint256 public feeChangeActivatesAt; // 0 = no pending change

    // ─── V5 State ─────────────────────────────────────────────────────────────
    mapping(bytes32 => bool)                        public paused;
    mapping(bytes32 => mapping(uint256 => uint256)) public dailySpentV5;
    mapping(bytes32 => mapping(uint256 => uint256)) public hourlyTxCountV5;

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentExecutedV5(
        bytes32 indexed credentialHash,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee,
        bytes32 memo,
        uint256 dailyRemaining
    );
    event CredentialPaused(bytes32 indexed credentialHash);
    event CredentialUnpaused(bytes32 indexed credentialHash);
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event OwnershipTransferStarted(address indexed current, address indexed pending);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event FeeChangeProposed(uint256 feeRateBps, uint256 minFee, uint256 activatesAt);
    event FeeChangeActivated(uint256 feeRateBps, uint256 minFee);
    event FeeChangeCancelled();

    // ─── Errors ───────────────────────────────────────────────────────────────
    error NotOwner();
    error NotRelayer();
    error NotPendingOwner();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidAddress();
    error OnlyUSDCSupported();
    error CredentialPausedError();
    error CredentialExpired();
    error CredentialNotStarted();
    error ExceedsPerTxLimit(uint256 amount, uint256 maxPerTx);
    error RecipientNotWhitelisted(address to);
    error VelocityLimitExceeded();
    error ExceedsDailyLimit(uint256 requested, uint256 remaining);
    error ArrayLengthMismatch();
    error FeeTimelockActive(uint256 activatesAt);
    error NoPendingFeeChange();
    error FeeTooHigh();

    // ─── Modifiers ────────────────────────────────────────────────────────────
    modifier onlyOwner()   { if (msg.sender != owner)   revert NotOwner();   _; }
    modifier onlyRelayer() { if (msg.sender != relayer) revert NotRelayer(); _; }

    // ─── Constructor ──────────────────────────────────────────────────────────
    /**
     * @param _feeCollector  Address that receives protocol fees
     * @param _relayer       Address allowed to submit payments
     * @param _feeRateBps    Initial fee rate in basis points (0 = no %)
     * @param _minFee        Initial flat minimum fee in USDC units (5000 = $0.005)
     */
    constructor(
        address _feeCollector,
        address _relayer,
        uint256 _feeRateBps,
        uint256 _minFee
    ) {
        if (_feeCollector == address(0) || _relayer == address(0)) revert InvalidAddress();
        if (_feeRateBps > MAX_FEE_BPS) revert FeeTooHigh();
        owner        = msg.sender;
        feeCollector = _feeCollector;
        relayer      = _relayer;
        feeRateBps   = _feeRateBps;
        minFee       = _minFee;
    }

    receive() external payable { revert("no ETH"); }
    fallback() external         { revert("no fallback"); }

    // ══════════════════════════════════════════════════════════════════════════
    //  PAYMENT (onlyRelayer)
    // ══════════════════════════════════════════════════════════════════════════

    function payEOAV5(
        PermissionV5 calldata permission,
        address  to,
        uint256  amount,
        bytes32  memo
    ) external onlyRelayer {
        _validateAndExecuteV5(permission, to, amount, memo);
    }

    function batchPayEOAV5(
        PermissionV5 calldata permission,
        address[]    calldata recipients,
        uint256[]    calldata amounts,
        bytes32[]    calldata memos
    ) external onlyRelayer {
        if (recipients.length != amounts.length || amounts.length != memos.length)
            revert ArrayLengthMismatch();
        for (uint256 i = 0; i < recipients.length; i++) {
            _validateAndExecuteV5(permission, recipients[i], amounts[i], memos[i]);
        }
    }

    function pauseCredential(bytes32 credentialHash)   external onlyRelayer {
        paused[credentialHash] = true;
        emit CredentialPaused(credentialHash);
    }
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
        if (to == address(0))         revert InvalidRecipient();
        if (amount == 0)              revert InvalidAmount();
        if (permission.token != USDC) revert OnlyUSDCSupported();

        bytes32 credHash = computeCredentialHash(permission);

        if (paused[credHash])                                               revert CredentialPausedError();
        if (block.timestamp < permission.start)                             revert CredentialNotStarted();
        if (permission.end != 0 && block.timestamp > permission.end)        revert CredentialExpired();
        if (permission.maxPerTx > 0 && amount > permission.maxPerTx)        revert ExceedsPerTxLimit(amount, permission.maxPerTx);

        if (permission.allowedTo.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < permission.allowedTo.length; i++) {
                if (permission.allowedTo[i] == to) { allowed = true; break; }
            }
            if (!allowed) revert RecipientNotWhitelisted(to);
        }

        uint256 hourKey = block.timestamp / 3600;
        if (permission.maxTxPerHour > 0) {
            if (hourlyTxCountV5[credHash][hourKey] >= permission.maxTxPerHour)
                revert VelocityLimitExceeded();
            hourlyTxCountV5[credHash][hourKey]++;
        }

        // ── Fee calculation ───────────────────────────────────────────────────
        // Fee is additive: payer sends amount + fee, recipient gets amount.
        // Both count against daily allowance to prevent gaming the limit.
        uint256 fee          = _calculateFee(amount);
        uint256 totalCharged = amount + fee;

        uint256 dayKey = block.timestamp / 86400;
        uint256 spent  = dailySpentV5[credHash][dayKey];
        if (spent + totalCharged > permission.allowance)
            revert ExceedsDailyLimit(totalCharged, permission.allowance - spent);
        dailySpentV5[credHash][dayKey] = spent + totalCharged;

        // ── Transfers (two direct safeTransferFrom — contract holds zero) ────
        IERC20(USDC).safeTransferFrom(permission.account, to,           amount);
        if (fee > 0) {
            IERC20(USDC).safeTransferFrom(permission.account, feeCollector, fee);
        }

        uint256 dailyRemaining = permission.allowance - dailySpentV5[credHash][dayKey];
        emit PaymentExecutedV5(credHash, permission.account, to, amount, fee, memo, dailyRemaining);
    }

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        if (feeRateBps == 0 && minFee == 0) return 0;
        uint256 pct = (amount * feeRateBps) / 10000;
        return pct > minFee ? pct : minFee;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function computeCredentialHash(PermissionV5 calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(p));
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        return _calculateFee(amount);
    }

    function dailyRemainingV5(PermissionV5 calldata permission) external view returns (uint256) {
        bytes32 credHash = computeCredentialHash(permission);
        uint256 spent    = dailySpentV5[credHash][block.timestamp / 86400];
        return spent >= permission.allowance ? 0 : permission.allowance - spent;
    }

    function canSpendV5(PermissionV5 calldata permission, address to, uint256 amount)
        external view returns (bool, string memory)
    {
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
        if (permission.maxTxPerHour > 0 &&
            hourlyTxCountV5[credHash][hourKey] >= permission.maxTxPerHour) return (false, "velocity_limit");
        uint256 fee          = _calculateFee(amount);
        uint256 totalCharged = amount + fee;
        uint256 spent        = dailySpentV5[credHash][block.timestamp / 86400];
        if (spent + totalCharged > permission.allowance) return (false, "daily_limit");
        return (true, "ok");
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADMIN — TWO-STEP OWNERSHIP (M-3)
    // ══════════════════════════════════════════════════════════════════════════

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    function setRelayer(address _relayer) external onlyOwner {
        if (_relayer == address(0)) revert InvalidAddress();
        emit RelayerUpdated(relayer, _relayer);
        relayer = _relayer;
    }

    function setFeeCollector(address _feeCollector) external onlyOwner {
        if (_feeCollector == address(0)) revert InvalidAddress();
        feeCollector = _feeCollector;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ADMIN — FEE TIMELOCK (M-5) — 48h delay on runtime fee changes
    // ══════════════════════════════════════════════════════════════════════════

    function proposeFeeChange(uint256 _feeRateBps, uint256 _minFee) external onlyOwner {
        if (_feeRateBps > MAX_FEE_BPS) revert FeeTooHigh();
        pendingFeeRateBps    = _feeRateBps;
        pendingMinFee        = _minFee;
        feeChangeActivatesAt = block.timestamp + FEE_TIMELOCK;
        emit FeeChangeProposed(_feeRateBps, _minFee, feeChangeActivatesAt);
    }

    function activateFeeChange() external {
        if (feeChangeActivatesAt == 0)              revert NoPendingFeeChange();
        if (block.timestamp < feeChangeActivatesAt) revert FeeTimelockActive(feeChangeActivatesAt);
        feeRateBps           = pendingFeeRateBps;
        minFee               = pendingMinFee;
        feeChangeActivatesAt = 0;
        emit FeeChangeActivated(feeRateBps, minFee);
    }

    function cancelFeeChange() external onlyOwner {
        if (feeChangeActivatesAt == 0) revert NoPendingFeeChange();
        feeChangeActivatesAt = 0;
        emit FeeChangeCancelled();
    }

    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
