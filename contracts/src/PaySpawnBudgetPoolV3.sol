// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PaySpawnBudgetPoolV3
 * @notice A shared USDC pool that multiple agent credentials can draw from.
 *
 * Flow:
 *   1. Owner deposits USDC → pool holds funds
 *   2. Owner registers agent credential hashes (keccak256 of the permission struct)
 *   3. When agent calls /api/pool/pay, relayer calls pool.pay(credentialHash, to, amount)
 *   4. Pool checks per-agent daily limit → transfers USDC directly to recipient
 *   5. When pool balance hits zero, all agents stop automatically
 *
 * Level 2 (autonomous): orchestrator agent calls /api/pool/create with its credential.
 *   The relayer creates the pool on-chain, funds it from the orchestrator's wallet,
 *   and returns sub-agent credentials — no human in the loop.
 */
contract PaySpawnBudgetPoolV3 {
    using SafeERC20 for IERC20;

    // ── Constants ────────────────────────────────────────────
    address public constant USDC        = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // ── State ────────────────────────────────────────────────
    address public owner;
    address public relayer;
    uint256 public perAgentDailyLimit;   // USDC amount (6 decimals) each agent can spend per day
    bool    public active;

    // credentialHash => registered
    mapping(bytes32 => bool) public registeredAgents;

    // credentialHash => UTC-day-number => amount spent that day
    mapping(bytes32 => mapping(uint256 => uint256)) public dailySpent;

    // ── Events ───────────────────────────────────────────────
    event Deposited(uint256 amount, uint256 newBalance);
    event Drained(address indexed to, uint256 amount);
    event AgentAdded(bytes32 indexed credentialHash);
    event AgentRemoved(bytes32 indexed credentialHash);
    event AgentPayment(bytes32 indexed credentialHash, address indexed to, uint256 amount, uint256 day);

    // ── Errors ───────────────────────────────────────────────
    error NotOwner();
    error NotRelayer();
    error NotActive();
    error AgentNotRegistered();
    error ExceedsAgentDailyLimit();
    error InsufficientPoolBalance();
    error ZeroAmount();
    error InvalidAddress();

    // ── Modifiers ────────────────────────────────────────────
    modifier onlyOwner()          { if (msg.sender != owner)                          revert NotOwner();   _; }
    modifier onlyRelayer()        { if (msg.sender != relayer)                        revert NotRelayer(); _; }
    modifier onlyOwnerOrRelayer() { if (msg.sender != owner && msg.sender != relayer) revert NotOwner();   _; }
    modifier whenActive()         { if (!active)                                      revert NotActive();  _; }

    // ── Constructor ──────────────────────────────────────────
    constructor(address _owner, address _relayer, uint256 _perAgentDailyLimit) {
        if (_owner   == address(0)) revert InvalidAddress();
        if (_relayer == address(0)) revert InvalidAddress();
        owner              = _owner;
        relayer            = _relayer;
        perAgentDailyLimit = _perAgentDailyLimit;
        active             = true;
    }

    // ── Funding ──────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the pool.
     * @dev Owner must have approved this contract to spend their USDC first.
     *      V3 holds funds directly and pays recipients via safeTransfer — no V4 dependency.
     */
    function deposit(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        IERC20(USDC).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(amount, IERC20(USDC).balanceOf(address(this)));
    }

    /**
     * @notice Emergency drain — pulls all USDC back to owner and deactivates pool.
     */
    function drain() external onlyOwner {
        active = false;
        uint256 bal = IERC20(USDC).balanceOf(address(this));
        if (bal > 0) IERC20(USDC).safeTransfer(owner, bal);
        emit Drained(owner, bal);
    }

    // ── Agent management ─────────────────────────────────────

    function addAgent(bytes32 credentialHash) external onlyOwnerOrRelayer {
        registeredAgents[credentialHash] = true;
        emit AgentAdded(credentialHash);
    }

    function removeAgent(bytes32 credentialHash) external onlyOwnerOrRelayer {
        registeredAgents[credentialHash] = false;
        emit AgentRemoved(credentialHash);
    }

    function addAgentsBatch(bytes32[] calldata credentialHashes) external onlyOwnerOrRelayer {
        for (uint256 i = 0; i < credentialHashes.length; i++) {
            registeredAgents[credentialHashes[i]] = true;
            emit AgentAdded(credentialHashes[i]);
        }
    }

    // ── Payments ─────────────────────────────────────────────

    /**
     * @notice Execute a payment on behalf of a registered agent.
     * @dev Only the relayer can call this. Per-agent and pool-level limits are enforced.
     * @param credentialHash  keccak256(abi.encode(permission)) — identifies the agent
     * @param to              USDC recipient
     * @param amount          Amount in USDC (6 decimals) — does NOT include fees (currently 0)
     */
    function pay(
        bytes32 credentialHash,
        address to,
        uint256 amount
    ) external onlyRelayer whenActive {
        if (to     == address(0)) revert InvalidAddress();
        if (amount == 0)          revert ZeroAmount();
        if (!registeredAgents[credentialHash]) revert AgentNotRegistered();

        // Per-agent daily limit check
        uint256 today = block.timestamp / 1 days;
        uint256 used  = dailySpent[credentialHash][today];
        if (used + amount > perAgentDailyLimit) revert ExceedsAgentDailyLimit();

        // Pool balance check
        if (IERC20(USDC).balanceOf(address(this)) < amount) revert InsufficientPoolBalance();

        // Update state before external call (reentrancy protection)
        dailySpent[credentialHash][today] = used + amount;

        // Direct transfer — no intermediate contract, no external approval needed
        IERC20(USDC).safeTransfer(to, amount);

        emit AgentPayment(credentialHash, to, amount, today);
    }

    // ── Views ────────────────────────────────────────────────

    function balance() external view returns (uint256) {
        return IERC20(USDC).balanceOf(address(this));
    }

    function agentDailyUsed(bytes32 credentialHash) external view returns (uint256) {
        return dailySpent[credentialHash][block.timestamp / 1 days];
    }

    function agentDailyRemaining(bytes32 credentialHash) external view returns (uint256) {
        uint256 used = dailySpent[credentialHash][block.timestamp / 1 days];
        if (used >= perAgentDailyLimit) return 0;
        return perAgentDailyLimit - used;
    }

    function canSpend(bytes32 credentialHash, uint256 amount) external view returns (bool) {
        if (!active)                           return false;
        if (!registeredAgents[credentialHash]) return false;
        uint256 used = dailySpent[credentialHash][block.timestamp / 1 days];
        if (used + amount > perAgentDailyLimit)                    return false;
        if (IERC20(USDC).balanceOf(address(this)) < amount)        return false;
        return true;
    }

    // ── Admin ────────────────────────────────────────────────

    function setPerAgentDailyLimit(uint256 _limit) external onlyOwner {
        perAgentDailyLimit = _limit;
    }

    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

    function setRelayer(address _relayer) external onlyOwner {
        if (_relayer == address(0)) revert InvalidAddress();
        relayer = _relayer;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        owner = newOwner;
    }
}
