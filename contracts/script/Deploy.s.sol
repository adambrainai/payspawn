// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PaySpawnPolicy} from "../src/PaySpawnPolicy.sol";
import {PaySpawnRouter} from "../src/PaySpawnRouter.sol";

contract DeployScript is Script {
    function run() external {
        // Treasury address - where fees go
        address treasury = 0x17E4f8FB5937f4Fd556d35b0064Cc2A01cdB96db;
        
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy Policy contract first
        PaySpawnPolicy policy = new PaySpawnPolicy();
        console2.log("PaySpawnPolicy deployed to:", address(policy));
        
        // Deploy Router contract with policy address and treasury
        PaySpawnRouter router = new PaySpawnRouter(address(policy), treasury);
        console2.log("PaySpawnRouter deployed to:", address(router));
        console2.log("Treasury set to:", treasury);
        
        // Log fee settings
        console2.log("Flat fee:", router.flatFee(), "(0.20 USDC)");
        console2.log("Fee threshold:", router.feeThreshold(), "(200 USDC)");
        console2.log("Fee rate:", router.feeRate(), "basis points (0.1%)");
        
        vm.stopBroadcast();
        
        console2.log("");
        console2.log("=== DEPLOYMENT COMPLETE ===");
        console2.log("Save these addresses!");
    }
}
