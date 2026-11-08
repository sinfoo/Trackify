// Scratch: screenshots of every public page at 1440 and 390, dark and light. Usage: node e2e/public-shots.mjs <out-dir>
import { chromium } from "@playwright/test";
const OUT = process.argv[2];
const b = await chromium.launch();
const logs = [];
const pages = { landing: "/", offers: "/offers", offer: "/offers/intro-ai", assistant: "/assistant", failed: "/payment-failed?reason=insufficient%20funds", badcheckout: "/checkout/00000000-0000-0000-0000-000000000000" };
for (const [vw, vh, tag] of [[1440, 900, "d"], [390, 844, "m"]]) {
  for (const theme of ["dark", "light"]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: vh }, colorScheme: theme });
    const p = await ctx.newPage();
    p.on("console", (m) => m.type() === "error" && !/401/.test(m.text()) && logs.push(`${tag}/${theme} console: ${m.text()}`));
    p.on("pageerror", (e) => logs.push(`${tag}/${theme} pageerror: ${e.message}`));
    for (const [name, url] of Object.entries(pages)) {
      await p.goto("http://localhost:3000" + url, { waitUntil: "networkidle" });
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/${name}-${tag}-${theme}.png`, fullPage: true });
    }
    await ctx.close();
  }
}
console.log("ERRORS\n" + logs.join("\n"));
await b.close();
