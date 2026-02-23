// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaySpawnSpenderV5} from "../src/PaySpawnSpenderV5.sol";

/**
 * @title DeployV5
 * @notice Deploys PaySpawnSpenderV5 to Base mainnet.
 *
 * Usage:
 *   forge script contracts/script/DeployV5.s.sol \
 *     --rpc-url $BASE_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     --broadcast \
 *     --verify \
 *     --etherscan-api-key $BASESCAN_API_KEY
 *
 * Env vars required:
 *   BASE_RPC_URL         — Alchemy/Infura Base mainnet RPC
 *   DEPLOYER_PRIVATE_KEY — Deployer wallet private key
 *   FEE_COLLECTOR        — Fee collector address (can be deployer for now)
 *   RELAYER_ADDRESS      — PaySpawn relayer: 0xd983B335e8590e31b460e25c4530219fE085Fa76
 *   BASESCAN_API_KEY     — For contract verification
 */
contract DeployV5 is Script {
    // PaySpawn relayer (unchanged from V4)
    address constant RELAYER = 0xd983B335e8590e31b460e25c4530219fE085Fa76;

    function run() external {
        address feeCollector = vm.envOr("FEE_COLLECTOR", RELAYER);
        address relayer      = vm.envOr("RELAYER_ADDRESS", RELAYER);

        vm.startBroadcast();

        PaySpawnSpenderV5 v5 = new PaySpawnSpenderV5(feeCollector, relayer);

        // Confirm zero fees (should already be default, but explicit is better)
        v5.setFeeRate(0);
        v5.setMinFee(0);

        vm.stopBroadcast();

        console.log("===========================================");
        console.log("PaySpawnSpenderV5 deployed:");
        console.log("  Address:      ", address(v5));
        console.log("  Owner:        ", v5.owner());
        console.log("  Relayer:      ", v5.relayer());
        console.log("  FeeCollector: ", v5.feeCollector());
        console.log("  FeeRate:      ", v5.feeRateBps());
        console.log("  MinFee:       ", v5.minFee());
        console.log("===========================================");
        console.log("Next steps:");
        console.log("  1. Set PAYSPAWN_SPENDER_V5 in Vercel env vars");
        console.log("  2. Add RECEIPT_SIGNING_KEY to Vercel env vars");
        console.log("  3. Verify on Sourcify + Blockscout if Basescan auto-verify fails");
        console.log("  4. Update SDK with V5 contract address constant");
    }
}
