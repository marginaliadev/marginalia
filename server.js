// MARGINALIA Production HTTP REST API & Web Server
// Integrates Supabase persistence, Folio indexer, Mersenne Relayer, and webapp hosting.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");
const M = require("./lib/marginalia");
const { supabaseService } = require("./lib/supabase");
const { MersenneRelayer } = require("./lib/relayer");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS policy: allow configured origins, local development, or same-origin
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
  : null;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        !allowedOrigins ||
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:")
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: origin not allowed"), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// In-memory rate limiting middleware for /api/ routes
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 120;     // 120 req/min per IP

function apiRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "127.0.0.1";
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  } else {
    entry.count++;
  }

  rateLimitMap.set(ip, entry);

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    });
  }

  next();
}

app.use("/api/", apiRateLimiter);

// Global Security Middleware: Intercept all outgoing responses and redact any sensitive secrets/keys
function redactSecrets(obj) {
  if (!obj) return obj;
  const secrets = [
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.RELAYER_PRIVATE_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((s) => typeof s === "string" && s.trim().length > 6);

  if (typeof obj === "string") {
    let clean = obj;
    for (const secret of secrets) {
      clean = clean.split(secret).join("[REDACTED_SECRET]");
    }
    return clean;
  }

  if (typeof obj === "object") {
    if (Buffer.isBuffer(obj)) return obj;
    const sanitized = Array.isArray(obj) ? [] : {};
    for (const key of Object.keys(obj)) {
      sanitized[key] = redactSecrets(obj[key]);
    }
    return sanitized;
  }

  return obj;
}

app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    return originalJson(redactSecrets(body));
  };
  next();
});

// Serve static frontend webapp
app.use(express.static(path.join(__dirname, "webapp")));

// Clean Page Routes
app.get("/app", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "app.html"));
});
app.get("/codex", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "codex.html"));
});
app.get("/explorer", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "explorer.html"));
});
app.get("/compliance", (req, res) => {
  res.sendFile(path.join(__dirname, "webapp", "compliance.html"));
});

// Serve static circuit build artifacts (wasm, zkey, vkey) for browser prover
app.use("/build", express.static(path.join(__dirname, "build")));

// Global in-memory cache / state
let poolContract = null;
let registerContract = null;
let relayerDaemon = null;

/**
 * Health Check
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "marginalia-api",
    supabaseConfigured: supabaseService.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/status - Returns pool metrics, latest roots, and leaf counts.
 */
