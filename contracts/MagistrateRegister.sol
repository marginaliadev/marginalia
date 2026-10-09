// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title The Magistrate's Register (Association Set Provider root registry)
/// @notice Holds the Merkle root of approved deposit labels. The off-chain Magistrate
///         service screens each deposit, rebuilds the label tree and publishes its root here.
///         Withdrawals must prove their label is in one of the last 16 published roots.
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
    mapping(uint256 => bool) public approvedLabels;
    mapping(uint256 => bool) public revokedLabels;
    /// @dev Pools allowed to revoke labels (on ragequit). Set by the owner.
    mapping(address => bool) public isPool;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MagistrateChanged(address indexed previous, address indexed current);
    event RootPublished(uint256 indexed root, uint256 indexed index, string data);
    event LabelApproved(uint256 indexed label);
    event LabelRevoked(uint256 indexed label);
    event PoolAuthorised(address indexed pool, bool allowed);

    error NotOwner();
    error NotMagistrate();
    error ZeroRoot();
    error ZeroAddress();
    error NotAuthorised();

    constructor(address _magistrate) {
        if (_magistrate == address(0)) revert ZeroAddress();
        owner = msg.sender;
        magistrate = _magistrate;
        emit OwnershipTransferred(address(0), msg.sender);
        emit MagistrateChanged(address(0), _magistrate);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setMagistrate(address _magistrate) external {
        if (msg.sender != owner) revert NotOwner();
        if (_magistrate == address(0)) revert ZeroAddress();
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

    function isApproved(uint256 label) external view returns (bool) {
        return approvedLabels[label] && !revokedLabels[label];
    }

    function isRevoked(uint256 label) external view returns (bool) {
        return revokedLabels[label];
    }

    function approveLabels(uint256[] calldata labels) external {
        if (msg.sender != magistrate) revert NotMagistrate();
        for (uint256 i = 0; i < labels.length; i++) {
            if (!revokedLabels[labels[i]]) {
                approvedLabels[labels[i]] = true;
                emit LabelApproved(labels[i]);
            }
        }
    }

    function setPool(address pool, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        if (pool == address(0)) revert ZeroAddress();
        isPool[pool] = allowed;
        emit PoolAuthorised(pool, allowed);
    }

    /// @notice Bookkeeping: marks a label as revoked so the Magistrate never approves it again.
    /// @dev    NOT a safety mechanism for funds (the contract cannot inspect ASP root contents,
    ///         and withdraw never sees the label). Double-spend safety comes solely from the
    ///         nullifier burnt by the ZK ragequit. Restricted to authorised pools / magistrate.
    function markRevoked(uint256 label) external {
        if (msg.sender != magistrate && !isPool[msg.sender]) revert NotAuthorised();
        revokedLabels[label] = true;
        approvedLabels[label] = false;
        emit LabelRevoked(label);
    }

    function publishRoot(uint256 root, string calldata data) public {
        if (msg.sender != magistrate) revert NotMagistrate();
        if (root == 0) revert ZeroRoot();
        latestRoot = root;
        roots[currentRootIndex] = root;
        currentRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        rootData[root] = data;
        emit RootPublished(root, rootCount++, data);
    }

    function publishRoot(uint256 root, string calldata data, uint256[] calldata labels) external {
        publishRoot(root, data);
        for (uint256 i = 0; i < labels.length; i++) {
            if (!revokedLabels[labels[i]]) {
                approvedLabels[labels[i]] = true;
                emit LabelApproved(labels[i]);
            }
        }
    }
}
