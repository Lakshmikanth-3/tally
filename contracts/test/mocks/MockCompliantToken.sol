// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test-only double mirroring ATS's identity-registry transfer gate:
///         `transfer()` reverts with "IDENTITY_NOT_VERIFIED" for any address
///         not in the verified set. Used only inside forge tests to prove
///         SecondaryMarket.fillOrder correctly surfaces a real compliance
///         revert — this file never ships to any deployed environment.
contract MockCompliantToken {
    mapping(address => bool) public verified;
    mapping(address => uint256) public balanceOf;

    constructor(address[] memory verifiedHolders) {
        for (uint256 i = 0; i < verifiedHolders.length; i++) {
            verified[verifiedHolders[i]] = true;
        }
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(verified[to], "IDENTITY_NOT_VERIFIED");
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
