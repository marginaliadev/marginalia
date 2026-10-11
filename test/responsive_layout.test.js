// Static guards for the responsive fixes (the browser-level check is scripts/responsive-audit.js).
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("Responsive layout guards", function () {
  it("the landing hero is two columns only from lg (it did not fit at 768 px) and its right card follows", function () {
    const page = read("frontend/src/app/page.tsx");
    expect(page).to.include('className="flex flex-col gap-x-8 gap-y-8 lg:flex-row items-stretch"');
    expect(page).to.not.include("gap-y-8 md:flex-row items-stretch");
    const card = read("frontend/src/components/NoirpayCircuitCard.tsx");
    expect(card).to.include("lg:w-5/12");
    expect(card).to.not.include("md:w-5/12");
  });
  it("section headings can wrap below lg", function () {
    expect(read("frontend/src/app/page.tsx")).to.not.include("sm:whitespace-nowrap");
  });
  it("the app tabs wrap into a grid on small screens instead of a clipped scroller", function () {
    const app = read("frontend/src/app/app/page.tsx");
    expect(app).to.include("grid grid-cols-2 sm:grid-cols-3 lg:flex");
    expect(app).to.not.include("flex items-center gap-2 overflow-x-auto pb-4 mb-6");
  });
  it("the explorer never prints an 18-decimal balance", function () {
    const ex = read("frontend/src/app/explorer/page.tsx");
    expect(ex).to.include("shortEth(data.telemetry.poolBalanceEth)");
  });
});
