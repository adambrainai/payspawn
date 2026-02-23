// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PaySpawnBudgetPoolFactoryV2} from "../src/PaySpawnBudgetPoolFactoryV2.sol";

contract DeployBudgetPoolV2 is Script {
    address constant RELAYER       = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    address constant FEE_COLLECTOR = 0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PaySpawnBudgetPoolFactoryV2 factory = new PaySpawnBudgetPoolFactoryV2();
        console.log("PaySpawnBudgetPoolFactoryV2:", address(factory));
        vm.stopBroadcast();
    }
}
