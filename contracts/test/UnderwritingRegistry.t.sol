// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {UnderwritingRegistry, IReceiver, IERC165} from "../src/UnderwritingRegistry.sol";

contract UnderwritingRegistryTest is Test {
    UnderwritingRegistry registry;
    address forwarder = address(0xF0F0);

    function setUp() public {
        registry = new UnderwritingRegistry(forwarder);
    }

    /// Same encoding the CRE workflow produces in workflow.ts.
    function _report(string memory id, bool approved, uint256 bps, uint8 reason) internal pure returns (bytes memory) {
        return abi.encode(id, approved, bps, reason);
    }

    function test_DecodesAndStoresVerdict() public {
        vm.warp(1_800_000_000);
        vm.prank(forwarder);
        registry.onReport("", _report("issuer-corrados-deli-f5bb20", true, 428, 0));

        UnderwritingRegistry.Verdict memory v = registry.latestVerdict("issuer-corrados-deli-f5bb20");
        assertTrue(v.exists);
        assertTrue(v.approved);
        assertEq(v.couponBps, 428);
        assertEq(v.reasonCode, 0);
        assertEq(v.timestamp, 1_800_000_000);
        assertEq(registry.verdictCount(), 1);
    }

    function test_EmitsUnderwritingVerdict() public {
        vm.expectEmit(false, false, false, true);
        emit UnderwritingRegistry.UnderwritingVerdict("issuer-x", false, 0, 2, block.timestamp);
        vm.prank(forwarder);
        registry.onReport("", _report("issuer-x", false, 0, 2));
    }

    function test_LatestVerdictOverwritesPrevious() public {
        vm.startPrank(forwarder);
        registry.onReport("", _report("issuer-x", false, 0, 2));
        registry.onReport("", _report("issuer-x", true, 500, 0));
        vm.stopPrank();

        UnderwritingRegistry.Verdict memory v = registry.latestVerdict("issuer-x");
        assertTrue(v.approved);
        assertEq(v.couponBps, 500);
        assertEq(registry.verdictCount(), 2);
    }

    function test_UnknownIssuerHasNoVerdict() public view {
        assertFalse(registry.latestVerdict("nobody").exists);
    }

    function testFuzz_RejectsNonForwarder(address caller) public {
        vm.assume(caller != forwarder);
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(UnderwritingRegistry.InvalidSender.selector, caller, forwarder));
        registry.onReport("", _report("issuer-x", true, 1, 0));
    }

    function test_RejectsZeroForwarder() public {
        vm.expectRevert(UnderwritingRegistry.InvalidForwarderAddress.selector);
        new UnderwritingRegistry(address(0));
    }

    function test_OnlyOwnerCanChangeForwarder() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(UnderwritingRegistry.NotOwner.selector);
        registry.setForwarder(address(0x1234));

        registry.setForwarder(address(0x1234));
        assertEq(registry.forwarder(), address(0x1234));

        // old forwarder is now refused
        vm.prank(forwarder);
        vm.expectRevert(abi.encodeWithSelector(UnderwritingRegistry.InvalidSender.selector, forwarder, address(0x1234)));
        registry.onReport("", _report("issuer-x", true, 1, 0));
    }

    function test_SupportsIReceiverViaERC165() public view {
        assertTrue(registry.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(registry.supportsInterface(type(IERC165).interfaceId));
        assertFalse(registry.supportsInterface(0xdeadbeef));
    }

    function test_MalformedReportReverts() public {
        vm.prank(forwarder);
        vm.expectRevert();
        registry.onReport("", hex"1234");
    }
}
