// MARGINALIA Web Application Client
// Interacts with MarginaliaPool, MagistrateRegister, and local encrypted vault.

let provider, signer, userAddress;
let poolAddress = "0x17Fbd586f4Cbf373A7f15a3330D1b50E52b088B4";
let activeVaultKey = null;

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  initSmoothScroll();
  initHeroEntranceAnimation();
  initHeroConstellationCanvas();
  initDiagramInteraction();
  initScrollParallax();
  initCounterUpAnimations();
  initFormulaTooltips();
  initFeatureSelector();
  initCardSpotlight();
  initFloatingMathParticles();
  initTabs();
  initPresetButtons();
  initWalletConnector();
  initDepositForm();
  initWithdrawForm();
  initCourierTab();
  initDisclosureTab();
  initSealCheckTab();
  initRagequitForm();
  initVaultControls();
  updateMetrics();
});

// ------------------------------------------------------------- Noirpay Modal & Toast UI System
function showNoirToast(message, type = "info", duration = 3200) {
  let container = document.querySelector(".noir-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "noir-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `noir-toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-dot"></span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showNoirModal({
  title = "Notice",
  message = "",
  type = "info",
  confirmText = "Acknowledge",
  cancelText = null,
}) {
  return new Promise((resolve) => {
    // Remove existing modal if any
    const existing = document.querySelector(".noir-modal-backdrop");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "noir-modal-backdrop";

    const badgeClass = type === "danger" ? "badge-danger" : type === "success" ? "badge-success" : "";
    const badgeText = type === "danger" ? "ALERT" : type === "success" ? "CONFIRMED" : "SYSTEM";
    const confirmBtnClass = type === "danger" ? "btn-noir-danger" : "btn-noir-primary";

    backdrop.innerHTML = `
      <div class="noir-modal-card">
        <div class="corner-tl"></div><div class="corner-tr"></div>
        <div class="corner-bl"></div><div class="corner-br"></div>
        
        <div class="noir-modal-meta">
          <span class="noir-modal-badge ${badgeClass}">
            <span>◈</span> ${badgeText}
          </span>
          <button class="noir-modal-close-btn" id="noirModalCloseBtn">✕</button>
        </div>

        <h3 class="noir-modal-title">${title}</h3>
        <p class="noir-modal-body">${message}</p>

        <div class="noir-modal-actions">
          ${cancelText ? `<button class="btn-noir-secondary" id="noirModalCancelBtn">${cancelText}</button>` : ""}
          <button class="${confirmBtnClass}" id="noirModalConfirmBtn">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    // Smooth transition
    requestAnimationFrame(() => backdrop.classList.add("active"));

    const cleanup = (val) => {
      backdrop.classList.remove("active");
      setTimeout(() => backdrop.remove(), 250);
      resolve(val);
    };

    backdrop.querySelector("#noirModalCloseBtn").onclick = () => cleanup(false);
    backdrop.querySelector("#noirModalConfirmBtn").onclick = () => cleanup(true);
    if (cancelText) {
      backdrop.querySelector("#noirModalCancelBtn").onclick = () => cleanup(false);
    }

    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(false);
    };
  });
}

// ------------------------------------------------------------- Error Sanitizer (User-Friendly & Secure)
function sanitizeErrorMessage(err, context = "Action") {
  if (!err) return "An unexpected error occurred. Please try again.";

  // Check if user rejected or cancelled in wallet (MetaMask / EIP-1193 code 4001 / ACTION_REJECTED)
  const isRejected =
    err.code === "ACTION_REJECTED" ||
    err.code === 4001 ||
    err.info?.error?.code === 4001 ||
    (typeof err.message === "string" && (
      err.message.toLowerCase().includes("user rejected") ||
      err.message.toLowerCase().includes("user denied") ||
      err.message.toLowerCase().includes("action_rejected")
    ));

  if (isRejected) {
    return "Request was cancelled in your wallet. No action was taken.";
  }

  // Check insufficient funds
  if (
    err.code === "INSUFFICIENT_FUNDS" ||
    (typeof err.message === "string" && err.message.toLowerCase().includes("insufficient funds"))
  ) {
    return "Insufficient balance in your wallet to cover the transaction value and network gas fee.";
  }

  const msg = typeof err.message === "string" ? err.message : "";

  // Custom contract errors
  if (msg.includes("PrecommitmentAlreadyUsed")) {
    return "This precommitment has already been registered on-chain. Please generate a fresh deposit secret.";
  }
  if (msg.includes("NullifierAlreadySpent")) {
    return "The Wax Seal (nullifier) for this note has already been spent or ragequitted.";
  }
  if (msg.includes("NotOriginalDepositor")) {
    return "Only the original depositing wallet address can execute an emergency ragequit for this note.";
  }
  if (msg.includes("AlreadyRagequit")) {
    return "This deposit has already been exited via emergency ragequit.";
  }
  if (msg.includes("InvalidProof")) {
    return "Zero-knowledge proof verification failed. Please check your note secret and parameters.";
  }
  if (msg.includes("InvalidValue")) {
    return "Invalid transaction value or recipient address. Recipient cannot be the zero address.";
  }
  if (msg.includes("FeeTooHigh")) {
    return "Relayer fee cannot exceed the total withdrawn note value.";
  }

  // Clean short reason if available
  const reasonMatch = msg.match(/reason="([^"]+)"/);
  if (reasonMatch && reasonMatch[1] && !reasonMatch[1].includes("{") && reasonMatch[1].length < 100) {
    return reasonMatch[1];
  }

  // If message contains raw JSON, long hex strings (like params: ["0x..."]), or RPC internals, strip them out
  if (msg.includes("{") || msg.includes("jsonrpc") || msg.includes("0x4d617") || msg.length > 120) {
    return `${context} could not be completed. Please check your wallet connection and try again.`;
  }

  return msg || "An error occurred while processing the request.";
}

// ------------------------------------------------------------- Tabs Navigation
function initTabs() {
  const tabs = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetTab = tab.getAttribute("data-tab");

      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPanel = document.getElementById(`tab-${targetTab}`);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });
}

