// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettlementAnchor} from "../src/SettlementAnchor.sol";
import {SecondaryMarket} from "../src/SecondaryMarket.sol";

/// @notice Deploys SettlementAnchor and SecondaryMarket to Hedera testnet.
/// Run with:
///   forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast --private-key $HEDERA_OPERATOR_EVM_KEY
contract DeployScript is Script {
    function run() external {
        address recorder = vm.envAddress("SETTLEMENT_RECORDER_ADDRESS");

        vm.startBroadcast();

        SettlementAnchor anchor = new SettlementAnchor(recorder);
        SecondaryMarket market = new SecondaryMarket(address(anchor));

        vm.stopBroadcast();

        console.log("SettlementAnchor deployed at:", address(anchor));
        console.log("SecondaryMarket deployed at:", address(market));
    }
}
