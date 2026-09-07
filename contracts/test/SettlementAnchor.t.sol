// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SettlementAnchor} from "../src/SettlementAnchor.sol";

contract SettlementAnchorTest is Test {
    SettlementAnchor anchor;
    address recorder = address(0xBEEF);

    function setUp() public {
        anchor = new SettlementAnchor(recorder);
    }

    /// The event shape must be identical regardless of caller/issuer — that
    /// uniformity is exactly what lets one subgraph mapping handle every
    /// issuer without special-casing. Fuzzed over issuer address, bondId,
    /// kind, onTime and the hcsTxId string.
    function testFuzz_LifecycleEvent_ShapeIsIdenticalAcrossIssuers(
        bytes32 bondId,
        address issuer,
        uint8 kindRaw,
        bool onTime,
        string calldata hcsTxId
    ) public {
        SettlementAnchor.EventKind kind = SettlementAnchor.EventKind(kindRaw % 5);

        vm.expectEmit(true, true, false, true);
        emit SettlementAnchor.LifecycleEvent(bondId, issuer, kind, block.timestamp, onTime, hcsTxId);

        vm.prank(recorder);
        anchor.anchor(bondId, issuer, kind, onTime, hcsTxId);
    }

    function test_OnlyRecorder_CanAnchor() public {
        vm.expectRevert(SettlementAnchor.NotRecorder.selector);
        vm.prank(address(0xBAD));
        anchor.anchor(bytes32(0), address(this), SettlementAnchor.EventKind.Issued, false, "");
    }

    function test_Recorder_IsImmutableAndSetAtConstruction() public view {
        assertEq(anchor.recorder(), recorder);
    }
}