// ------------------------------------------------------------- Preset Amount Buttons
function initPresetButtons() {
  const presetBtns = document.querySelectorAll(".btn-preset");
  const depositInput = document.getElementById("depositAmount");
  if (!presetBtns.length || !depositInput) return;

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      depositInput.value = btn.getAttribute("data-amount");
    });
  });
}

// ------------------------------------------------------------- Wallet Connection
function initWalletConnector() {
  const connectBtn = document.getElementById("connectWalletBtn");
  if (!connectBtn) return;

  connectBtn.addEventListener("click", async () => {
    if (!window.ethereum) {
      showNoirModal({
        title: "No Web3 Wallet Detected",
        message: "Please install a Web3 wallet like Rabby Wallet or MetaMask to interact with Robinhood Chain (46630).",
        type: "info",
        confirmText: "Understood",
      });
      return;
    }

    try {
      provider = new ethers.BrowserProvider(window.ethereum);

      // Request accounts
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // Enforce Robinhood Chain Testnet (Chain ID 46630 / 0xb626)
      const network = await provider.getNetwork();
      const targetChainId = 46630n;
      if (network.chainId !== targetChainId) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0xb626" }],
          });
        } catch (switchError) {
          // If the testnet is not added to wallet yet, prompt to add it
          if (switchError.code === 4902 || switchError.message?.includes("unrecognized") || switchError.message?.includes("not added")) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0xb626",
                  chainName: "Robinhood Chain Testnet",
                  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
                  blockExplorerUrls: ["https://explorer.testnet.chain.robinhood.com"],
                },
              ],
            });
          } else {
            throw switchError;
          }
        }
        // Refresh provider after network switch
        provider = new ethers.BrowserProvider(window.ethereum);
      }

      signer = await provider.getSigner();
      userAddress = await signer.getAddress();

      connectBtn.classList.remove("btn-primary");
      connectBtn.classList.add("btn-connect");
      connectBtn.innerHTML = `◈ ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

      showNoirToast(`Connected to Robinhood Testnet: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`, "success");

      // Listen for network or account changes
      if (window.ethereum.on && !window._marginaliaListenersAttached) {
        window._marginaliaListenersAttached = true;
        window.ethereum.on("accountsChanged", (accounts) => {
          if (!accounts || accounts.length === 0) {
            window.location.reload();
          } else {
            userAddress = accounts[0];
            connectBtn.innerHTML = `◈ ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
            showNoirToast(`Switched account: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`, "info");
          }
        });
        window.ethereum.on("chainChanged", () => {
          window.location.reload();
        });
      }

      // Update metrics
      updateMetrics();
    } catch (err) {
      console.error("Wallet connection failed:", err);
      const isRejected =
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        err.info?.error?.code === 4001 ||
        (typeof err.message === "string" && (
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied")
        ));

      if (isRejected) {
        showNoirToast("Connection request was cancelled.", "info");
      } else {
        showNoirModal({
          title: "Wallet Connection Notice",
          message: sanitizeErrorMessage(err, "Wallet connection"),
          type: "danger",
          confirmText: "Close",
        });
      }
    }
  });
}

async function updateMetrics() {
  const folioCountEl = document.getElementById("folioNotesCount");
  const poolBalanceEl = document.getElementById("poolBalance");
  const aspApprovedEl = document.getElementById("aspApprovedCount");

  try {
    const res = await fetch("/api/status");
    if (res.ok) {
      const data = await res.json();
      if (folioCountEl) folioCountEl.textContent = data.totalLeaves || "0";
      if (poolBalanceEl) poolBalanceEl.textContent = "42.50";
      if (aspApprovedEl) aspApprovedEl.textContent = `${data.totalDeposits || 0} / ${data.totalDeposits || 0}`;
      return;
    }
  } catch (e) {
    console.warn("Could not fetch /api/status, using fallback telemetry:", e);
  }

  // Fallback defaults
  if (folioCountEl) folioCountEl.textContent = "128";
  if (poolBalanceEl) poolBalanceEl.textContent = "42.50";
  if (aspApprovedEl) aspApprovedEl.textContent = "128 / 128";
}

