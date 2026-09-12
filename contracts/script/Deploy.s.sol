// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SettlementAnchor} from "../src/SettlementAnchor.sol";
import {SecondaryMarket} from "../src/SecondaryMarket.sol";

/// @notice Deploys SettlementAnchor and SecondaryMarket to Hedera testnet.
/// Documented run command (may not work — see below):
///   forge script script/Deploy.s.sol --rpc-url hedera_testnet --broadcast --private-key $HEDERA_OPERATOR_EVM_KEY
///
/// [VERIFIED via a real failed attempt, then a real successful workaround]
/// `forge script --broadcast` fails against Hashio's JSON-RPC relay
/// (https://testnet.hashio.io/api) with "Invalid parameter 1: ... Expected
/// 0x prefixed hexadecimal block number" before any user code runs — Hashio
/// rejects the batched JSON-RPC array `forge script`'s pre-flight sends, the
/// same batching limitation this repo already works around elsewhere for
/// `eth_getLogs` (see apps/console/lib/secondary-market.ts's batchMaxCount:
/// 1). Foundry has no equivalent flag for `forge script`. The real, verified
/// workaround is `forge create` per contract instead, which doesn't batch:
///   forge create src/SettlementAnchor.sol:SettlementAnchor --rpc-url hedera_testnet --private-key $KEY --legacy --constructor-args <recorder address>
///   forge create src/SecondaryMarket.sol:SecondaryMarket --rpc-url hedera_testnet --private-key $KEY --legacy --constructor-args <SettlementAnchor address>
/// See FEEDBACK/HEDERA.md for the full writeup.
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
