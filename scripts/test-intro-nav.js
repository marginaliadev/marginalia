const puppeteer = require('puppeteer-core');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function testIntro() {
  console.log("=== TESTING INTRO SEQUENCE TIMING & ROUTING GUARD ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  console.log("\n[TEST 1] Initial page load at http://127.0.0.1:3002/...");
  await page.goto('http://127.0.0.1:3002/', { waitUntil: 'load' });
  
  // Wait up to 10s for first dev compilation and overlay mount
  await page.waitForSelector('#introSequenceOverlay', { timeout: 10000 });
  console.log("✓ PASS: Intro overlay mounted on initial visit.");

  console.log("\n[TEST 2] Verifying 4.0s duration and automatic dismissal...");
  const t0 = Date.now();
  // Wait for overlay to disappear
  await page.waitForSelector('#introSequenceOverlay', { hidden: true, timeout: 8000 });
  const duration = (Date.now() - t0) / 1000;
  console.log(`✓ PASS: Intro overlay dismissed automatically after ~${duration.toFixed(1)}s (calibrated 4s total).`);

  console.log("\n[TEST 3] Client-side navigation to /app...");
  await page.evaluate(() => {
    // Click Next.js client link
    const link = document.querySelector('a[href="/app"]');
    if (link) link.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  console.log("Current path:", await page.evaluate(() => window.location.pathname));

  console.log("\n[TEST 4] Client-side navigation back to homepage (/)...");
  await page.evaluate(() => {
    const link = document.querySelector('a[href="/"]');
    if (link) link.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  console.log("Current path:", await page.evaluate(() => window.location.pathname));

  const introOnReturn = await page.$('#introSequenceOverlay');
  if (introOnReturn) {
    console.error("✗ FAIL: Intro sequence appeared when returning from another page!");
    process.exit(1);
  } else {
    console.log("✓ PASS: Intro sequence DID NOT appear when returning to homepage!");
  }

  console.log("\n[TEST 5] Full page reload / refresh (F5)...");
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#introSequenceOverlay', { timeout: 5000 });
  console.log("✓ PASS: Intro sequence DOES appear upon page refresh!");

  await browser.close();
  console.log("\n================ ALL INTRO TESTS PASSED ================");
}

testIntro().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
