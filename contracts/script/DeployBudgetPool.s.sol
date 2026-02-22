// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PaySpawnBudgetPoolFactory} from "../src/PaySpawnBudgetPoolFactory.sol";

contract DeployBudgetPool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        PaySpawnBudgetPoolFactory factory = new PaySpawnBudgetPoolFactory();
        console.log("PaySpawnBudgetPoolFactory deployed:", address(factory));

        vm.stopBroadcast();
    }
}
