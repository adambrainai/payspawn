// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

struct SpendPermission {
    address account;
    address spender;
    address token;
    uint160 allowance;
    uint48 period;
    uint48 start;
    uint48 end;
    uint256 salt;
    bytes extraData;
}

interface ISpendPermissionManager {
    function approveWithSignature(SpendPermission calldata spendPermission, bytes calldata signature) external returns (bool);
    function spend(SpendPermission memory spendPermission, uint160 value) external;
    function isApproved(SpendPermission memory spendPermission) external view returns (bool);
}

/**
 * @title PaySpawnSpenderV4
 * @notice Dual-path payment:
 *   - Smart Wallets: use Coinbase SpendPermissionManager (gasless off-chain signature)
 *   - EOAs: direct USDC.transferFrom (user approves this contract directly)
 */
contract PaySpawnSpenderV4 {
    using SafeERC20 for IERC20;

    address public constant SPEND_PERMISSION_MANAGER = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    address public feeCollector;
    uint256 public feeRateBps = 10;  // 0.1%
    uint256 public minFee = 50000;   // $0.05 in USDC (6 decimals)
    address public owner;

    event PaymentSent(address indexed from, address indexed to, uint256 amount, uint256 fee);

    error NotOwner();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidSpender();
    error OnlyUSDCSupported();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _feeCollector) {
        owner = msg.sender;
        feeCollector = _feeCollector;
    }

    /**
     * @notice Pay via Smart Wallet (off-chain signature → approveWithSignature → spend)
     */
    function pay(
        SpendPermission calldata permission,
        bytes calldata signature,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC) revert OnlyUSDCSupported();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        ISpendPermissionManager spm = ISpendPermissionManager(SPEND_PERMISSION_MANAGER);
        spm.approveWithSignature(permission, signature);
        spm.spend(permission, uint160(totalAmount));

        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(permission.account, to, amount, fee);
    }

    /**
     * @notice Pay via Smart Wallet (already-approved permission, no signature needed)
     */
    function payWithApprovedPermission(
        SpendPermission calldata permission,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC) revert OnlyUSDCSupported();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).spend(permission, uint160(totalAmount));

        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(permission.account, to, amount, fee);
    }

    /**
     * @notice Pay via EOA (direct USDC transferFrom — no SpendPermissionManager needed)
     * @dev Requires: account has called USDC.approve(this contract, amount) beforehand
     * @param account The wallet address to pull USDC from
     * @param to Recipient address
     * @param amount Amount in USDC (6 decimals) to send to recipient
     */
    function payEOA(
        address account,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (account == address(0)) revert InvalidRecipient();

        uint256 fee = _calculateFee(amount);
        uint256 totalAmount = amount + fee;

        // Pull USDC directly from account (account must have approved this contract)
        IERC20(USDC).safeTransferFrom(account, address(this), totalAmount);

        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);

        emit PaymentSent(account, to, amount, fee);
    }

    function _calculateFee(uint256 amount) internal view returns (uint256) {
        uint256 pct = (amount * feeRateBps) / 10000;
        return pct > minFee ? pct : minFee;
    }

    function calculateFee(uint256 amount) external view returns (uint256) {
        return _calculateFee(amount);
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
