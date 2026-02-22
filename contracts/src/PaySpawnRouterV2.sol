// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {PaySpawnPolicy} from "./PaySpawnPolicy.sol";

/**
 * @title PaySpawnRouterV2
 * @notice Routes agent payments with automatic policy enforcement and fee collection
 * @dev Fee is ADDED to the payment amount, not deducted. Recipient always gets exact amount.
 *      Fee structure: 0.1% with $0.05 minimum
 */
contract PaySpawnRouterV2 is Ownable {
    using SafeERC20 for IERC20;
    
    PaySpawnPolicy public immutable policyContract;
    address public treasury;
    
    // Fee structure: 0.1% with $0.05 minimum
    uint256 public minFee = 50000; // $0.05 in USDC (6 decimals)
    uint256 public feeRate = 10; // 0.1% = 10 basis points
    
    uint256 public constant MAX_FEE_RATE = 100; // 1% max = 100 basis points
    uint256 public constant MAX_MIN_FEE = 1000000; // $1.00 max minimum fee
    uint256 public constant BASIS_POINTS = 10000;
    
    // Stats
    uint256 public totalVolume;
    uint256 public totalFees;
    uint256 public totalTransactions;
    
    event Payment(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 recipientAmount,
        uint256 fee,
        uint256 totalPaid
    );
    
    event FeeUpdated(uint256 newRate, uint256 newMinFee);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    
    error ZeroAddress();
    error ZeroAmount();
    error FeeRateTooHigh(uint256 rate, uint256 maxRate);
    error MinFeeTooHigh(uint256 fee, uint256 maxFee);
    error PolicyValidationFailed();
    error InsufficientAllowance(uint256 required, uint256 available);
    
    constructor(address _policyContract, address _treasury) Ownable(msg.sender) {
        if (_policyContract == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        
        policyContract = PaySpawnPolicy(_policyContract);
        treasury = _treasury;
    }
    
    /**
     * @notice Calculate fee for a given recipient amount
     * @param recipientAmount The amount the recipient should receive
     * @return fee The fee amount
     * @return totalRequired The total amount payer needs (recipientAmount + fee)
     */
    function calculateFee(uint256 recipientAmount) public view returns (uint256 fee, uint256 totalRequired) {
        // Calculate percentage fee
        uint256 percentageFee = (recipientAmount * feeRate) / BASIS_POINTS;
        
        // Use the greater of percentage fee or minimum fee
        fee = percentageFee > minFee ? percentageFee : minFee;
        
        // Total required from payer = recipient amount + fee
        totalRequired = recipientAmount + fee;
    }
    
    /**
     * @notice Pay on behalf of a user (relayer pattern)
     * @dev Recipient receives EXACT amount specified. Payer pays amount + fee.
     * @param from The wallet to pull funds from
     * @param token The ERC20 token address (usually USDC)
     * @param to The recipient address
     * @param amount The EXACT amount recipient will receive (fee added on top)
     */
    function payFrom(
        address from,
        address token,
        address to,
        uint256 amount
    ) external {
        if (from == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        // Calculate fee - recipient gets exact amount, payer pays amount + fee
        (uint256 fee, uint256 totalRequired) = calculateFee(amount);
        
        // Validate against policy for the TOTAL amount being spent
        bool valid = policyContract.validateTransaction(from, totalRequired);
        if (!valid) revert PolicyValidationFailed();
        
        // Check allowance covers total
        uint256 allowance = IERC20(token).allowance(from, address(this));
        if (allowance < totalRequired) {
            revert InsufficientAllowance(totalRequired, allowance);
        }
        
        // Transfer exact amount to recipient
        IERC20(token).safeTransferFrom(from, to, amount);
        
        // Transfer fee to treasury
        if (fee > 0) {
            IERC20(token).safeTransferFrom(from, treasury, fee);
        }
        
        // Update stats
        totalVolume += amount;
        totalFees += fee;
        totalTransactions++;
        
        emit Payment(from, to, token, amount, fee, totalRequired);
    }
    
    /**
     * @notice Direct pay (caller pays)
     * @param token The ERC20 token address
     * @param to The recipient address  
     * @param amount The EXACT amount recipient will receive (fee added on top)
     */
    function pay(
        address token,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        // Calculate fee
        (uint256 fee, uint256 totalRequired) = calculateFee(amount);
        
        // Validate against policy
        bool valid = policyContract.validateTransaction(msg.sender, totalRequired);
        if (!valid) revert PolicyValidationFailed();
        
        // Transfer exact amount to recipient
        IERC20(token).safeTransferFrom(msg.sender, to, amount);
        
        // Transfer fee to treasury
        if (fee > 0) {
            IERC20(token).safeTransferFrom(msg.sender, treasury, fee);
        }
        
        // Update stats
        totalVolume += amount;
        totalFees += fee;
        totalTransactions++;
        
        emit Payment(msg.sender, to, token, amount, fee, totalRequired);
    }
    
    /**
     * @notice Preview what a payment would cost
     * @param recipientAmount The amount to send to recipient
     * @return fee The fee that will be charged
     * @return totalRequired The total the payer needs to have approved
     */
    function previewPayment(uint256 recipientAmount) external view returns (
        uint256 fee,
        uint256 totalRequired
    ) {
        return calculateFee(recipientAmount);
    }
    
    /**
     * @notice Check if a payment would succeed
     * @param from The payer address
     * @param token The token address
     * @param amount The recipient amount
     * @return canPay True if payment would succeed
     * @return fee The fee amount
     * @return totalRequired Total amount needed from payer
     * @return reason Error reason if cannot pay
     */
    function canPayFrom(
        address from,
        address token,
        uint256 amount
    ) external view returns (
        bool canPay,
        uint256 fee,
        uint256 totalRequired,
        string memory reason
    ) {
        if (amount == 0) return (false, 0, 0, "Zero amount");
        
        (fee, totalRequired) = calculateFee(amount);
        
        // Check policy
        bool policyAllows = policyContract.canSpend(from, totalRequired);
        if (!policyAllows) return (false, fee, totalRequired, "Policy rejects");
        
        // Check allowance
        uint256 allowance = IERC20(token).allowance(from, address(this));
        if (allowance < totalRequired) return (false, fee, totalRequired, "Insufficient allowance");
        
        // Check balance
        uint256 balance = IERC20(token).balanceOf(from);
        if (balance < totalRequired) return (false, fee, totalRequired, "Insufficient balance");
        
        return (true, fee, totalRequired, "");
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update fee parameters
     * @param newRate Fee rate in basis points (10 = 0.1%)
     * @param newMinFee Minimum fee in token units (50000 = $0.05 USDC)
     */
    function setFees(uint256 newRate, uint256 newMinFee) external onlyOwner {
        if (newRate > MAX_FEE_RATE) revert FeeRateTooHigh(newRate, MAX_FEE_RATE);
        if (newMinFee > MAX_MIN_FEE) revert MinFeeTooHigh(newMinFee, MAX_MIN_FEE);
        
        feeRate = newRate;
        minFee = newMinFee;
        
        emit FeeUpdated(newRate, newMinFee);
    }
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @notice Get protocol statistics
     */
    function getStats() external view returns (
        uint256 volume,
        uint256 fees,
        uint256 transactions
    ) {
        return (totalVolume, totalFees, totalTransactions);
    }
}
