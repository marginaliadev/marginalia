// The header must be usable below the lg breakpoint: a hamburger toggles a menu with every page, including the ceremony page.
const fs = require("fs");
const path = require("path");
const { expect } = require("chai");

const nav = fs.readFileSync(path.join(__dirname, "../frontend/src/components/Navbar.tsx"), "utf8");
const footer = fs.readFileSync(path.join(__dirname, "../frontend/src/components/Footer.tsx"), "utf8");

describe("Navbar (mobile / tablet menu)", function () {
  it("has a hamburger button that exists only below the lg breakpoint and is accessible", function () {
    expect(nav).to.include('aria-controls="mobile-menu"');
    expect(nav).to.include("aria-expanded={menuOpen}");
    expect(nav).to.match(/className="lg:hidden inline-flex[^"]*"[\s\S]{0,200}aria-label=\{menuOpen \? "Close menu" : "Open menu"\}/);
    expect(nav).to.include('id="mobile-menu"');
  });
  it("lists every page, including Trusted Setup Ceremony, and closes on navigation, Escape and desktop width", function () {
    for (const href of ['"/"', '"/#how-it-works"', '"/app"', '"/explorer"', '"/compliance"', '"/codex"', '"/ceremony"']) expect(nav).to.include(`href: ${href}`);
    expect(nav).to.include("setMenuOpen(false)");
    expect(nav).to.include('e.key === "Escape"');
    expect(nav).to.include('matchMedia("(min-width: 1024px)")');
  });
  it("the footer links to /ceremony", function () {
    expect(footer).to.include('href="/ceremony"');
  });
});
