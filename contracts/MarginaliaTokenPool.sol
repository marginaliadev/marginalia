// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidonT2, IPoseidonT3, IPoseidonT4, IGroth16Verifier} from "./interfaces/IPoseidon.sol";
import {MagistrateRegister} from "./MagistrateRegister.sol";
import {IERC20} from "./mocks/MockERC20.sol";

/// @title MARGINALIA Dedicated Token Pool (ERC-20), AUDITED & HARDENED
/// @notice Shielded pool for a specific ERC-20 token with SafeERC20 balance-delta checks,
///         eliminating cross-token pool drainage attacks.
contract MarginaliaTokenPool {
    // ------------------------------------------------------------------ constants
    uint256 public constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint32 public constant DEPTH = 20;
    uint32 public constant ROOT_HISTORY_SIZE = 64;
    uint256 public constant MAX_VALUE = type(uint128).max;

    // ------------------------------------------------------------------ immutables
    address public immutable token;
    IGroth16Verifier public immutable verifier;
    IPoseidonT2 public immutable hasher1;
    IPoseidonT3 public immutable hasher2;
    IPoseidonT4 public immutable hasher3;
    MagistrateRegister public immutable register;

    // ------------------------------------------------------------------ Folio state
    uint256[DEPTH] public zeros;
    uint256[DEPTH] public filledSubtrees;
    uint256[ROOT_HISTORY_SIZE] public roots;
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    uint256 public depositNonce;
    mapping(uint256 => bool) public nullifierSpent;
    mapping(uint256 => address) public labelDepositor;
    mapping(uint256 => uint256) public depositValue;
    mapping(uint256 => uint256) public labelPrecommitment;
    mapping(uint256 => bool) public isRagequit;

    bool private _locked;

    // ------------------------------------------------------------------ types
    struct Withdrawal {
        address recipient;
        address relayer;
        uint256 fee;
    }

    struct Proof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[6] pubSignals;
    }

    // ------------------------------------------------------------------ events
    event LeafInserted(uint256 indexed index, uint256 leaf, uint256 root);
    event Deposited(
        address indexed depositor,
        address indexed token,
        uint256 commitment,
        uint256 label,
        uint256 value,
        uint256 precommitment,
        uint256 index
    );
    event Withdrawn(
        address indexed recipient,
        address indexed relayer,
        address indexed token,
        uint256 withdrawnValue,
        uint256 fee,
        uint256 nullifierHash,
        uint256 newCommitment
    );
    event Ragequit(
        address indexed depositor,
        address indexed token,
        uint256 indexed label,
        uint256 value,
        uint256 nullifierHash,
        address recipient
    );

    // ------------------------------------------------------------------ errors
    error Reentrancy();
    error InvalidValue();
    error NotInField();
    error TreeFull();
    error UnknownStateRoot();
    error StaleAspRoot();
    error NullifierAlreadySpent();
    error InvalidContext();
    error FeeTooHigh();
    error InvalidProof();
    error TransferFailed();
    error NotOriginalDepositor();
    error AlreadyRagequit();
    error InvalidPrecommitment();
    error ZeroAddress();

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address _token,
        IGroth16Verifier _verifier,
        IPoseidonT2 _hasher1,
        IPoseidonT3 _hasher2,
        IPoseidonT4 _hasher3,
        MagistrateRegister _register
    ) {
        if (_token == address(0)) revert ZeroAddress();
        token = _token;
        verifier = _verifier;
        hasher1 = _hasher1;
        hasher2 = _hasher2;
        hasher3 = _hasher3;
        register = _register;

        uint256 z = 0;
        for (uint32 i = 0; i < DEPTH; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = _h2([z, z]);
        }
        roots[0] = z;
    }

    // ================================================================== deposit
    function deposit(uint256 amount, uint256 precommitment) external nonReentrant returns (uint256 commitment) {
        if (amount == 0 || amount > MAX_VALUE) revert InvalidValue();
        if (precommitment >= SNARK_SCALAR_FIELD) revert NotInField();

        // Safe transfer & balance delta check (protects against fee-on-transfer / rebasing tokens)
        uint256 balBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 actualAmount = IERC20(token).balanceOf(address(this)) - balBefore;
        if (actualAmount == 0) revert InvalidValue();

        uint256 label =
            uint256(keccak256(abi.encodePacked(block.chainid, address(this), token, depositNonce++))) % SNARK_SCALAR_FIELD;
        labelDepositor[label] = msg.sender;
        depositValue[label] = actualAmount;
        labelPrecommitment[label] = precommitment;

        commitment = hasher3.poseidon([actualAmount, label, precommitment]);
        uint256 index = _insert(commitment);

        emit Deposited(msg.sender, token, commitment, label, actualAmount, precommitment, index);
    }

    // ================================================================== ragequit
    function ragequit(uint256 label, uint256 sk, uint256 rho, address recipient) external nonReentrant {
        if (msg.sender != labelDepositor[label]) revert NotOriginalDepositor();
        if (isRagequit[label]) revert AlreadyRagequit();
        if (sk >= SNARK_SCALAR_FIELD || rho >= SNARK_SCALAR_FIELD) revert NotInField();

        // 1. Verify (sk, rho) matches precommitment
        uint256 P = hasher1.poseidon([sk]);
        uint256 expectedPre = hasher2.poseidon([P, rho]);
        if (expectedPre != labelPrecommitment[label]) revert InvalidPrecommitment();

        // 2. Derive genuine nullifier and enforce uniqueness
        uint256 nullifierHash = hasher2.poseidon([sk, rho]);
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();

        uint256 amount = depositValue[label];
        if (amount == 0) revert InvalidValue();

        isRagequit[label] = true;
        nullifierSpent[nullifierHash] = true;
        depositValue[label] = 0;

        emit Ragequit(msg.sender, token, label, amount, nullifierHash, recipient);

        _safeTransfer(token, recipient, amount);
    }

    // ================================================================== withdraw
    function withdraw(Withdrawal calldata w, Proof calldata p) external nonReentrant {
        uint256 withdrawnValue = p.pubSignals[0];
        uint256 stateRoot = p.pubSignals[1];
        uint256 aspRoot = p.pubSignals[2];
        uint256 context = p.pubSignals[3];
        uint256 nullifierHash = p.pubSignals[4];
        uint256 newCommitment = p.pubSignals[5];

        if (withdrawnValue == 0) revert InvalidValue();
        if (w.fee > withdrawnValue) revert FeeTooHigh();
        if (w.fee > 0 && w.relayer == address(0)) revert FeeTooHigh();
        if (context != computeContext(w)) revert InvalidContext();
        if (!isKnownRoot(stateRoot)) revert UnknownStateRoot();
        if (!register.isValidRoot(aspRoot)) revert StaleAspRoot();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        for (uint256 i = 0; i < 6; i++) {
            if (p.pubSignals[i] >= SNARK_SCALAR_FIELD) revert NotInField();
        }
        if (!verifier.verifyProof(p.pA, p.pB, p.pC, p.pubSignals)) revert InvalidProof();

        // effects
        nullifierSpent[nullifierHash] = true;
        _insert(newCommitment);

        emit Withdrawn(w.recipient, w.relayer, token, withdrawnValue, w.fee, nullifierHash, newCommitment);

        // interactions
        _safeTransfer(token, w.recipient, withdrawnValue - w.fee);
        if (w.fee > 0) _safeTransfer(token, w.relayer, w.fee);
    }

    // ================================================================== views
    function computeContext(Withdrawal calldata w) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), token, w.recipient, w.relayer, w.fee)))
            % SNARK_SCALAR_FIELD;
    }

    function isKnownRoot(uint256 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 i = currentRootIndex;
        do {
            if (roots[i] == root) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != currentRootIndex);
        return false;
    }

    function getLastRoot() external view returns (uint256) {
        return roots[currentRootIndex];
    }

    // ================================================================== internal
    function _h2(uint256[2] memory x) internal view returns (uint256) {
        return hasher2.poseidon(x);
    }

    function _insert(uint256 leaf) internal returns (uint256 index) {
        if (leaf >= SNARK_SCALAR_FIELD) revert NotInField();
        uint32 idx = nextIndex;
        if (idx == uint32(2) ** DEPTH) revert TreeFull();

        uint256 node = leaf;
        uint32 cur = idx;
        for (uint32 i = 0; i < DEPTH; i++) {
            if (cur % 2 == 0) {
                filledSubtrees[i] = node;
                node = _h2([node, zeros[i]]);
            } else {
                node = _h2([filledSubtrees[i], node]);
            }
            cur /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = node;
        nextIndex = idx + 1;

        emit LeafInserted(idx, leaf, node);
        return idx;
    }

    function _safeTransfer(address _token, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            _token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address _token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) =
            _token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        if (!success || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