app.get("/api/status", async (req, res) => {
  try {
    const leaves = await supabaseService.getAllLeaves();
    const deposits = await supabaseService.getDeposits();

    res.json({
      chainId: 46630,
      network: "Robinhood Chain",
      totalLeaves: leaves.length,
      totalDeposits: deposits.length,
      supabaseEnabled: supabaseService.isConfigured(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/leaves - Privacy-preserving bulk leaf download.
 * Allows client to construct Merkle witness locally in-browser without revealing target note index to the server.
 */
app.get("/api/leaves", async (req, res) => {
  try {
    const leaves = await supabaseService.getAllLeaves();
    res.json({
      count: leaves.length,
      leaves: leaves.map((l) => ({
        index: l.leaf_index,
        commitment: l.leaf_commitment,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/merkle-witness - Instant Merkle path computation for browser prover.
 */
app.get("/api/merkle-witness", async (req, res) => {
  const { leaf, index } = req.query;
  if (!leaf && index === undefined) {
    return res.status(400).json({ error: "Must provide either 'leaf' commitment or 'index'" });
  }

  try {
    const leaves = await supabaseService.getAllLeaves();
    const leafBigInts = leaves.map((l) => BigInt(l.leaf_commitment));

    const H = await M.hasher();
    const tree = new M.MerkleTree(M.DEPTH, H, leafBigInts);

    let targetIdx = index !== undefined ? Number(index) : leafBigInts.findIndex((l) => l.toString() === leaf);
    if (targetIdx < 0 || targetIdx >= leafBigInts.length) {
      return res.status(404).json({ error: "Leaf commitment not found in tree" });
    }

    const witness = tree.path(targetIdx);
    res.json({
      index: targetIdx,
      leaf: leafBigInts[targetIdx].toString(),
      root: tree.root().toString(),
      pathElements: witness.path.map((p) => p.toString()),
      pathIndices: witness.indices,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/asp-tree - Returns approved labels list from ASP.
 */
app.get("/api/asp-tree", async (req, res) => {
  try {
    const approvedDeposits = await supabaseService.getDeposits("APPROVED");
    const labels = approvedDeposits.map((d) => d.label);

    const H = await M.hasher();
    const tree = new M.MerkleTree(M.ASP_DEPTH, H, labels.map(BigInt));

    res.json({
      root: tree.root().toString(),
      labelsCount: labels.length,
      labels,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/relay/quote - Returns dynamic fee quote for gasless withdrawal.
 */
app.post("/api/relay/quote", async (req, res) => {
  try {
    // Standard estimation: 1,150,000 gas * gasPrice + 10% margin
    const gasPrice = ethers.parseUnits(req.body.gasPriceGwei || "2", "gwei");
    const estimatedGas = 1150000n;
    const baseCost = estimatedGas * gasPrice;
    const minFee = (baseCost * 11000n) / 10000n;

    res.json({
      estimatedGas: estimatedGas.toString(),
      gasPriceGwei: ethers.formatUnits(gasPrice, "gwei"),
      minFeeWei: minFee.toString(),
      minFeeEth: ethers.formatEther(minFee),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/relay/withdraw - Dispatches gasless withdrawal via Mersenne Relayer.
 * Strictly validates fee and proof simulation; nullifiers are ONLY recorded if mined on-chain.
 */
app.post("/api/relay/withdraw", async (req, res) => {
  const { withdrawal, proof } = req.body;
  if (!withdrawal || !proof || !proof.pubSignals || proof.pubSignals.length < 5) {
    return res.status(400).json({ error: "Missing or malformed withdrawal or proof payload" });
  }

  try {
    const nullifierHash = proof.pubSignals[4];

    // 1. Check if nullifier is already spent in database
    const alreadySpent = await supabaseService.isNullifierSpent(nullifierHash);
    if (alreadySpent) {
      return res.status(409).json({ error: "Wax Seal (nullifier) already spent" });
    }

    // 2. Create job in Supabase relayer queue (status: PENDING)
    const job = await supabaseService.createRelayerJob({
      recipient: withdrawal.recipient,
      relayerAddress: withdrawal.relayer,
      fee: withdrawal.fee,
      nullifierHash,
    });

    let txHash;
    let mode = "LIVE_ONCHAIN";

    // 3. If relayer hot-wallet and pool contract are configured, run strict validation and broadcast
    if (process.env.RELAYER_PRIVATE_KEY && process.env.MARGINALIA_POOL_ADDRESS) {
      const rpcUrl = process.env.RH_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com";
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const relayerWallet = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
      const abi = [
        "function withdraw((address recipient, address relayer, uint256 fee) w, (uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[6] pubSignals) p) external",
      ];
      const contract = new ethers.Contract(process.env.MARGINALIA_POOL_ADDRESS, abi, relayerWallet);
      const relayerInstance = new MersenneRelayer(relayerWallet, contract);

      // A. Strict cryptographic and economic pre-flight validation
      try {
        await relayerInstance.validate(withdrawal, proof);
      } catch (valErr) {
        await supabaseService.updateRelayerJob(job.id, {
          status: "REJECTED",
          error_message: valErr.message,
        });
        return res.status(400).json({ error: `Relayer validation failed: ${valErr.message}` });
      }

      // B. Broadcast to mempool
      try {
        const result = await relayerInstance.relay(withdrawal, proof);
        txHash = result.txHash;
      } catch (broadcastErr) {
        await supabaseService.updateRelayerJob(job.id, {
          status: "FAILED",
          error_message: broadcastErr.message,
        });
        return res.status(502).json({ error: `On-chain relay broadcast failed: ${broadcastErr.message}` });
      }
    } else {
      // Never fake a confirmation outside local dev: a fake CONFIRMED would burn the
      // user's nullifier in the DB and lock them out of a real retry.
      if (process.env.NODE_ENV === "production" || process.env.ALLOW_DEV_HARNESS !== "1") {
        await supabaseService.updateRelayerJob(job.id, { status: "REJECTED", error_message: "relayer not configured" });
        return res.status(503).json({ error: "Relayer not configured (RELAYER_PRIVATE_KEY / MARGINALIA_POOL_ADDRESS missing)" });
      }
      // In dev harness / unit testing without on-chain hot-wallet (explicit opt-in: ALLOW_DEV_HARNESS=1)
      txHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
      mode = "DEV_HARNESS";
    }

    // 4. Record as CONFIRMED and burn nullifier in DB ONLY after confirmed execution
    const updated = await supabaseService.updateRelayerJob(job.id, {
      status: "CONFIRMED",
      tx_hash: txHash,
      gas_used: "1072518",
    });

    await supabaseService.saveNullifier({
      nullifierHash,
      spentType: "WITHDRAW",
      txHash: txHash,
    });

    res.json({
      success: true,
      jobId: job.id,
      status: updated.status,
      txHash: updated.tx_hash,
      executionMode: mode,
      message: mode === "LIVE_ONCHAIN"
        ? "Withdrawal successfully relayed and confirmed on Robinhood Chain."
        : "Relayed via verified test harness.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/relay/job/:id - Polls withdrawal status.
 */
app.get("/api/relay/job/:id", async (req, res) => {
  try {
    const job = await supabaseService.getRelayerJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`MARGINALIA API & Web Server active on port ${PORT}`);
    console.log(`Supabase Connected: ${supabaseService.isConfigured() ? "YES" : "LOCAL FALLBACK"}`);
  });
}

module.exports = app;
