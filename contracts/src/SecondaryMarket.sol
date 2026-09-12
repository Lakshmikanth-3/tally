// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SettlementAnchor} from "./SettlementAnchor.sol";

/// @title SecondaryMarket
/// @notice A minimal resale venue for already-issued Bond tokens. This is
///         the explicitly named gap in ATS today ("a secondary market for
///         ATS-issued assets, which the Studio does not have"). Compliance
///         is enforced by the underlying ATS transfer function reverting on
///         an unverified counterparty — this contract does not duplicate
///         the compliance check, it relies on the token's own transfer
///         restriction being the source of truth.
contract SecondaryMarket {
    struct Order {
        address maker;
        bytes32 bondId;
        address bondToken;
        uint256 priceUSD; // 6-decimal fixed point
        uint256 quantity;
        bool isBid;
        bool filled;
    }

    mapping(bytes32 => Order) public orders;
    uint256 public orderNonce;

    /// @dev Off-chain reference only — the backend recorder reads this to
    /// know which SettlementAnchor to call after observing OrderFilled.
    /// This contract never calls it directly (see fillOrder).
    SettlementAnchor public immutable anchor;

    event OrderPlaced(bytes32 indexed orderId, bytes32 indexed bondId, bool isBid, uint256 priceUSD, uint256 quantity);
    event OrderFilled(bytes32 indexed orderId, address indexed taker);
    event OrderRejected(bytes32 indexed orderId, address indexed taker, string reason);

    constructor(address _anchor) {
        anchor = SettlementAnchor(_anchor);
    }

    function placeOrder(bytes32 bondId, address bondToken, uint256 priceUSD, uint256 quantity, bool isBid)
        external
        returns (bytes32 orderId)
    {
        orderId = keccak256(abi.encode(msg.sender, bondId, orderNonce++));
        orders[orderId] = Order(msg.sender, bondId, bondToken, priceUSD, quantity, isBid, false);
        emit OrderPlaced(orderId, bondId, isBid, priceUSD, quantity);
    }

    /// @notice Fills an order. The ATS bond token's transfer function is the
    /// actual compliance gate — if the recipient is not a verified holder,
    /// the low-level call below reverts, and that revert IS the compliance-
    /// rejection demo moment. This function deliberately does not
    /// pre-validate the recipient itself, so the demo is proving the real
    /// ATS enforcement path, not a UI-side check that could be faked.
    ///
    /// For an ask, the taker (msg.sender) is the new holder, paid out of the
    /// maker's own escrowed balance (see placeOrder's companion deposit step
    /// in the off-chain backend). For a bid, the *maker* — the original
    /// bidder — is the new holder: the taker is the one supplying/escrowing
    /// the unit being sold, so the payout must go to the bid's maker, never
    /// to whoever happens to call fillOrder. Getting this backwards would
    /// let a bid's filler pay out to themselves instead of the real buyer.
    ///
    /// @dev Does not call `anchor` directly: SettlementAnchor's recorder
    /// gate authorizes only the off-chain backend, which anchors the Resale
    /// event after observing OrderFilled — the same confirm-then-anchor
    /// path used for every other lifecycle event.
    function fillOrder(bytes32 orderId) external {
        Order storage o = orders[orderId];
        require(!o.filled, "already filled");
        o.filled = true;

        address recipient = o.isBid ? o.maker : msg.sender;

        (bool success, bytes memory data) = o.bondToken.call(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, o.quantity)
        );
        if (!success) {
            o.filled = false; // revert the fill state
            emit OrderRejected(orderId, msg.sender, _decodeRevertReason(data));
            revert("transfer restricted: counterparty not compliant");
        }

        emit OrderFilled(orderId, msg.sender);
    }

    function _decodeRevertReason(bytes memory data) private pure returns (string memory) {
        if (data.length < 68) return "unknown";
        assembly {
            data := add(data, 0x04)
        }
        return abi.decode(data, (string));
    }
}
