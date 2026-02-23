// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PaySpawnSpenderV5_2} from "../src/PaySpawnSpenderV5_2.sol";

contract DeployV5_2 is Script {
    address constant RELAYER       = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    address constant FEE_COLLECTOR = 0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PaySpawnSpenderV5_2 v5_2 = new PaySpawnSpenderV5_2(FEE_COLLECTOR, RELAYER);
        console.log("PaySpawnSpenderV5_2:", address(v5_2));
        vm.stopBroadcast();
    }
}