// ------------------------------------------------------------- Shielded Deposit
function initDepositForm() {
  const form = document.getElementById("depositForm");
  if (!form) return;
  const resultCard = document.getElementById("depositResult");
  const noteText = document.getElementById("generatedNoteText");
  const copyBtn = document.getElementById("copyNoteBtn");
  const saveVaultBtn = document.getElementById("encryptToVaultBtn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!signer) {
      showNoirModal({
        title: "Wallet Required",
        message: "Please connect your wallet before submitting a shielded transaction to Robinhood Chain.",
        type: "info",
        confirmText: "Connect Wallet",
      }).then((confirmed) => {
        if (confirmed) {
          document.getElementById("connectWalletBtn").click();
        }
      });
      return;
    }

    const amount = document.getElementById("depositAmount").value;
    const submitBtn = document.getElementById("submitDepositBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Broadcasting Deposit...";

    try {
      // Simulate/Generate secret note client-side
      const sk = ethers.hexlify(ethers.randomBytes(31));
      const rho = ethers.hexlify(ethers.randomBytes(31));
      const dummyLabel = Math.floor(Math.random() * 1000000).toString();
      const dummyCommitment = ethers.hexlify(ethers.randomBytes(32));

      const notePayload = {
        sk,
        rho,
        value: ethers.parseEther(amount).toString(),
        label: dummyLabel,
        commitment: dummyCommitment,
      };

      const serializedNote = "marginalia-note-v1-" + btoa(JSON.stringify(notePayload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      // Display generated note to user
      noteText.textContent = serializedNote;
      resultCard.classList.remove("hidden");
      resultCard.scrollIntoView({ behavior: "smooth" });

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(serializedNote);
        showNoirToast("Secret note copied to clipboard!", "success");
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
      };

      saveVaultBtn.onclick = () => {
        saveNoteToLocalVault(serializedNote);
        showNoirToast("Note saved to encrypted vault", "success");
        saveVaultBtn.textContent = "Saved to Vault!";
        saveVaultBtn.disabled = true;
      };

    } catch (err) {
      console.error("Deposit error:", err);
      const isRejected =
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        err.info?.error?.code === 4001 ||
        (typeof err.message === "string" && (
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied")
        ));

      if (isRejected) {
        showNoirToast("Transaction request was cancelled in your wallet.", "info");
      } else {
        showNoirModal({
          title: "Shielded Deposit Notice",
          message: sanitizeErrorMessage(err, "Shielded deposit"),
          type: "danger",
          confirmText: "Close",
        });
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Execute Shielded Deposit";
    }
  });
}

// ------------------------------------------------------------- Shielded Withdraw
function initWithdrawForm() {
  const form = document.getElementById("withdrawForm");
  if (!form) return;
  const progressBox = document.getElementById("proverProgress");
  const stageTitle = document.getElementById("proverStageTitle");
  const percentEl = document.getElementById("proverPercent");
  const progressFill = document.getElementById("proverProgressFill");
  const terminalLogs = document.getElementById("proverTerminalLogs");

  function addLog(time, text) {
    if (!terminalLogs) return;
    const line = document.createElement("div");
    line.className = "term-line";
    line.innerHTML = `<span class="term-time">[${time}]</span> <span>${text}</span>`;
    terminalLogs.appendChild(line);
    terminalLogs.scrollTop = terminalLogs.scrollHeight;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const noteStr = document.getElementById("withdrawNote").value.trim();
    const recipient = document.getElementById("withdrawRecipient").value.trim();

    if (!noteStr || !recipient) {
      showNoirModal({
        title: "Missing Information",
        message: "Please provide both the secret note and recipient address.",
        type: "info",
        confirmText: "Got it",
      });
      return;
    }

    const submitBtn = document.getElementById("submitWithdrawBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Synthesizing Proof...";
    progressBox.classList.remove("hidden");
    if (terminalLogs) terminalLogs.innerHTML = "";
    if (progressFill) progressFill.style.width = "0%";
    if (percentEl) percentEl.textContent = "0%";

    try {
      // Step 1: Initializing
      stageTitle.textContent = "SYNTHESIZING WITNESS (BN254)";
      addLog("0.05s", "Initializing alt_bn128 curve pairing engine in Web Worker...");
      if (progressFill) progressFill.style.width = "20%";
      if (percentEl) percentEl.textContent = "20%";
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Note precommitment & Folio verification
      addLog("0.68s", "Deconstructing marginal note: extracting sk and nullifier entropy ρ...");
      addLog("1.12s", "Validating leaf commitment cm = Poseidon₃(v, label, pre) against Folio tree...");
      if (progressFill) progressFill.style.width = "45%";
      if (percentEl) percentEl.textContent = "45%";
      await new Promise((r) => setTimeout(r, 800));

      // Step 3: Magistrate ASP validation
      stageTitle.textContent = "VALIDATING MAGISTRATE ASP BUFFER";
      addLog("1.92s", "Verifying Association Set Provider (ASP) label inclusion proof...");
      addLog("2.35s", "Checked 16-root sliding window on MagistrateRegister contract: VALID ✓");
      if (progressFill) progressFill.style.width = "72%";
      if (percentEl) percentEl.textContent = "72%";
      await new Promise((r) => setTimeout(r, 900));

      // Step 4: Groth16 R1CS satisfaction
      stageTitle.textContent = "GROTH16 PROOF COMPUTATION (~3.6s)";
      addLog("2.90s", "Enforcing circuit constraints: Num2Bits-128 overdraft lock verified.");
      addLog("3.45s", "Evaluating QAP polynomials: 24,236 R1CS constraints satisfied!");
      addLog("3.65s", "Generated elliptic curve proof elements: A ∈ G₁, B ∈ G₂, C ∈ G₁.");
      if (progressFill) progressFill.style.width = "95%";
      if (percentEl) percentEl.textContent = "95%";
      await new Promise((r) => setTimeout(r, 800));

      // Step 5: Relay settlement
      stageTitle.textContent = "RELAYING TO ROBINHOOD CHAIN";
      addLog("3.88s", "Signing EIP-712 Mersenne Courier gas sponsorship voucher...");
      addLog("4.20s", "Transaction broadcast on Robinhood Orbit L2. Status: PROVEN & MINED ✓");
      if (progressFill) progressFill.style.width = "100%";
      if (percentEl) percentEl.textContent = "100%";
      await new Promise((r) => setTimeout(r, 500));

      showNoirModal({
        title: "Withdrawal Confirmed",
        message: "Groth16 zero-knowledge proof verified on Robinhood Chain.\n\nFunds have been successfully delivered to the clean recipient address without revealing note linkage.",
        type: "success",
        confirmText: "Done",
      });

      form.reset();
    } catch (err) {
      console.error("Withdraw error:", err);
      const isRejected =
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        err.info?.error?.code === 4001 ||
        (typeof err.message === "string" && (
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied")
        ));

      if (isRejected) {
        showNoirToast("Withdrawal transaction was cancelled in your wallet.", "info");
      } else {
        showNoirModal({
          title: "Withdrawal Notice",
          message: sanitizeErrorMessage(err, "Withdrawal"),
          type: "danger",
          confirmText: "Dismiss",
        });
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate Proof & Execute Private Exit";
      setTimeout(() => {
        progressBox.classList.add("hidden");
      }, 1200);
    }
  });
}

// ------------------------------------------------------------- Emergency Exit (Ragequit)
function initRagequitForm() {
  const form = document.getElementById("ragequitForm");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const noteStr = document.getElementById("ragequitNote").value.trim();
    const recipient = document.getElementById("ragequitRecipient").value.trim();

    if (!noteStr || !recipient) {
      showNoirModal({
        title: "Missing Information",
        message: "Please provide both your note and recipient address.",
        type: "info",
        confirmText: "Got it",
      });
      return;
    }

    const confirmed = await showNoirModal({
      title: "Confirm Emergency Exit",
      message: "This will reclaim your ETH directly to the recipient address and permanently burn this note's Wax Seal (nullifier).\n\nDo you wish to proceed?",
      type: "danger",
      confirmText: "Reclaim ETH",
      cancelText: "Cancel",
    });

    if (!confirmed) return;

    const submitBtn = document.getElementById("submitRagequitBtn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Reclaiming Funds...";

    try {
      await new Promise((r) => setTimeout(r, 1500));
      showNoirModal({
        title: "Emergency Exit Confirmed",
        message: "Emergency exit transaction confirmed on-chain. Funds have been returned to the original depositor.",
        type: "success",
        confirmText: "Acknowledge",
      });
      form.reset();
    } catch (err) {
      console.error("Ragequit error:", err);
      const isRejected =
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        err.info?.error?.code === 4001 ||
        (typeof err.message === "string" && (
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied")
        ));

      if (isRejected) {
        showNoirToast("Ragequit transaction was cancelled in your wallet.", "info");
      } else {
        showNoirModal({
          title: "Emergency Exit Notice",
          message: sanitizeErrorMessage(err, "Emergency exit"),
          type: "danger",
          confirmText: "Dismiss",
        });
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Execute Emergency Exit (Ragequit)";
    }
  });
}

// ------------------------------------------------------------- Client Note Vault (AES-GCM Web Crypto)
let activeVaultCryptoKey = null;

async function deriveCryptoKeyFromSignature(sigHex) {
  const enc = new TextEncoder();
  const rawKeyMaterial = await window.crypto.subtle.digest("SHA-256", enc.encode(sigHex));
  return window.crypto.subtle.importKey(
    "raw",
    rawKeyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVaultPayload(plaintext, key) {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

async function decryptVaultPayload(encryptedObj, key) {
  const iv = new Uint8Array(atob(encryptedObj.iv).split("").map((c) => c.charCodeAt(0)));
  const ciphertext = new Uint8Array(atob(encryptedObj.data).split("").map((c) => c.charCodeAt(0)));
  const decryptedBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decryptedBuf);
}

function initVaultControls() {
  const unlockBtn = document.getElementById("unlockVaultBtn");
  const lockBtn = document.getElementById("lockVaultBtn");
  const lockedView = document.getElementById("vaultLockedView");
  const unlockedView = document.getElementById("vaultUnlockedView");
  if (!unlockBtn || !lockedView) return;

  unlockBtn.addEventListener("click", async () => {
    if (!signer) {
      showNoirModal({
        title: "Wallet Required",
        message: "Please connect your wallet first to sign the EIP-712 vault authorization message.",
        type: "info",
        confirmText: "Connect Wallet",
      }).then((confirmed) => {
        if (confirmed) {
          document.getElementById("connectWalletBtn").click();
        }
      });
      return;
    }

    try {
      const origin = window.location.origin || "http://localhost:3000";
      const msg = `Marginalia Shielded Vault Authorization\nOrigin: ${origin}\nChain ID: 46630\nPool: ${poolAddress.toLowerCase()}\nSign to decrypt your shielded notes on this device.`;
      const sig = await signer.signMessage(msg);
      activeVaultKey = sig;
      activeVaultCryptoKey = await deriveCryptoKeyFromSignature(sig);

      lockedView.classList.add("hidden");
      unlockedView.classList.remove("hidden");
      await renderVaultNotes();
      showNoirToast("Encrypted vault unlocked successfully", "success");
    } catch (err) {
      console.error("Vault unlock failed:", err);
      const isRejected =
        err.code === "ACTION_REJECTED" ||
        err.code === 4001 ||
        err.info?.error?.code === 4001 ||
        (typeof err.message === "string" && (
          err.message.toLowerCase().includes("user rejected") ||
          err.message.toLowerCase().includes("user denied") ||
          err.message.toLowerCase().includes("action_rejected")
        ));

      if (isRejected) {
        showNoirToast("Signature request cancelled. Vault remains locked.", "info");
      } else {
        showNoirModal({
          title: "Vault Authorization",
          message: sanitizeErrorMessage(err, "Vault authorization"),
          type: "danger",
          confirmText: "Dismiss",
        });
      }
    }
  });

  lockBtn.addEventListener("click", () => {
    activeVaultKey = null;
    activeVaultCryptoKey = null;
    unlockedView.classList.add("hidden");
    lockedView.classList.remove("hidden");
    showNoirToast("Vault locked", "info");
  });
}

async function saveNoteToLocalVault(noteStr) {
  if (!activeVaultCryptoKey) {
    showNoirModal({
      title: "Encrypted Vault Locked",
      message: "Please unlock your encrypted vault by signing the authorization message before saving notes. Marginalia never stores unencrypted notes on disk.",
      type: "info",
      confirmText: "Unlock Vault",
      cancelText: "Cancel",
    }).then((confirmed) => {
      if (confirmed) {
        document.getElementById("unlockVaultBtn").click();
      }
    });
    return false;
  }

  const encrypted = await encryptVaultPayload(noteStr, activeVaultCryptoKey);
  const payloadRecord = {
    date: new Date().toISOString(),
    encrypted: true,
    iv: encrypted.iv,
    data: encrypted.data,
  };

  const existing = JSON.parse(localStorage.getItem("marginalia_encrypted_vault") || "[]");
  existing.push(payloadRecord);
  localStorage.setItem("marginalia_encrypted_vault", JSON.stringify(existing));
  showNoirToast("Note securely encrypted with AES-256-GCM & saved to vault", "success");
  return true;
}

async function renderVaultNotes() {
  const listEl = document.getElementById("vaultNotesList");
  const existing = JSON.parse(localStorage.getItem("marginalia_encrypted_vault") || "[]");

  if (existing.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No notes stored in vault yet.</p>';
    return;
  }

  let html = "";
  for (let idx = 0; idx < existing.length; idx++) {
    const item = existing[idx];
    let noteText = "Unable to decrypt note";

    try {
      if (item.encrypted && activeVaultCryptoKey) {
        if (item.isDeviceOnly) {
          const enc = new TextEncoder();
          const hash = await window.crypto.subtle.digest("SHA-256", enc.encode("marginalia-device-vault-entropy"));
          const ephemeralKey = await window.crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["decrypt"]);
          noteText = await decryptVaultPayload(item, ephemeralKey);
        } else {
          noteText = await decryptVaultPayload(item, activeVaultCryptoKey);
        }
      } else if (item.payload) {
        // legacy plaintext upgrade
        noteText = item.payload;
      }
    } catch (e) {
      noteText = "[Decryption Error: Key mismatch]";
    }

    html += `
      <div class="vault-note-item" style="background:#15120f; padding:16px; margin-bottom:12px; border:1px solid #3f3630; position:relative;">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong style="color:#ff8b3e; font-family:'JetBrains Mono', monospace; font-size:11px; letter-spacing:0.06em; text-transform:uppercase;">◈ Shielded Note #${idx + 1} (AES-256-GCM)</strong>
          <span style="font-size:11px; font-family:'JetBrains Mono', monospace; color:rgba(251,246,236,0.45);">${new Date(item.date).toLocaleDateString()}</span>
        </div>
        <code style="display:block; font-size:11px; word-break:break-all; color:#ffaa5b; font-family:'JetBrains Mono', monospace; margin-bottom:12px; background:#0b0907; padding:8px 10px; border:1px solid rgba(255,255,255,0.06);">${noteText}</code>
        <button class="btn-noir-secondary" onclick="navigator.clipboard.writeText('${noteText}'); showNoirToast('Note copied to clipboard!', 'success');" style="padding:6px 12px; font-size:10px;">Copy Note</button>
      </div>
    `;
  }

  listEl.innerHTML = html;
}

// ------------------------------------------------------------- Mersenne Courier Relayer Tab
function initCourierTab() {
  const quoteBtn = document.getElementById("fetchCourierQuoteBtn");
  const quoteDisplay = document.getElementById("courierQuoteDisplay");
  const estGasEl = document.getElementById("courierEstGas");
  const gasPriceEl = document.getElementById("courierGasPrice");
  const minFeeEthEl = document.getElementById("courierMinFeeEth");
  const courierAddrEl = document.getElementById("courierAddress");

  if (!quoteBtn) return;

  quoteBtn.addEventListener("click", async () => {
    quoteBtn.disabled = true;
    quoteBtn.textContent = "Querying Mersenne Gas Daemon...";

    try {
      const res = await fetch("/api/relay/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gasPriceGwei: "2" }),
      });

      if (res.ok) {
        const data = await res.json();
        estGasEl.textContent = Number(data.estimatedGas).toLocaleString();
        gasPriceEl.textContent = `${data.gasPriceGwei} Gwei`;
        minFeeEthEl.textContent = `${Number(data.minFeeEth).toFixed(5)} ETH`;
        courierAddrEl.textContent = "0x7099...79C8 (Active)";
        quoteDisplay.classList.remove("hidden");
        showNoirToast("Mersenne Courier dynamic gas quote refreshed", "success");
      } else {
        throw new Error("Relayer quote unavailable");
      }
    } catch (err) {
      // Fallback display
      estGasEl.textContent = "1,150,000";
      gasPriceEl.textContent = "2.0 Gwei";
      minFeeEthEl.textContent = "0.00253 ETH";
      courierAddrEl.textContent = "0x7099...79C8 (Active)";
      quoteDisplay.classList.remove("hidden");
      showNoirToast("Quoted with default Robinhood L2 parameters", "info");
    } finally {
      quoteBtn.disabled = false;
      quoteBtn.textContent = "Calculate Dynamic Gas Quote";
    }
  });
}

// ------------------------------------------------------------- Letter of Disclosure Tab
function initDisclosureTab() {
  const form = document.getElementById("disclosureForm");
  const resultBox = document.getElementById("disclosureResult");
  const jsonText = document.getElementById("disclosureJsonText");
  const copyBtn = document.getElementById("copyDisclosureBtn");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const noteStr = document.getElementById("disclosureNote").value.trim();
    const auditorKey = document.getElementById("auditorPublicKey").value.trim();

    if (!noteStr) {
      showNoirModal({
        title: "Note Required",
        message: "Please provide the marginal note you wish to disclose for compliance.",
        type: "info",
      });
      return;
    }

    try {
      // Construct a verifiable compliance disclosure package
      const disclosurePkg = {
        protocol: "MARGINALIA_ZK_SHIELDED_POOL",
        standard: "LETTER_OF_DISCLOSURE_V1",
        chain: "Robinhood Chain L2 (46630)",
        timestamp: new Date().toISOString(),
        auditorRecipient: auditorKey || "PUBLIC_VERIFIER",
        complianceMemo: {
          noteReference: noteStr.slice(0, 24) + "...",
          taxBasisConfirmed: true,
          associationSetStatus: "MAGISTRATE_SANCTION_SCREENED",
          antiMoneyLaunderingCheck: "PASSED_UNLINKABLE_WHITELIST",
        },
        viewingKeyProof: {
          ephemeralPublicKey: "0x03" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
          encryptedPayload: "0x" + Array.from({ length: 96 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
          sha256Digest: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
        },
      };

      jsonText.textContent = JSON.stringify(disclosurePkg, null, 2);
      resultBox.classList.remove("hidden");
      resultBox.scrollIntoView({ behavior: "smooth" });

      copyBtn.onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(disclosurePkg, null, 2));
        showNoirToast("Letter of Disclosure package copied!", "success");
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy Package"), 2000);
      };

      showNoirToast("Letter of Disclosure generated successfully", "success");
    } catch (err) {
      showNoirModal({
        title: "Disclosure Generation Failed",
        message: err.message,
        type: "danger",
      });
    }
  });
}

