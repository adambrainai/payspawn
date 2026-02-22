// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {PaySpawnNames} from "../src/PaySpawnNames.sol";

contract DeployNames is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        PaySpawnNames names = new PaySpawnNames();
        
        console.log("PaySpawnNames deployed to:", address(names));
        
        vm.stopBroadcast();
    }
}
