# Database

SQLAlchemy 2 models in `apps/api/app/models/__init__.py`; migrations in `apps/api/migrations` (Alembic,
`render_as_batch` for SQLite). Default engine SQLite (`fintech.db`), PostgreSQL 16 in Docker.

Conventions: UUID primary keys (audit logs and system events use autoincrement integers for ordering),
UTC tz-aware timestamps (`UTCDateTime`), money as integer millimes (`Money` -> `Decimal`), enums stored as
strings, explicit `ondelete` policies.

```mermaid
erDiagram
  users }o--o{ roles : user_roles
  roles }o--o{ permissions : role_permissions
  users ||--o{ refresh_tokens : has
  customers ||--o{ conversations : has
  conversations ||--o{ messages : has
  conversations ||--o| customer_insights : analysed_as
  customers ||--o{ orders : places
  orders ||--o{ order_items : contains
  products ||--o{ order_items : sold_as
  orders ||--o{ enrollments : grants
  orders ||--o{ payment_sessions : paid_via
  payment_sessions ||--|| transactions : creates
  transactions ||--o{ payment_attempts : tried
  transactions ||--o{ transaction_status_changes : history
  transactions ||--o{ refunds : refunded_by
  transactions ||--o{ security_events : flagged_by
  transactions ||--o{ approval_requests : held_by
  approval_requests ||--o{ approval_decisions : decided_by
  workflows ||--o{ workflow_steps : steps
  workflows ||--o{ agent_executions : runs
  workflows ||--o{ agent_messages : exchanges
  agents ||--o{ agent_executions : performs
  agent_executions ||--o{ tool_invocations : calls
  customers ||--o{ customer_feedback : gives
```

## Tables

| Group | Tables |
|---|---|
| Access | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `refresh_tokens`, `password_reset_tokens` |
| Sales | `customers`, `products` (offers), `conversations`, `messages`, `customer_insights`, `orders`, `order_items`, `enrollments`, `customer_feedback` |
| Financial | `payment_sessions`, `transactions`, `transaction_status_changes`, `payment_attempts`, `refunds` |
| AI | `agents`, `agent_executions` (also serves as agent task log), `agent_messages`, `workflows`, `workflow_steps`, `tool_invocations` |
| Governance | `security_events` (fraud alerts = category FRAUD), `approval_requests`, `approval_decisions`, `audit_logs` |
| Analytics | `business_recommendations`, `analytics_snapshots`, `system_events` |

## Integrity rules

- `payment_sessions.idempotency_key` and `payment_attempts.idempotency_key` are unique.
- One transaction per payment session; one insight per conversation; one workflow per conversation.
- `audit_logs`: no update/delete code path; PostgreSQL trigger `audit_logs_no_mutation` rejects UPDATE/DELETE;
  each row stores `prev_hash` and `hash` (SHA-256 chain), verifiable via `GET /api/v1/audit/verify`.
- Messages flagged as injection keep `flagged=true` and are excluded from model context.

## Commands

```bash
cd apps/api
uv run alembic upgrade head          # create / migrate schema
uv run python -m app.seed            # seed fictional data (if empty)
uv run python -m app.seed --reset    # wipe and reseed
uv run alembic revision --autogenerate -m "change"   # after editing models
```
