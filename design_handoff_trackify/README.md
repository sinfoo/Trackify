# Handoff: Trackify — full redesign of the Autonomous FinTech Team console

## Overview
Trackify is the renamed, fully redesigned UI for the "Autonomous FinTech Team" hackathon project (`Hackathon/apps/web`, Next.js 15 + React 19 + Tailwind 4 + shadcn/ui). The redesign covers **every route**: the admin console (`(app)`), the public academy site (`(public)`), and auth (`(auth)`). The brief (Cahier des Charges) asks for a product where six AI agents (Sales, Intelligence, Payment, Analyst, Strategy, Security) are visibly coordinated by an orchestrator, risky actions wait for humans, and the whole experience feels live. The redesign makes that the centrepiece: a **live orchestration canvas** on the dashboard that replays scenarios, a shared agent colour system, glassy dark "control room" surfaces, and a true light theme.

Product name everywhere: **Trackify**. The logo is the supplied mark `assets/trackify-mark.png` (rounded-square app icon, radius ≈ 30% of its size: 38px → 12px, 40px → 12px) next to the wordmark "Trackify" set in Manrope 800 with the dot of the "i" replaced by an amber (#F5A623) circle (`Track` + dotless ı + positioned 0.17em circle + `fy`). Full lock-up for reference: `assets/trackify-logo-full.png`. The business is simply **Trackify** (no "academy" wording anywhere). Tagline under the logo: "Autonomous FinTech Team".

## About the design files
Everything in this bundle is a **design reference built in HTML** (`Trackify.dc.html` + `data.js` + `l-icon.js`). It is a clickable prototype that shows intended look and behaviour; it is **not production code to copy**. The task is to **recreate these screens inside the existing Next.js codebase** using its established patterns: the route groups already present, the `components/ui` shadcn primitives, `ui-kit` (AgentAvatar, StatusBadge, KpiCard, DataTable), TanStack Query hooks in `lib/queries.ts`, the SSE hook `hooks/use-events.ts`, and `lib/permissions.tsx` for role gating. Replace real data where the prototype uses `data.js` fixtures.

Open `Trackify.dc.html` in a browser to explore. Top-left logo = dashboard, header "Public site" link = landing, header "Team sign in" on the public site = login. The sun/moon button toggles theme. ⌘K / Ctrl+K opens the command palette.

## Fidelity
**High-fidelity.** Colours, typography, radii, spacing, motion and copy are final. Recreate pixel-perfectly, but use the codebase's components (e.g. shadcn `Button`, `Tabs`, `Dialog`, `Sheet`) restyled with the tokens below rather than hand-rolling new primitives. The prototype's inline styles are the spec; the tokens section is the source of truth for values.

---

## Design tokens

### Fonts
- UI: **Manrope** 400/500/600/700/800 (Google Fonts). Body 15px / line-height 1.45. Replace Geist Sans in `app/layout.tsx` with `next/font/google` Manrope, variable `--font-sans`.
- Mono: **Geist Mono** 400/500/600 for IDs, hashes, message types, amounts in tables, kbd hints, timestamps.
- Headline letter-spacing: -0.025em at 28px+, -0.03em at 32px+. Eyebrow labels: 11.5px / 700–800 / uppercase / letter-spacing .08em.

### Theme tokens (CSS variables on `[data-theme]`; map into `globals.css` `:root` / `.dark`)
Dark is the default admin theme. Light is a full first-class theme (not a dimmed dark).

| token | dark | light | use |
|---|---|---|---|
| --bg | #060D1F | #F4F6FB | page background |
| --panel | #0B1733 | #FFFFFF | cards |
| --panel2 | rgba(255,255,255,.05) | #F1F4F9 | nested surfaces, footers of cards |
| --panel3 | rgba(255,255,255,.09) | #E6EAF2 | chips, selected rows, tiles |
| --hair | rgba(255,255,255,.07) | #E4E8F0 | borders |
| --hair2 | rgba(255,255,255,.14) | #CBD2DF | stronger borders, scrollbars |
| --text | #F3F5F9 | #0F1A33 | primary text |
| --t2 | #B8C2D9 | #4B5872 | secondary |
| --t3 | #8A97B3 | #6B7792 | muted |
| --t4 | #5E6C8A | #8F9AB2 | eyebrows, placeholders |
| --brand | #F5A623 | #F5A623 | primary buttons, progress, active markers |
| --brand-text | #FFC65C | #9A5B00 | brand-coloured text/links (AA on both) |
| --brand-bg | rgba(245,166,35,.16) | #FEF0D6 | brand tints |
| --on-brand | #0B1730 | #0B1730 | text on brand |
| --glass | rgba(6,13,31,.78) | rgba(244,246,251,.86) | sticky header (backdrop-filter: blur(14px)) |
| --shadow | none | 0 8px 24px rgba(15,26,51,.06) | card shadow |
| --shadow-lift | 0 12px 32px rgba(0,0,0,.35) | 0 16px 40px rgba(15,26,51,.12) | hover lift |
| --input | rgba(255,255,255,.05) | #FFFFFF | inputs |
| --grid-dot | rgba(255,255,255,.07) | rgba(15,26,51,.09) | canvas dot grid |
| --success / -bg | #7CF3B6 / rgba(61,203,139,.16) | #0F7A4F / #E3F7EE | |
| --warning / -bg | #FFC65C / rgba(245,166,35,.16) | #8A5A00 / #FEF3D6 | |
| --danger / -bg | #FDA4AF / rgba(251,113,133,.16) | #B52F3F / #FDE8EB | |
| --info / -bg | #8FB4FF / rgba(57,123,255,.18) | #2B5FD9 / #E6EEFF | |
| --neutral / -bg | #8A97B3 / rgba(255,255,255,.08) | #6B7792 / #EEF1F7 | |
| --bubble / --bubble-me | rgba(255,255,255,.07) / #1E3A7A | #F1F4F9 / #0B1730 | chat bubbles (agent / customer) |

Sidebar is **always dark** in both themes: `linear-gradient(180deg,#0A1530,#070F24)`, right border rgba(255,255,255,.06). Hero/landing/auth left panels are always dark: `linear-gradient(160deg,#0E1C3E 0%,#0A1530 50%,#0B1A3A 100%)` with an amber radial glow (`radial-gradient(circle, rgba(245,166,35,.26), transparent 68%)`, 700px, offset top-left).

### Agent colour system (one hue per agent, used everywhere: avatars, canvas nodes, lane colours, chat sender names, filter chips)
| agent | icon (lucide) | dark fg / bg | light fg / bg |
|---|---|---|---|
| sales | mic | #FFC65C / rgba(245,166,35,.18) | #9A5B00 / #FEF0D6 |
| intelligence | brain | #8FB4FF / rgba(57,123,255,.2) | #2B5FD9 / #E6EEFF |
| payment | credit-card | #7CF3B6 / rgba(61,203,139,.18) | #0F7A4F / #E3F7EE |
| analyst | chart-line | #7FE7DA / rgba(45,212,191,.18) | #0F766E / #DDF5F2 |
| strategy | compass | #FDE68A / rgba(250,204,21,.16) | #8A5A00 / #FDF4D0 |
| security | shield | #FDA4AF / rgba(251,113,133,.18) | #B52F3F / #FDE8EB |
| orchestrator | workflow | #F3F5F9 / rgba(255,255,255,.12) | #0F1A33 / #E6EAF2 |
| human approver | user-check | #DCE2EF / rgba(255,255,255,.1) | #4B5872 / #EEF1F7 |
| customer | user | same as human | same as human |

Extend `ui-kit/agent-avatar.tsx` to take these per-agent tokens (today all agents share one navy/amber tile).

### Radii
Cards 22–26px (hero/canvas 26–28px), KPI tiles 18px, buttons 10–12px, chips/pills 999px, avatars 11–14px, inputs 12px, logo 13px, canvas nodes 20px.

### Spacing
Page padding 22px 26px (admin main), max-width 1500px; public pages max-width 1180px, padding 24px sides. Card padding 18–22px. Grid gaps 12px (KPIs), 14px (cards), 18px (sections). Row padding in lists 13px 20px.

### Motion
- Page enter: `rise` 400ms cubic-bezier(.2,.8,.2,1) (opacity 0→1, translateY 12→0).
- Rows / feed items: `rowIn` 350ms (translateY -8→0).
- Pop (success check, palette): `popIn` 220ms cubic-bezier(.34,1.45,.64,1) with overshoot.
- Live pip: `livePip` box-shadow pulse 1.8s.
- Node halo on active agent: `halo` 1.1s ease-out infinite (scale 1→1.9, opacity .6→0).
- Edge flow: dashed stroke `dash` 0.8s linear infinite (dashoffset -24).
- Theme toggle: View Transition API circular reveal from the click point, 620ms cubic-bezier(.65,.05,.25,1). Fall back to instant swap.
- Hover lift on cards: translateY(-2px) + `--shadow-lift`, 200ms.
- Respect `prefers-reduced-motion` (all durations → ~0).

### Icons
Lucide (same set already in the repo). Stroke 2 at 14–19px. Never emoji.

---

## Global shell (admin, `(app)/layout.tsx` + `components/shell/app-shell.tsx`)

**Sidebar** (sticky, 100vh, 252px expanded / 76px collapsed, always dark):
- Logo row: 38px rounded-13 brand gradient square (`linear-gradient(145deg,#FFD27A,#F5A623 55%,#D9820B)`) with "T" 800; "Trackify" 15px/800 + "Autonomous FinTech Team" 12px #8A97B3.
- **Jump to… ⌘K** button (40px, rgba(255,255,255,.05) fill, kbd hint) → opens command palette.
- Groups with 11px/700 uppercase eyebrow #5E6C8A: Overview (Dashboard, Live activity, Workflows, Agents), Commerce (Studio, Customers, Products, Orders, Payments), Intelligence (Analytics, Strategy), Trust (Security, Approvals [badge = pending count], Audit), System (Settings, Demo control).
- Item: 38px tall, radius 10, 14px/600 #9AA6C2; active = rgba(255,255,255,.06) fill, text #F3F5F9, icon #FFC65C, 3px amber bar at the left edge (outside the item, rounded right). Hover rgba(255,255,255,.06). Badge 20px pill #F5A623 / #0B1730 11.5px/800.
- Footer: user card (34px circle initials #1A2A52/#FFC65C, name 13.5/700, role 11.5 #8A97B3, log-out icon) + collapse toggle (`panel-left-close`).
- Collapsed: icons only, tooltips for labels.

**Header** (sticky, 60px, `--glass` + blur 14px, bottom hairline): breadcrumb group label (11.5 eyebrow) + page title 20px/800; right: Live pill (34px, success-bg, pulsing 8px dot, "Live"), "Simulated" pill with flask icon (neutral), theme toggle (34px square, sun/moon), notifications bell, "Public site" link, avatar menu.

**Toast**: bottom-centre fixed, 44px pill, `--panel` + hairline + lift shadow, 13.5/700, slides up 220ms, auto-dismiss 2.4s (use sonner).

**Command palette** (⌘K): overlay rgba(4,10,24,.55) blur 6px; dialog 600px max, radius 20, `--panel`; search row 14px 18px with search icon + "esc" kbd; results grouped (Pages / Customers / Workflows / Payments) with 32px icon tile `--panel3`, label 14/700, sub 12 `--t3`; selected row `--panel3` + "↵"; footer hints ↑↓ ↵ ⌘K. Arrow keys + Enter navigate; Escape closes; empty query shows 6 pages + 3 customers + 2 workflows.

**Responsive**: main grid tracks use `auto-fit, minmax()`; tables wrap in an `overflow-x:auto` container with a min-width (680px for ≤5 cols, 860–900px for more). Sidebar collapses to the rail under ~1100px (add a Sheet drawer under 768px).

---

## Screens

### 1. Dashboard (`/dashboard`)
Vertical stack, gap 20px.
1. **Hero banner** (radius 26, dark gradient + amber glow, border rgba(255,255,255,.07), padding 26px 28px): eyebrow "Overview", h1 "Good morning, Amira" 30px/800, sub 14px rgba(243,245,249,.7) "Sales, payments, security and agent work at a glance." Right: 5 big numbers in a row (Revenue 30d "41,870 TND", Conversion "23.4%", Interested "48", Held "1", Alerts "4"), each 26px/800 tabular + 11.5 eyebrow. Under them **"NEEDS YOU"** strip: pills (40px, rgba(255,255,255,.07), hairline) with coloured icon tile and a notification dot: "3 approvals to decide" (hand, warning), "4 open alerts" (shield-alert, danger), "2 payments pending" (clock, info), "3 new recommendations" (lightbulb, strategy). Each pill links to its page.
2. **Orchestration canvas** (flex 3 1 620px) + **Hand-offs panel** (flex 1 1 300px):
   - Canvas card radius 26, `--panel`. Header: eyebrow "THE TEAM AT WORK", title = scenario title 19px/800; scenario segmented control (Suspicious / Success / Failed / Injection / Intelligence; selected = `--text` fill, `--bg` text, 30px, radius 9); amber round play/pause button 38px with glow `0 6px 18px rgba(245,166,35,.35)`.
   - Stage: aspect 1000/640, min 420px, max 640px, dot grid (26px, radial mask). 9 nodes positioned by % (customer 17,13 · intelligence 50,12 · sales 24,36 · strategy 76,36 · orchestrator 50,50 · security 24,72 · analyst 76,72 · payment 50,86 · human 83,90). Node = pill card radius 20, `--node` (rgba(12,24,56,.88) dark / rgba(255,255,255,.92) light) + blur 8, hairline; 44px agent tile in agent colour; name 14.5/800 + subline 11.5 (role, or the **current message type in mono** when the node is the receiver). Active nodes: scale 1.06, border = agent colour, glow shadow, pulsing halo. Nodes link to agent detail.
   - Edges: SVG cubic curves between node centres, stroke rgba(255,255,255,.12) idle; the active edge takes the receiver's colour at 2.5px with animated dash; visited edges rgba(255,255,255,.3). A 7px packet circle travels the active edge with `animateMotion` 1.1s spline(.3 0 .2 1) and drop-shadow glow.
   - Footer bar (`--panel2`, top hairline, 14px 22px 18px, **pinned to card bottom**): "Step n / N" 12/700 `--t3`, 6px progress track `--panel3` with amber fill (`linear-gradient(90deg,#F5A623,#FFC65C)`), caption 13/600 `--t2` (e.g. "Risk decision: HOLD").
   - Auto-advance every 1.9s while playing; pause stops; changing scenario resets to step 0. Scenario step data = `data.js` SCENARIOS (from/to/type/text/caption).
   - **Hand-offs** card: eyebrow "HAND-OFFS", title "Agent messages"; list of the last 8 messages newest first; row radius 14, `--panel2`, 12px 14px: sender tile → receiver tile (24px, agent colours), mono type right-aligned 10.5px, text 13px `--t2`. Rows containing HOLD / REJECTED / BLOCKED / alert get `--danger-bg` fill + `--danger` border. Footer buttons "Open workflow →" (ghost, full) and "Live feed" (ghost).
3. **Revenue 30 days** (flex 2) + **Conversion funnel** (flex 1): bar chart 220px tall, bars radius 4, amber with 35% alpha fallback, today's bar full amber; x labels every 5 days 11px mono. Funnel: 5 rows (New customer 115 · Sales interaction 98 · Customer analysis 91 · Enrollment request 44 · Completed 27), 10px track, fill = agent/brand colour, value + % in mono.
4. **Agents strip**: 6 cards in `repeat(auto-fit,minmax(170px,1fr))`: 40px coloured tile, name 14/800, StatusBadge (Idle/Running), "142 ok · 1 failed" mono 11.5, 36px sparkline of last runs.
5. **Recent activity** (flex 3) + **Open security alerts** / **Latest recommendations** stacked (flex 2). Activity row: time mono 11px · 28px agent tile · type badge (mono) · summary 13.5; "Live activity →" link. Alert row: severity badge + title 14/700 + desc 12 + relative time. Recommendation row: title 14/700 + meta 12 (category · priority · confidence).

### 2. Live activity (`/activity`)
Header + Live pill. Left (flex 1 1 560px): two filter rows of chips (Type: agents/workflows/payments/security/approvals/customers/analytics; Agent: 7 agent chips with 24px coloured tiles). Chips 32px, radius 999, selected = `--text` fill. Feed card: header "142 events" mono + Pause/Resume ghost button; rows grid `72px 28px 1fr auto`: time mono, agent tile, [type badge + summary], "Workflow" link. New rows animate `rowIn`; the feed is driven by the same scenario clock as the dashboard canvas (in prod: SSE `use-events`). Right aside (flex 0 1 300px): "Now running" (agent tile, Running badge with ping dot, current tool mono) + "Latest" line.

### 3. Workflows (`/workflows`) — generic list
State filter chips (All / Awaiting approval / Payment failed / Completed / In progress). Rows: label 14/700 + uid mono, customer, kind chip, StatusBadge, "updated 2 min ago". Click → detail.

### 4. Workflow detail (`/workflows/[id]`)
Back link ("← All workflows", 13/700 `--t3`). Title 28/800 + status badge + uid mono + customer + "Started … · updated …". Danger ghost "Cancel workflow" (role-gated).
- **Journey graph** card: the 12 states (WF_STATES) as a horizontal chain of chips (radius 10, 13/600) with arrow icons; current = amber fill `--on-brand` text with glow; visited = `--info-bg` + `--info` border; failed = `--danger-bg`; not reached = dashed `--hair2`. Legend row below (12px).
- Two columns: **Timeline** (numbered rows: from-badge → to-badge, "Agent: note", time mono) and **Agent messages** (sender tile → receiver tile, type chip mono, payload mono 12 ellipsised, click expands JSON).

### 5. Agents (`/agents`)
Cards `auto-fit minmax(300px,1fr)`: 44px coloured tile, full name 16/800, role 13 `--t3`, StatusBadge + last run, 3 stats (OK green / Failed / Avg ms) mono 15/700, allowed-tool chips (mono 11.5, `--panel3`), chevron. Below: **How they collaborate** = the same orchestration canvas component (without scenario tabs, driven by live events) + **Message paths** list (source → target, label mono). Click card → agent detail.

### 6. Agent detail (`/agents/[id]`)
Header with big 56px tile; tabs Overview / Executions / Permissions. Permissions tab: "Allowed tools" chips in agent colour; "Never granted" chips with `--danger-bg` + strike icon (NEVER list: approval.decide, product.update_price, payment.refund, user.write, db.query); provider/model/temperature from settings. Executions: table (started, trigger, status, duration ms mono, tokens) + JSON inspector drawer.

### 7. Studio (`/studio`)
Three columns `minmax(240px,300px) 1fr minmax(260px,320px)`: conversation list (customer, channel icon mic/message-square, time, workflow state badge, selected = `--panel3`); transcript (bubbles: agent `--bubble` left with 28px sales tile, customer `--bubble-me` right; injection-flagged conversation shows a danger notice bar above); **Intelligence inspector**: intent gauge (0–1, 8px track, colour by band), stage badge, needs / motivations / objections chip groups, sentiment pill, "Suggested follow-up" box in `--brand-bg`, "Open workflow" link.

### 8. Customers / Products / Orders / Payments / Audit — generic list + detail
Shared list layout: title 28/800 + description, right-aligned actions (search 36px input with icon, filter selects, primary "New product" where applicable). Card radius 22, header row 12px 20px 11.5 eyebrow, rows 13px 20px hover `--panel2`, footer "Showing n of m" + pager. Column specs:
- Customers: avatar initials (32px `--panel3`) + name/email · stage badge · intent bar (56px) + value · sentiment · interactions · spent mono · since.
- Products: name + category · level chip · weeks · seats "7 / 25" with mini bar · price mono "1,890 TND" · status badge · actions (edit). **New / Edit program modal** (720px, radius 24, 2-column form): Program name (span 2), Category select, Level select, Duration (prefix "weeks"), Price (prefix "TND", hint "server-side, agents cannot change it"), Seats, Status segmented Draft/Active/Archived, Summary textarea, Learning outcomes textarea (one per line), Who it is for textarea. Required fields turn `--danger` border with an inline error; footer note about price-change approval; "Save program" / "Publish program" (when Active) / "Save changes". Editing the price of an active program creates an approval request. Opened by the "New program" header action and "Edit program" on product detail.
- Orders: ref mono · customer · product · amount mono right · status · time.
- Payments: ref mono · order · customer · amount mono · method chip mono · risk bar (colour: <40 success, <70 warning, else danger) · status · time.
- Audit: time mono · actor (agent tile or user) · action mono · details · hash mono `--t4` with copy icon.
Detail pages: back link, title + status badge, 2-column `1fr minmax(280px,360px)`: main cards (timeline, related items) + facts `dl` (grid `auto 1fr`, 6px 14px, labels `--t3`, values 13.5). Payment detail has "Release / Refund" actions that open the approval request (role-gated). Customer detail reuses the Studio inspector.

### 9. Analytics (`/analytics`)
KPI tiles `auto-fit minmax(170px,1fr)` radius 18: eyebrow, value 24/800 + unit, **delta row with inline 64×24 sparkline** (not overlapping). Then: Revenue area chart (30d), Conversion funnel, Payment status donut (Succeeded/Failed/Pending/Held/Refunded), "Objections" horizontal bars, "Top programs" table. Analyst narrative card (agent tile + "Latest analysis 4 minutes ago, trigger payment.succeeded" + paragraph).

### 10. Strategy (`/strategy`)
Tabs Active / Superseded. Cards `auto-fit minmax(380px,1fr)`: 40px strategy tile, title 16/800, category · priority chip (High warning / Medium info / Low neutral) · confidence "78%" with 6px bar; **"Observed facts"** list (eyebrow in `--success`, check icons) and **"Hypothesis"** (eyebrow in `--info`, italic 13.5); footer: "Requires approval" lock chip when `approval:true`; buttons right-aligned, wrap allowed: "Defer" ghost and "Accept" / "Accept · needs approval" solid `--text` on `--bg` (min-height 32, padding 6px 12px, nowrap). Accept → toast + status Accepted; needs-approval → creates an approval request.

### 11. Security (`/security`)
KPI tiles (Open events 4 · High or critical 3 · Injection attempts 5 · Total 14). Row: **Breakdown** card (by severity bars with severity badges; by detector) + **Prompt injection tester** (textarea 96px `--input`, radius 12; "Scan" primary; result badge Blocked/Clean with matched patterns; 700ms scanning state with shimmer). Tabs All events / Fraud / Prompt injection / Agent violations / Access + severity/status selects. Table (min-width 900px, scrolls): severity badge (Critical 600 weight) · type + category · description `--t3` · risk mono · status badge · time. Row → event detail (facts + "Mark investigating / Resolve / Dismiss" actions, related payment/customer links).

### 12. Approvals (`/approvals`)
Explainer card (user-check icon): "Agents can request, only humans decide." + four-eyes note. Tabs Queue (count) / History. Queue rows: action 14/700 + ref mono, requested by (agent tile or user), customer, amount mono right, risk bar + score, status badge, **expires countdown mono** (turns `--danger` under 10 min), requested. Click → **Approval detail**: context card (reason, security findings, related TX and workflow links), decision panel with "Approve" (success solid) and "Reject" (danger ghost) + required note textarea; the requester cannot decide (disabled with tooltip). Decision updates queue, history and toasts.

### 13. Settings (`/settings`)
Left tab rail (flex 0 0 220px; items 38px radius 10, selected `--panel3`): Users & roles / **Business profile** / AI providers / Simulation / Preferences. **Business profile** (new): 2-column form (brand name, legal name, tagline, registration no., tax ID, address, phone, support email, contact email, website, founded, support hours, About textarea, Refund policy textarea) + "Preview public page" link + "Save profile". These values feed every buyer-facing surface (landing "Who you are buying from", program detail "Offered by", checkout "You are buying from", public footer). Persist in a `business_profile` table / settings endpoint. Users: rows wrap `flex-wrap` (avatar 34px + name/email · role chip mono · "Active 12 min ago" nowrap · edit at right). Providers: per-agent rows (tile, name, provider select, model input mono, temperature slider 0–1); note "Keys stay on the server". Simulation: toggles (velocity threshold, high-value threshold 2,000 TND, approval expiry 60 min). Preferences: theme (Dark/Light/System), density, reduce motion.

### 14. Demo control (`/demo`)
Left: 5 scenario cards (01–05 mono numbers 28/800 `--t4`, title 20/800, desc, step chips chain, amber "Run" button with play icon; running card shows a progress bar and "Running step 4/13"). Right: **Live feed** card that fills as the scenario executes (same row style as Live activity) and a "Follow in → Approvals / Payments / Security" link depending on the scenario. Running a scenario also drives the dashboard canvas.

### 15. Public: Landing (`/`)
Includes a **"Who you are buying from"** section (panel background, 2 columns): business name 32/800, tagline, about paragraph, accreditation pills (`--success-bg`, badge-check icon), 4 stat tiles (Founded / Learners trained / Instructors / Rating), and a "Business details" card listing legal name, registration + tax ID (mono), address, phone (mono), emails, support hours, plus a refund-policy note in `--brand-bg`. Program detail shows an "Offered by" card under the price card (verified badge, legal name, since-year, address/phone/support/registration, 14-day refund line); checkout order summary ends with "You are buying from" (name, legal + registration, address, support contact, refund). The public footer carries name, legal, registration, address, phone, email.

Public header 64px (logo, nav Programs / Assistant, theme toggle, "Dashboard" button → login/dashboard). Hero: dark gradient + glow, eyebrow "AN ACADEMY RUN BY SIX AI AGENTS", h1 52px/800 -0.03em "Learn AI from a team that runs on it.", sub 18px rgba(243,245,249,.72), CTAs "Talk to the assistant" (amber, mic icon, 48px radius 12) + "See programs" (ghost white hairline). Right: **Live relay card** (glass rgba(255,255,255,.05), radius 28): "LIVE" pip, 6 agent tiles in a 3×2 grid that light up in sequence, a message line that cycles through hand-offs. Below: "Programs open for enrollment" (3 cards: name 18/800, category, summary, weeks/level/seats, price mono 22/800, Details + Enroll), "From first question to a seat" 4 steps with numbered 01–04 mono, dark CTA band, footer with the fictional-data disclaimer.

### 16. Programs (`/offers`) and Program detail (`/offers/[slug]`)
Category chips, cards grid `auto-fit minmax(300px,1fr)` radius 22 with seat bar and price. Detail: 2 columns `1fr minmax(280px,360px)`: title 36/800, summary, "You will be able to" outcome list (check icons in `--success`), "Who it is for", weeks/level/seats facts; sticky right card: price 30/800 mono + "TND", seats left bar, "Enroll" amber 48px, "Ask the assistant" ghost, "Simulated payment" info note.

### 17. Assistant (`/assistant`)
Left card radius 28 min 680px: header (sales tile, "Sales assistant" 15/800, "Screened by the security agent before every reply" 12 `--t3`, Read-aloud switch, New conversation). Centre **voice orb** when conversation empty: 120px circle with layered amber radial glow and 5 animated bars when listening. Bubbles as in Studio; agent replies may include a program card (name, weeks · level, price, Details) + "Enroll in …" amber button. Typing indicator 3 dots. Composer: chips row (suggested questions, radius 999 32px), textarea 44px auto-grow `--input`, mic button (ghost; active = amber with pulsing ring), send (amber square 40px). Right aside: "How your question travels" mini relay (Security → Sales → Intelligence) that highlights as a reply is produced; "Try a prompt injection" demo button that sends a hostile message and shows the refusal + danger notice.

### 18. Checkout (`/checkout`), Success, Failed, Held, Blocked
Info banner (`--info-bg`, flask icon): "SIMULATED PAYMENT. No real money moves…". 2 columns `1fr minmax(280px,360px)`: method list (5 radio cards 56px radius 14: Test card succeeds / insufficient funds / velocity trigger / bank transfer pending / high amount; selected = `--brand-bg` + amber border + filled radio); "Pay 1,890 TND" amber 48px with lock icon. Order summary card: product, weeks/level, ref mono, status badge, total mono 18/800. Processing state: button shows spinner + "Payment agent working…", then a 3-step vertical tracker (Session created → Security check → Decision) animating in. Outcomes (max-width 640, centred): **Success** 96px green circle check with `popIn` + ring halo, "You are enrolled." 32/800, order facts, "Back to programs"; **Failed** red circle x, reason, "Try another method"; **Held** amber hand icon, "A person will review this payment", countdown, and (demo only) reviewer buttons Approve / Reject that resolve in place; **Blocked** danger shield.

### 19. Auth (`/login`, `/register`, `/forgot-password`, `/reset-password`) — fully working flow
Admin routes are guarded: no session → redirect to `/login` with the inline message "Sign in to open the console." Session persists (`trackify-session`); sign-out from the sidebar user card clears it. Login validates email format + password; wrong credentials show an inline `--danger` error box. **Register** (form column 560px, 2-column grid): Full name, Work email, Business name, Field of activity (select: Education & training / FinTech & banking / E-commerce & retail / SaaS & software / Healthcare / Consulting & services / Other), Your role (Business owner → SUPER_ADMIN, Finance, Security, Sales, Viewer), Team size, Country, Phone (optional), Password with strength meter (4 bands: Too short / Weak / Fair / Good / Strong), Confirm password, consent line. Validation: all required, email format, ≥8 chars, match, duplicate email. Success signs the user in and toasts "Welcome, {first}. {business} is set up." Forgot: validates email → success box + "Open the reset link" (demo). Reset: ≥8 chars, one digit, match → back to login. Enter submits on any field. On narrow screens the form stacks **above** the brand panel (`flex-wrap: wrap-reverse`).

Two-column `auto-fit minmax(460px,1fr)`: left dark gradient panel with logo, headline 40/800 "The console behind the academy.", three bullet proofs with coloured agent tiles, disclaimer; right form column centred, max 420px: title 28/800, inputs 46px radius 12 `--input` + hairline (focus: amber 2px ring at 35% alpha), primary 46px amber, links in `--brand-text`. Login shows **Demo accounts** chips (Super admin / Finance / Security / Sales / Viewer) that fill credentials; password `Demo!2026`. Register: name/email/password/confirm + role select. Forgot: email + "Send reset link" → success state with mail icon. Reset: two password fields with strength bar.

---

## Interactions & behaviour summary
- All navigation is client-side; back links use the parent route. Scroll to top on route change.
- Scenario clock: one interval (1.9s) in a context/provider drives dashboard canvas, hand-offs, live feed and demo control. In production replace with SSE events (`use-events.ts`), mapping `agent.started` → activate receiver node, `agent.completed` → mark edge visited, `approval.requested` → human node + danger row.
- Approvals, Strategy accept/defer, Security tester, checkout methods, demo runs and the ⌘K palette all mutate local state optimistically and toast.
- Theme persists in `localStorage("trackify-theme")`; default dark for admin, follows system on public pages. Toggle uses `document.startViewTransition` circular reveal from the pointer.
- Role gating: Cancel workflow, Approve/Reject, product edits, settings tabs follow `lib/permissions.tsx` (SUPER_ADMIN, FINANCE_MANAGER, SECURITY_ANALYST, SALES_MANAGER, VIEWER). The requester of an approval cannot decide it.
- Loading: skeleton rows in `--panel3` with shimmer 1.4s. Empty states: centred icon tile + 14px copy + one action.
- Minimum hit target 36px (44px on public/mobile). Focus rings: 2px amber at 35% alpha, offset 2px.

## State
Per page as in the codebase today (TanStack Query). New shared state: `theme`, `sidebarCollapsed`, `paletteOpen`, `scenario{ id, step, playing }`, `thread[]` (last 8 hand-offs), `toast`, `session{ name, email, role, org, field }`, `businessProfile`, `productModal{ mode, id }`.

## New data the backend needs
- `business_profile` (single row): name, legal, tagline, about, founded, city, address, phone, email, support, website, registration, taxId, refund, learners, instructors, rating, accreditations[], hours. Exposed read-only to the public API and editable by SUPER_ADMIN.
- `users` registration payload: name, email, password, role, org, field, size, country, phone.
- `products`: add `status` (DRAFT/ACTIVE/ARCHIVED), `outcomes[]`, `audience`; price changes on ACTIVE products create an approval request.

## Component mapping (prototype → codebase)
- Sidebar/header → `components/shell/app-shell.tsx` (restyle; add palette + theme toggle + Public site link).
- Orchestration canvas → new `features/agents/orchestration-canvas.tsx` (replace `collaboration-graph.tsx`); reuse `use-agent-pulse.ts` for live activation.
- Hand-offs panel → new `features/dashboard/handoffs.tsx`.
- Journey chain → restyle `features/workflows/journey-graph.tsx`.
- KPI tiles → `ui-kit/kpi-card.tsx` (add inline sparkline + delta row).
- StatusBadge → keep API, map tones to the token table; add severity weights.
- AgentAvatar → add per-agent colours.
- DataTable → add scroll wrapper + min-width, hover `--panel2`, 13px 20px rows.
- Command palette → new `components/shell/command-palette.tsx` on shadcn `Dialog` (or cmdk).
- Checkout tracker / outcomes → `features/checkout/outcomes.tsx`.
- Voice orb → `features/assistant/chat.tsx` + `features/voice/adapter.ts`.

## Assets
- Fonts: Manrope, Geist Mono (Google Fonts / `next/font`).
- Icons: lucide-react (already a dependency). `l-icon.js` in this bundle is only the prototype's icon loader.
- `assets/trackify-mark.png` (256px app icon) and `assets/trackify-logo-full.png` (source lock-up). Export an SVG from the source file if available; otherwise use the PNG at 2× size.

## Files in this bundle
- `Trackify.dc.html` — the full clickable prototype (all screens, both themes). NOTE: the copy in this repo was fetched through an API capped at 256 KiB; the whole HTML template + CSS (lines 1–578) is complete, only the tail of the fixture-building script after the Demo page is cut. The README + `data.js` cover what is missing.
- `data.js` — fixture data and scenario scripts used by the prototype (useful as seed/mocks).
- `l-icon.js` — lucide icon web component used by the prototype.
- `support.js` — prototype runtime; required to open the `.dc.html` files locally, not relevant to the port.
