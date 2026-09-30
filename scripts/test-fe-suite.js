// MARGINALIA Automated Frontend End-to-End Test Suite
// Executes against live Chrome instance via puppeteer-core
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const M = require("../lib/marginalia");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\bimo\\.gemini\\antigravity-ide\\brain\\b83349cd-2b43-46d7-bab7-879e21ffaf38\\fe_test_screenshots";

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function closeModal(page) {
  try {
    const closeBtn = await page.$("#noirModalCloseBtn");
    if (closeBtn) {
      await closeBtn.click();
      await new Promise((r) => setTimeout(r, 350));
    }
  } catch (_) {}
  await page.evaluate(() => {
    document.querySelectorAll(".noir-modal-backdrop").forEach((b) => b.remove());
  });
  await new Promise((r) => setTimeout(r, 200));
}

async function switchTab(page, tabName) {
  await closeModal(page);
  await page.evaluate((tab) => {
    const btn = document.querySelector(`button[data-tab="${tab}"]`);
    if (btn) btn.click();
  }, tabName);
  await new Promise((r) => setTimeout(r, 400));
}

async function runFeTestSuite() {
  console.log("=== STARTING MARGINALIA FRONTEND E2E TEST SUITE ===");
  const results = [];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1600,1000"],
    defaultViewport: { width: 1600, height: 1000 },
  });

  const page = await browser.newPage();

  try {
    // ------------------------------------------------------------------------------------
    // TEST 1: Shielded App - Telemetry & Navigation
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 1] Loading http://localhost:3001/app.html...");
    await page.goto("http://localhost:3001/app.html", { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      document.querySelectorAll("form").forEach((f) => (f.noValidate = true));
    });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "01_app_loaded.png") });

    const pageTitle = await page.title();
    console.log(`Page Title: ${pageTitle}`);
    if (pageTitle.includes("Shielded App")) {
      results.push({ test: "1. App Page Load", status: "PASS", detail: pageTitle });
    } else {
      results.push({ test: "1. App Page Load", status: "FAIL", detail: `Unexpected title: ${pageTitle}` });
    }

    // ------------------------------------------------------------------------------------
    // TEST 2: Shielded Deposit - Wallet Required Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 2] Testing Deposit Wallet Required guard...");
    await switchTab(page, "deposit");
    await page.waitForSelector("#submitDepositBtn", { visible: true });
    await page.type("#depositAmount", "0.05");
    await page.click("#submitDepositBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleDeposit = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleDeposit}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "02_deposit_wallet_required.png") });

    if (modalTitleDeposit === "Wallet Required") {
      results.push({ test: "2. Deposit Wallet Guard", status: "PASS", detail: "Displays 'Wallet Required' modal" });
    } else {
      results.push({ test: "2. Deposit Wallet Guard", status: "FAIL", detail: `Expected 'Wallet Required', got: ${modalTitleDeposit}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 3: Withdraw - Missing Fields Validation
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing Withdraw Missing Information check...");
    await switchTab(page, "withdraw");
    await page.waitForSelector("#submitWithdrawBtn", { visible: true });
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleMissing = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleMissing}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "03_withdraw_missing_info.png") });

    if (modalTitleMissing === "Missing Information") {
      results.push({ test: "3. Withdraw Missing Information Guard", status: "PASS", detail: "Rejected empty inputs" });
    } else {
      results.push({ test: "3. Withdraw Missing Information Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleMissing}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 4: Withdraw - Invalid Recipient Address Validation
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing Withdraw Invalid Recipient check...");
    await switchTab(page, "withdraw");
    await page.type("#withdrawNote", "marginalia-note-v1-abc");
    await page.type("#withdrawRecipient", "not-a-valid-eth-address");
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleBadRecipient = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleBadRecipient}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "04_withdraw_invalid_recipient.png") });

    if (modalTitleBadRecipient === "Invalid Recipient Address") {
      results.push({ test: "4. Withdraw Recipient Address Check", status: "PASS", detail: "Rejected non-Ethereum address" });
    } else {
      results.push({ test: "4. Withdraw Recipient Address Check", status: "FAIL", detail: `Unexpected title: ${modalTitleBadRecipient}` });
    }
    await closeModal(page);

    // Clear inputs
    await page.evaluate(() => {
      document.getElementById("withdrawNote").value = "";
      document.getElementById("withdrawRecipient").value = "";
    });

    // ------------------------------------------------------------------------------------
    // TEST 5: Withdraw - Tampered / Corrupted Note Rejection
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing Withdraw Tampered Note Rejection...");
    await switchTab(page, "withdraw");
    await page.type("#withdrawNote", "marginalia-note-v1-tamperedFakeNotePayloadData12345");
    await page.type("#withdrawRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleTampered = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    const modalBodyTampered = await page.$eval(".noir-modal-body", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleTampered}`);
    console.log(`Modal Body: ${modalBodyTampered}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "05_withdraw_tampered_note_rejected.png") });

    if (modalTitleTampered.includes("Invalid Secret") || modalTitleTampered.includes("Validation Failed")) {
      results.push({ test: "5. Withdraw Tampered Note Rejection", status: "PASS", detail: modalBodyTampered });
    } else {
      results.push({ test: "5. Withdraw Tampered Note Rejection", status: "FAIL", detail: `Modal title was ${modalTitleTampered}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 6: Withdraw - Uninscribed Folio Note Rejection
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 6] Testing Withdraw Uninscribed Note Rejection...");
    await switchTab(page, "withdraw");
    const sec = await M.newSecret();
    const testVal = 1000000000000000000n;
    const testLabel = 9999n;
    const testCm = await M.commitmentOf(testVal, testLabel, sec.precommitment);
    const validSyntaxNote = M.serializeNote({
      sk: sec.sk,
      rho: sec.rho,
      value: testVal,
      label: testLabel,
      commitment: testCm,
    });

    await page.evaluate(() => {
      document.getElementById("withdrawNote").value = "";
      document.getElementById("withdrawRecipient").value = "";
    });

    await page.type("#withdrawNote", validSyntaxNote);
    await page.type("#withdrawRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 15000 });

    const modalTitleUninscribed = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    const modalBodyUninscribed = await page.$eval(".noir-modal-body", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleUninscribed}`);
    console.log(`Modal Body: ${modalBodyUninscribed}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "06_withdraw_uninscribed_note_rejected.png") });

    if (modalTitleUninscribed.includes("Validation Failed") && modalBodyUninscribed.includes("Folio")) {
      results.push({ test: "6. Withdraw Folio Tree Inclusion Guard", status: "PASS", detail: modalBodyUninscribed });
    } else {
      results.push({ test: "6. Withdraw Folio Tree Inclusion Guard", status: "FAIL", detail: modalBodyUninscribed });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 7: Mersenne Courier - Dynamic Gas Fee Quoting
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing Mersenne Courier tab & Dynamic Gas Quoting...");
    await switchTab(page, "courier");
    await page.waitForSelector("#fetchCourierQuoteBtn", { visible: true });
    await page.click("#fetchCourierQuoteBtn");
    await page.waitForSelector("#courierQuoteDisplay:not(.hidden)", { visible: true, timeout: 5000 });

    const gasPrice = await page.$eval("#courierGasPrice", (el) => el.textContent.trim());
    const minFee = await page.$eval("#courierMinFeeEth", (el) => el.textContent.trim());
    const courierAddr = await page.$eval("#courierAddress", (el) => el.textContent.trim());
    console.log(`Gas Price: ${gasPrice}, Min Fee: ${minFee}, Courier: ${courierAddr}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "07_courier_quote_received.png") });

    if (gasPrice.includes("Gwei") && minFee.includes("ETH") && courierAddr.includes("Active")) {
      results.push({ test: "7. Mersenne Courier Dynamic Fee Quote", status: "PASS", detail: `Fee: ${minFee}, Relayer: ${courierAddr}` });
    } else {
      results.push({ test: "7. Mersenne Courier Dynamic Fee Quote", status: "FAIL", detail: "Quote box values malformed" });
    }

    // ------------------------------------------------------------------------------------
    // TEST 8: Emergency Exit (Ragequit) - Verification Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 8] Testing Emergency Exit (Ragequit) tab...");
    await switchTab(page, "ragequit");
    await page.waitForSelector("#submitRagequitBtn", { visible: true });
    await page.type("#ragequitNote", "marginalia-note-v1-invalidragequitnote");
    await page.type("#ragequitRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    await page.click("#submitRagequitBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleRagequit = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleRagequit}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "08_ragequit_rejected_invalid_note.png") });

    if (modalTitleRagequit === "Invalid Secret Note") {
      results.push({ test: "8. Ragequit Invalid Note Guard", status: "PASS", detail: "Rejects invalid note format" });
    } else {
      results.push({ test: "8. Ragequit Invalid Note Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleRagequit}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 9: Encrypted Vault - Wallet Signature Protection
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 9] Testing Encrypted Vault tab...");
    await switchTab(page, "vault");
    await page.waitForSelector("#unlockVaultBtn", { visible: true });
    await page.click("#unlockVaultBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleVault = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleVault}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "09_vault_wallet_required.png") });

    if (modalTitleVault === "Wallet Required") {
      results.push({ test: "9. Encrypted Vault Wallet Guard", status: "PASS", detail: "Requires wallet EIP-712 signature" });
    } else {
      results.push({ test: "9. Encrypted Vault Wallet Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleVault}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 10: Explorer Page - Real Telemetry & Wax Seal Verifier
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 10] Testing Explorer Page (http://localhost:3001/explorer.html)...");
    await page.goto("http://localhost:3001/explorer.html", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 1200));

    const folioNotesCount = await page.$eval("#folioNotesCount", (el) => el.textContent.trim());
    const aspApprovedCount = await page.$eval("#aspApprovedCount", (el) => el.textContent.trim());
    const poolBalance = await page.$eval("#poolBalance", (el) => el.textContent.trim());
    console.log(`Explorer Telemetry -> Folio: ${folioNotesCount}, ASP: ${aspApprovedCount}, TVL: ${poolBalance} ETH`);

    // Test Wax Seal Verifier with spent hash
    await page.type("#nullifierHashInput", "999888777666555444333");
    await page.click('button[type="submit"]');
    await page.waitForSelector("#sealCheckResult:not(.hidden)", { visible: true });
    await new Promise((r) => setTimeout(r, 500));

    const sealBadgeText = await page.$eval("#sealStatusBadge", (el) => el.textContent.trim());
    console.log(`Wax Seal Status: ${sealBadgeText}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "10_explorer_wax_seal_spent.png") });

    if (sealBadgeText.includes("BROKEN (SPENT)")) {
      results.push({ test: "10. Wax Seal Verifier (Spent Detection)", status: "PASS", detail: sealBadgeText });
    } else {
      results.push({ test: "10. Wax Seal Verifier (Spent Detection)", status: "FAIL", detail: `Status was: ${sealBadgeText}` });
    }

    // Test Wax Seal Verifier with unspent hash
    await page.evaluate(() => { document.getElementById("nullifierHashInput").value = ""; });
    await page.type("#nullifierHashInput", "111222333444555666777");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 500));

    const sealBadgeUnspent = await page.$eval("#sealStatusBadge", (el) => el.textContent.trim());
    console.log(`Wax Seal Status (Unspent): ${sealBadgeUnspent}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "11_explorer_wax_seal_unspent.png") });

    if (sealBadgeUnspent.includes("INTACT (UNSPENT)")) {
      results.push({ test: "11. Wax Seal Verifier (Unspent Detection)", status: "PASS", detail: sealBadgeUnspent });
    } else {
      results.push({ test: "11. Wax Seal Verifier (Unspent Detection)", status: "FAIL", detail: `Status was: ${sealBadgeUnspent}` });
    }

    // ------------------------------------------------------------------------------------
    // TEST 12: Compliance Page - Letter of Disclosure Generation (X25519)
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 12] Testing Compliance Page (http://localhost:3001/compliance.html)...");
    await page.goto("http://localhost:3001/compliance.html", { waitUntil: "networkidle0" });

    // Generate genuine note for compliance test
    const secComp = await M.newSecret();
    const compVal = 1000000000000000000n;
    const compLabel = 777n;
    const compCm = await M.commitmentOf(compVal, compLabel, secComp.precommitment);
    const compNoteStr = M.serializeNote({
      sk: secComp.sk,
      rho: secComp.rho,
      value: compVal,
      label: compLabel,
      commitment: compCm,
    });

    await page.type("#disclosureNote", compNoteStr);
    await page.click("#generateDisclosureBtn");
    await page.waitForSelector("#disclosureResult:not(.hidden)", { visible: true, timeout: 5000 });

    const disclosureJson = await page.$eval("#disclosureJsonText", (el) => el.textContent.trim());
    const parsedPkg = JSON.parse(disclosureJson);
    console.log(`Disclosure Standard: ${parsedPkg.standard}, Timestamp: ${parsedPkg.timestamp}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "12_compliance_disclosure_generated.png") });

    if (parsedPkg.standard === "LETTER_OF_DISCLOSURE_V1" && parsedPkg.viewingKeyProof && parsedPkg.viewingKeyProof.ciphertext) {
      results.push({ test: "12. Cryptographic Letter of Disclosure (X25519)", status: "PASS", detail: `Ciphertext: ${parsedPkg.viewingKeyProof.ciphertext.slice(0, 16)}...` });
    } else {
      results.push({ test: "12. Cryptographic Letter of Disclosure (X25519)", status: "FAIL", detail: "Disclosure package missing expected fields" });
    }

  } catch (err) {
    console.error("Test execution error:", err);
    results.push({ test: "UNHANDLED EXCEPTION", status: "ERROR", detail: err.message });
  } finally {
    await browser.close();
  }

  console.log("\n=================== TEST RESULTS SUMMARY ===================");
  console.table(results);

  // Write results JSON to artifacts
  fs.writeFileSync(path.join(ARTIFACTS_DIR, "fe_test_summary.json"), JSON.stringify(results, null, 2));
  return results;
}

runFeTestSuite();
