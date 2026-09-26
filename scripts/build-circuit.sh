#!/usr/bin/env bash
# Compiles the withdraw circuit, runs a DEV-ONLY trusted setup and exports the Solidity verifier.
#
#   PTAU=path/to/powersOfTau28_hez_final_15.ptau ./scripts/build-circuit.sh
#
# If PTAU is not set, a local Powers of Tau is generated. That is fine for development
# but NOT for production (see devbrief.md, section "Trusted setup").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
SNARKJS="npx snarkjs"
POWER=15   # 2^15 = 32768 constraints max; circuit uses ~12k

mkdir -p "$BUILD" "$ROOT/contracts"
cd "$ROOT"

echo "==> [1/5] Compiling circuit"
circom circuits/withdraw.circom --r1cs --wasm --sym -o "$BUILD"
$SNARKJS r1cs info "$BUILD/withdraw.r1cs"

echo "==> [2/5] Powers of Tau (phase 1)"
if [[ -n "${PTAU:-}" ]]; then
  cp "$PTAU" "$BUILD/pot_final.ptau"
elif [[ ! -f "$BUILD/pot_final.ptau" ]]; then
  echo "    PTAU not provided -> generating a LOCAL dev ptau (insecure, dev only)"
  $SNARKJS powersoftau new bn128 $POWER "$BUILD/pot_0.ptau"
  $SNARKJS powersoftau contribute "$BUILD/pot_0.ptau" "$BUILD/pot_1.ptau" \
    --name="dev-contribution" -e="$(head -c 64 /dev/urandom | base64)"
  $SNARKJS powersoftau prepare phase2 "$BUILD/pot_1.ptau" "$BUILD/pot_final.ptau"
  rm -f "$BUILD/pot_0.ptau" "$BUILD/pot_1.ptau"
fi

echo "==> [3/5] Groth16 setup (phase 2)"
$SNARKJS groth16 setup "$BUILD/withdraw.r1cs" "$BUILD/pot_final.ptau" "$BUILD/withdraw_0.zkey"
$SNARKJS zkey contribute "$BUILD/withdraw_0.zkey" "$BUILD/withdraw_final.zkey" \
  --name="dev-phase2" -e="$(head -c 64 /dev/urandom | base64)"
rm -f "$BUILD/withdraw_0.zkey"

echo "==> [4/5] Exporting verification key"
$SNARKJS zkey export verificationkey "$BUILD/withdraw_final.zkey" "$BUILD/verification_key.json"

echo "==> [5/5] Exporting Solidity verifier"
$SNARKJS zkey export solidityverifier "$BUILD/withdraw_final.zkey" "$ROOT/contracts/Groth16Verifier.sol"

echo "Done. Artifacts in build/, verifier in contracts/Groth16Verifier.sol"
