// Scratch: held path. 3 declines then a success -> held for review -> approved via API as security@demo.techx -> page advances.
// Usage: node e2e/held-walk.mjs <output-dir>
import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const API = "http://localhost:8000/api/v1";
const j = (r) => r.json();

// Open a conversation + enrollment straight through the public API (the chat walk is covered by walk.mjs).
const offers = await fetch(`${API}/public/offers`).then(j);
const start = await fetch(`${API}/public/conversations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ consent_voice: false, channel: "text" }) }).then(j);
const tok = { "content-type": "application/json", "X-Conversation-Token": start.access_token };
const { checkout_session_id } = await fetch(`${API}/public/conversations/${start.conversation_id}/enroll`, { method: "POST", headers: tok, body: JSON.stringify({ product_id: offers[6].id }) }).then(j);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://localhost:3000/assistant");
await p.evaluate(([k, v]) => localStorage.setItem(k, v), ["assistant.session", JSON.stringify({ conversation_id: start.conversation_id, access_token: start.access_token, channel: "text" })]);
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` });
const url = `http://localhost:3000/checkout/${checkout_session_id}`;
await p.goto(url);
await p.getByText("Choose a test method").waitFor();
await shot("h0-checkout");
for (const [i, label] of ["Test card · declined", "Test card · insufficient funds", "Test card · provider error"].entries()) {
  await p.getByText(label).click();
  await p.getByRole("button", { name: /^Pay/ }).click();
  if (i === 0) {
    await p.waitForTimeout(700);
    await shot("h1-processing");
  }
  await Promise.race([p.waitForURL(/payment-failed/, { timeout: 20000 }), p.getByText("A person will review this payment").waitFor({ timeout: 20000 })]);
  await p.waitForTimeout(600);
  await shot(`h2-fail-${i + 1}`);
  console.log(`attempt ${i + 1}:`, p.url().replace("http://localhost:3000", ""), (await p.locator("main").innerText()).split("\n").slice(0, 3).join(" | "));
  if (/payment-failed/.test(p.url())) {
    await p.getByRole("link", { name: /try another/i }).click();
    await p.getByText("Choose a test method").waitFor({ timeout: 20000 });
  } else break;
}
if (await p.getByText("Choose a test method").isVisible()) {
  await p.getByText("Test card · always succeeds").click();
  await p.getByRole("button", { name: /^Pay/ }).click();
}
await p.getByText("A person will review this payment").waitFor({ timeout: 20000 });
await p.waitForTimeout(500);
await shot("h3-held");
console.log("HELD\n" + (await p.locator("main").innerText()).slice(0, 700));

// Human decides: security analyst approves through the admin API.
const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "security@demo.techx", password: "Demo!2026" }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const pend = await fetch(`${API}/approvals?status=PENDING_REVIEW&page_size=50`, { headers: { cookie } }).then(j);
const items = pend.items ?? pend;
console.log("pending approvals:", items.length, items.map((a) => `${a.action_type ?? a.action} ${a.id}`).slice(0, 5).join(" ; "));
const mine = items.find((a) => JSON.stringify(a).includes(checkout_session_id)) ?? items[0];
const dec = await fetch(`${API}/approvals/${mine.id}/approve`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ notes: "e2e held walk" }) });
console.log("approve:", dec.status, (await dec.text()).slice(0, 200));
await p.waitForURL(/success/, { timeout: 20000 });
await p.waitForTimeout(800);
await shot("h4-approved-success");
console.log("AFTER APPROVAL:", p.url().replace("http://localhost:3000", ""), (await p.locator("main").innerText()).slice(0, 200).replace(/\n/g, " | "));
await b.close();
