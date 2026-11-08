# Architecture — The Autonomous FinTech Team

Full diagrams and rationale: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). This file is the **contract** every
module (backend, frontend, tests) builds against.

## Monorepo

```
apps/api   FastAPI + SQLAlchemy 2 + Alembic (Python 3.12, uv). SQLite by default, PostgreSQL in Docker.
apps/web   Next.js (App Router, TS strict) + Tailwind + shadcn/ui + TanStack Query + Recharts + React Flow.
docs/      Architecture, database, API, agents, security, workflows, demo, deployment, testing.
```

Frontend calls the API **same-origin** through a Next rewrite: `/api/v1/*` -> `http://localhost:8000/api/v1/*`.
Auth = httpOnly cookies (`access_token` 15 min JWT, `refresh_token` rotating). WebSocket connects directly to
`ws://localhost:8000/ws/events` (cookie authenticates; localhost cookies are not port-scoped).

## Conventions

- All IDs UUID strings (audit logs and system events use integer ids).
- Money: **decimal strings** with 3 decimals, currency `TND` (e.g. `"1290.000"`). Never floats.
- Timestamps: ISO-8601 UTC strings.
- Errors: `{"error": {"code": "SNAKE_CASE", "message": "...", "details": {}}}` with HTTP 4xx/5xx.
- Lists: `{"items": [...], "total": n, "page": 1, "page_size": 25}`; query `page`, `page_size`, `q`, `sort`.
- 401 -> frontend tries `POST /auth/refresh` once, then redirects to `/login`.

## The six agents (ids)

`sales`, `intelligence`, `payment`, `analyst`, `strategy`, `security` — plus the `orchestrator`.

## Workflow states

`NEW_CUSTOMER, SALES_INTERACTION, CUSTOMER_ANALYSIS, PRODUCT_RECOMMENDATION, ENROLLMENT_REQUEST, SECURITY_CHECK,
PAYMENT_SESSION, PAYMENT_PROCESSING, AWAITING_APPROVAL, PAYMENT_FAILED, FINANCIAL_ANALYSIS,
BUSINESS_RECOMMENDATION, COMPLETED, BLOCKED, CANCELLED, LOW_INTENT, ERROR`

## Transaction states

`CREATED -> PENDING -> PROCESSING -> SUCCEEDED | FAILED`; `PENDING|FAILED -> REQUIRES_APPROVAL` (security hold);
`REQUIRES_APPROVAL -> PROCESSING | CANCELLED` (human only); `SUCCEEDED -> REFUNDED` (human-approved refund only).

## REST API (prefix `/api/v1`)

Permission in brackets. Public endpoints need no login.

### Auth
- `POST /auth/login {email,password}` -> `User` (sets cookies). 429 `RATE_LIMITED` after 5 failures / 5 min.
- `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me` -> `User`
- `POST /auth/register {email,full_name,password}` (creates VIEWER), `POST /auth/forgot-password {email}`,
  `POST /auth/reset-password {token,password}`
- `User = {id,email,full_name,roles:string[],permissions:string[],is_active,created_at,last_login_at}`

### Users & RBAC [users:read / users:write]
`GET /users`, `POST /users {email,full_name,password,roles[]}`, `GET /users/{id}`,
`PATCH /users/{id} {full_name?,roles?,is_active?}`, `GET /roles` -> `[{name,description,permissions[]}]`,
`GET /permissions` -> `[{code,description}]`

### Public (customer-facing, no auth)
- `GET /public/offers` -> `Offer[]`; `GET /public/offers/{slug}` -> `Offer`
  `Offer = {id,slug,name,category,summary,description,price,currency,duration_weeks,level,learning_outcomes[],
  target_audience,seats_total,seats_left,status}`
- `POST /public/conversations {full_name?, email?, consent_voice:boolean, channel:"text"|"voice"}`
  -> `{conversation_id, access_token, messages: PublicMessage[]}` (first message = agent greeting).
  Client stores `access_token` and sends it as header `X-Conversation-Token` on the calls below.
- `GET /public/conversations/{id}` -> `{conversation_id, messages: PublicMessage[]}`
- `POST /public/conversations/{id}/messages {content}` -> `{messages: PublicMessage[]}` (the new customer
  message + agent reply). `PublicMessage = {id, role:"customer"|"agent"|"system", content, created_at,
  meta:{products?: OfferCard[], cta?: {type:"enroll", product_id, label}, notice?: string}}`
  `OfferCard = {id,slug,name,price,currency,duration_weeks,level}`
