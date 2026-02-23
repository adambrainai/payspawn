// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// ─── Legacy SpendPermission (Coinbase SPM — unchanged for Smart Wallet compat) ───
struct SpendPermission {
    address account;
    address spender;
    address token;
    uint160 allowance;
    uint48  period;
    uint48  start;
    uint48  end;
    uint256 salt;
    bytes   extraData;
}

// ─── V5 Permission struct (EOA path — richer controls) ───────────────────────
struct PermissionV5 {
    address   account;       // human wallet
    address   spender;       // this contract (V5)
    address   token;         // USDC
    uint256   allowance;     // daily limit (USDC, 6 decimals)
    uint48    period;        // reset cadence in seconds (86400 = daily)
    uint48    start;         // valid from (unix timestamp)
    uint48    end;           // expires at (0 = never expires)
    uint256   salt;          // per-agent uniqueness seed
    uint256   maxPerTx;      // single-tx cap in USDC (0 = no cap)
    address[] allowedTo;     // counterparty whitelist (empty = any address)
    uint8     maxTxPerHour;  // velocity control — max txs per clock hour (0 = unlimited)
    bytes32   parentHash;    // parent credential hash (bytes32(0) = root / human-issued)
}

interface ISpendPermissionManager {
    function approveWithSignature(SpendPermission calldata spendPermission, bytes calldata signature) external returns (bool);
    function spend(SpendPermission memory spendPermission, uint160 value) external;
    function isApproved(SpendPermission memory spendPermission) external view returns (bool);
}

/**
 * @title PaySpawnSpenderV5
 * @notice Dual-path payments with enhanced per-credential controls:
 *   - Smart Wallets: Coinbase SpendPermissionManager (backward compat, unchanged)
 *   - EOA V4: direct USDC.transferFrom via payEOA() (backward compat)
 *   - EOA V5: payEOAV5() with per-tx limit, counterparty whitelist,
 *             velocity control, pause/unpause, batch payments, and memo.
 *
 * @dev All V5 EOA credential enforcement lives here.
 *      Daily spend tracking keyed by credentialHash + UTC day.
 *      Hourly tx velocity keyed by credentialHash + UTC hour.
 *
 * Security model:
 *   - onlyRelayer: only PaySpawn's trusted relayer submits txs.
 *     The relayer authenticates the agent's credential off-chain before
 *     calling on-chain. Contract enforces limits; relayer enforces identity.
 *   - Non-upgradeable: trust through immutability.
 *   - No funds held: pure pass-through. USDC goes from account → recipient directly.
 */
