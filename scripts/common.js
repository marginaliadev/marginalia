const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

const DEPLOY_DIR = path.join(__dirname, "..", "deployments");
const ASP_DIR = path.join(__dirname, "..", "asp");
const NOTES_DIR = path.join(__dirname, "..", "notes");

function deploymentFile() {
  return path.join(DEPLOY_DIR, `${network.name}.json`);
}

function loadDeployment() {
  const f = deploymentFile();
  if (!fs.existsSync(f)) throw new Error(`No deployment for network "${network.name}". Run scripts/deploy.js first.`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

async function contracts() {
  const d = loadDeployment();
  const pool = await ethers.getContractAt("MarginaliaPool", d.pool);
  const register = await ethers.getContractAt("MagistrateRegister", d.register);
  return { d, pool, register };
}

function aspFile() {
  return path.join(ASP_DIR, `${network.name}.labels.json`);
}

function loadApprovedLabels() {
  const f = aspFile();
  if (!fs.existsSync(f)) throw new Error("No ASP label list found. Run scripts/magistrate-approve.js first.");
  return JSON.parse(fs.readFileSync(f, "utf8")).labels.map(BigInt);
}

function saveNote(name, noteStr) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const f = path.join(NOTES_DIR, `${network.name}-${name}.txt`);
  fs.writeFileSync(f, noteStr + "\n");
  return f;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

module.exports = {
  DEPLOY_DIR,
  ASP_DIR,
  deploymentFile,
  loadDeployment,
  contracts,
  aspFile,
  loadApprovedLabels,
  saveNote,
  requireEnv,
};