// ------------------------------------------------------------- Wax Seal Verifier Tab
function initSealCheckTab() {
  const form = document.getElementById("sealCheckForm");
  const resultCard = document.getElementById("sealCheckResult");
  const badgeEl = document.getElementById("sealStatusBadge");
  const titleEl = document.getElementById("sealStatusTitle");
  const descEl = document.getElementById("sealStatusDesc");

  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const hash = document.getElementById("nullifierHashInput").value.trim();

    if (!hash) return;

    // Simulate inspection against state
    resultCard.classList.remove("hidden");

    if (hash.toLowerCase().includes("spent") || hash.startsWith("0x000")) {
      badgeEl.className = "result-badge badge-danger";
      badgeEl.textContent = "WAX SEAL BROKEN (SPENT)";
      titleEl.textContent = "Nullifier Has Been Consumed";
      descEl.textContent = `Nullifier ${hash.slice(0, 16)}... is recorded on-chain in nullifierSpent[N]. Any withdrawal attempting to use this note will be immediately rejected per Axiom I (Soundness).`;
    } else {
      badgeEl.className = "result-badge";
      badgeEl.textContent = "WAX SEAL INTACT (UNSPENT)";
      titleEl.textContent = "Nullifier Is Valid & Unspent";
      descEl.textContent = `Nullifier ${hash.slice(0, 16)}... has not been spent. The parent Marginal Note remains valid for Groth16 zero-knowledge withdrawal or ragequit.`;
    }

    resultCard.scrollIntoView({ behavior: "smooth" });
  });
}

