// Next.js MARGINALIA Automated E2E Test Suite
const puppeteer = require("puppeteer-core");
const path = require("path");
const fs = require("fs");
const M = require("../lib/marginalia");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACTS_DIR = "C:\\Users\\bimo\\.gemini\\antigravity-ide\\brain\\b83349cd-2b43-46d7-bab7-879e21ffaf38\\nextjs_test_screenshots";

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function dismissIntro(page) {
  try {
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const intro = document.getElementById("introSequenceOverlay");
      if (intro) intro.remove();
    });
    await new Promise((r) => setTimeout(r, 200));
  } catch (_) {}
}

async function closeModal(page) {
  try {
    await dismissIntro(page);
    const closeBtn = await page.$("#noirModalCloseBtn");
    if (closeBtn) {
      await closeBtn.click();
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (_) {}
  await page.evaluate(() => {
    document.querySelectorAll(".noir-modal-backdrop").forEach((b) => b.remove());
  });
  await new Promise((r) => setTimeout(r, 200));
}

async function clearAndType(page, selector, text) {
  await page.focus(selector);
  await page.keyboard.down("Control");
  await page.keyboard.press("KeyA");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (text) {
    await page.type(selector, text);
  }
}

async function switchTab(page, tabName) {
  await closeModal(page);
  await page.waitForSelector(`button[data-tab="${tabName}"]`, { timeout: 5000 });
  await page.evaluate((tab) => {
    const btn = document.querySelector(`button[data-tab="${tab}"]`);
    if (btn) btn.click();
  }, tabName);
  await new Promise((r) => setTimeout(r, 400));
}

async function runNextJsTestSuite() {
  console.log("=== STARTING NEXT.JS MARGINALIA TEST SUITE (PORT 3002) ===");
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
    // TEST 1: Next.js Landing Page
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 1] Loading Next.js Home (http://127.0.0.1:3002/)...");
    await page.goto("http://127.0.0.1:3002/", { waitUntil: "domcontentloaded" });
    await dismissIntro(page);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "01_nextjs_home.png") });

    const homeTitle = await page.title();
    console.log(`Page Title: ${homeTitle}`);
    if (homeTitle.includes("MARGINALIA")) {
      results.push({ test: "1. Next.js Landing Page", status: "PASS", detail: homeTitle });
    } else {
      results.push({ test: "1. Next.js Landing Page", status: "FAIL", detail: `Unexpected title: ${homeTitle}` });
    }

    // ------------------------------------------------------------------------------------
    // TEST 2: Shielded App - Deposit Wallet Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 2] Navigating to http://127.0.0.1:3002/app...");
    await page.goto("http://127.0.0.1:3002/app", { waitUntil: "domcontentloaded" });
    await dismissIntro(page);
    await page.evaluate(() => {
      document.querySelectorAll("form").forEach((f) => (f.noValidate = true));
    });
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "02_nextjs_app_loaded.png") });

    console.log("Testing Deposit Wallet Guard...");
    await switchTab(page, "deposit");
    await page.type("#depositAmount", "0.05");
    await page.click("#submitDepositBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleDeposit = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleDeposit}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "03_nextjs_deposit_guard.png") });

    if (modalTitleDeposit === "Wallet Required") {
      results.push({ test: "2. Deposit Wallet Guard", status: "PASS", detail: "Displays 'Wallet Required' modal" });
    } else {
      results.push({ test: "2. Deposit Wallet Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleDeposit}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 3: Withdraw - Missing Information Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 3] Testing Withdraw Missing Information check...");
    await switchTab(page, "withdraw");
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleMissing = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleMissing}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "04_nextjs_withdraw_missing.png") });

    if (modalTitleMissing === "Missing Information") {
      results.push({ test: "3. Withdraw Missing Info Guard", status: "PASS", detail: "Rejected empty inputs" });
    } else {
      results.push({ test: "3. Withdraw Missing Info Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleMissing}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 4: Withdraw - Invalid Recipient Address Check
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 4] Testing Withdraw Invalid Recipient Address check...");
    await switchTab(page, "withdraw");
    await page.type("#withdrawNote", "marginalia-note-v1-abc");
    await page.type("#withdrawRecipient", "invalid-eth-recipient");
    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleRecipient = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleRecipient}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "05_nextjs_withdraw_bad_recipient.png") });

    if (modalTitleRecipient === "Invalid Recipient Address") {
      results.push({ test: "4. Withdraw Recipient Address Check", status: "PASS", detail: "Rejected invalid Ethereum address" });
    } else {
      results.push({ test: "4. Withdraw Recipient Address Check", status: "FAIL", detail: `Unexpected title: ${modalTitleRecipient}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 5: Withdraw - Tampered Note Rejection
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 5] Testing Withdraw Tampered Note Rejection...");
    await switchTab(page, "withdraw");
    await clearAndType(page, "#withdrawNote", "marginalia-note-v1-corruptedBase64PayloadNote123");
    await clearAndType(page, "#withdrawRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleTampered = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    const modalBodyTampered = await page.$eval(".noir-modal-body", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleTampered}, Body: ${modalBodyTampered}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "06_nextjs_tampered_note.png") });

    if (modalTitleTampered.includes("Note Validation Failed") || modalTitleTampered.includes("Invalid Secret")) {
      results.push({ test: "5. Withdraw Tampered Note Rejection", status: "PASS", detail: modalBodyTampered });
    } else {
      results.push({ test: "5. Withdraw Tampered Note Rejection", status: "FAIL", detail: modalTitleTampered });
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

    await clearAndType(page, "#withdrawNote", validSyntaxNote);
    await clearAndType(page, "#withdrawRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

    await page.click("#submitWithdrawBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 15000 });

    const modalTitleUninscribed = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    const modalBodyUninscribed = await page.$eval(".noir-modal-body", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleUninscribed}, Body: ${modalBodyUninscribed}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "07_nextjs_uninscribed_note.png") });

    if (modalTitleUninscribed.includes("Validation Failed") && modalBodyUninscribed.includes("Folio")) {
      results.push({ test: "6. Withdraw Folio Tree Inclusion Guard", status: "PASS", detail: modalBodyUninscribed });
    } else {
      results.push({ test: "6. Withdraw Folio Tree Inclusion Guard", status: "FAIL", detail: modalBodyUninscribed });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 7: Mersenne Courier - Dynamic Gas Fee Quote
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 7] Testing Mersenne Courier dynamic gas quoting...");
    await switchTab(page, "courier");
    await page.waitForSelector("#fetchCourierQuoteBtn", { visible: true });
    await page.click("#fetchCourierQuoteBtn");
    await page.waitForSelector("#courierQuoteDisplay", { visible: true, timeout: 5000 });

    const gasPrice = await page.$eval("#courierGasPrice", (el) => el.textContent.trim());
    const minFee = await page.$eval("#courierMinFeeEth", (el) => el.textContent.trim());
    const courierAddr = await page.$eval("#courierAddress", (el) => el.textContent.trim());
    console.log(`Gas: ${gasPrice}, Fee: ${minFee}, Courier: ${courierAddr}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "08_nextjs_courier_quote.png") });

    if (gasPrice.includes("Gwei") && minFee.includes("ETH") && courierAddr.includes("Active")) {
      results.push({ test: "7. Mersenne Courier Dynamic Fee Quote", status: "PASS", detail: `Fee: ${minFee}, Relayer: ${courierAddr}` });
    } else {
      results.push({ test: "7. Mersenne Courier Dynamic Fee Quote", status: "FAIL", detail: "Quote box values malformed" });
    }

    // ------------------------------------------------------------------------------------
    // TEST 8: Ragequit Invalid Note Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 8] Testing Emergency Exit (Ragequit) tab...");
    await switchTab(page, "ragequit");
    await page.type("#ragequitNote", "marginalia-note-v1-invalidragequitnote");
    await page.type("#ragequitRecipient", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    await page.click("#submitRagequitBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleRagequit = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleRagequit}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "09_nextjs_ragequit_guard.png") });

    if (modalTitleRagequit === "Invalid Secret Note") {
      results.push({ test: "8. Ragequit Invalid Note Guard", status: "PASS", detail: "Rejects invalid note format" });
    } else {
      results.push({ test: "8. Ragequit Invalid Note Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleRagequit}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 9: Encrypted Vault Guard
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 9] Testing Encrypted Vault tab...");
    await switchTab(page, "vault");
    await page.click("#unlockVaultBtn");
    await page.waitForSelector(".noir-modal-card", { visible: true, timeout: 5000 });

    const modalTitleVault = await page.$eval(".noir-modal-title", (el) => el.textContent.trim());
    console.log(`Modal Title: ${modalTitleVault}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "10_nextjs_vault_guard.png") });

    if (modalTitleVault === "Wallet Required") {
      results.push({ test: "9. Encrypted Vault Wallet Guard", status: "PASS", detail: "Requires wallet EIP-712 signature" });
    } else {
      results.push({ test: "9. Encrypted Vault Wallet Guard", status: "FAIL", detail: `Unexpected title: ${modalTitleVault}` });
    }
    await closeModal(page);

    // ------------------------------------------------------------------------------------
    // TEST 10: Explorer Page & Wax Seal Verifier (Spent)
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 10] Testing Explorer Page (http://127.0.0.1:3002/explorer)...");
    await page.goto("http://127.0.0.1:3002/explorer", { waitUntil: "domcontentloaded" });
    await dismissIntro(page);
    await new Promise((r) => setTimeout(r, 1200));

    const folioCount = await page.$eval("#folioNotesCount", (el) => el.textContent.trim());
    const aspCount = await page.$eval("#aspApprovedCount", (el) => el.textContent.trim());
    const poolBal = await page.$eval("#poolBalance", (el) => el.textContent.trim());
    console.log(`Explorer Telemetry -> Folio: ${folioCount}, ASP: ${aspCount}, TVL: ${poolBal} ETH`);

    await page.type("#nullifierHashInput", "8514309743580435606405499989571109382450448814222988967129436610895366290229");
    await page.click('button[type="submit"]');
    await page.waitForSelector("#sealCheckResult", { visible: true, timeout: 5000 });

    const sealBadgeSpent = await page.$eval("#sealStatusBadge", (el) => el.textContent.trim());
    console.log(`Wax Seal Status (Spent): ${sealBadgeSpent}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "11_nextjs_explorer_seal_spent.png") });

    if (sealBadgeSpent.includes("WAX SEAL BROKEN (SPENT)")) {
      results.push({ test: "10. Wax Seal Verifier (Spent)", status: "PASS", detail: sealBadgeSpent });
    } else {
      results.push({ test: "10. Wax Seal Verifier (Spent)", status: "FAIL", detail: sealBadgeSpent });
    }

    // ------------------------------------------------------------------------------------
    // TEST 11: Explorer Wax Seal Verifier (Unspent)
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 11] Testing Wax Seal Verifier (Unspent)...");
    await page.evaluate(() => { document.getElementById("nullifierHashInput").value = ""; });
    await page.type("#nullifierHashInput", "111222333444555666777");
    await page.click('button[type="submit"]');
    await new Promise((r) => setTimeout(r, 600));

    const sealBadgeUnspent = await page.$eval("#sealStatusBadge", (el) => el.textContent.trim());
    console.log(`Wax Seal Status (Unspent): ${sealBadgeUnspent}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "12_nextjs_explorer_seal_unspent.png") });

    if (sealBadgeUnspent.includes("WAX SEAL INTACT (UNSPENT)")) {
      results.push({ test: "11. Wax Seal Verifier (Unspent)", status: "PASS", detail: sealBadgeUnspent });
    } else {
      results.push({ test: "11. Wax Seal Verifier (Unspent)", status: "FAIL", detail: sealBadgeUnspent });
    }

    // ------------------------------------------------------------------------------------
    // TEST 12: Compliance Page - Letter of Disclosure (X25519)
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 12] Testing Compliance Page (http://127.0.0.1:3002/compliance)...");
    await page.goto("http://127.0.0.1:3002/compliance", { waitUntil: "domcontentloaded" });
    await dismissIntro(page);

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
    await page.waitForSelector("#disclosureResult", { visible: true, timeout: 6000 });

    const disclosureJson = await page.$eval("#disclosureJsonText", (el) => el.textContent.trim());
    const parsedPkg = JSON.parse(disclosureJson);
    console.log(`Disclosure Standard: ${parsedPkg.standard}, Timestamp: ${parsedPkg.timestamp}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "13_nextjs_compliance_disclosure.png") });

    if (parsedPkg.standard === "LETTER_OF_DISCLOSURE_V1" && parsedPkg.viewingKeyProof && parsedPkg.viewingKeyProof.ciphertext) {
      results.push({ test: "12. Letter of Disclosure (X25519)", status: "PASS", detail: `Ciphertext: ${parsedPkg.viewingKeyProof.ciphertext.slice(0, 16)}...` });
    } else {
      results.push({ test: "12. Letter of Disclosure (X25519)", status: "FAIL", detail: "Disclosure package missing expected fields" });
    }

    // ------------------------------------------------------------------------------------
    // TEST 13: Codex & Lore Page
    // ------------------------------------------------------------------------------------
    console.log("\n[TEST 13] Testing Codex & Lore Page (http://127.0.0.1:3002/codex)...");
    await page.goto("http://127.0.0.1:3002/codex", { waitUntil: "domcontentloaded" });
    await dismissIntro(page);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, "14_nextjs_codex_page.png") });

    const codexTitle = await page.title();
    console.log(`Codex Title: ${codexTitle}`);
    if (codexTitle.includes("MARGINALIA")) {
      results.push({ test: "13. Codex & Lore Page", status: "PASS", detail: "Loaded Fermat lore and mathematical treatise" });
    } else {
      results.push({ test: "13. Codex & Lore Page", status: "FAIL", detail: `Unexpected title: ${codexTitle}` });
    }

  } catch (err) {
    console.error("Test execution error:", err);
    results.push({ test: "UNHANDLED EXCEPTION", status: "ERROR", detail: err.message });
  } finally {
    await browser.close();
  }

  console.log("\n=================== NEXT.JS TEST RESULTS SUMMARY ===================");
  console.table(results);
  fs.writeFileSync(path.join(ARTIFACTS_DIR, "nextjs_test_summary.json"), JSON.stringify(results, null, 2));
  return results;
}

runNextJsTestSuite();
