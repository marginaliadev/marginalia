// Responsive audit: loads every page at many widths and reports horizontal scroll and content pushed outside the viewport.
//   (cd frontend && npx next build && npx next start -p 3000) &   then   node scripts/responsive-audit.js
// Env: BASE (default http://localhost:3000), PAGES, WIDTHS, CHROME_PATH. Exit code 1 if any page overflows. Decorative glows and the
// animated marquee (.animate-marquee-x, intentionally off-screen) are ignored; tables inside scroll containers are fine.
const path = require("path");
const puppeteer = require(path.join(__dirname, "..", "node_modules", "puppeteer-core"));
const BASE = process.env.BASE || "http://localhost:3000";
const PAGES = (process.env.PAGES || "/,/app,/explorer,/compliance,/codex,/ceremony").split(",");
const WIDTHS = (process.env.WIDTHS || "320,360,393,430,600,768,820,1024,1280,1440").split(",").map(Number);
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
  const rows = [];
  for (const p of PAGES) {
    const page = await browser.newPage();
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900 });
      await page.goto(BASE + p, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => {});
      await page.keyboard.press("Escape").catch(() => {});
      await new Promise((r) => setTimeout(r, 1500));
      // scroll through the page once so scroll-triggered reveal animations (which start offset) have finished
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 900)); });
      const res = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const over = document.documentElement.scrollWidth - vw;
        const bad = [];
        for (const el of document.querySelectorAll("header *, main *, section *, footer *, nav *")) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          if (r.right <= vw + 1 && r.left >= -1) continue;
          const cs = getComputedStyle(el);
          if (cs.position === "absolute" && !el.textContent.trim()) continue; // decorative glows
          if (el.closest(".animate-marquee-x")) continue; // intentionally off-screen ticker
          // inside a horizontally scrollable region (tables) is fine
          let scroller = false; for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a); if (/(auto|scroll)/.test(c.overflowX) && a.scrollWidth > a.clientWidth) { scroller = true; break; } }
          if (scroller) continue;
          bad.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), l: Math.round(r.left), r: Math.round(r.right), t: el.textContent.trim().slice(0, 24) });
        }
        return { over, n: bad.length, first: bad[0] || null };
      });
      rows.push({ p, w, ...res });
    }
    await page.close();
  }
  await browser.close();
  const bad = rows.filter((r) => r.over > 1 || r.n > 0);
  console.log(`checked ${rows.length}; failing ${bad.length}`);
  for (const r of bad) console.log(`${r.p} @${r.w}: scroll +${r.over}, ${r.n} cut-off; e.g. ${JSON.stringify(r.first)}`);
  process.exit(bad.length ? 1 : 0);
})();
