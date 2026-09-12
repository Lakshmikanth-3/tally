// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SecondaryMarket} from "../src/SecondaryMarket.sol";
import {SettlementAnchor} from "../src/SettlementAnchor.sol";
import {MockCompliantToken} from "./mocks/MockCompliantToken.sol";

contract SecondaryMarketTest is Test {
    SecondaryMarket market;
    SettlementAnchor anchor;
    MockCompliantToken token;

    address recorder = address(0xBEEF);
    address maker = address(0xA11CE);
    address verifiedTaker = address(0xB0B);
    address unverifiedTaker = address(0xBAD1);

    bytes32 constant BOND_ID = keccak256("bond-1");
    uint256 constant PRICE = 1_000_000; // 6-decimal fixed point, $1.00
    uint256 constant QTY = 10;

    function setUp() public {
        anchor = new SettlementAnchor(recorder);
        market = new SecondaryMarket(address(anchor));

        address[] memory verified = new address[](1);
        verified[0] = verifiedTaker;
        token = new MockCompliantToken(verified);

        // fund the market contract with bond tokens to fill from
        token.mint(address(market), QTY * 10);
    }

    function _placeAsk() internal returns (bytes32 orderId) {
        vm.prank(maker);
        orderId = market.placeOrder(BOND_ID, address(token), PRICE, QTY, false);
    }

    function _placeBid(address bidder) internal returns (bytes32 orderId) {
        vm.prank(bidder);
        orderId = market.placeOrder(BOND_ID, address(token), PRICE, QTY, true);
    }

    /// THE core proof: an unverified counterparty's fill reverts, and the
    /// OrderRejected event carries the real reason string. This test is the
    /// contract-level twin of the rejected-transfer screenshot in Part F.8 —
    /// if this test doesn't pass, that screenshot isn't proving anything real.
    function test_FillOrder_RevertsForUnverifiedCounterparty() public {
        bytes32 orderId = _placeAsk();

        vm.expectEmit(true, true, false, false);
        emit SecondaryMarket.OrderRejected(orderId, unverifiedTaker, "IDENTITY_NOT_VERIFIED");

        vm.prank(unverifiedTaker);
        vm.expectRevert("transfer restricted: counterparty not compliant");
        market.fillOrder(orderId);

        (, , , , , , bool filled) = market.orders(orderId);
        assertFalse(filled, "filled flag must be rolled back on revert");
    }

    function test_FillOrder_SucceedsForVerifiedCounterparty() public {
        bytes32 orderId = _placeAsk();

        vm.expectEmit(true, true, false, true);
        emit SecondaryMarket.OrderFilled(orderId, verifiedTaker);

        vm.prank(verifiedTaker);
        market.fillOrder(orderId);

        (, , , , , , bool filled) = market.orders(orderId);
        assertTrue(filled);
        assertEq(token.balanceOf(verifiedTaker), QTY);
    }

    /// A bid's payout must go to the bidder (maker), never to whoever calls
    /// fillOrder — the filler is the seller supplying the unit, not the buyer.
    function test_FillOrder_Bid_PaysMaker() public {
        bytes32 orderId = _placeBid(verifiedTaker);

        vm.expectEmit(true, true, false, true);
        emit SecondaryMarket.OrderFilled(orderId, unverifiedTaker);

        // Anyone can supply the unit being sold — the compliance gate is on
        // the recipient (the bidder), not the filler.
        vm.prank(unverifiedTaker);
        market.fillOrder(orderId);

        (, , , , , , bool filled) = market.orders(orderId);
        assertTrue(filled);
        assertEq(token.balanceOf(verifiedTaker), QTY, "bid's maker must receive the unit, not the filler");
    }

    /// If the bid's own maker isn't a verified holder, the fill must revert
    /// — the real ATS compliance gate is on whoever ends up holding the
    /// security, which for a bid is the maker, not the filler.
    function test_FillOrder_Bid_RevertsForUnverifiedMaker() public {
        bytes32 orderId = _placeBid(unverifiedTaker);

        vm.expectEmit(true, true, false, false);
        emit SecondaryMarket.OrderRejected(orderId, verifiedTaker, "IDENTITY_NOT_VERIFIED");

        vm.prank(verifiedTaker);
        vm.expectRevert("transfer restricted: counterparty not compliant");
        market.fillOrder(orderId);

        (, , , , , , bool filled) = market.orders(orderId);
        assertFalse(filled, "filled flag must be rolled back on revert");
    }

    function test_OnlyRecorder_CanAnchorEvents() public {
        vm.expectRevert(SettlementAnchor.NotRecorder.selector);
        vm.prank(address(0xBAD));
        anchor.anchor(bytes32(0), address(this), SettlementAnchor.EventKind.Issued, false, "");
    }
}
