// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title The Magistrate's Register (Association Set Provider root registry)
/// @notice Holds the Merkle root of approved deposit labels. The off-chain Magistrate
///         service screens each deposit, rebuilds the label tree and publishes its root here.
///         Withdrawals must prove their label is in the tree with the LATEST root.
contract MagistrateRegister {
    address public owner;
    address public magistrate;

    uint256 public latestRoot;
    uint256 public rootCount;

    uint32 public constant ROOT_HISTORY_SIZE = 16;
    uint256[ROOT_HISTORY_SIZE] public roots;
    uint32 public currentRootIndex;

    /// @dev Optional pointer (IPFS CID / URL) to the full list of approved labels,
    ///      so anyone can rebuild the tree and generate their own Merkle path.
    mapping(uint256 => string) public rootData;

    event MagistrateChanged(address indexed previous, address indexed current);
    event RootPublished(uint256 indexed root, uint256 indexed index, string data);

    error NotOwner();
    error NotMagistrate();
    error ZeroRoot();

    constructor(address _magistrate) {
        owner = msg.sender;
        magistrate = _magistrate;
        emit MagistrateChanged(address(0), _magistrate);
    }

    function setMagistrate(address _magistrate) external {
        if (msg.sender != owner) revert NotOwner();
        emit MagistrateChanged(magistrate, _magistrate);
        magistrate = _magistrate;
    }

    /// @notice Returns true if the root is the latest root or one of the last 16 historical roots.
    function isValidRoot(uint256 root) external view returns (bool) {
        if (root == 0) return false;
        if (root == latestRoot) return true;
        for (uint32 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            if (roots[i] == root) return true;
        }
        return false;
    }

    function publishRoot(uint256 root, string calldata data) external {
        if (msg.sender != magistrate) revert NotMagistrate();
        if (root == 0) revert ZeroRoot();
        latestRoot = root;
        roots[currentRootIndex] = root;
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        rootData[root] = data;
        emit RootPublished(root, rootCount++, data);
    }
}
