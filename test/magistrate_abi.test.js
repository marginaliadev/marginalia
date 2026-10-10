// The Magistrate worker ships its own ABIs (no build artifacts on Railway); they must equal the compiled contracts.
const path = require("path");
const { expect } = require("chai");

describe("Magistrate worker ABIs", function () {
  for (const n of ["MagistrateRegister", "MarginaliaPool"]) {
    it(`${n} ABI equals the compiled artifact`, function () {
      const shipped = require(path.join(__dirname, "../services/magistrate/abi", `${n}.json`));
      const compiled = require(path.join(__dirname, "../artifacts/contracts", `${n}.sol`, `${n}.json`)).abi;
      expect(shipped).to.deep.equal(compiled);
    });
  }
});
