// MARGINALIA Phase-2 Trusted Setup Ceremony Tooling (TASK-3.4 / L1 Mitigation)
// Provides automated scripts for adding decentralized MPC contributions, verifying transcripts, and applying random beacons.

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Add a contribution to an existing zkey during Phase 2 ceremony.
 */
async function contributePhase2(inputZkeyPath, outputZkeyPath, contributorName, entropyString) {
  if (!fs.existsSync(inputZkeyPath)) throw new Error(`Input zkey does not exist: ${inputZkeyPath}`);
  
  await snarkjs.zKey.contribute(
    inputZkeyPath,
    outputZkeyPath,
    contributorName,
    entropyString || snarkjs.crypto.randomBytes(32).toString("hex")
  );
  return outputZkeyPath;
}

/**
 * Verify a Phase-2 zkey contribution against the circuit r1cs and ptau file.
 */
async function verifyPhase2(r1csPath, ptauPath, zkeyPath) {
  return await snarkjs.zKey.verifyFromR1cs(r1csPath, ptauPath, zkeyPath);
}

/**
 * Apply a public random beacon (e.g. Drand round hash or Bitcoin block hash) to seal the ceremony.
 */
async function applyRandomBeacon(inputZkeyPath, finalZkeyPath, beaconHashHex, numIterationsExp = 10) {
  await snarkjs.zKey.beacon(inputZkeyPath, finalZkeyPath, "Final Beacon", beaconHashHex, numIterationsExp);
  return finalZkeyPath;
}

/**
 * Export Solidity verifier contract from the finalized zkey.
 */
async function exportSolidityVerifier(zkeyPath, templatePath) {
  return await snarkjs.zKey.exportSolidityVerifier(zkeyPath, templatePath);
}

/**
 * Export JSON verification key.
 */
async function exportVerificationKey(zkeyPath) {
  return await snarkjs.zKey.exportVerificationKey(zkeyPath);
}

module.exports = {
  contributePhase2,
  verifyPhase2,
  applyRandomBeacon,
  exportSolidityVerifier,
  exportVerificationKey,
};
