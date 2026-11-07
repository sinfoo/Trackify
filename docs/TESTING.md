# Testing

## Backend (pytest) — `cd apps/api && uv run pytest -q`

108 tests, ~55 s, no network, no API keys (conftest forces `AI_PROVIDER=mock`). Each test gets a wiped SQLite
database with reference data reseeded.

| File | Covers |
|---|---|
| `test_payments.py` | Transaction state machine, human-only transitions, idempotency (incl. long keys), server-side pricing, tampering vs legitimate catalog price change, velocity / failures / high-value / clean decisions |
| `test_approvals.py` | Four-eyes rule, viewer 403, rejection needs notes, payment release, refund completion, double decision 409 |
| `test_security.py` | Injection true positives (EN/FR) and negatives, public chat refusal without transaction, least privilege for all six agents |
| `test_orchestration.py` | Full public journey -> COMPLETED with executions from all six agents, failed payment, chatting while a payment is held, agent retry |
| `test_analytics_audit.py` | Full seed run reconciled against raw rows (revenue = sum of SUCCEEDED, status counts, conversion formula), exact Money round-trip, audit hash chain + tamper detection |
| `test_auth.py` | Cookies, 401, rate limit 429, refresh rotation + reuse detection, logout, RBAC with audited denial |
| `test_public_api.py` | No leakage on public endpoints, wrong conversation token 404, checkout `simulated: true`, health |
| `test_demo.py` | All 5 demo scenarios and their effects |
| `test_admin_api.py` | Contract tests for users, customers, products, orders, payments, analytics, reports, security, approvals, strategy, audit, settings |

Lint: `uv run ruff check app tests` and `uv run ruff format --check app tests`.

## Frontend (Vitest) — `cd apps/web && npm test`

Unit tests for money/date formatting, the API client (error envelope, refresh-once on 401), and the login form
validation. Type check `npx tsc --noEmit`, lint `npm run lint`, build `npm run build`.

## End-to-end (Playwright) — `cd apps/web && npx playwright test`

Requires the API on :8000 (seeded) and the web app on :3000. Covers login, dashboard rendering, the public
assistant -> enroll -> simulated checkout journey, and the RBAC-protected approval flow.

## CI

`.github/workflows/ci.yml`: backend lint, migration on a fresh DB, pytest; frontend type check, unit tests, build.
