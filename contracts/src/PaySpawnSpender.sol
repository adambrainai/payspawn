// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice SpendPermission struct from Coinbase
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

/// @notice Interface for Coinbase SpendPermissionManager
interface ISpendPermissionManager {
    function spend(SpendPermission memory spendPermission, uint160 value) external;
    function approveWithSignature(SpendPermission calldata spendPermission, bytes calldata signature) external returns (bool);
    function isValid(SpendPermission memory spendPermission) external view returns (bool);
    function isApproved(SpendPermission memory spendPermission) external view returns (bool);
    function isRevoked(SpendPermission memory spendPermission) external view returns (bool);
}

/**
 * @title PaySpawnSpender
 * @notice Spender contract for Coinbase Spend Permissions
 * @dev Acts as the "spender" in SpendPermission, takes fee, forwards to recipient
 * 
 * How it works:
 * 1. User creates a Coinbase Smart Wallet
 * 2. User signs a SpendPermission with this contract as the spender
 * 3. Agent calls pay() to send money to recipients
 * 4. This contract uses the permission to withdraw from user's wallet
 * 5. Forwards to recipient minus PaySpawn fee
 */
contract PaySpawnSpender {
    using SafeERC20 for IERC20;
    
    /// @notice Coinbase SpendPermissionManager on Base
    address public constant SPEND_PERMISSION_MANAGER = 0xf85210B21cC50302F477BA56686d2019dC9b67Ad;
    
    /// @notice USDC on Base
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    
    /// @notice Fee collector (PaySpawn treasury)
    address public feeCollector;
    
    /// @notice Fee rate in basis points (10 = 0.1%)
    uint256 public feeRateBps = 10;
    
    /// @notice Minimum fee in USDC (6 decimals, 50000 = $0.05)
    uint256 public minFee = 50000;
    
    /// @notice Owner for admin functions
    address public owner;
    
    event PaymentSent(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 fee,
        bytes32 indexed permissionHash
    );
    
    event PermissionApproved(
        address indexed account,
        bytes32 indexed permissionHash
    );
    
    event FeeCollectorUpdated(address indexed oldCollector, address indexed newCollector);
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event MinFeeUpdated(uint256 oldMinFee, uint256 newMinFee);
    
    error NotOwner();
    error InvalidRecipient();
    error InvalidAmount();
    error InvalidSpender();
    error OnlyUSDCSupported();
    error AmountTooLarge();
    
    modifier onlyOwner() {
        _checkOwner();
        _;
    }
    
    function _checkOwner() internal view {
        if (msg.sender != owner) revert NotOwner();
    }
    
    constructor(address _feeCollector) {
        owner = msg.sender;
        feeCollector = _feeCollector;
    }
    
    /**
     * @notice Pay a recipient using a spend permission
     * @param permission The signed spend permission
     * @param to Recipient address
     * @param amount Amount to send to recipient (fee added on top)
     */
    function pay(
        SpendPermission memory permission,
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
        
        // Ensure totalAmount fits in uint160 (max value ~1.46e48)
        // forge-lint: disable-next-line(unsafe-typecast)
        if (totalAmount > type(uint160).max) revert AmountTooLarge();
        
        // Spend from user's wallet to this contract
        // SpendPermissionManager validates the permission and enforces limits
        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).spend(
            permission,
            uint160(totalAmount)
        );
        
        // Now this contract has the USDC, forward to recipient and fee collector
        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);
        
        emit PaymentSent(
            permission.account,
            to,
            amount,
            fee,
            keccak256(abi.encode(permission))
        );
    }
    
    /**
     * @notice Approve a permission with signature (can be batched with pay)
     * @param permission The spend permission
     * @param signature User's EIP-712 signature
     */
    function approvePermission(
        SpendPermission calldata permission,
        bytes calldata signature
    ) external returns (bool) {
        bool approved = ISpendPermissionManager(SPEND_PERMISSION_MANAGER).approveWithSignature(
            permission,
            signature
        );
        
        if (approved) {
            emit PermissionApproved(
                permission.account,
                keccak256(abi.encode(permission))
            );
        }
        
        return approved;
    }
    
    /**
     * @notice Approve a permission and pay in one transaction
     * @param permission The spend permission
     * @param signature User's signature
     * @param to Recipient address
     * @param amount Amount to send
     */
    function approveAndPay(
        SpendPermission calldata permission,
        bytes calldata signature,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();
        if (permission.spender != address(this)) revert InvalidSpender();
        if (permission.token != USDC) revert OnlyUSDCSupported();
        
        // First approve the permission with the user's signature
        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).approveWithSignature(
            permission,
            signature
        );
        
        emit PermissionApproved(
            permission.account,
            keccak256(abi.encode(permission))
        );
        
        // Calculate fee
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        uint256 fee = percentageFee > minFee ? percentageFee : minFee;
        uint256 totalAmount = amount + fee;
        
        // forge-lint: disable-next-line(unsafe-typecast)
        if (totalAmount > type(uint160).max) revert AmountTooLarge();
        
        // Convert to memory struct for spend call
        SpendPermission memory permMem = SpendPermission({
            account: permission.account,
            spender: permission.spender,
            token: permission.token,
            allowance: permission.allowance,
            period: permission.period,
            start: permission.start,
            end: permission.end,
            salt: permission.salt,
            extraData: permission.extraData
        });
        
        // Spend from user's wallet
        ISpendPermissionManager(SPEND_PERMISSION_MANAGER).spend(
            permMem,
            uint160(totalAmount)
        );
        
        // Forward to recipient and fee collector
        IERC20(USDC).safeTransfer(to, amount);
        IERC20(USDC).safeTransfer(feeCollector, fee);
        
        emit PaymentSent(
            permission.account,
            to,
            amount,
            fee,
            keccak256(abi.encode(permission))
        );
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Check if a permission is valid (approved and not revoked)
     */
    function isPermissionValid(SpendPermission memory permission) external view returns (bool) {
        return ISpendPermissionManager(SPEND_PERMISSION_MANAGER).isValid(permission);
    }
    
    /**
     * @notice Calculate the fee for a given amount
     */
    function calculateFee(uint256 amount) external view returns (uint256) {
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        return percentageFee > minFee ? percentageFee : minFee;
    }
    
    /**
     * @notice Calculate total amount needed (amount + fee)
     */
    function calculateTotal(uint256 amount) external view returns (uint256) {
        uint256 percentageFee = (amount * feeRateBps) / 10000;
        uint256 fee = percentageFee > minFee ? percentageFee : minFee;
        return amount + fee;
    }
    
    // ============ Admin Functions ============
    
    function setFeeCollector(address _feeCollector) external onlyOwner {
        emit FeeCollectorUpdated(feeCollector, _feeCollector);
        feeCollector = _feeCollector;
    }
    
    function setFeeRate(uint256 _feeRateBps) external onlyOwner {
        require(_feeRateBps <= 1000, "Fee too high"); // Max 10%
        emit FeeRateUpdated(feeRateBps, _feeRateBps);
        feeRateBps = _feeRateBps;
    }
    
    function setMinFee(uint256 _minFee) external onlyOwner {
        emit MinFeeUpdated(minFee, _minFee);
        minFee = _minFee;
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
    
    /**
     * @notice Recover any stuck tokens
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }
}
