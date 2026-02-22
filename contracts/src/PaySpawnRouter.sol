// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "lib/openzeppelin-contracts/contracts/access/Ownable.sol";
import {PaySpawnPolicy} from "./PaySpawnPolicy.sol";

/**
 * @title PaySpawnRouter
 * @notice Routes agent payments with automatic policy enforcement and fee collection
 * @dev Collects 0.1% protocol fee on all transactions
 */
contract PaySpawnRouter is Ownable {
    using SafeERC20 for IERC20;
    
    PaySpawnPolicy public immutable policyContract;
    address public treasury;
    
    // Fee structure: flat fee for small txs, percentage for large txs
    uint256 public flatFee = 200000; // $0.20 in USDC (6 decimals)
    uint256 public feeThreshold = 200000000; // $200 in USDC (6 decimals)
    uint256 public feeRate = 10; // 0.1% = 10 basis points for txs > threshold
    
    uint256 public constant MAX_FEE_RATE = 50; // 0.5% max = 50 basis points
    uint256 public constant MAX_FLAT_FEE = 500000; // $0.50 max flat fee (6 decimals)
    uint256 public constant BASIS_POINTS = 10000;
    
    // Stats
    uint256 public totalVolume;
    uint256 public totalFees;
    uint256 public totalTransactions;
    
    event Payment(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount,
        uint256 fee,
        uint256 netAmount
    );
    
    event FeeRateUpdated(uint256 oldRate, uint256 newRate);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event NativePayment(address indexed from, address indexed to, uint256 amount, uint256 fee);
    
    error ZeroAddress();
    error ZeroAmount();
    error FeeRateTooHigh(uint256 rate, uint256 maxRate);
    error PolicyValidationFailed();
    error InsufficientAllowance();
    error TransferFailed();
    
    constructor(address _policyContract, address _treasury) Ownable(msg.sender) {
        if (_policyContract == address(0)) revert ZeroAddress();
        if (_treasury == address(0)) revert ZeroAddress();
        
        policyContract = PaySpawnPolicy(_policyContract);
        treasury = _treasury;
    }
    
    /**
     * @notice Pay with ERC20 tokens through the router
     * @dev Validates against policy, deducts fee, and transfers to recipient
     * @param token The ERC20 token address
     * @param to The recipient address
     * @param amount The total amount to send (fee will be deducted)
     */
    function pay(
        address token,
        address to,
        uint256 amount
    ) external {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        // Validate against policy
        bool valid = policyContract.validateTransaction(msg.sender, amount);
        if (!valid) revert PolicyValidationFailed();
        
        // Calculate fee (flat fee for small txs, percentage for large txs)
        (uint256 fee, uint256 netAmount) = calculateFee(amount);
        
        // Transfer tokens
        IERC20(token).safeTransferFrom(msg.sender, to, netAmount);
        if (fee > 0) {
            IERC20(token).safeTransferFrom(msg.sender, treasury, fee);
        }
        
        // Update stats
        totalVolume += amount;
        totalFees += fee;
        totalTransactions++;
        
        emit Payment(msg.sender, to, token, amount, fee, netAmount);
    }
    
    /**
     * @notice Pay on behalf of a user (relayer pattern)
     * @dev Anyone can call this, but it pulls from `from` address who must have:
     *      1. Approved this router to spend their tokens
     *      2. Set up a policy that allows this payment
     * @param from The wallet to pull funds from
     * @param token The ERC20 token address (usually USDC)
     * @param to The recipient address
     * @param amount The total amount to send (fee will be deducted)
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
        
        // Validate against policy for the `from` address
        bool valid = policyContract.validateTransaction(from, amount);
        if (!valid) revert PolicyValidationFailed();
        
        // Calculate fee (flat fee for small txs, percentage for large txs)
        (uint256 fee, uint256 netAmount) = calculateFee(amount);
        
        // Transfer tokens from the user's wallet
        IERC20(token).safeTransferFrom(from, to, netAmount);
        if (fee > 0) {
            IERC20(token).safeTransferFrom(from, treasury, fee);
        }
        
        // Update stats
        totalVolume += amount;
        totalFees += fee;
        totalTransactions++;
        
        emit Payment(from, to, token, amount, fee, netAmount);
    }
    
    /**
     * @notice Pay with native ETH through the router
     * @param to The recipient address
     */
    function payNative(address payable to) external payable {
        if (to == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        
        uint256 amount = msg.value;
        
        // Validate against policy
        bool valid = policyContract.validateTransaction(msg.sender, amount);
        if (!valid) revert PolicyValidationFailed();
        
        // Calculate fee (flat fee for small txs, percentage for large txs)
        (uint256 fee, uint256 netAmount) = calculateFee(amount);
        
        // Transfer ETH
        (bool success, ) = to.call{value: netAmount}("");
        if (!success) revert TransferFailed();
        
        if (fee > 0) {
            (bool feeSuccess, ) = treasury.call{value: fee}("");
            if (!feeSuccess) revert TransferFailed();
        }
        
        // Update stats
        totalVolume += amount;
        totalFees += fee;
        totalTransactions++;
        
        emit NativePayment(msg.sender, to, amount, fee);
    }
    
    /**
     * @notice Calculate the fee for a given amount
     * @dev Flat fee for amounts <= threshold, percentage for amounts > threshold
     * @param amount The transaction amount
     * @return fee The fee amount
     * @return netAmount The amount after fee deduction
     */
    function calculateFee(uint256 amount) public view returns (uint256 fee, uint256 netAmount) {
        if (amount <= feeThreshold) {
            // Flat fee for small transactions (≤$200)
            fee = flatFee;
        } else {
            // Percentage fee for large transactions (>$200)
            fee = (amount * feeRate) / BASIS_POINTS;
        }
        
        // Ensure fee doesn't exceed amount
        if (fee > amount) {
            fee = amount;
        }
        
        netAmount = amount - fee;
    }
    
    /**
     * @notice Update the protocol fee rate (for txs > threshold)
     * @param newRate The new fee rate in basis points (max 50 = 0.5%)
     */
    function setFeeRate(uint256 newRate) external onlyOwner {
        if (newRate > MAX_FEE_RATE) revert FeeRateTooHigh(newRate, MAX_FEE_RATE);
        
        uint256 oldRate = feeRate;
        feeRate = newRate;
        
        emit FeeRateUpdated(oldRate, newRate);
    }
    
    /**
     * @notice Update the flat fee for small transactions
     * @param newFlatFee The new flat fee amount (in token units, e.g., 200000 = $0.20 USDC)
     * @dev Max flat fee is $0.50 (500000 in 6 decimals)
     */
    function setFlatFee(uint256 newFlatFee) external onlyOwner {
        require(newFlatFee <= MAX_FLAT_FEE, "Flat fee exceeds max");
        flatFee = newFlatFee;
    }
    
    /**
     * @notice Update the threshold between flat fee and percentage fee
     * @param newThreshold The new threshold (in token units, e.g., 200000000 = $200 USDC)
     */
    function setFeeThreshold(uint256 newThreshold) external onlyOwner {
        feeThreshold = newThreshold;
    }
    
    /**
     * @notice Update the treasury address
     * @param newTreasury The new treasury address
     */
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        
        address oldTreasury = treasury;
        treasury = newTreasury;
        
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }
    
    /**
     * @notice Get protocol statistics
     * @return volume Total volume processed
     * @return fees Total fees collected
     * @return transactions Total number of transactions
     */
    function getStats() external view returns (
        uint256 volume,
        uint256 fees,
        uint256 transactions
    ) {
        return (totalVolume, totalFees, totalTransactions);
    }
    
    /**
     * @notice Check if a payment would succeed
     * @param agent The agent wallet address
     * @param amount The amount to check
     * @return canPay True if the payment would succeed
     * @return reason A reason string if cannot pay
     */
    function canPay(address agent, uint256 amount) external view returns (bool canPay, string memory reason) {
        if (amount == 0) return (false, "Zero amount");
        
        bool policyAllows = policyContract.canSpend(agent, amount);
        if (!policyAllows) return (false, "Policy rejects");
        
        return (true, "");
    }
}
