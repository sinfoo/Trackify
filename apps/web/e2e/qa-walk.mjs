// QA walk: every admin + public + auth route at 1440/1024/390, dark + light, full-page screenshots,
// console errors + failed requests per page. Usage: node qa-walk.mjs <out-dir> [widths] [themes] [routeFilter]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = process.argv[2];
const WIDTHS = (process.argv[3] ?? "1440,1024,390").split(",").map(Number);
const THEMES = (process.argv[4] ?? "dark,light").split(",");
const FILTER = process.argv[5] ? new RegExp(process.argv[5]) : null;
mkdirSync(OUT, { recursive: true });
const API = "http://localhost:8000/api/v1";
const WEB = "http://localhost:3000";
const j = (r) => r.json();

// ---- API: login + first ids + fresh checkout session
const login = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@demo.techx", password: "Demo!2026" }) });
const setCookies = login.headers.getSetCookie();
const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
const get = (p) => fetch(`${API}${p}`, { headers: { cookie: cookieHeader } }).then(j);
const first = (r) => (r.items ?? r)[0]?.id;
const [wf, cust, prod, ord, pay, sec, appr] = await Promise.all([
  get("/workflows?page_size=1"), get("/customers?page_size=1"), get("/products"), get("/orders?page_size=1"),
  get("/payments/transactions?page_size=1"), get("/security/events?page_size=1"), get("/approvals?page_size=1"),
]);
// Enrollment needs a signed-in BUYER (401 BUYER_ACCOUNT_REQUIRED for guests): open the conversation + enroll as buyer@.
const buyerLogin = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "buyer@demo.techx", password: "Demo!2026" }) });
const buyerCookies = buyerLogin.headers.getSetCookie();
const buyerCookie = buyerCookies.map((c) => c.split(";")[0]).join("; ");
const offers = await fetch(`${API}/public/offers`).then(j);
const start = await fetch(`${API}/public/conversations`, { method: "POST", headers: { "content-type": "application/json", cookie: buyerCookie }, body: JSON.stringify({ consent_voice: false, channel: "text" }) }).then(j);
const enroll = await fetch(`${API}/public/conversations/${start.conversation_id}/enroll`, { method: "POST", headers: { "content-type": "application/json", cookie: buyerCookie, "X-Conversation-Token": start.access_token }, body: JSON.stringify({ product_id: offers[0].id }) }).then(j);
if (!enroll.checkout_session_id) console.error("enroll failed:", JSON.stringify(enroll).slice(0, 300));

const ADMIN = {
  dashboard: "/dashboard", activity: "/activity", workflows: "/workflows", "workflow-detail": `/workflows/${first(wf)}`,
  agents: "/agents", "agent-security": "/agents/security", studio: "/studio",
  customers: "/customers", "customer-detail": `/customers/${first(cust)}`, products: "/products", "product-detail": `/products/${first(prod)}`,
  orders: "/orders", "order-detail": `/orders/${first(ord)}`, payments: "/payments", "payment-detail": `/payments/${first(pay)}`,
  analytics: "/analytics", strategy: "/strategy", security: "/security", "security-detail": `/security/${first(sec)}`,
  approvals: "/approvals", "approval-detail": `/approvals/${first(appr)}`, audit: "/audit",
  "settings-users": "/settings", "settings-business": "/settings?tab=business", "settings-providers": "/settings?tab=providers",
  "settings-sim": "/settings?tab=sim", "settings-prefs": "/settings?tab=prefs", demo: "/demo",
};
const PUBLIC = {
  landing: "/", offers: "/offers", "offer-genai": "/offers/genai-llm", assistant: "/assistant",
  checkout: `/checkout/${enroll.checkout_session_id}`, success: `/success?session=${enroll.checkout_session_id}`, "payment-failed": "/payment-failed?reason=insufficient%20funds",
  login: "/login", register: "/register", "forgot-password": "/forgot-password", "reset-password": "/reset-password",
};

const b = await chromium.launch();
const report = {};
const log = (k, m) => (report[k] ??= []).push(m);

for (const vw of WIDTHS) {
  const vh = vw === 390 ? 844 : 900;
  for (const theme of THEMES) {
    for (const [routes, cookies] of [[ADMIN, setCookies], [PUBLIC, buyerCookies]]) {
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, colorScheme: theme });
      if (cookies.length) {
        await ctx.addCookies(cookies.map((c) => {
          const [kv] = c.split(";");
          const [name, ...v] = kv.split("=");
          return { name, value: v.join("="), domain: "localhost", path: "/" };
        }));
      }
      await ctx.addInitScript((t) => localStorage.setItem("trackify-theme", t), theme);
      const p = await ctx.newPage();
      let cur = "";
      p.on("console", (m) => m.type() === "error" && log(cur, `console: ${m.text().slice(0, 300)}`));
      p.on("pageerror", (e) => log(cur, `pageerror: ${e.message.slice(0, 300)}`));
      p.on("response", (r) => r.status() >= 400 && !/\/auth\/me|\/auth\/refresh/.test(r.url()) && log(cur, `${r.status()} ${r.request().method()} ${r.url().replace(WEB, "").replace(API, "api")}`));
      for (const [name, url] of Object.entries(routes)) {
        if (FILTER && !FILTER.test(name)) continue;
        const tag = `${name}-${vw}-${theme}`;
        cur = tag;
        try {
          await p.goto(WEB + url, { waitUntil: "networkidle", timeout: 30000 });
          await p.waitForTimeout(900);
          // horizontal overflow check
          const ov = await p.evaluate(() => {
            const d = document.documentElement;
            const sw = d.scrollWidth, cw = d.clientWidth;
            const offenders = [];
            if (sw > cw + 1) {
              for (const el of document.querySelectorAll("body *")) {
                const r = el.getBoundingClientRect();
                if (r.right > cw + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed") {
                  offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} right=${Math.round(r.right)}`);
                  if (offenders.length > 4) break;
                }
              }
            }
            return { sw, cw, offenders };
          });
          if (ov.sw > ov.cw + 1) log(tag, `OVERFLOW scrollWidth ${ov.sw} > ${ov.cw}: ${ov.offenders.join(" | ")}`);
          const text = await p.evaluate(() => document.body.innerText);
          for (const bad of [/TECHX Agents/i, /—/, /Geist Sans/i, /academy/i, /[\u{1F300}-\u{1FAFF}]/u]) {
            const m = text.match(bad);
            if (m) log(tag, `COPY ${bad}: ...${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, " ")}...`);
          }
          await p.screenshot({ path: `${OUT}/${tag}.png`, fullPage: true });
        } catch (e) {
          log(tag, `NAV FAILED: ${String(e.message).split("\n")[0]}`);
          await p.screenshot({ path: `${OUT}/${tag}.png` }).catch(() => {});
        }
      }
      await ctx.close();
    }
  }
}
await b.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
const lines = Object.entries(report).flatMap(([k, v]) => v.map((m) => `${k}: ${m}`));
console.log(lines.join("\n") || "no issues logged");
