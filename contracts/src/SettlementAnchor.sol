// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SettlementAnchor
/// @notice Emits standardized lifecycle events for every Tally-issued bond,
///         independent of the ATS token's own internal accounting, so a
///         single subgraph query pattern works identically across issuers.
contract SettlementAnchor {
    enum EventKind { Issued, Coupon, Resale, Redeemed, Defaulted }

    event LifecycleEvent(
        bytes32 indexed bondId,
        address indexed issuer,
        EventKind kind,
        uint256 timestamp,
        bool onTime, // ignored for Issued/Resale, must still be passed (false)
        string hcsTxId // the corresponding Hedera transaction id, for cross-reference
    );

    address public immutable recorder; // the enforcer/backend address permitted to anchor events

    error NotRecorder();

    constructor(address _recorder) {
        recorder = _recorder;
    }

    modifier onlyRecorder() {
        if (msg.sender != recorder) revert NotRecorder();
        _;
    }

    /// @notice Anchors one lifecycle event. Called by the backend immediately
    /// after a real Hedera-side event (issuance, coupon settlement via
    /// Scheduled Transaction, redemption) has been confirmed — never
    /// speculatively, never before the real event has happened.
    function anchor(
        bytes32 bondId,
        address issuer,
        EventKind kind,
        bool onTime,
        string calldata hcsTxId
    ) external onlyRecorder {
        emit LifecycleEvent(bondId, issuer, kind, block.timestamp, onTime, hcsTxId);
    }
}