- `POST /public/conversations/{id}/enroll {product_id}` -> `{checkout_session_id}` 
- `GET /public/checkout/{session_id}` -> `{session_id, status, amount, currency, product: OfferCard,
  order_reference, test_methods:[{id,label}], simulated: true, failure_reason?}`
- `POST /public/checkout/{session_id}/pay {payment_method}` + header `Idempotency-Key` ->
  `{status:"SUCCEEDED"|"FAILED"|"REQUIRES_APPROVAL"|"BLOCKED", message, transaction_reference}`
- `POST /public/feedback {conversation_id, rating 1-5, comment}` (needs X-Conversation-Token)

### Agents & orchestration [agents:* / workflows:*]
- `GET /agents` -> `AgentView[]` = `{id,name,description,icon,status,current_task,last_run_at,enabled,provider,
  model,temperature,tools[],responsibilities[],stats:{succeeded,failed,avg_ms}}`
- `GET /agents/{id}`, `GET /agents/{id}/executions` -> paged `Execution`,
  `GET /agents/{id}/permissions` -> `{allowed_tools[], forbidden_tools[]}`
- `PATCH /agents/{id}/config {enabled?,provider?,model?,temperature?}` [agents:write]
- `POST /agents/{id}/execute {task_type, payload}` [agents:write] -> `Execution`
- `Execution = {id,agent_id,workflow_id,task_type,triggered_by,status,input_summary,output_summary,output,provider,
  tokens_in,tokens_out,attempts,error,started_at,completed_at,duration_ms}`
- `GET /workflows` (filter `state`) -> paged `Workflow`; `GET /workflows/{id}` -> `Workflow` + `steps[]`,
  `executions[]`, `messages[]` (agent-to-agent), `approvals[]`
- `POST /workflows/{id}/cancel`, `GET /workflows/{id}/events` -> `Event[]`
- `Workflow = {id,kind,label,state,customer_id,customer_name,conversation_id,transaction_id,context,error,
  created_at,updated_at}`; step = `{id,from_state,to_state,agent_id,note,created_at}`;
  agent message = `{id,from_agent,to_agent,message_type,payload,created_at}`
- `GET /events?after_id=&limit=` -> `Event[]` (polling fallback) [events:read]
- `Event = {id:int,type,agent_id,workflow_id,summary,data,created_at}`; types: `agent.started, agent.completed,
  agent.failed, workflow.started, workflow.updated, workflow.completed, payment.created, payment.updated,
  security.alert, approval.requested, approval.resolved, customer.message, analytics.updated`
- WebSocket `/ws/events`: server sends `{"type":"hello"}`, then `Event` objects, `{"type":"ping"}` every 20s.

### Demo [workflows:write]
- `GET /demo/scenarios` -> `[{id,title,description,steps[]}]`; ids: `successful_journey, failed_payment,
  suspicious_activity, prompt_injection, business_intelligence`
- `POST /demo/scenarios/{id}/run` -> `{workflow_id, summary, details}`
- `POST /demo/reset` [settings:write] reseeds fictional data.

### Conversations [conversations:read]
`GET /conversations`, `GET /conversations/{id}` (all messages incl. flagged + insight + workflow),
`POST /conversations/{id}/analyze` [agents:write], `GET /conversations/{id}/insights`

### Customers [customers:*]
`GET /customers?q=&segment=&stage=` -> paged `{id,full_name,email,segment,city,journey_stage,created_at,
purchase_intent,sentiment_label,objections[],orders_count,total_spent}`; `POST /customers`, `GET /customers/{id}`,
`PATCH /customers/{id}`, `GET /customers/{id}/history` -> `{conversations[],orders[],transactions[],enrollments[]}`,
`GET /customers/{id}/insights` -> `Insight[]`
`Insight = {id,conversation_id,summary,needs[],motivations[],interests[],preferred_product_ids[],objections[],
satisfaction_signals[],sentiment_score,sentiment_label,purchase_intent,hesitation,journey_stage,
recommended_follow_up,confidence,source,updated_at}`

### Products [products:*]
`GET /products?status=` -> `Product[]` (Offer fields + `keywords[]`, `created_at`, `updated_at`, `stats:{revenue,
sales,seats_taken}`), `POST /products`, `GET /products/{id}`, `PATCH /products/{id}`,
`DELETE /products/{id}` (archives; never hard-deletes).

### Orders & enrollments [orders:*]
`GET /orders?status=` -> paged `{id,reference,status,total,currency,customer:{id,full_name},items:[{product_id,
product_name,unit_price,quantity}],transaction:{id,reference,status}|null,created_at}`; `POST /orders
{customer_id,product_id}`, `GET /orders/{id}` (+ `timeline[]`); `GET /enrollments`, `POST /enrollments`,
`GET /enrollments/{id}`

