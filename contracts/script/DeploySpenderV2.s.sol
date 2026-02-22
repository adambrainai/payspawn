// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaySpawnSpenderV2} from "../src/PaySpawnSpenderV2.sol";

contract DeploySpenderV2 is Script {
    // Fee collector (same as before)
    address constant FEE_COLLECTOR = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        PaySpawnSpenderV2 spender = new PaySpawnSpenderV2(FEE_COLLECTOR);
        
        console.log("PaySpawnSpenderV2 deployed at:", address(spender));
        
        vm.stopBroadcast();
    }
}
