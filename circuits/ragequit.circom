pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/poseidon.circom";

/*
 * MARGINALIA - The Ragequit Theorem
 *
 * Proves knowledge of the note secrets (sk, rho) behind a deposit's
 * precommitment, and reveals the note's genuine Wax Seal (nullifier)
 * WITHOUT revealing sk or rho.
 *
 *   P    = Poseidon(sk)
 *   pre  = Poseidon(P, rho)      must equal labelPrecommitment[label] on-chain
 *   N    = Poseidon(sk, rho)     burnt on-chain by ragequit
 *
 * Because N is the SAME nullifier the Withdraw circuit reveals for this note:
 *   - ragequit -> withdraw   : withdraw reverts (N already spent)
 *   - withdraw -> ragequit   : ragequit reverts (N already spent)
 * The proof is useless to a front-runner: the pool only accepts it from
 * labelDepositor[label], so copying calldata gains nothing.
 *
 * Public signals (verifier order):
 *   [0] precommitment
 *   [1] nullifierHash
 */
template Ragequit() {
    // ---------- public ----------
    signal input precommitment;
    signal input nullifierHash;

    // ---------- private ----------
    signal input sk;
    signal input rho;

    component pk = Poseidon(1);
    pk.inputs[0] <== sk;

    component pre = Poseidon(2);
    pre.inputs[0] <== pk.out;
    pre.inputs[1] <== rho;
    pre.out === precommitment;

    component nul = Poseidon(2);
    nul.inputs[0] <== sk;
    nul.inputs[1] <== rho;
    nul.out === nullifierHash;
}

component main {public [precommitment, nullifierHash]} = Ragequit();
