// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Poseidon hasher deployed from circomlibjs bytecode (2 inputs).
interface IPoseidonT3 {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

/// @notice Poseidon hasher deployed from circomlibjs bytecode (3 inputs).
interface IPoseidonT4 {
    function poseidon(uint256[3] calldata input) external pure returns (uint256);
}

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[6] calldata pubSignals
    ) external view returns (bool);
}
