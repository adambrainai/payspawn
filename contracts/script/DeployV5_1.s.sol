// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaySpawnSpenderV5_1} from "../src/PaySpawnSpenderV5_1.sol";

contract DeployV5_1 is Script {
    address constant RELAYER       = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    address constant FEE_COLLECTOR = 0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        PaySpawnSpenderV5_1 v5_1 = new PaySpawnSpenderV5_1(FEE_COLLECTOR, RELAYER);

        console.log("PaySpawnSpenderV5_1 deployed at:", address(v5_1));
        console.log("Owner:         ", v5_1.owner());
        console.log("Relayer:       ", v5_1.relayer());
        console.log("FeeCollector:  ", v5_1.feeCollector());
        console.log("FeeRateBps:    ", v5_1.feeRateBps());
        console.log("MinFee:        ", v5_1.minFee());

        vm.stopBroadcast();
    }
}
