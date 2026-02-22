// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {PaySpawnSpender} from "../src/PaySpawnSpender.sol";

contract DeploySpender is Script {
    // PaySpawn treasury (relayer wallet)
    address constant FEE_COLLECTOR = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        PaySpawnSpender spender = new PaySpawnSpender(FEE_COLLECTOR);
        
        console2.log("PaySpawnSpender deployed at:", address(spender));
        console2.log("Fee collector:", FEE_COLLECTOR);
        console2.log("Fee rate:", spender.feeRateBps(), "bps (0.1%)");
        console2.log("Min fee:", spender.minFee(), "(0.05 USDC)");
        
        vm.stopBroadcast();
    }
}
