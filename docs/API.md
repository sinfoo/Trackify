# API

- Interactive OpenAPI/Swagger: `http://localhost:8000/docs` (ReDoc at `/redoc`, schema at `/openapi.json`).
- The full endpoint contract with request/response shapes and required permissions is in the root
  [ARCHITECTURE.md](../ARCHITECTURE.md#rest-api-prefix-apiv1).

## Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1` |
| Auth | httpOnly cookies `access_token` (15 min) + `refresh_token` (rotating). `Authorization: Bearer` also accepted. |
| Errors | `{"error": {"code", "message", "details"}}` |
| Pagination | `?page=&page_size=` -> `{items, total, page, page_size}` |
| Money | decimal strings, 3 decimals, TND |
| Idempotency | `Idempotency-Key` header on payment session creation and payment attempts |
| Public chat | `X-Conversation-Token` header (returned once when the conversation starts) |
| Real time | `ws://localhost:8000/ws/events` (cookie auth), fallback `GET /api/v1/events?after_id=` |

## Quick tour with curl

```bash
# login (cookie jar)
curl -c jar -H 'content-type: application/json' -d '{"email":"admin@demo.techx","password":"Demo!2026"}' \
  localhost:8000/api/v1/auth/login
curl -b jar localhost:8000/api/v1/analytics/overview

# public journey
curl -d '{"consent_voice":false,"channel":"text"}' -H 'content-type: application/json' \
  localhost:8000/api/v1/public/conversations            # -> conversation_id, access_token
curl -H "X-Conversation-Token: $TOKEN" -H 'content-type: application/json' \
  -d '{"content":"I want to enroll in generative AI"}' localhost:8000/api/v1/public/conversations/$ID/messages
curl -b jar -X POST localhost:8000/api/v1/demo/scenarios/successful_journey/run
```

## Error codes worth knowing

`UNAUTHENTICATED` 401, `FORBIDDEN` 403, `SELF_APPROVAL_FORBIDDEN` 403, `AGENT_PERMISSION_DENIED` 403,
`RATE_LIMITED` 429, `VALIDATION_ERROR` 422, `INVALID_TRANSITION` 409, `IDEMPOTENCY_KEY_REUSED` 409,
`PRICE_MISMATCH` 409, `APPROVAL_CLOSED` / `APPROVAL_EXPIRED` 409, `NOT_REFUNDABLE` 409.
