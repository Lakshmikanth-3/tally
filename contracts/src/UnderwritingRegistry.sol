// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chainlink CRE receiver interface, as published in
/// smartcontractkit/cre-templates (contracts/cre/src/v1/interfaces/IReceiver.sol).
/// Vendored inline to avoid pulling in the Chainlink and OpenZeppelin contract
/// packages for two function signatures.
interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title UnderwritingRegistry
/// @notice On-chain record of Tally's Chainlink CRE underwriting verdicts.
///         The CRE workflow reads a business's revenue off-chain, applies the
///         underwriting policy, and delivers ONLY the verdict here through the
///         Keystone forwarder. Raw revenue figures never reach this contract.
/// @dev Follows the CRE consumer pattern (ReceiverTemplate): onReport is
///      callable only by the configured forwarder, and ERC165 advertises
///      IReceiver so the forwarder will deliver to it.
contract UnderwritingRegistry is IReceiver {
    struct Verdict {
        bool approved;
        uint256 couponBps;
        uint8 reasonCode;
        uint256 timestamp;
        bool exists;
    }

    event UnderwritingVerdict(
        string issuerId,
        bool approved,
        uint256 couponBps,
        uint8 reasonCode,
        uint256 timestamp
    );
    event ForwarderUpdated(address indexed previous, address indexed current);

    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error NotOwner();

    address public immutable owner;
    address public forwarder;

    mapping(string => Verdict) private verdicts;
    uint256 public verdictCount;

    constructor(address _forwarder) {
        if (_forwarder == address(0)) revert InvalidForwarderAddress();
        owner = msg.sender;
        forwarder = _forwarder;
        emit ForwarderUpdated(address(0), _forwarder);
    }

    /// @notice Switches between the simulation MockKeystoneForwarder and the
    /// production KeystoneForwarder without redeploying.
    function setForwarder(address _forwarder) external {
        if (msg.sender != owner) revert NotOwner();
        if (_forwarder == address(0)) revert InvalidForwarderAddress();
        emit ForwarderUpdated(forwarder, _forwarder);
        forwarder = _forwarder;
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert InvalidSender(msg.sender, forwarder);

        (string memory issuerId, bool approved, uint256 couponBps, uint8 reasonCode) =
            abi.decode(report, (string, bool, uint256, uint8));

        verdicts[issuerId] = Verdict(approved, couponBps, reasonCode, block.timestamp, true);
        verdictCount++;

        emit UnderwritingVerdict(issuerId, approved, couponBps, reasonCode, block.timestamp);
    }

    /// @notice Latest verdict for an issuer. `exists` is false if none recorded.
    function latestVerdict(string calldata issuerId) external view returns (Verdict memory) {
        return verdicts[issuerId];
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
