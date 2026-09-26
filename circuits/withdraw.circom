pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./lib/merkle.circom";

/*
 * MARGINALIA - The Withdrawal Theorem
 *
 * Note (Marginal Note) structure:
 *   P    = Poseidon(sk)                    owner public key
 *   pre  = Poseidon(P, rho)                precommitment (chosen by user off-chain)
 *   cm   = Poseidon(value, label, pre)     commitment (computed ON-CHAIN at deposit)
 *   N    = Poseidon(sk, rho)               nullifier ("Wax Seal")
 *
 * `label` is assigned by the pool at deposit time and is what the
 * Magistrate (ASP) approves. Change notes inherit the label, so approval
 * follows the funds through partial withdrawals.
 *
 * Public signals (order matters, it is the order the verifier expects):
 *   [0] withdrawnValue
 *   [1] stateRoot       root of the Folio (commitment tree)
 *   [2] aspRoot         root of the Magistrate's Register (approved labels)
 *   [3] context         keccak(pool, recipient, relayer, fee) mod p; binds proof to tx params
 *   [4] nullifierHash
 *   [5] newCommitment   change note
 */
template Withdraw(stateDepth, aspDepth) {
    // ---------- public ----------
    signal input withdrawnValue;
    signal input stateRoot;
    signal input aspRoot;
    signal input context;
    signal input nullifierHash;
    signal input newCommitment;

    // ---------- private ----------
    signal input sk;
    signal input value;
    signal input label;
    signal input rho;
    signal input statePathElements[stateDepth];
    signal input statePathIndices[stateDepth];
    signal input aspPathElements[aspDepth];
    signal input aspPathIndices[aspDepth];
    signal input newRho;

    // 1. Ownership: P = Poseidon(sk)
    component pk = Poseidon(1);
    pk.inputs[0] <== sk;

    // 2. Rebuild the existing commitment
    component pre = Poseidon(2);
    pre.inputs[0] <== pk.out;
    pre.inputs[1] <== rho;

    component cm = Poseidon(3);
    cm.inputs[0] <== value;
    cm.inputs[1] <== label;
    cm.inputs[2] <== pre.out;

    // 3. The note is written in the Folio
    component stateProof = MerkleInclusion(stateDepth);
    stateProof.leaf <== cm.out;
    for (var i = 0; i < stateDepth; i++) {
        stateProof.pathElements[i] <== statePathElements[i];
        stateProof.pathIndices[i]  <== statePathIndices[i];
    }
    stateProof.root === stateRoot;

    // 4. The label is written in the Magistrate's Register
    component aspProof = MerkleInclusion(aspDepth);
    aspProof.leaf <== label;
    for (var j = 0; j < aspDepth; j++) {
        aspProof.pathElements[j] <== aspPathElements[j];
        aspProof.pathIndices[j]  <== aspPathIndices[j];
    }
    aspProof.root === aspRoot;

    // 5. Wax Seal: N = Poseidon(sk, rho)
    component nul = Poseidon(2);
    nul.inputs[0] <== sk;
    nul.inputs[1] <== rho;
    nul.out === nullifierHash;

    // 6. Conservation of value: value = withdrawn + remaining, both in [0, 2^128)
    signal remaining;
    remaining <== value - withdrawnValue;

    component wBits = Num2Bits(128);
    wBits.in <== withdrawnValue;
    component rBits = Num2Bits(128);
    rBits.in <== remaining;

    // 7. Change note, same owner, same label, fresh rho
    component newPre = Poseidon(2);
    newPre.inputs[0] <== pk.out;
    newPre.inputs[1] <== newRho;

    component newCm = Poseidon(3);
    newCm.inputs[0] <== remaining;
    newCm.inputs[1] <== label;
    newCm.inputs[2] <== newPre.out;
    newCm.out === newCommitment;

    // 8. Bind the proof to the transaction context (recipient, relayer, fee).
    //    A quadratic constraint keeps `context` from being optimised away.
    signal contextSquare;
    contextSquare <== context * context;
}

component main {public [withdrawnValue, stateRoot, aspRoot, context, nullifierHash, newCommitment]} = Withdraw(20, 20);
