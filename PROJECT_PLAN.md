# Project Plan — The Autonomous FinTech Team

TECHX Tunisia 2026–2027 hackathon (IEEE CS ENICarthage x ENIT). Brief: `Cahier_des_Charges_The_Autonomous_FinTech_Team_TechX.pdf`.

## Goal

A working prototype where six specialised AI agents run a complete, secured customer and financial journey for a
fictional AI-training academy: conversation, intelligence, simulated payment, financial analysis,
recommendations, fraud and prompt-injection defence, human approval, full traceability.

## Judging criteria to satisfy (from the brief)

| Criterion | How this project answers it |
|---|---|
| Communication / presentation | Demo control panel with 5 scripted scenarios, live activity stream, workflow visualiser |
| Originality | Agents collaborate through a typed orchestrator; deterministic rules decide, LLMs only enrich |
| Technical realisation | FastAPI + SQLAlchemy + Alembic, Next.js, tests, Docker, CI |
| AI & FinTech relevance | Real sales journey: offer, objections, enrollment, payment state machine, revenue KPIs |
| Cybersecurity & trust | Least-privilege tool gateway, injection classifier, fraud rules, four-eyes approvals, hash-chained audit |
| Impact | Strategy agent turns objections and payment data into evidence-backed actions |

## Key decisions

1. **Rules decide, LLMs enrich.** Every agent has a deterministic core. Anthropic/OpenAI adapters only rewrite
   wording, summarise or explain; any provider failure falls back silently. Mock mode is the primary demo path.
2. **One choke point for agent actions** (`app/agents/base.py::invoke`): allowlist check, tool-invocation log,
   audit row, then execution. Forbidden tools raise a security event.
3. **Money is exact**: integer millimes in the DB, `Decimal` in Python, decimal strings in JSON.
4. **Seed through the real services**, so dashboard totals always reconcile with transactions.
5. **SQLite by default, PostgreSQL in Docker.** Docker daemon was unavailable on the build machine.
6. **In-process event bus** persisted to `system_events` before broadcast; Redis is the documented upgrade path.

## Milestones

| Phase | Scope | Status |
|---|---|---|
| 1 Foundation | Repo, architecture contract, backend skeleton, design system, Docker, CI | done |
| 2 Core business | Auth, RBAC, customers, products, conversations, orders, payments | done |
| 3 Agent infrastructure | Specs, tool gateway, provider adapters, orchestrator, state machines | done |
| 4 Six agents | Sales, Intelligence, Payment, Analyst, Strategy, Security | done |
| 5 Security & approvals | Fraud rules, injection defence, audit chain, approval center | done |
| 6 Analytics | KPIs, series, funnel, CSV reports, recommendations | done |
| 7 Frontend | Admin console + public experience | in progress |
| 8 Real-time | WebSocket + polling fallback, live activity, workflow visualiser | in progress |
| 9 Tests & demo | Pytest, Vitest, Playwright, demo scenarios | in progress |
| 10 Polish & docs | Responsive, a11y, docs/ | pending |

Live checklist: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Contract: [ARCHITECTURE.md](ARCHITECTURE.md).
