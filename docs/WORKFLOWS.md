# Workflows

## Customer journey state machine

```mermaid
stateDiagram-v2
  [*] --> NEW_CUSTOMER
  NEW_CUSTOMER --> SALES_INTERACTION: greeting
  SALES_INTERACTION --> CUSTOMER_ANALYSIS: customer message
  CUSTOMER_ANALYSIS --> PRODUCT_RECOMMENDATION: product matched / purchase intent
  CUSTOMER_ANALYSIS --> LOW_INTENT: rejection or intent < 0.2
  CUSTOMER_ANALYSIS --> SALES_INTERACTION: keep talking
  LOW_INTENT --> SALES_INTERACTION
  PRODUCT_RECOMMENDATION --> ENROLLMENT_REQUEST: Enroll clicked
  PRODUCT_RECOMMENDATION --> SALES_INTERACTION: customer keeps talking
  ENROLLMENT_REQUEST --> SECURITY_CHECK
  SECURITY_CHECK --> PAYMENT_SESSION: session created
  PAYMENT_SESSION --> SECURITY_CHECK: pay
  SECURITY_CHECK --> PAYMENT_PROCESSING: ALLOW
  SECURITY_CHECK --> AWAITING_APPROVAL: HOLD
  SECURITY_CHECK --> BLOCKED: BLOCK
  AWAITING_APPROVAL --> PAYMENT_PROCESSING: human approves
  AWAITING_APPROVAL --> CANCELLED: human rejects
  PAYMENT_PROCESSING --> FINANCIAL_ANALYSIS: SUCCEEDED
  PAYMENT_PROCESSING --> PAYMENT_FAILED: FAILED
  PAYMENT_FAILED --> SECURITY_CHECK: retry
  FINANCIAL_ANALYSIS --> BUSINESS_RECOMMENDATION
  BUSINESS_RECOMMENDATION --> COMPLETED
  BLOCKED --> [*]
  CANCELLED --> [*]
  COMPLETED --> [*]
```

Transitions are validated by `ALLOWED_STATES` in the orchestrator and recorded as `workflow_steps`
(`from_state`, `to_state`, agent, note). Routing uses structured fields only (`next_action`, `intent`,
`purchase_intent`, risk `decision`), never free text. `ERROR` and `CANCELLED` are reachable from any state.

## Transaction state machine

```mermaid
stateDiagram-v2
  [*] --> CREATED
  CREATED --> PENDING
  PENDING --> PROCESSING
  PENDING --> REQUIRES_APPROVAL: security HOLD
  FAILED --> PROCESSING: retry
  FAILED --> REQUIRES_APPROVAL
  REQUIRES_APPROVAL --> PROCESSING: human only
  REQUIRES_APPROVAL --> CANCELLED: human only
  PROCESSING --> SUCCEEDED
  PROCESSING --> FAILED
  SUCCEEDED --> REFUNDED: approved refund, human only
  CREATED --> CANCELLED
  PENDING --> CANCELLED
  FAILED --> CANCELLED
```

Every change writes `transaction_status_changes` (actor, reason), an audit row and a `payment.updated` event.

## Approval lifecycle

`PENDING_REVIEW -> APPROVED | REJECTED | EXPIRED`, with `INFO_REQUESTED` as a reversible intermediate.
Expiry is applied lazily (`approvals.expire_stale`) when the approval list is read.

## Sequence: successful purchase

```mermaid
sequenceDiagram
  participant C as Customer
  participant O as Orchestrator
  participant SE as Security
  participant SA as Sales
  participant IN as Intelligence
  participant PA as Payment
  participant AN as Analyst
  participant ST as Strategy
  C->>O: "I want to enroll in GenAI"
  O->>SE: screen_message
  SE-->>O: clean
  O->>SA: reply
  SA-->>O: intent=purchase, next_action=prepare_enrollment
  O->>IN: analyze_conversation
  IN-->>ST: CUSTOMER_INSIGHT
  C->>O: Enroll
  O->>PA: create_session (price from catalog)
  C->>O: Pay (test method, Idempotency-Key)
  O->>SE: assess_payment
  SE-->>PA: ALLOW
  PA->>PA: PROCESSING -> SUCCEEDED
  PA-->>AN: PAYMENT_RESULT
  AN-->>ST: METRICS_UPDATED
  ST->>ST: generate recommendations
  O-->>C: enrollment active
```