### Payments [payments:*]
- `POST /payments/sessions {order_id}` + `Idempotency-Key`; `GET /payments/sessions/{id}`;
  `POST /payments/sessions/{id}/simulate {payment_method}` + `Idempotency-Key`
- `GET /payments/transactions?status=&q=` -> paged `Transaction = {id,reference,status,amount,currency,provider,
  payment_method,failure_reason,risk_score,risk_flags[],customer:{id,full_name},product:{id,name},created_at,
  completed_at}`; `GET /payments/transactions/{id}` (+ `attempts[]`, `history[]`, `security_events[]`,
  `refunds[]`, `approvals[]`)
- `POST /payments/transactions/{id}/refund {reason}` [payments:refund] -> creates approval (never immediate).
- `GET /payments/settings` -> simulation settings (no secrets).

### Analytics [analytics:read]
Query filters on all: `date_from`, `date_to` (YYYY-MM-DD), `product_id`, `segment`.
`GET /analytics/overview` -> KPIs (`interactions, customers_engaged, interested_customers, enrollments,
conversion_rate, revenue, refunded, currency, payments:{STATUS:n}, pending_payments, avg_transaction_value,
satisfaction, feedback_count, security_alerts, high_risk_events, open_security_events, security_event_types,
top_products[], top_objections[]`), `GET /analytics/revenue` -> `[{date,revenue,succeeded,failed}]`,
`GET /analytics/conversion` -> `{funnel:[{stage,customers}], conversion_rate}`, `GET /analytics/products`,
`GET /analytics/payments`, `GET /analytics/customers` -> `{sentiment, interests, intent, objections, segments}`,
`GET /analytics/security`, `GET /analytics/agents`, `GET /analytics/definitions`,
`GET /analytics/snapshots/latest` (analyst narrative),
`GET /reports/{kind}.csv` kind ∈ `financial, customers, transactions, security, agents`.

### Security [security:*]
`GET /security/overview`, `GET /security/events?severity=&category=&status=`, `GET /security/events/{id}`,
`POST /security/events/{id}/resolve {status:"RESOLVED"|"DISMISSED"|"INVESTIGATING", note}`,
`POST /security/analyze {text}` -> injection verdict, `GET /security/fraud-alerts` (category FRAUD).
`SecurityEvent = {id,event_type,category,severity,description,risk_score,recommended_action,status,detector,
customer_id,transaction_id,agent_id,evidence,explanation,resolved_at,resolution_note,created_at}`

### Approvals [approvals:read / approvals:decide]
`GET /approvals?status=`, `GET /approvals/{id}` (+ context: transaction, customer, security event, decisions),
`POST /approvals/{id}/approve {notes}`, `/reject {notes}`, `/request-information {notes}`.
`Approval = {id,action,status,reason,requested_by_agent,requested_by_user,customer:{id,full_name}|null,
transaction:{id,reference,amount,status}|null,risk_score,risk_flags[],expires_at,created_at,decisions:[{decision,
decided_by_email,notes,created_at}]}`. Self-approval -> 403 `SELF_APPROVAL_FORBIDDEN`.

### Strategy [strategy:*]
`GET /strategy/recommendations?status=`, `POST /strategy/generate`, `GET /strategy/recommendations/{id}`,
`POST /strategy/recommendations/{id}/feedback {feedback:"ACCEPTED"|"REJECTED"|"DEFERRED", note}`.
`Recommendation = {id,rule_key,title,description,category,observed_facts[],hypothesis,metrics,expected_impact,
priority,confidence,suggested_action,requires_approval,status,feedback,feedback_note,source,created_at}`

### Audit [audit:read]
`GET /audit/logs?actor_type=&actor_id=&action=&severity=&date_from=&date_to=` -> paged
`{id,created_at,actor_type,actor_id,action,resource_type,resource_id,severity,outcome,details,ip,hash}`,
`GET /audit/logs/{id}`, `GET /audit/verify` -> `{ok, first_broken_id}`

### Settings [settings:*]
`GET /settings` -> `{ai:{provider,default_model,anthropic_configured:boolean,openai_configured:boolean},
payments:{...}, voice:{stt:"browser",tts:"browser"}, environment}` (never keys).
`GET /health`, `/health/live`, `/health/ready` (no auth).

## Demo accounts (password `Demo!2026`)

