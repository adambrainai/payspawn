// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaySpawnSpenderV3} from "../src/PaySpawnSpenderV3.sol";

contract DeploySpenderV3 is Script {
    // Relayer address = fee collector
    address constant FEE_COLLECTOR = 0xd983B335e8590e31b460e25c4530219fE085Fa76;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        PaySpawnSpenderV3 spender = new PaySpawnSpenderV3(FEE_COLLECTOR);
        console.log("PaySpawnSpenderV3 deployed at:", address(spender));
        console.log("Fee collector:", FEE_COLLECTOR);

        vm.stopBroadcast();
    }
}
