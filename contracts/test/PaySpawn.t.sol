// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {PaySpawnPolicy} from "../src/PaySpawnPolicy.sol";
import {PaySpawnRouter} from "../src/PaySpawnRouter.sol";
import {ERC20} from "lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

// Mock USDC for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6); // 1M USDC
    }
    
    function decimals() public pure override returns (uint8) {
        return 6;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract PaySpawnTest is Test {
    PaySpawnPolicy public policy;
    PaySpawnRouter public router;
    MockUSDC public usdc;
    
    address public human = address(0x1);
    address public agent = address(0x2);
    address public recipient = address(0x3);
    address public treasury = address(0x4);
    
    uint256 public constant DAILY_LIMIT = 100 * 10**6; // 100 USDC
    uint256 public constant PER_TX_LIMIT = 10 * 10**6;  // 10 USDC
    
    function setUp() public {
        policy = new PaySpawnPolicy();
        router = new PaySpawnRouter(address(policy), treasury);
        usdc = new MockUSDC();
        
        // Setup agent with policy
        vm.prank(human);
        policy.createPolicy(agent, DAILY_LIMIT, PER_TX_LIMIT);
        
        // Fund agent
        usdc.mint(agent, 1000 * 10**6); // 1000 USDC
        
        // Agent approves router
        vm.prank(agent);
        usdc.approve(address(router), type(uint256).max);
    }
    
    // ============ Policy Tests ============
    
    function test_CreatePolicy() public {
        address newAgent = address(0x100);
        
        vm.prank(human);
        policy.createPolicy(newAgent, DAILY_LIMIT, PER_TX_LIMIT);
        
        PaySpawnPolicy.Policy memory p = policy.getPolicy(newAgent);
        assertEq(p.human, human);
        assertEq(p.agent, newAgent);
        assertEq(p.dailyLimit, DAILY_LIMIT);
        assertEq(p.perTxLimit, PER_TX_LIMIT);
        assertEq(p.paused, false);
    }
    
    function test_CreatePolicy_RevertIfExists() public {
        vm.prank(human);
        vm.expectRevert(PaySpawnPolicy.PolicyAlreadyExists.selector);
        policy.createPolicy(agent, DAILY_LIMIT, PER_TX_LIMIT);
    }
    
    function test_ValidateTransaction() public {
        uint256 amount = 5 * 10**6; // 5 USDC
        
        bool success = policy.validateTransaction(agent, amount);
        assertTrue(success);
        
        PaySpawnPolicy.Policy memory p = policy.getPolicy(agent);
        assertEq(p.dailySpent, amount);
    }
    
    function test_ValidateTransaction_RevertExceedsPerTx() public {
        uint256 amount = 15 * 10**6; // 15 USDC > 10 USDC limit
        
        vm.expectRevert(
            abi.encodeWithSelector(
                PaySpawnPolicy.ExceedsPerTxLimit.selector,
                amount,
                PER_TX_LIMIT
            )
        );
        policy.validateTransaction(agent, amount);
    }
    
    function test_ValidateTransaction_RevertExceedsDaily() public {
        // Make multiple transactions to hit daily limit
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6); // 100 USDC spent
        
        // Next transaction should fail
        vm.expectRevert();
        policy.validateTransaction(agent, 1 * 10**6);
    }
    
    function test_Pause() public {
        vm.prank(human);
        policy.pause(agent);
        
        PaySpawnPolicy.Policy memory p = policy.getPolicy(agent);
        assertTrue(p.paused);
        
        // Transactions should fail
        vm.expectRevert(PaySpawnPolicy.AgentPausedError.selector);
        policy.validateTransaction(agent, 1 * 10**6);
    }
    
    function test_Unpause() public {
        vm.prank(human);
        policy.pause(agent);
        
        vm.prank(human);
        policy.unpause(agent);
        
        PaySpawnPolicy.Policy memory p = policy.getPolicy(agent);
        assertFalse(p.paused);
        
        // Transactions should work again
        bool success = policy.validateTransaction(agent, 1 * 10**6);
        assertTrue(success);
    }
    
    function test_Pause_RevertIfNotHuman() public {
        vm.prank(address(0x999));
        vm.expectRevert(PaySpawnPolicy.NotAuthorized.selector);
        policy.pause(agent);
    }
    
    function test_UpdateLimits() public {
        uint256 newDaily = 200 * 10**6;
        uint256 newPerTx = 20 * 10**6;
        
        vm.prank(human);
        policy.updateLimits(agent, newDaily, newPerTx);
        
        PaySpawnPolicy.Policy memory p = policy.getPolicy(agent);
        assertEq(p.dailyLimit, newDaily);
        assertEq(p.perTxLimit, newPerTx);
    }
    
    function test_CanSpend() public view {
        assertTrue(policy.canSpend(agent, 5 * 10**6));
        assertFalse(policy.canSpend(agent, 15 * 10**6)); // Exceeds per-tx
        assertFalse(policy.canSpend(agent, 150 * 10**6)); // Exceeds daily
    }
    
    function test_GetRemainingDaily() public {
        uint256 remaining = policy.getRemainingDaily(agent);
        assertEq(remaining, DAILY_LIMIT);
        
        // Use valid amount (under per-tx limit of 10 USDC)
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6); // 30 total
        
        remaining = policy.getRemainingDaily(agent);
        assertEq(remaining, 70 * 10**6);
    }
    
    function test_DailyResetOnNewDay() public {
        // Spend some today (multiple smaller transactions)
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6);
        policy.validateTransaction(agent, 10 * 10**6); // 50 total
        assertEq(policy.getRemainingDaily(agent), 50 * 10**6);
        
        // Move to next day
        vm.warp(block.timestamp + 1 days);
        
        // Should have full daily limit again
        assertEq(policy.getRemainingDaily(agent), DAILY_LIMIT);
    }
    
    // ============ Router Tests ============
    
    function test_RouterPay() public {
        uint256 amount = 10 * 10**6; // $10 USDC (under threshold, uses flat fee)
        
        uint256 recipientBefore = usdc.balanceOf(recipient);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        
        vm.prank(agent);
        router.pay(address(usdc), recipient, amount);
        
        // Calculate expected amounts (flat fee of $0.20 for small txs)
        (uint256 fee, uint256 netAmount) = router.calculateFee(amount);
        assertEq(fee, 200000); // $0.20 flat fee
        
        assertEq(usdc.balanceOf(recipient), recipientBefore + netAmount);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + fee);
        
        // Check stats
        (uint256 volume, uint256 fees, uint256 txCount) = router.getStats();
        assertEq(volume, amount);
        assertEq(fees, fee);
        assertEq(txCount, 1);
    }
    
    function test_RouterCalculateFee_SmallTx() public view {
        uint256 amount = 100 * 10**6; // $100 USDC (under threshold)
        
        (uint256 fee, uint256 netAmount) = router.calculateFee(amount);
        
        // Flat fee = $0.20
        assertEq(fee, 200000); // 0.20 USDC
        assertEq(netAmount, amount - 200000);
    }
    
    function test_RouterCalculateFee_LargeTx() public view {
        uint256 amount = 1000 * 10**6; // $1000 USDC (over threshold)
        
        (uint256 fee, uint256 netAmount) = router.calculateFee(amount);
        
        // 0.1% fee = $1.00 USDC
        assertEq(fee, 1 * 10**6);
        assertEq(netAmount, 999 * 10**6);
    }
    
    function test_RouterCalculateFee_AtThreshold() public view {
        uint256 amount = 200 * 10**6; // $200 USDC (at threshold)
        
        (uint256 fee, uint256 netAmount) = router.calculateFee(amount);
        
        // At threshold, flat fee applies
        assertEq(fee, 200000); // $0.20
        assertEq(netAmount, amount - 200000);
    }
    
    function test_RouterCanPay() public view {
        (bool canPay, string memory reason) = router.canPay(agent, 5 * 10**6);
        assertTrue(canPay);
        assertEq(reason, "");
        
        (canPay, reason) = router.canPay(agent, 150 * 10**6);
        assertFalse(canPay);
        assertEq(reason, "Policy rejects");
    }
    
    function test_RouterSetFeeRate() public {
        uint256 newRate = 20; // 0.2%
        
        router.setFeeRate(newRate);
        
        // Test with amount over threshold to trigger percentage fee
        (uint256 fee, ) = router.calculateFee(1000 * 10**6);
        assertEq(fee, 2 * 10**6); // 0.2% of 1000 = 2
    }
    
    function test_RouterSetFlatFee() public {
        uint256 newFlatFee = 500000; // $0.50
        
        router.setFlatFee(newFlatFee);
        
        // Test with amount under threshold
        (uint256 fee, ) = router.calculateFee(100 * 10**6);
        assertEq(fee, 500000); // $0.50
    }
    
    function test_RouterSetFeeThreshold() public {
        uint256 newThreshold = 500 * 10**6; // $500
        
        router.setFeeThreshold(newThreshold);
        
        // $300 is now under threshold, should use flat fee
        (uint256 fee, ) = router.calculateFee(300 * 10**6);
        assertEq(fee, 200000); // flat $0.20
    }
    
    function test_RouterSetFeeRate_RevertIfTooHigh() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                PaySpawnRouter.FeeRateTooHigh.selector,
                100,
                50
            )
        );
        router.setFeeRate(100); // 1% > 0.5% max
    }
    
    function test_RouterSetTreasury() public {
        address newTreasury = address(0x999);
        
        router.setTreasury(newTreasury);
        
        assertEq(router.treasury(), newTreasury);
    }
    
    // ============ Integration Tests ============
    
    function test_FullFlow() public {
        // Human creates policy
        address newAgent = address(0x200);
        vm.prank(human);
        policy.createPolicy(newAgent, 1000 * 10**6, 500 * 10**6); // Higher per-tx for large payment test
        
        // Fund agent
        usdc.mint(newAgent, 1000 * 10**6);
        vm.prank(newAgent);
        usdc.approve(address(router), type(uint256).max);
        
        // Agent makes large payment ($300 - over threshold, percentage fee)
        vm.prank(newAgent);
        router.pay(address(usdc), recipient, 300 * 10**6);
        
        // Check recipient received net amount (0.1% of $300 = $0.30 fee)
        (uint256 fee, uint256 netAmount) = router.calculateFee(300 * 10**6);
        assertEq(fee, 300000); // 0.1% of $300 = $0.30
        assertEq(usdc.balanceOf(recipient), netAmount);
        assertEq(usdc.balanceOf(treasury), fee);
        
        // Human pauses agent
        vm.prank(human);
        policy.pause(newAgent);
        
        // Agent can't pay while paused
        vm.prank(newAgent);
        vm.expectRevert();
        router.pay(address(usdc), recipient, 10 * 10**6);
        
        // Human unpauses
        vm.prank(human);
        policy.unpause(newAgent);
        
        // Agent can pay again (small payment - flat fee)
        vm.prank(newAgent);
        router.pay(address(usdc), recipient, 10 * 10**6);
    }
}
