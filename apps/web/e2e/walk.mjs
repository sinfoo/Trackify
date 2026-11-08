// Scratch walkthrough (not a test): screenshots of every step of the customer journey.
// Usage: node e2e/walk.mjs <output-dir>
import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
const logs = [];
p.on("console", (m) => m.type() === "error" && logs.push("console: " + m.text()));
p.on("response", (r) => r.status() >= 400 && logs.push(`${r.status()} ${r.request().method()} ${r.url()}`));
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const step = async (n, fn) => {
  try {
    await fn();
  } catch (e) {
    logs.push(`STEP ${n} FAILED: ${String(e.message).split("\n")[0]}`);
  }
  await p.waitForTimeout(400);
  await shot(n);
};

await p.goto("http://localhost:3000/assistant");
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.getByLabel("Name (optional)").fill("Yasmine Trabelsi");
await p.getByRole("button", { name: "Start conversation" }).click();
const input = p.getByPlaceholder("Ask about a program, price or schedule");
await input.waitFor();
await shot("01-start");

const msgs = (process.env.MSGS ?? "").split("|").filter(Boolean);
const script = msgs.length
  ? msgs
  : [
      "Hi! I work in marketing and I'd like to get into AI. I never coded, is that a problem?",
      "What would you recommend for me?",
      "Thanks",
      "How much is it and can I pay in parts?",
      "OK I want to enroll",
    ];
let i = 2;
for (const m of script) {
  await input.fill(m);
  await p.getByRole("button", { name: "Send message" }).click();
  await p.waitForTimeout(200);
  await shot(String(i).padStart(2, "0") + "-sent");
  await p.waitForFunction(() => !document.querySelector('[aria-label="The assistant is typing"]'), null, {
    timeout: 30000,
  });
  await p.waitForTimeout(300);
  await shot(String(i).padStart(2, "0") + "-reply");
  i++;
}
console.log("TRANSCRIPT\n" + (await p.locator('[role="log"]').innerText()));

if (!process.env.CHAT_ONLY) {
  await step("10-enroll", async () => {
    await p.getByRole("button", { name: /^Enroll in/ }).last().click();
    await p.waitForURL(/checkout/, { timeout: 20000 });
    await p.getByText(/simulated/i).first().waitFor();
  });
  console.log("CHECKOUT\n" + (await p.locator("main").innerText()).slice(0, 1200));
  await step("11-declined", async () => {
    await p.getByText("Test card · declined").click();
    await p.getByRole("button", { name: /^Pay/ }).click();
    await p.waitForURL(/payment-failed/, { timeout: 20000 });
  });
  console.log("FAILED PAGE\n" + (await p.locator("main").innerText()).slice(0, 900));
  await step("12-retry", async () => {
    await p.getByRole("link", { name: /try another|retry/i }).first().click();
    await p.waitForURL(/checkout/, { timeout: 20000 });
  });
  await step("13-success", async () => {
    await p.getByText("Test card · always succeeds").click();
    await p.getByRole("button", { name: /^Pay/ }).click();
    await p.waitForURL(/success/, { timeout: 20000 });
  });
  console.log("SUCCESS PAGE\n" + (await p.locator("main").innerText()).slice(0, 1200));
  await step("14-back-to-chat", async () => {
    await p.goto("http://localhost:3000/assistant");
    await p.locator('[role="log"]').waitFor();
  });
  console.log("CHAT AFTER PAY (tail)\n" + (await p.locator('[role="log"]').innerText()).slice(-900));
  await step("15-enroll-again", async () => {
    await input.fill("I want to enroll in the introduction to AI");
    await p.getByRole("button", { name: "Send message" }).click();
    await p.waitForFunction(() => !document.querySelector('[aria-label="The assistant is typing"]'), null, {
      timeout: 30000,
    });
  });
  console.log("ENROLL AGAIN (tail)\n" + (await p.locator('[role="log"]').innerText()).slice(-500));
  console.log("BUTTONS: " + (await p.getByRole("button").allInnerTexts()).filter((t) => /Enroll|Resume/.test(t)).join(" | "));
}
console.log("ERRORS\n" + logs.join("\n"));
await b.close();
