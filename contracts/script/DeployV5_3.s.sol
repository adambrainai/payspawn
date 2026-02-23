// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {PaySpawnSpenderV5_3} from "../src/PaySpawnSpenderV5_3.sol";

contract DeployV5_3 is Script {
    address constant RELAYER       = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    address constant FEE_COLLECTOR = 0xcb3216d1DFf5d648849c784581c4934ea8f9b7b2;

    // feeRateBps = 0 (no %), minFee = 5000 ($0.005 USDC — 6 decimals)
    uint256 constant FEE_RATE_BPS = 0;
    uint256 constant MIN_FEE      = 5000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PaySpawnSpenderV5_3 v5_3 = new PaySpawnSpenderV5_3(
            FEE_COLLECTOR,
            RELAYER,
            FEE_RATE_BPS,
            MIN_FEE
        );
        console.log("PaySpawnSpenderV5_3:", address(v5_3));
        console.log("feeRateBps:", v5_3.feeRateBps());
        console.log("minFee:", v5_3.minFee());
        vm.stopBroadcast();
    }
}