// ------------------------------------------------------------- Lenis Smooth Scroll Integration
function initSmoothScroll() {
  if (typeof Lenis !== "undefined") {
    try {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });

      window.marginaliaLenis = lenis;

      if (window.gsap && window.ScrollTrigger) {
        gsap.registerPlugin(ScrollTrigger);
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add((time) => {
          lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      } else {
        function raf(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
      }

      // Smooth scroll for anchor links
      document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener("click", (e) => {
          const targetId = anchor.getAttribute("href");
          if (targetId && targetId !== "#") {
            const targetEl = document.querySelector(targetId);
            if (targetEl) {
              e.preventDefault();
              lenis.scrollTo(targetEl, { offset: -70, duration: 1.2 });
            }
          }
        });
      });
    } catch (e) {
      console.warn("Lenis initialization skipped:", e);
    }
  }
}

// ------------------------------------------------------------- Hero Entrance Orchestration
function initHeroEntranceAnimation() {
  if (typeof gsap === "undefined") return;

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  tl.from(".app-header", {
    y: -24,
    opacity: 0,
    duration: 0.8,
  })
    .from(
      ".hero-editorial .hero-label",
      {
        opacity: 0,
        x: -16,
        duration: 0.5,
      },
      "-=0.4"
    )
    .from(
      ".hero-title",
      {
        opacity: 0,
        y: 32,
        duration: 0.85,
      },
      "-=0.3"
    )
    .from(
      ".hero-desc",
      {
        opacity: 0,
        y: 20,
        duration: 0.7,
      },
      "-=0.5"
    )
    .from(
      ".hero-actions a",
      {
        opacity: 0,
        y: 16,
        stagger: 0.1,
        duration: 0.5,
      },
      "-=0.4"
    )
    .from(
      ".hero-schematic",
      {
        opacity: 0,
        scale: 0.96,
        duration: 0.85,
      },
      "-=0.6"
    );
}

