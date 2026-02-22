// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PaySpawnRouterV2} from "../src/PaySpawnRouterV2.sol";

contract DeployRouterV2Script is Script {
    function run() external {
        // Existing Policy contract address (no change needed)
        address policyContract = 0xbD55962D570f4E9843F7300002781aB68F51a09B;
        
        // Treasury address - where fees go
        address treasury = 0x17E4f8FB5937f4Fd556d35b0064Cc2A01cdB96db;
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new Router V2 with existing policy
        PaySpawnRouterV2 router = new PaySpawnRouterV2(policyContract, treasury);
        console2.log("PaySpawnRouterV2 deployed to:", address(router));
        console2.log("Using existing Policy at:", policyContract);
        console2.log("Treasury set to:", treasury);
        
        // Log fee settings
        console2.log("Min fee:", router.minFee(), "($0.05 USDC)");
        console2.log("Fee rate:", router.feeRate(), "basis points (0.1%)");
        
        vm.stopBroadcast();
        
        console2.log("");
        console2.log("=== ROUTER V2 DEPLOYMENT COMPLETE ===");
        console2.log("NEW Router address:", address(router));
        console2.log("");
        console2.log("IMPORTANT: Update these files with new router address:");
        console2.log("  - apps/web/src/app/api/pay/route.ts");
        console2.log("  - apps/web/src/app/api/x402/route.ts");
        console2.log("  - README.md");
        console2.log("  - memory/payspawn-project.md");
        console2.log("");
        console2.log("Users need to re-approve the NEW router for USDC spending!");
    }
}
