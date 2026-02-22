// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaySpawnPolicy
 * @notice On-chain spending policies for AI agent wallets
 * @dev Verifiable, non-custodial spending limits with human override
 */
contract PaySpawnPolicy {
    struct Policy {
        address human;           // Owner who controls the agent
        address agent;           // Agent wallet address
        uint256 dailyLimit;      // Max spend per day (in wei)
        uint256 perTxLimit;      // Max spend per transaction
        uint256 dailySpent;      // Spent today
        uint256 lastResetDay;    // Day number of last reset
        bool paused;             // Emergency stop
    }
    
    mapping(address => Policy) public policies;
    
    event PolicyCreated(address indexed agent, address indexed human, uint256 dailyLimit, uint256 perTxLimit);
    event PolicyUpdated(address indexed agent, uint256 dailyLimit, uint256 perTxLimit);
    event AgentPaused(address indexed agent, address indexed human);
    event AgentUnpaused(address indexed agent, address indexed human);
    event TransactionValidated(address indexed agent, uint256 amount, uint256 dailySpent);
    
    error NotAuthorized();
    error PolicyAlreadyExists();
    error PolicyDoesNotExist();
    error AgentPausedError();
    error ExceedsPerTxLimit(uint256 amount, uint256 limit);
    error ExceedsDailyLimit(uint256 amount, uint256 remaining);
    
    modifier onlyHuman(address agent) {
        if (msg.sender != policies[agent].human) revert NotAuthorized();
        _;
    }
    
    modifier policyExists(address agent) {
        if (policies[agent].human == address(0)) revert PolicyDoesNotExist();
        _;
    }
    
    /**
     * @notice Create a new spending policy for an agent wallet
     * @param agent The agent wallet address
     * @param dailyLimit Maximum amount the agent can spend per day (in wei)
     * @param perTxLimit Maximum amount per transaction (in wei)
     */
    function createPolicy(
        address agent,
        uint256 dailyLimit,
        uint256 perTxLimit
    ) external {
        if (policies[agent].human != address(0)) revert PolicyAlreadyExists();
        
        policies[agent] = Policy({
            human: msg.sender,
            agent: agent,
            dailyLimit: dailyLimit,
            perTxLimit: perTxLimit,
            dailySpent: 0,
            lastResetDay: block.timestamp / 1 days,
            paused: false
        });
        
        emit PolicyCreated(agent, msg.sender, dailyLimit, perTxLimit);
    }
    
    /**
     * @notice Validate a transaction against the agent's policy
     * @dev Updates dailySpent - should only be called by trusted routers
     * @param agent The agent wallet address
     * @param amount The transaction amount in wei
     * @return success True if transaction is allowed
     */
    function validateTransaction(address agent, uint256 amount) 
        external 
        policyExists(agent) 
        returns (bool success) 
    {
        Policy storage policy = policies[agent];
        
        if (policy.paused) revert AgentPausedError();
        if (amount > policy.perTxLimit) revert ExceedsPerTxLimit(amount, policy.perTxLimit);
        
        // Reset daily spent if new day
        uint256 today = block.timestamp / 1 days;
        if (today > policy.lastResetDay) {
            policy.dailySpent = 0;
            policy.lastResetDay = today;
        }
        
        uint256 remaining = policy.dailyLimit - policy.dailySpent;
        if (amount > remaining) revert ExceedsDailyLimit(amount, remaining);
        
        policy.dailySpent += amount;
        
        emit TransactionValidated(agent, amount, policy.dailySpent);
        return true;
    }
    
    /**
     * @notice Emergency pause - stops all agent transactions
     * @param agent The agent wallet address
     */
    function pause(address agent) external onlyHuman(agent) {
        policies[agent].paused = true;
        emit AgentPaused(agent, msg.sender);
    }
    
    /**
     * @notice Resume agent operations after pause
     * @param agent The agent wallet address
     */
    function unpause(address agent) external onlyHuman(agent) {
        policies[agent].paused = false;
        emit AgentUnpaused(agent, msg.sender);
    }
    
    /**
     * @notice Update spending limits
     * @param agent The agent wallet address
     * @param newDailyLimit New daily spending limit
     * @param newPerTxLimit New per-transaction limit
     */
    function updateLimits(
        address agent,
        uint256 newDailyLimit,
        uint256 newPerTxLimit
    ) external onlyHuman(agent) {
        policies[agent].dailyLimit = newDailyLimit;
        policies[agent].perTxLimit = newPerTxLimit;
        emit PolicyUpdated(agent, newDailyLimit, newPerTxLimit);
    }
    
    /**
     * @notice Transfer human ownership to a new address
     * @param agent The agent wallet address
     * @param newHuman The new human owner address
     */
    function transferOwnership(address agent, address newHuman) external onlyHuman(agent) {
        policies[agent].human = newHuman;
    }
    
    /**
     * @notice Get the full policy for an agent
     * @param agent The agent wallet address
     * @return The policy struct
     */
    function getPolicy(address agent) external view returns (Policy memory) {
        return policies[agent];
    }
    
    /**
     * @notice Get remaining daily allowance for an agent
     * @param agent The agent wallet address
     * @return remaining The amount still available today
     */
    function getRemainingDaily(address agent) external view returns (uint256 remaining) {
        Policy memory policy = policies[agent];
        
        // Check if we're on a new day
        uint256 today = block.timestamp / 1 days;
        if (today > policy.lastResetDay) {
            return policy.dailyLimit;
        }
        
        return policy.dailyLimit - policy.dailySpent;
    }
    
    /**
     * @notice Check if agent can spend a given amount
     * @param agent The agent wallet address
     * @param amount The amount to check
     * @return canSpend True if the amount can be spent
     */
    function canSpend(address agent, uint256 amount) external view returns (bool canSpend) {
        Policy memory policy = policies[agent];
        
        if (policy.human == address(0)) return false;
        if (policy.paused) return false;
        if (amount > policy.perTxLimit) return false;
        
        uint256 today = block.timestamp / 1 days;
        uint256 dailySpent = (today > policy.lastResetDay) ? 0 : policy.dailySpent;
        
        return (dailySpent + amount) <= policy.dailyLimit;
    }
}
