const puppeteer = require('puppeteer-core');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function testAllPagesIntro() {
  console.log("=== TESTING INTRO SEQUENCE ON ALL PAGES UPON REFRESH ===");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  const pages = ["/", "/app", "/codex", "/compliance", "/explorer"];

  for (const p of pages) {
    console.log(`\n--- Testing page: ${p} ---`);
    
    // Direct load / refresh
    console.log(`[1] Directly loading (or refreshing) ${p}...`);
    await page.goto(`http://127.0.0.1:3002${p}`, { waitUntil: 'domcontentloaded' });
    
    const introOnRefresh = await page.waitForSelector('#introSequenceOverlay', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    
    if (introOnRefresh) {
      console.log(`✓ PASS: Intro sequence appeared upon direct load / refresh of ${p}`);
    } else {
      console.error(`✗ FAIL: Intro sequence DID NOT appear on ${p}!`);
      process.exit(1);
    }

    // Dismiss intro so we can test client navigation
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 600));

    // Client navigation to next page or back to home
    const nextRoute = p === "/" ? "/app" : "/";
    console.log(`[2] Client-side navigating to ${nextRoute}...`);
    await page.evaluate((dest) => {
      const link = document.querySelector(`a[href="${dest}"]`);
      if (link) link.click();
    }, nextRoute);
    await new Promise(r => setTimeout(r, 1000));

    const introOnClientNav = await page.$('#introSequenceOverlay');
    if (!introOnClientNav) {
      console.log(`✓ PASS: Intro sequence DID NOT appear during client navigation to ${nextRoute}`);
    } else {
      console.error(`✗ FAIL: Intro sequence unexpectedly appeared on client navigation to ${nextRoute}!`);
      process.exit(1);
    }
  }

  await browser.close();
  console.log("\n================ ALL ALL-PAGE INTRO TESTS PASSED ================");
}

testAllPagesIntro().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
