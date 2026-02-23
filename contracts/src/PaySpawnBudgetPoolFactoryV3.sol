// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PaySpawnBudgetPoolV3} from "./PaySpawnBudgetPoolV3.sol";

/**
 * @title PaySpawnBudgetPoolFactoryV3
 * @notice Creates PaySpawnBudgetPool instances.
 *
 * Level 1: Human calls createPool() directly (dashboard flow).
 * Level 2: Relayer calls createPoolForAgent() on behalf of an orchestrator
 *          agent credential — no human wallet interaction required.
 */
contract PaySpawnBudgetPoolFactoryV3 {
    address public constant RELAYER = 0xd983B335e8590e31b460e25c4530219fE085Fa76;

    event PoolCreated(
        address indexed pool,
        address indexed owner,
        uint256 perAgentDailyLimit,
        bool autonomous
    );

    error NotRelayer();

    // ── Level 1: Human creates pool via dashboard ─────────────────────

    /**
     * @notice Deploy a new budget pool owned by msg.sender.
     * @param perAgentDailyLimit  Max USDC each agent can spend per 24h period (6 decimals)
     * @return pool  Address of the deployed PaySpawnBudgetPool
     */
    function createPool(uint256 perAgentDailyLimit) external returns (address pool) {
        pool = address(new PaySpawnBudgetPoolV3(msg.sender, RELAYER, perAgentDailyLimit));
        emit PoolCreated(pool, msg.sender, perAgentDailyLimit, false);
    }

    // ── Level 2: Relayer creates pool for orchestrator agent ──────────

    /**
     * @notice Deploy a pool on behalf of an orchestrator agent credential.
     * @dev Only the relayer can call this. The relayer is trusted to have validated
     *      the orchestrator's credential before calling. Ownership is assigned to
     *      `ownerWallet` (the account in the orchestrator's SpendPermission).
     * @param ownerWallet          The wallet that owns the orchestrator's credential
     * @param perAgentDailyLimit   Per-agent daily USDC limit (6 decimals)
     * @return pool                Address of the new pool
     */
    function createPoolForAgent(
        address ownerWallet,
        uint256 perAgentDailyLimit
    ) external returns (address pool) {
        if (msg.sender != RELAYER) revert NotRelayer();
        pool = address(new PaySpawnBudgetPoolV3(ownerWallet, RELAYER, perAgentDailyLimit));
        emit PoolCreated(pool, ownerWallet, perAgentDailyLimit, true);
    }
}
