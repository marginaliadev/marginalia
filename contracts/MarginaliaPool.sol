// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoseidonT2, IPoseidonT3, IPoseidonT4, IGroth16Verifier, IRagequitVerifier} from "./interfaces/IPoseidon.sol";
import {MagistrateRegister} from "./MagistrateRegister.sol";

/// @title MARGINALIA shielded pool (native ETH), PROTOTYPE, NOT AUDITED
/// @notice Deposit publicly, withdraw privately with a Groth16 proof that:
///         (a) you own a note written in the Folio (commitment tree),
///         (b) the note's label is approved in the Magistrate's Register,
///         (c) its Wax Seal (nullifier) has never been broken,
///         (d) value is conserved, with the remainder re-deposited as a change note.
contract MarginaliaPool {
    // ------------------------------------------------------------------ constants
    uint256 public constant SNARK_SCALAR_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint32 public constant DEPTH = 20;               // 2^20 ~= 1M notes (must match circuit)
    uint32 public constant ROOT_HISTORY_SIZE = 64;
    uint256 public constant MAX_VALUE = type(uint128).max;

    // ------------------------------------------------------------------ immutables
    IGroth16Verifier public immutable verifier;
    IRagequitVerifier public immutable ragequitVerifier;
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
    mapping(uint256 => bool) public nullifierSpent;   // broken Wax Seals
    mapping(uint256 => address) public labelDepositor; // label -> original depositor (for screening)
    mapping(uint256 => uint256) public depositValue;   // label -> deposited value (for ragequit)
    mapping(uint256 => uint256) public labelPrecommitment; // label -> precommitment (for ragequit cryptographic verification)
    mapping(uint256 => bool) public isRagequit;       // label -> ragequit status
    /// @dev Each precommitment may back exactly one deposit. Without this, anyone could deposit dust
    ///      under a victim's (public) precommitment and replay the victim's ragequit proof on their
    ///      own label, burning the victim's nullifier and freezing the victim's note forever.
    mapping(uint256 => bool) public precommitmentUsed;

    // ------------------------------------------------------------------ guarded launch (Phase 4)
    address public guardian;
    address public pendingGuardian;
    bool public depositsPaused;
    uint256 public maxDepositAmount;

    bool private _locked;

    // ------------------------------------------------------------------ types
    struct Withdrawal {
        address payable recipient;
        address payable relayer;  // Mersenne Courier; address(0) if self-relayed
        uint256 fee;              // paid to relayer out of withdrawnValue
    }

    /// @dev Groth16 proof for circuits/ragequit.circom. pubSignals = [precommitment, nullifierHash].
    struct RagequitProof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        uint256[2] pubSignals;
    }

    struct Proof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
        // [withdrawnValue, stateRoot, aspRoot, context, nullifierHash, newCommitment]
        uint256[6] pubSignals;
    }

    // ------------------------------------------------------------------ events
    event LeafInserted(uint256 indexed index, uint256 leaf, uint256 root);
    event Deposited(
        address indexed depositor, uint256 commitment, uint256 label, uint256 value, uint256 precommitment, uint256 index
    );
    event Withdrawn(
        address indexed recipient,
        address indexed relayer,
        uint256 withdrawnValue,
        uint256 fee,
        uint256 nullifierHash,
        uint256 newCommitment
    );
    event Ragequit(
        address indexed depositor,
        uint256 indexed label,
        uint256 value,
        uint256 nullifierHash,
        address recipient
    );
    event DepositPauseToggled(bool isPaused);
    event GuardianProposed(address indexed currentGuardian, address indexed proposedGuardian);
    event GuardianTransferred(address indexed oldGuardian, address indexed newGuardian);
    event MaxDepositUpdated(uint256 newMaxDeposit);

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
    error PrecommitmentReused();
    error DepositsPaused();
    error NotGuardian();
    error ExceedsMaxDeposit();

    modifier nonReentrant() {
        if (_locked) revert Reentrancy();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        IGroth16Verifier _verifier,
        IRagequitVerifier _ragequitVerifier,
        IPoseidonT2 _hasher1,
        IPoseidonT3 _hasher2,
        IPoseidonT4 _hasher3,
        MagistrateRegister _register
    ) {
        verifier = _verifier;
        ragequitVerifier = _ragequitVerifier;
        hasher1 = _hasher1;
        hasher2 = _hasher2;
        hasher3 = _hasher3;
        register = _register;
        guardian = msg.sender;

        uint256 z = 0; // empty leaf
        for (uint32 i = 0; i < DEPTH; i++) {
            zeros[i] = z;
            filledSubtrees[i] = z;
            z = _h2([z, z]);
        }
        roots[0] = z; // root of the empty tree
    }

    // ================================================================== guardian controls
    /// @notice Allows the emergency guardian to pause deposits during an active incident.
    ///         Note: Withdrawals and Ragequits remain permanently unpausable.
    function setDepositsPaused(bool _paused) external {
        if (msg.sender != guardian) revert NotGuardian();
        depositsPaused = _paused;
        emit DepositPauseToggled(_paused);
    }

    /// @notice Caps maximum deposit value per note during guarded mainnet launch.
    function setMaxDepositAmount(uint256 _maxDeposit) external {
        if (msg.sender != guardian) revert NotGuardian();
        maxDepositAmount = _maxDeposit;
        emit MaxDepositUpdated(_maxDeposit);
    }

    function transferGuardian(address _newGuardian) external {
        if (msg.sender != guardian) revert NotGuardian();
        if (_newGuardian == address(0)) revert InvalidValue();
        pendingGuardian = _newGuardian;
        emit GuardianProposed(guardian, _newGuardian);
    }

    function acceptGuardian() external {
        if (msg.sender != pendingGuardian) revert NotGuardian();
        emit GuardianTransferred(guardian, pendingGuardian);
        guardian = pendingGuardian;
        pendingGuardian = address(0);
    }

    // ================================================================== deposit
    /// @param precommitment Poseidon(P, rho) computed off-chain, where P = Poseidon(sk).
    function deposit(uint256 precommitment) external payable nonReentrant returns (uint256 commitment) {
        if (depositsPaused) revert DepositsPaused();
        if (maxDepositAmount > 0 && msg.value > maxDepositAmount) revert ExceedsMaxDeposit();
        if (msg.value == 0 || msg.value > MAX_VALUE) revert InvalidValue();
        if (precommitment >= SNARK_SCALAR_FIELD) revert NotInField();
        if (precommitmentUsed[precommitment]) revert PrecommitmentReused();
        precommitmentUsed[precommitment] = true;

        uint256 label =
            uint256(keccak256(abi.encodePacked(block.chainid, address(this), depositNonce++))) % SNARK_SCALAR_FIELD;
        labelDepositor[label] = msg.sender;
        depositValue[label] = msg.value;
        labelPrecommitment[label] = precommitment;

        // The pool computes the commitment itself, so the value inside is guaranteed == msg.value.
        commitment = hasher3.poseidon([msg.value, label, precommitment]);
        uint256 index = _insert(commitment);

        emit Deposited(msg.sender, commitment, label, msg.value, precommitment, index);
    }

    // ================================================================== ragequit
    /// @notice Emergency exit: the original depositor reclaims the ORIGINAL deposit publicly.
    /// @dev    Safety rests on ONE invariant: ragequit burns the note's GENUINE nullifier,
    ///         proven in zero knowledge (circuits/ragequit.circom). Because Withdraw reveals the
    ///         same nullifier for this note, a note can be exited at most once, by either path:
    ///           withdraw -> ragequit  reverts (NullifierAlreadySpent)
    ///           ragequit -> withdraw  reverts (NullifierAlreadySpent)
    ///         No secret (sk, rho) ever touches calldata, and a copied proof is useless to a
    ///         front-runner because only labelDepositor[label] may submit it.
    ///         ASP approval status is deliberately NOT consulted: it is not a safety property.
    /// @param label     The label assigned to the deposit.
    /// @param recipient Address receiving the refund.
    /// @param p         Ragequit proof; pubSignals = [precommitment, nullifierHash].
    function ragequit(uint256 label, address payable recipient, RagequitProof calldata p) external nonReentrant {
        if (msg.sender != labelDepositor[label]) revert NotOriginalDepositor();
        if (isRagequit[label]) revert AlreadyRagequit();
        if (recipient == address(0)) revert InvalidValue();

        uint256 precommitment = p.pubSignals[0];
        uint256 nullifierHash = p.pubSignals[1];
        if (precommitment >= SNARK_SCALAR_FIELD || nullifierHash >= SNARK_SCALAR_FIELD) revert NotInField();
        if (precommitment != labelPrecommitment[label]) revert InvalidPrecommitment();
        if (nullifierSpent[nullifierHash]) revert NullifierAlreadySpent();
        if (!ragequitVerifier.verifyProof(p.pA, p.pB, p.pC, p.pubSignals)) revert InvalidProof();

        uint256 amount = depositValue[label];
        if (amount == 0) revert InvalidValue();

        // effects
        isRagequit[label] = true;
        nullifierSpent[nullifierHash] = true; // the genuine Wax Seal is now broken
        depositValue[label] = 0;
        register.markRevoked(label);          // bookkeeping only (pool is an authorised caller)

        emit Ragequit(msg.sender, label, amount, nullifierHash, recipient);

        // interactions
        _send(recipient, amount);
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
        if (w.recipient == address(0)) revert InvalidValue();
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
        _insert(newCommitment); // always inserted (value may be 0), so full and partial exits look alike

        emit Withdrawn(w.recipient, w.relayer, withdrawnValue, w.fee, nullifierHash, newCommitment);

        // interactions
        _send(w.recipient, withdrawnValue - w.fee);
        if (w.fee > 0) _send(w.relayer, w.fee);
    }

    // ================================================================== views
    /// @notice Binds a proof to its transaction parameters so a front-runner cannot redirect funds.
    function computeContext(Withdrawal calldata w) public view returns (uint256) {
        return uint256(keccak256(abi.encode(block.chainid, address(this), w.recipient, w.relayer, w.fee)))
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

    function _send(address payable to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
