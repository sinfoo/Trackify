# Implementation Status

Legend: [x] done and verified · [~] partial · [ ] not done.

## Definition of done

### Product
- [x] Application launches (API :8000, web :3000; production `next build` passes, 36 routes)
- [x] Authentication (login, logout, refresh rotation, register, forgot/reset)
- [x] Role-based access enforced by the backend (6 roles, 26 permissions, audited 403s)
- [x] Public experience: landing, offers, assistant (text + browser voice with consent), simulated checkout, success / failure
- [x] Product management (create, edit, archive, price audit trail)
- [x] Customer management (search, filters, intelligence, history, re-analyze)
- [x] Sales assistant conversations
- [x] Orders and enrollments
- [x] Simulated payments (state machine, idempotency, server-side price)
- [x] Transaction history persisted (attempts, status changes, refunds)

### AI
- [x] Six specialised agents with distinct tools, prompts, permissions and Pydantic outputs
- [x] All six collaborate in one workflow (verified by test: executions from every agent)
- [x] Structured agent communication (`agent_messages`) and orchestration with retries
- [x] Execution history (UI + API)
- [x] Mock mode without API keys (default); Anthropic and OpenAI adapters with rule fallback

### Security
- [x] Backend RBAC, least-privilege tool gateway, forbidden-tool detection
- [x] Fraud rules + statistical anomaly; prompt-injection classifier (demonstrable)
- [x] Human approval for held payments and refunds, four-eyes rule
- [x] Payment idempotency; audit log persisted with hash chain; no live payment path

### Analytics
- [x] KPIs from persisted data, reconciled by tests (revenue == sum of SUCCEEDED)
- [x] Conversion formula documented and tested; segment/date/product filters
- [x] Security alerts and recommendations displayed; CSV exports + print

### Experience
- [x] Responsive (checked at ~390 px and 1440 px), light (default) and dark
- [x] All major routes functional; loading, empty and error states
- [x] Real-time via WebSocket with polling fallback

### Engineering
- [x] Alembic migrations (fresh `upgrade head`, `alembic check` clean, seed after)
- [x] Backend tests: 111 passed
- [x] Frontend unit tests: 14 passed; type check + lint clean
- [x] Playwright E2E: 5 passed (dashboard, auth redirect, purchase journey, injection, RBAC)
- [~] Docker Compose written, **not executed** (Docker daemon unavailable on build machine)
- [x] README, docs/ set, `.env.example`, seed + reset

## Known deviations
- No Redis: in-process event bus and rate limiter (single instance). Upgrade path documented.
- `offers` merged into `products`; `fraud_alerts` = security events with category FRAUD; `agent_tasks` merged
  into `agent_executions`; `POST /workflows/{id}/execute` not implemented (workflows advance through events).
- Payment session/simulate admin endpoints gated by `orders:write` (no separate `payments:write`).
- Voice: browser Web Speech APIs only (adapter interface ready for a server STT/TTS provider).
- Revenue forecasting (ML bonus) not implemented.
