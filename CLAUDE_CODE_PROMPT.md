# Claude Code prompt — implement the Trackify redesign

Copy everything below the line into Claude Code, run from the repo root (`Hackathon/`), with the `design_handoff_trackify/` folder placed at the repo root.

---

You are implementing a complete UI redesign of the Next.js app in `apps/web` (Next.js 15, React 19, Tailwind 4, shadcn/ui, TanStack Query, lucide-react). The product is renamed **Trackify**. The redesign is fully specified in `design_handoff_trackify/README.md` and demonstrated by the clickable prototype `design_handoff_trackify/Trackify.dc.html` (open it in a browser; `data.js` holds its fixtures). Reproduce the prototype **exactly**: same layout, spacing, radii, colours, typography, motion, copy and behaviour, in both dark and light themes. The prototype is the source of truth whenever the README and the code disagree.

## Ground rules
1. Read `design_handoff_trackify/README.md` fully before writing code. Then open `Trackify.dc.html` and inspect each screen's inline styles when you need an exact value; do not guess.
2. Keep the existing architecture: route groups `(app)`, `(public)`, `(auth)`; `components/ui` shadcn primitives; `components/ui-kit`; `features/*`; `lib/queries.ts`; `hooks/use-events.ts`; `lib/permissions.tsx`. Restyle and extend, do not fork a parallel UI tree.
3. Tokens first: put every CSS variable from the README token table into `app/globals.css` under `:root` (light) and `.dark` (dark), including the per-agent `--c-<agent>` / `--c-<agent>-bg` pairs. Load **Manrope** and **Geist Mono** with `next/font/google` and set them as `--font-sans` / `--font-mono`. Delete leftover Geist Sans usage.
4. The sidebar and the hero/auth/landing brand panels are always dark, in both themes, exactly as in the prototype.
5. Icons: lucide-react only, same icon names as the prototype. No emoji, no custom SVG illustrations.
6. Motion: implement the named keyframes (`rise`, `rowIn`, `popIn`, `livePip`, `halo`, `dash`, `fadeIn`, `shimmer`) and the theme-toggle View Transition circular reveal; honour `prefers-reduced-motion`.
7. Accessibility: minimum 36px hit targets (44px on public pages), visible 2px amber focus rings, `aria-label`s on icon buttons, dialogs trap focus and close on Escape.
8. Do not change API contracts. Where the prototype shows data the API does not provide yet, add a typed TODO and render from a fixture in `lib/fixtures.ts` built from `design_handoff_trackify/data.js`, so every screen renders fully today.

## Work in this order, committing after each step
1. **Foundation**: globals.css tokens + fonts, `ThemeProvider` with persisted theme (`trackify-theme`) and View Transition reveal, restyled shadcn primitives (Button, Input, Select, Textarea, Tabs, Dialog, Sheet, Badge, Switch, Tooltip, Table) to the prototype values. Toast via sonner styled as the prototype pill.
2. **Admin shell**: sidebar (expanded 252px / rail 76px, groups, active bar, badge, user card with sign-out, collapse), sticky glass header (breadcrumb + title, Live pill, Simulated pill, theme toggle, bell, Public site link), **command palette** (⌘K / Ctrl+K, grouped results, arrow-key navigation) in `components/shell/command-palette.tsx`.
3. **Auth** (`(auth)`): two-panel layout that stacks form-first on narrow screens; login with inline errors and demo-account chips; **register** with all extra fields (business name, field of activity, role, team size, country, phone, password strength meter, confirm) and validation; forgot/reset flows; route guard redirecting unauthenticated users to `/login` with the inline message. Use the existing auth API; keep the session in the current mechanism.
4. **Dashboard**: hero banner with the five big numbers and "NEEDS YOU" strip; **orchestration canvas** (`features/agents/orchestration-canvas.tsx`): 9 positioned nodes, SVG curved edges, travelling packet, scenario segmented control, play/pause, pinned step bar; hand-offs panel; revenue chart; funnel; agents strip; recent activity; alerts; recommendations. Drive the canvas from a shared scenario clock provider now, and from `use-events` SSE events when available.
5. **Agents, Live activity, Workflows + detail** (journey chain, timeline, messages).
6. **Generic list + detail** pattern (`ui-kit/data-table.tsx` + a `DetailPage` layout) and apply to Customers, Products, Orders, Payments, Audit, Approvals, Security events. Products gets the **New / Edit program modal** with validation and the price-change-approval rule.
7. **Studio, Analytics, Strategy, Security (with the working injection tester), Approvals detail (approve/reject with four-eyes rule), Settings** (Users & roles, **Business profile**, AI providers, Simulation, Preferences), **Demo control**.
8. **Public site** (`(public)`): landing with live relay card and the "Who you are buying from" section, programs grid, program detail with the "Offered by" card, assistant with voice orb, checkout with the five test methods, processing tracker and the four outcomes, "You are buying from" block, footer with business details. Business details come from the Business profile settings (add a read-only public endpoint or fixture).
9. **QA pass**: open every route in dark and light at 1440px, 1024px and 390px; compare against the prototype side by side; fix any difference in spacing, colour, radius, type size, or copy. Run `pnpm lint`, `pnpm typecheck`, and the existing tests; add tests for the register validation, route guard, command palette navigation and the program modal validation.

## Definition of done
- Every route listed in the README exists, renders without console errors, matches the prototype in both themes, and is reachable from the navigation exactly as in the prototype.
- No Geist Sans, no leftover old colours (`#F5F7FB`, `#17233C`, `#FCFDFE`), no old "TECHX Agents" naming in the UI.
- `pnpm build` succeeds.

When you finish each numbered step, print a short checklist of what was implemented and any deviations from the prototype with the reason, then continue to the next step without waiting.
