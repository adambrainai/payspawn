// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PaySpawnBudgetPoolFactoryV3} from "../src/PaySpawnBudgetPoolFactoryV3.sol";

contract DeployBudgetPoolV3 is Script {
    address constant RELAYER = 0xd983B335e8590e31b460e25c4530219fE085Fa76;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PaySpawnBudgetPoolFactoryV3 factory = new PaySpawnBudgetPoolFactoryV3();
        console.log("PaySpawnBudgetPoolFactoryV3:", address(factory));
        vm.stopBroadcast();
    }
}