| Email | Role |
|---|---|
| admin@demo.techx | SUPER_ADMIN |
| finance@demo.techx | FINANCE_MANAGER |
| security@demo.techx | SECURITY_ANALYST |
| sales@demo.techx | SALES_MANAGER |
| viewer@demo.techx | VIEWER |
| buyer@demo.techx | BUYER |

## Implemented deviations from the contract above

- Bare arrays (not paged): `GET /products`, `/roles`, `/permissions`, `/customers/{id}/insights`,
  `/conversations/{id}/insights`. `POST /strategy/generate` returns `{items,total}`.
- Admin `POST /payments/sessions` and `/simulate` require `orders:write` (there is no `payments:write`).
- `GET /approvals/{id}` keeps short `customer`/`transaction` at top level and adds full records under `context`.
  Approval status for "request information" is `INFO_REQUESTED`.
- `GET /orders/{id}` timeline entries: `{type,status,from_status,actor,note,created_at}`.
- `Idempotency-Key` must be 8–80 characters. `failure_reason` values are codes (`card_declined`, ...).
- `Insight.hesitation` is a boolean. Audit logs also return `prev_hash`.
- `/security/overview` -> `{total,by_severity,by_status,by_category,recent}`; `/security/analyze` -> `{detected,score,patterns,verdict}`.
- `/analytics/payments` -> `{counts,revenue,refunded,currency,avg_transaction_value,pending_payments,series}`;
  `/analytics/snapshots/latest` may be `null`. Percentages (`conversion_rate`, `share`) are 0–100.
- `POST /agents/security/execute {task_type:"explain"}` needs `security:write`; other manual runs need `agents:write`.
- `POST /workflows/{id}/execute` is not implemented: workflows advance through customer and approval events.

## Trackify additions (redesign)

- `GET /public/business` (no auth) and `GET|PUT /settings/business-profile` [settings:read / settings:write]:
  `{name, legal_name, tagline, about, founded, city, address, phone, email, support_email, website, registration,
  tax_id, refund_policy, learners, instructors, rating, accreditations[], support_hours, updated_at}`.
- `POST /auth/register` accepts `{email, full_name, password (>=8), role: owner|finance|security|sales|viewer,
  business_name, field_of_activity, team_size, country, phone}`; signs the user in (cookies) and returns
  `User + business_name`. `owner` -> SUPER_ADMIN while `SELF_SIGNUP_ADMIN=true` (demo), else VIEWER.
- `PATCH /products/{id}` with a new `price` on an ACTIVE product does not change the price: it creates an approval
  (`action: CHANGE_PRICE`) and returns the product plus `pending_approval: {id, action, new_price}`. Approving it
  applies the price. Draft/archived products change immediately.
- `GET /public/conversations/{id}/account` (header `X-Conversation-Token`): the buyer hub. `{customer:{full_name,email},
  recommended: Offer & {recommended_at, pitched}[] (programs the assistant showed in this conversation, latest first),
  enrollments: [{order_id, order_reference, order_status, created_at, product:{id,slug,name,duration_weeks,level,category},
  amount, currency, enrollment_status, payment:{transaction_reference,status,method,paid_at,failure_reason,session_id,
  checkout_open}|null, progress:[{key,label,state: done|pending|held|failed|upcoming, detail?}]}], journey}`.

## Buyer accounts (Fiverr-style two sides)

- Role `BUYER` with permission `buyer:self`. Public `POST /auth/register` defaults to `role: "buyer"`; `owner` sign-up
  gets `SUPER_ADMIN` + `BUYER` (can buy and sell). `customers.user_id` links a customer record to its buyer account.
- Buying needs a buyer account: `POST /public/conversations/{id}/enroll` returns 401 `BUYER_ACCOUNT_REQUIRED` for
  guests (403 for staff-only accounts); when a buyer enrolls, the guest conversation's customer is attached to (or
  merged into) the buyer's customer. `POST /public/checkout/{id}/pay` on a buyer-owned order requires that buyer
  (401 / 403 `NOT_YOUR_ORDER`).
- `GET /me/account` [buyer:self] -> `{user:{id,full_name,email,is_buyer,is_seller,roles}, customer, recommended[],
  library[] (ACTIVE enrollments), arriving[] (pending / under review), orders[] (all, with payment + progress),
  conversations[], journey}`; `POST /me/link-conversation {conversation_id, access_token}` attaches a guest chat;
  `GET /me/flags` -> `{is_buyer,is_seller,roles}` for the buy/sell switch.
- Demo buyer: `buyer@demo.techx` / `Demo!2026` (owns a paid enrollment).
