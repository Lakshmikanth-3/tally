// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {UnderwritingRegistry} from "../src/UnderwritingRegistry.sol";

/// @notice Deploys UnderwritingRegistry to Ethereum Sepolia.
///   forge script script/DeployUnderwritingRegistry.s.sol --rpc-url sepolia --broadcast --private-key $SEPOLIA_PRIVATE_KEY
///
/// Defaults to the Sepolia MockKeystoneForwarder, which is what
/// `cre workflow simulate --broadcast` delivers through. Set CRE_FORWARDER to
/// the production KeystoneForwarder (0xF8344CFd5c43616a4366C34E3EEE75af79a74482)
/// for a deployed workflow, or switch later with setForwarder().
/// Addresses: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
contract DeployUnderwritingRegistryScript is Script {
    address constant SEPOLIA_MOCK_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    function run() external {
        address forwarder = vm.envOr("CRE_FORWARDER", SEPOLIA_MOCK_FORWARDER);

        vm.startBroadcast();
        UnderwritingRegistry registry = new UnderwritingRegistry(forwarder);
        vm.stopBroadcast();

        console.log("UnderwritingRegistry deployed at:", address(registry));
        console.log("Forwarder:", forwarder);
    }
}