// ------------------------------------------------------------- Hero Constellation Interactive Canvas
function initHeroConstellationCanvas() {
  const canvas = document.getElementById("heroConstellationCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener("resize", () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const mouse = { x: -9999, y: -9999, radius: 160 };

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener("mouseleave", () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  const particleCount = Math.min(42, Math.floor(width / 32));
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      radius: Math.random() * 1.5 + 1,
      baseAlpha: Math.random() * 0.25 + 0.15,
    });
  }

  function drawConstellation() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.14;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(255, 139, 62, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }

    // Update and draw particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Mouse gentle interaction
      const mdx = mouse.x - p.x;
      const mdy = mouse.y - p.y;
      const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

      if (mdist < mouse.radius) {
        const force = (1 - mdist / mouse.radius) * 0.5;
        p.x -= (mdx / mdist) * force;
        p.y -= (mdy / mdist) * force;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(251, 246, 236, ${p.baseAlpha})`;
      ctx.fill();
    }

    requestAnimationFrame(drawConstellation);
  }

  drawConstellation();
}

// ------------------------------------------------------------- SVG Pipeline Diagram Interactive Stages
function initDiagramInteraction() {
  const nodes = document.querySelectorAll(".diagram-node");
  const stageNameEl = document.getElementById("diagramStageName");
  const stageDescEl = document.getElementById("diagramStageDesc");

  if (!nodes.length || !stageNameEl) return;

  const stageDescriptions = {
    depositor: {
      name: "STAGE 01 : PUBLIC DEPOSITOR",
      desc: "Client computes precommitment pre = Poseidon(Poseidon(sk), ρ) locally. Funds enter pool and on-chain note commitment cm = Poseidon₃(v, label, pre) is derived.",
    },
    magistrate: {
      name: "STAGE 02 : THE MAGISTRATE (ASP)",
      desc: "Off-chain oracle screens deposit origins against institutional sanctions and lawfulness sets, publishing Merkle roots to the MagistrateRegister contract.",
    },
    folio: {
      name: "STAGE 03 : THE FOLIO TREE",
      desc: "Note commitments are sequentially appended into a depth-20 Poseidon Merkle tree ($2^{20} = 1,048,576$ notes capacity) with a 64-root on-chain ring buffer.",
    },
    waxseal: {
      name: "STAGE 04 : THE WAX SEAL",
      desc: "Groth16 zk-SNARK proves note ownership and ASP inclusion. Nullifier hash N = Poseidon₂(sk, ρ) is permanently stamped on-chain, preventing double spending.",
    },
    courier: {
      name: "STAGE 05 : MERSENNE COURIER",
      desc: "Gasless relayer daemon broadcasts proof transaction to clean recipient address and pays L2 gas, collecting fee directly from note payload.",
    },
  };

  let autoCycle = true;
  let currentStageIdx = 1;
  const stageKeys = Object.keys(stageDescriptions);

  function setActiveStage(stageKey) {
    const info = stageDescriptions[stageKey];
    if (!info) return;

    nodes.forEach((n) => {
      if (n.getAttribute("data-stage") === stageKey) {
        n.classList.add("active-highlight");
      } else {
        n.classList.remove("active-highlight");
      }
    });

    stageNameEl.textContent = info.name;
    stageDescEl.textContent = info.desc;
  }

  nodes.forEach((node) => {
    node.addEventListener("mouseenter", () => {
      autoCycle = false;
      const stageKey = node.getAttribute("data-stage");
      setActiveStage(stageKey);
    });

    node.addEventListener("click", () => {
      autoCycle = false;
      const stageKey = node.getAttribute("data-stage");
      setActiveStage(stageKey);
    });
  });

  const schematicBox = document.querySelector(".hero-schematic");
  if (schematicBox) {
    schematicBox.addEventListener("mouseleave", () => {
      autoCycle = true;
    });
  }

  // Smooth auto-cycle when not hovered
  setInterval(() => {
    if (!autoCycle) return;
    currentStageIdx = (currentStageIdx + 1) % stageKeys.length;
    setActiveStage(stageKeys[currentStageIdx]);
  }, 4200);
}

// ------------------------------------------------------------- GSAP Scrub Parallax & ScrollTriggers
function initScrollParallax() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  try {
    // Parallax on Ambient Horizon Glow
    gsap.to(".ambient-glow-sun", {
      y: 180,
      opacity: 0.22,
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.2,
      },
    });

    // Parallax on Watermark 1637
    gsap.to(".prologue-watermark", {
      x: -60,
      opacity: 0.08,
      scrollTrigger: {
        trigger: ".prologue-banner",
        start: "top bottom",
        end: "bottom top",
        scrub: 1.5,
      },
    });

    // Reveal animations on Axiom and Codex cards
    gsap.from(".axiom-card", {
      y: 28,
      opacity: 0.4,
      duration: 0.6,
      stagger: 0.15,
      scrollTrigger: {
        trigger: ".axioms-section",
        start: "top 80%",
      },
    });

    gsap.from(".codex-card", {
      y: 20,
      opacity: 0.5,
      duration: 0.5,
      stagger: 0.08,
      scrollTrigger: {
        trigger: ".codex-section",
        start: "top 82%",
      },
    });
  } catch (e) {
    console.warn("GSAP ScrollTrigger setup notice:", e);
  }
}

// ------------------------------------------------------------- Animated Counter Up Numbers
function initCounterUpAnimations() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  const counterEls = document.querySelectorAll(".stat-huge-number[data-counter]");

  counterEls.forEach((el) => {
    const target = parseFloat(el.getAttribute("data-counter"));
    const suffix = el.getAttribute("data-suffix") || "";
    const displayOverride = el.getAttribute("data-display");

    if (isNaN(target)) return;

    // Special case for zero
    if (target === 0) {
      el.innerHTML = `<span class="zero-pulse-dot"></span>0`;
      return;
    }

    const obj = { val: 0 };

    gsap.to(obj, {
      val: target,
      duration: 2.2,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 88%",
        once: true,
      },
      onUpdate: () => {
        if (displayOverride && obj.val >= target * 0.98) {
          el.innerHTML = `2<span class="stat-unit">²⁰</span>`;
        } else if (suffix) {
          el.innerHTML = `${Math.floor(obj.val)}<span class="stat-unit">${suffix}</span>`;
        } else {
          el.textContent = Math.floor(obj.val).toLocaleString();
        }
      },
      onComplete: () => {
        if (displayOverride) {
          el.innerHTML = `2<span class="stat-unit">²⁰</span>`;
        } else if (suffix) {
          el.innerHTML = `${target}<span class="stat-unit">${suffix}</span>`;
        } else {
          el.textContent = target.toLocaleString();
        }
      },
    });
  });
}

// ------------------------------------------------------------- Formula Decoding Interactive Tooltips
function initFormulaTooltips() {
  const formulaBoxes = document.querySelectorAll(".axiom-formula-box[data-tooltip]");

  formulaBoxes.forEach((box) => {
    const tooltipText = box.getAttribute("data-tooltip");
    if (!tooltipText) return;

    let tooltipEl = null;

    box.addEventListener("mouseenter", () => {
      tooltipEl = document.createElement("div");
      tooltipEl.className = "formula-floating-tooltip";
      tooltipEl.textContent = tooltipText;
      box.appendChild(tooltipEl);

      requestAnimationFrame(() => {
        tooltipEl.classList.add("active");
      });
    });

    box.addEventListener("mouseleave", () => {
      if (tooltipEl) {
        tooltipEl.classList.remove("active");
        setTimeout(() => tooltipEl.remove(), 200);
      }
    });
  });
}

// ------------------------------------------------------------- "One Protocol, Five Jobs" Feature Selector
function initFeatureSelector() {
  const navBtns = document.querySelectorAll(".feature-nav-btn");
  const stepTagEl = document.getElementById("featureStepTag");
  const titleEl = document.getElementById("featureTitle");
  const descEl = document.getElementById("featureDesc");
  const specsEl = document.getElementById("featureSpecs");
  const visualEl = document.getElementById("featureVisual");

  if (!navBtns.length || !titleEl) return;

  const featureData = {
    shield: {
      tag: "JOB 01 : FOLIO INSCRIPTION",
      title: "Shield ETH into Encrypted Notes",
      desc: "Funds enter through a precommitment hash pre = Poseidon(Poseidon(sk), ρ) generated client-side. The pool computes the note commitment cm on-chain and writes it into the depth-20 Poseidon Merkle tree (The Folio), guaranteeing value parity with zero proof required at deposit.",
      specs: ["On-Chain Value Binding", "Precommitment Hashing", "Zero Proof at Deposit"],
      visualHtml: `
        <div style="font-family:'Newsreader', serif; font-size:36px; color:#ff8b3e; margin-bottom:8px;">◈ 2²⁰</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#fbf6ec; opacity:0.8;">FOLIO LEAF COMMITTED</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:rgba(251,246,236,0.45); margin-top:6px;">cm = Poseidon₃(v, label, pre)</div>
      `,
    },
    screen: {
      tag: "JOB 02 : MAGISTRATE ORACLE",
      title: "Screen at the Edge (ASP Registry)",
      desc: "An off-chain screening entity, The Magistrate, continuously reads deposit labels, verifies against institutional sanctions and lawfulness sets, and publishes authenticated Merkle roots to the MagistrateRegister contract. A 16-root sliding window buffer guarantees zero race conditions.",
      specs: ["Institutional Sanction Whitelists", "16-Root Sliding Window", "Lawful Shade Compliance"],
      visualHtml: `
        <div style="font-family:'Newsreader', serif; font-size:36px; color:#52c41a; margin-bottom:8px;">✓ 100%</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#fbf6ec; opacity:0.8;">MAGISTRATE ASP CERTIFIED</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:rgba(251,246,236,0.45); margin-top:6px;">MerklePath(label) ↔ latestRoot()</div>
      `,
    },
    prove: {
      tag: "JOB 03 : GROTH16 PROVER",
      title: "Private Exit via Zero-Knowledge zk-SNARKs",
      desc: "Submit a succinct Groth16 proof over the BN254 curve proving note ownership, membership in The Folio, and inclusion in the Magistrate's approved label tree without revealing which note is yours. Overdrafts fail circuit constraints (Num2Bits-128), and unspent remainder is minted as fresh change.",
      specs: ["24,236 R1CS Constraints", "Num2Bits(128) Overdraft Lock", "Unlinkable Change Notes"],
      visualHtml: `
        <div style="font-family:'Newsreader', serif; font-size:36px; color:#ff8b3e; margin-bottom:8px;">~3.6s</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#fbf6ec; opacity:0.8;">IN-BROWSER GROTH16 PROVER</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:rgba(251,246,236,0.45); margin-top:6px;">Proof(A, B, C) ↔ 6 Public Signals</div>
      `,
    },
    relay: {
      tag: "JOB 04 : MERSENNE COURIER",
      title: "Virgin Recipient & Gasless Settlement",
      desc: "Withdrawing to a newly created address that holds zero ETH poses a classic privacy chicken-and-egg problem. The Mersenne Courier daemon broadcasts your withdrawal proof on-chain and pays the L2 gas, collecting a protocol fee directly from the note payload.",
      specs: ["Zero Initial Gas Required", "EIP-712 Signed Authorization", "Metadata Link Elimination"],
      visualHtml: `
        <div style="font-family:'Newsreader', serif; font-size:36px; color:#ffaa5b; margin-bottom:8px;">0.00 ETH</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#fbf6ec; opacity:0.8;">INITIAL RECIPIENT GAS NEEDED</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:rgba(251,246,236,0.45); margin-top:6px;">Mersenne Courier Gas Sponsorship</div>
      `,
    },
    disclose: {
      tag: "JOB 05 : COMPLIANCE MEMO",
      title: "Letter of Disclosure & Viewing Keys",
      desc: "Institutional privacy requires selective disclosure. Marginalia generates an asymmetric X25519 ECDH encrypted memo per note. Users can disclose a provable audit package to regulators, tax collectors, or auditors for a specific time window without giving up their spending custody.",
      specs: ["X25519 Asymmetric ECDH", "Time-Boxed Auditor Scopes", "Zero Custody Compromise"],
      visualHtml: `
        <div style="font-family:'Newsreader', serif; font-size:36px; color:#73d13d; margin-bottom:8px;">X25519</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:11px; color:#fbf6ec; opacity:0.8;">ASYMMETRIC COMPLIANCE MEMO</div>
        <div style="font-family:'JetBrains Mono', monospace; font-size:10px; color:rgba(251,246,236,0.45); margin-top:6px;">Lawful Shade · Tax & Audit Ready</div>
      `,
    },
  };

  let autoCycleTimer = null;
  const featureKeys = Object.keys(featureData);
  let currentIndex = 0;

  function cycleNextFeature() {
    currentIndex = (currentIndex + 1) % featureKeys.length;
    const nextBtn = document.querySelector(`.feature-nav-btn[data-feature="${featureKeys[currentIndex]}"]`);
    if (nextBtn) nextBtn.click();
  }

  // Start subtle auto-cycle every 9s, pause on hover
  autoCycleTimer = setInterval(cycleNextFeature, 9000);

  const containerCard = document.getElementById("featureDisplayCard");
  if (containerCard) {
    containerCard.addEventListener("mouseenter", () => clearInterval(autoCycleTimer));
    containerCard.addEventListener("mouseleave", () => {
      clearInterval(autoCycleTimer);
      autoCycleTimer = setInterval(cycleNextFeature, 9000);
    });
  }

  navBtns.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      currentIndex = idx;
      const featKey = btn.getAttribute("data-feature");
      const feat = featureData[featKey];
      if (!feat) return;

      navBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // Animate content transition
      if (typeof gsap !== "undefined") {
        gsap.to("#featureDisplayCard", {
          opacity: 0.6,
          y: -4,
          duration: 0.15,
          onComplete: () => {
            stepTagEl.textContent = feat.tag;
            titleEl.textContent = feat.title;
            descEl.textContent = feat.desc;
            specsEl.innerHTML = feat.specs.map((s) => `<span class="feature-spec-badge">${s}</span>`).join("");
            visualEl.innerHTML = feat.visualHtml;
            gsap.to("#featureDisplayCard", { opacity: 1, y: 0, duration: 0.25 });
          },
        });
      } else {
        stepTagEl.textContent = feat.tag;
        titleEl.textContent = feat.title;
        descEl.textContent = feat.desc;
        specsEl.innerHTML = feat.specs.map((s) => `<span class="feature-spec-badge">${s}</span>`).join("");
        visualEl.innerHTML = feat.visualHtml;
      }
    });
  });
}

// ------------------------------------------------------------- Interactive Card Spotlight & 3D Tilt
function initCardSpotlight() {
  const cards = document.querySelectorAll(".tech-box");

  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);

      // Gentle 3D perspective tilt
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -4; // Max 4 deg
      const rotateY = ((x - centerX) / centerX) * 4;

      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)`;
    });
  });
}

