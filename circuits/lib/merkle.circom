pragma circom 2.1.9;

include "../../node_modules/circomlib/circuits/poseidon.circom";

// The Folio: proves that `leaf` sits in a binary Poseidon Merkle tree with root `root`.
// pathIndices[i] = 0 -> current node is the LEFT child at level i
// pathIndices[i] = 1 -> current node is the RIGHT child at level i
template MerkleInclusion(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;

    component hashers[depth];
    signal nodes[depth + 1];
    signal left[depth];
    signal right[depth];

    nodes[0] <== leaf;

    for (var i = 0; i < depth; i++) {
        // each index must be a bit
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // left  = idx ? sibling : node
        // right = idx ? node    : sibling
        left[i]  <== nodes[i] + pathIndices[i] * (pathElements[i] - nodes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (nodes[i] - pathElements[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        nodes[i + 1] <== hashers[i].out;
    }

    root <== nodes[depth];
}
