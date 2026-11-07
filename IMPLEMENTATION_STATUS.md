# Implementation Status

Updated as work lands. Legend: [x] done and verified · [~] partial · [ ] not done.

## Backend (apps/api)
- [x] Config, DB types (exact Money, tz-aware UTC), ORM models for all domains
- [x] Auth: argon2, 15-min JWT cookie, rotating refresh tokens with reuse detection, logout, register, reset, login rate limit
- [x] RBAC: 6 roles, 26 permissions, `require()` dependency, 403s audited
- [x] Six agents with specs, tool allowlists, structured outputs; tool gateway with denial -> security event
- [x] Provider adapters: mock (default), Anthropic SDK, OpenAI SDK; fallback to rules on any failure
- [x] Orchestrator: workflow state machine, agent executions, agent-to-agent messages, retries, events
- [x] Payment state machine, server-side pricing, idempotency, human-only transitions, refunds via approval
- [x] Risk engine: injection classifier, velocity, repeated failures, duplicates, high value, tampering, z-score
- [x] Approvals: request, expire, decide, four-eyes, side effects (release payment / refund)
- [x] Analytics service with documented definitions
- [x] Hash-chained append-only audit log (+ PostgreSQL trigger)
- [x] Event persistence + WebSocket broadcast after commit + polling endpoint
- [x] Seed via real orchestrator (42 fictional journeys), reset
- [x] Demo scenarios (5) endpoint
- [x] Alembic initial migration (verified `upgrade head` + `alembic check` on SQLite)
- [~] Admin routers (users, customers, products, orders, payments, analytics, security, approvals, strategy, audit, settings)
- [~] Pytest suite

## Frontend (apps/web)
- [~] Foundation: Next.js, design tokens, shell, auth, API client, events hook
- [ ] Admin pages
- [ ] Public experience (landing, offers, assistant with voice, checkout)

## Infrastructure & docs
- [x] Dockerfiles + docker-compose (PostgreSQL) — **not verified locally: Docker daemon unavailable**
- [x] `.env.example`, Makefile, `scripts/dev.ps1`, GitHub Actions CI
- [ ] docs/ set, README
- [ ] Playwright E2E

## Known deviations
- Redis not used: in-process event bus (single instance). Upgrade path documented.
- `offers` merged into `products`; `fraud_alerts` is a filtered view of `security_events`; `agent_tasks` merged into
  `agent_executions`.