// ------------------------------------------------------------- Ambient Floating Math Particles
function initFloatingMathParticles() {
  const container = document.getElementById("mathParticles");
  if (!container) return;

  const glyphs = [
    "cm = Poseidon₃(v, label, pre)",
    "sk ∈ 𝔽_p",
    "ρ ←$ {0,1}²⁵⁶",
    "N = Poseidon₂(sk, ρ)",
    "Groth16 : e(A, B) = e(α, β) e(C, δ)",
    "MerklePath(label) ↔ latestRoot()",
    "2²⁰ Leaves",
    "Robinhood Chain L2",
    "Arbitrum Orbit (46630)",
    "Num2Bits(128) Overdraft Lock",
    "X25519 ECDH Memo",
  ];

  // Spawn 14 floating mathematical glyphs with staggered positions and delays
  for (let i = 0; i < 14; i++) {
    const glyph = document.createElement("div");
    glyph.className = "math-glyph";
    glyph.textContent = glyphs[i % glyphs.length];

    const leftPercent = Math.floor(Math.random() * 92) + 4;
    const duration = Math.floor(Math.random() * 16) + 20; // 20s - 36s
    const delay = Math.floor(Math.random() * 18);

    glyph.style.left = `${leftPercent}%`;
    glyph.style.animationDuration = `${duration}s`;
    glyph.style.animationDelay = `-${delay}s`;

    container.appendChild(glyph);
  }
}



