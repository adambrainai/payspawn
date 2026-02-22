// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Script, console} from "forge-std/Script.sol";
import {PaySpawnSpenderV4} from "../src/PaySpawnSpenderV4.sol";
contract DeploySpenderV4 is Script {
    address constant FEE_COLLECTOR = 0xd983B335e8590e31b460e25c4530219fE085Fa76;
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        PaySpawnSpenderV4 spender = new PaySpawnSpenderV4(FEE_COLLECTOR);
        console.log("PaySpawnSpenderV4 deployed at:", address(spender));
        vm.stopBroadcast();
    }
}