contract PaySpawnSpenderV5 {
    using SafeERC20 for IERC20;

    // ─── Constants ───────────────────────────────────────────────────────────
    address public constant SPEND_PERMISSION_MANAGER = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // ─── Roles ───────────────────────────────────────────────────────────────
    address public owner;
    address public relayer;

    // ─── Fee config (currently zero) ─────────────────────────────────────────
    address public feeCollector;
    uint256 public feeRateBps = 0;
    uint256 public minFee     = 0;

    // ─── V5 State ─────────────────────────────────────────────────────────────
    /// @dev credentialHash => paused
    mapping(bytes32 => bool) public paused;

    /// @dev credentialHash => UTC-day-number => USDC spent (6 dec)
    mapping(bytes32 => mapping(uint256 => uint256)) public dailySpentV5;

    /// @dev credentialHash => UTC-hour-number => tx count
    mapping(bytes32 => mapping(uint256 => uint256)) public hourlyTxCountV5;

    // ─── Events ───────────────────────────────────────────────────────────────
    event PaymentSent(address indexed from, address indexed to, uint256 amount, uint256 fee);

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
    error InvalidSpender();
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

    // ══════════════════════════════════════════════════════════════════════════
    //  V5 EOA PATH
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Execute a payment from a V5 EOA credential.
     * @param permission  The V5 permission struct (must match the credential).
     * @param to          Recipient address (must be whitelisted if allowedTo is set).
     * @param amount      USDC amount (6 decimals).
     * @param memo        Arbitrary reference bytes for agent-to-agent receipt matching.
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
     * @dev    Each payment is checked independently against per-tx limit and whitelist.
     *         Daily limit is checked cumulatively. Velocity is counted per payment.
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
     * @notice Pause a V5 credential. Reverts all future payments until unpaused.
     * @param credentialHash  keccak256(abi.encode(permission)) of the credential.
     */
    function pauseCredential(bytes32 credentialHash) external onlyRelayer {
        paused[credentialHash] = true;
        emit CredentialPaused(credentialHash);
    }

    /**
     * @notice Unpause a previously paused credential.
     * @param credentialHash  keccak256(abi.encode(permission)) of the credential.
     */
    function unpauseCredential(bytes32 credentialHash) external onlyRelayer {
        paused[credentialHash] = false;
        emit CredentialUnpaused(credentialHash);
    }

    // ─── Internal V5 execution logic ─────────────────────────────────────────

    function _validateAndExecuteV5(
        PermissionV5 calldata permission,
        address to,
        uint256 amount,
        bytes32 memo
    ) internal {
        if (to == address(0))     revert InvalidRecipient();
        if (amount == 0)          revert InvalidAmount();
        if (permission.token != USDC) revert OnlyUSDCSupported();

        bytes32 credHash = computeCredentialHash(permission);

        // ── Pause check ──────────────────────────────────────────────────────
        if (paused[credHash]) revert CredentialPausedError();

        // ── Time validity ─────────────────────────────────────────────────────
        if (block.timestamp < permission.start) revert CredentialNotStarted();
        if (permission.end != 0 && block.timestamp > permission.end) revert CredentialExpired();

        // ── Per-tx limit ──────────────────────────────────────────────────────
        if (permission.maxPerTx > 0 && amount > permission.maxPerTx) {
            revert ExceedsPerTxLimit(amount, permission.maxPerTx);
        }

        // ── Counterparty whitelist ────────────────────────────────────────────
        if (permission.allowedTo.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < permission.allowedTo.length; i++) {
                if (permission.allowedTo[i] == to) { allowed = true; break; }
            }
            if (!allowed) revert RecipientNotWhitelisted(to);
        }

        // ── Velocity control ──────────────────────────────────────────────────
        uint256 hourKey = block.timestamp / 3600;
        if (permission.maxTxPerHour > 0) {
            if (hourlyTxCountV5[credHash][hourKey] >= permission.maxTxPerHour) {
                revert VelocityLimitExceeded();
            }
            hourlyTxCountV5[credHash][hourKey]++;
        }

        // ── Daily spend limit ─────────────────────────────────────────────────
        uint256 dayKey = block.timestamp / 86400;
        uint256 spent  = dailySpentV5[credHash][dayKey];
        if (spent + amount > permission.allowance) {
            revert ExceedsDailyLimit(amount, permission.allowance - spent);
        }
        dailySpentV5[credHash][dayKey] = spent + amount;

        // ── Execute transfer ──────────────────────────────────────────────────
        IERC20(USDC).safeTransferFrom(permission.account, to, amount);

        // ── Emit ──────────────────────────────────────────────────────────────
        uint256 dailyRemaining   = permission.allowance - dailySpentV5[credHash][dayKey];
        uint256 hourlyTxRemaining = permission.maxTxPerHour > 0
            ? permission.maxTxPerHour - hourlyTxCountV5[credHash][hourKey]
            : type(uint256).max;

        emit PaymentExecutedV5(credHash, permission.account, to, amount, memo, dailyRemaining, hourlyTxRemaining);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  V4 LEGACY PATHS (backward compatible — unchanged)
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Pay via Smart Wallet (off-chain signature → approveWithSignature → spend).
     *         Legacy V4 path, unchanged.
     */
    function pay(
        SpendPermission calldata permission,
        bytes calldata signature,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0)      revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC)            revert OnlyUSDCSupported();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        ISpendPermissionManager spm = ISpendPermissionManager(SPEND_PERMISSION_MANAGER);
        spm.approveWithSignature(permission, signature);
        spm.spend(permission, uint160(totalAmount));

        IERC20(USDC).safeTransfer(to, amount);
        if (fee > 0) IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(permission.account, to, amount, fee);
    }

    /**
     * @notice Pay via Smart Wallet (already-approved permission).
     *         Legacy V4 path, unchanged.
     */
    function payWithApprovedPermission(
        SpendPermission calldata permission,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0)      revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC)            revert OnlyUSDCSupported();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).spend(permission, uint160(totalAmount));

        IERC20(USDC).safeTransfer(to, amount);
        if (fee > 0) IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(permission.account, to, amount, fee);
    }

    /**
     * @notice Pay via EOA (direct USDC.transferFrom — no SPM).
     *         Legacy V4 path — no V5 controls. Use payEOAV5 for new credentials.
     */
    function payEOA(
        address account,
        address to,
        uint256 amount
    ) external {
        if (to == address(0))      revert InvalidRecipient();
        if (amount == 0)           revert InvalidAmount();
        if (account == address(0)) revert InvalidRecipient();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        IERC20(USDC).safeTransferFrom(account, address(this), totalAmount);
        IERC20(USDC).safeTransfer(to, amount);
        if (fee > 0) IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(account, to, amount, fee);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  VIEW HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * @notice Compute the credential hash for a V5 permission.
     *         Off-chain callers can use this to derive credentialHash for pause/unpause.
     */
    function computeCredentialHash(PermissionV5 calldata p) public pure returns (bytes32) {
        return keccak256(abi.encode(p));
    }

    function dailyRemainingV5(PermissionV5 calldata permission) external view returns (uint256) {
        bytes32 credHash = computeCredentialHash(permission);
        uint256 dayKey   = block.timestamp / 86400;
        uint256 spent    = dailySpentV5[credHash][dayKey];
        return spent >= permission.allowance ? 0 : permission.allowance - spent;
    }

    function canSpendV5(PermissionV5 calldata permission, address to, uint256 amount) external view returns (bool, string memory) {
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

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        if (feeRateBps == 0 && minFee == 0) return 0;
        uint256 pct = (amount * feeRateBps) / 10000;
        return pct > minFee ? pct : minFee;
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        return _calculateFee(amount);
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
