// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice SpendPermission struct - must match Coinbase's exactly
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

/// @notice Correct interface for Coinbase SpendPermissionManager
interface ISpendPermissionManager {
    /// @notice Approve a spend permission via signature
    function permit(SpendPermission memory spendPermission, bytes memory signature) external;
    
    /// @notice Approve and spend in one call
    function permitAndSpend(
        SpendPermission memory spendPermission,
        bytes memory signature,
        address recipient,
        uint160 value
    ) external;
    
    /// @notice Spend using an already-approved permission
    function spend(
        SpendPermission memory spendPermission,
        address recipient,
        uint160 value
    ) external;
    
    /// @notice Check if permission is approved and not revoked
    function isApproved(SpendPermission memory spendPermission) external view returns (bool);
}

/**
 * @title PaySpawnSpenderV2
 * @notice Spender contract for Coinbase Spend Permissions - Fixed interface
 */
contract PaySpawnSpenderV2 {
    using SafeERC20 for IERC20;
    
    address public constant SPEND_PERMISSION_MANAGER = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad;
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    address public feeCollector;
    uint256 public feeRateBps = 10; // 0.1%
    uint256 public minFee = 50000; // $0.05
    address public owner;
    
    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee
    );
    
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
     * @notice Pay a recipient - approves permission and spends in one tx
     * @param permission The signed spend permission
     * @param signature User's EIP-712 signature
     * @param to Recipient address
     * @param amount Amount to send to recipient (fee added on top)
     */
    function pay(
        SpendPermission memory permission,
        bytes memory signature,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC) revert OnlyUSDCSupported();
        
        // Calculate fee
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        uint256 fee = percentageFee > minFee ? percentageFee : minFee;
        uint256 totalAmount = amount + fee;
        
        // Use permitAndSpend to approve and transfer in one call
        // This transfers totalAmount from user to this contract
        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).permitAndSpend(
            permission,
            signature,
            address(this), // recipient is this contract
            uint160(totalAmount)
        );
        
        // Forward to recipient and fee collector
        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);
        
        emit PaymentSent(permission.account, to, amount, fee);
    }
    
    /**
     * @notice Pay using an already-approved permission
     */
    function payWithApprovedPermission(
        SpendPermission memory permission,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC) revert OnlyUSDCSupported();
        
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        uint256 fee = percentageFee > minFee ? percentageFee : minFee;
        uint256 totalAmount = amount + fee;
        
        // Spend from already-approved permission
        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).spend(
            permission,
            address(this),
            uint160(totalAmount)
        );
        
        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);
        
        emit PaymentSent(permission.account, to, amount, fee);
    }
    
    function calculateFee(uint256 amount) external view returns (uint256) {
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        return percentageFee > minFee ? percentageFee : minFee;
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
