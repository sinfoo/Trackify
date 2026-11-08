"""Central orchestrator: the only component that dispatches agents.

- Workflow state is changed by structured agent outputs + explicit transition rules, never by free text.
- Every dispatch records an AgentExecution (timing, status, summaries), an AgentMessage (who -> whom),
  and live events. Failures are retried once inside a savepoint, then the workflow moves to ERROR.
"""

import time
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import finance, intelligence, sales
from app.agents.base import AgentContext, PermissionViolation
from app.core.errors import AppError, conflict, not_found
from app.core.security import sha256
from app.db.base import utcnow
from app.models import (
    Agent,
    AgentExecution,
    AgentMessage,
    ApprovalRequest,
    ApprovalStatus,
    Conversation,
    Customer,
    Message,
    Order,
    PaymentSession,
    Product,
    Refund,
    Transaction,
    TxStatus,
    User,
    Workflow,
    WorkflowState,
    WorkflowStep,
)
from app.services import audit, events, payments

W = WorkflowState
RUNNERS = {
    "sales": sales.run,
    "intelligence": intelligence.run,
    "payment": finance.payment_run,
    "analyst": finance.analyst_run,
    "strategy": finance.strategy_run,
    "security": finance.security_run,
}

ALLOWED_STATES: dict[WorkflowState, set[WorkflowState]] = {
    W.NEW_CUSTOMER: {W.SALES_INTERACTION, W.CANCELLED},
    W.SALES_INTERACTION: {W.CUSTOMER_ANALYSIS, W.CANCELLED, W.ERROR},
    W.CUSTOMER_ANALYSIS: {W.SALES_INTERACTION, W.PRODUCT_RECOMMENDATION, W.LOW_INTENT, W.ERROR},
    W.PRODUCT_RECOMMENDATION: {W.SALES_INTERACTION, W.ENROLLMENT_REQUEST, W.ERROR},
    W.LOW_INTENT: {W.SALES_INTERACTION, W.CANCELLED},
    W.ENROLLMENT_REQUEST: {W.SECURITY_CHECK, W.ERROR},
    W.SECURITY_CHECK: {W.PAYMENT_SESSION, W.PAYMENT_PROCESSING, W.AWAITING_APPROVAL, W.BLOCKED, W.ERROR},
    W.PAYMENT_SESSION: {W.SECURITY_CHECK, W.SALES_INTERACTION, W.ERROR, W.CANCELLED},
    W.PAYMENT_PROCESSING: {W.FINANCIAL_ANALYSIS, W.PAYMENT_FAILED, W.ERROR},
    W.PAYMENT_FAILED: {W.SECURITY_CHECK, W.FINANCIAL_ANALYSIS, W.SALES_INTERACTION, W.CANCELLED},
    W.AWAITING_APPROVAL: {W.PAYMENT_PROCESSING, W.CANCELLED},
    W.FINANCIAL_ANALYSIS: {W.BUSINESS_RECOMMENDATION, W.ERROR},
    W.BUSINESS_RECOMMENDATION: {W.COMPLETED, W.PAYMENT_FAILED, W.ERROR},
    W.COMPLETED: {W.SALES_INTERACTION},  # returning customer
    W.BLOCKED: set(),
    W.CANCELLED: set(),
    W.ERROR: {W.SALES_INTERACTION},
}


# ---------------------------------------------------------------- primitives


def move(db: Session, wf: Workflow, to: WorkflowState, agent_id: str | None = None, note: str = "") -> None:
    if wf.state == to:
        return
    if to not in ALLOWED_STATES[wf.state] and to not in (W.ERROR, W.CANCELLED):
        raise conflict("INVALID_WORKFLOW_TRANSITION", f"{wf.state} -> {to} not allowed")
    db.add(WorkflowStep(workflow_id=wf.id, from_state=wf.state, to_state=to, agent_id=agent_id, note=note[:300]))
    frm = wf.state
    wf.state = to
    kind = "workflow.completed" if to == W.COMPLETED else "workflow.updated"
    events.publish(
        db,
        kind,
        f"{wf.label or 'Workflow'}: {frm} → {to}",
        agent_id=agent_id,
        workflow_id=wf.id,
        data={"from": frm, "to": to, "note": note},
    )
    db.flush()


def send(db: Session, wf: Workflow | None, frm: str, to: str, message_type: str, payload: dict) -> None:
    db.add(
        AgentMessage(
            workflow_id=wf.id if wf else None, from_agent=frm, to_agent=to, message_type=message_type, payload=payload
        )
    )


def execute(
    db: Session,
    agent_id: str,
    payload: dict,
    *,
    wf: Workflow | None,
    task_type: str,
    triggered_by: str,
    input_summary: str = "",
) -> dict:
    agent = db.get(Agent, agent_id)
    if not agent or not agent.enabled:
        raise AppError(409, "AGENT_DISABLED", f"Agent '{agent_id}' is disabled")
    ex = AgentExecution(
        agent_id=agent_id,
        workflow_id=wf.id if wf else None,
        task_type=task_type,
        triggered_by=triggered_by,
        input_summary=input_summary[:500],
        status="RUNNING",
    )
    db.add(ex)
    agent.status, agent.current_task, agent.last_run_at = "RUNNING", task_type, utcnow()
    db.flush()
    events.publish(
        db,
        "agent.started",
        f"{agent.name}: {task_type}",
        agent_id=agent_id,
        workflow_id=wf.id if wf else None,
        data={"execution_id": str(ex.id), "task_type": task_type, "triggered_by": triggered_by},
    )
    start = time.perf_counter()
    last_err: Exception | None = None
    for attempt in (1, 2):
        ctx = AgentContext(db, agent_id, ex.id, wf.id if wf else None)
        sp = db.begin_nested()
        try:
            summary, output = RUNNERS[agent_id](ctx, payload)
            sp.commit()
            ex.status, ex.output_summary, ex.output = "SUCCEEDED", summary[:500], _jsonable(output)
            ex.provider, ex.tokens_in, ex.tokens_out, ex.attempts = ctx.provider, ctx.tokens_in, ctx.tokens_out, attempt
            agent.status, agent.current_task = "IDLE", None
            ex.completed_at = utcnow()
            ex.duration_ms = int((time.perf_counter() - start) * 1000)
            audit.record(
                db,
                actor_type="agent",
                actor_id=f"agent:{agent_id}",
                action=f"agent.{task_type}",
                resource_type="execution",
                resource_id=ex.id,
                details={"summary": summary[:200]},
            )
            events.publish(
                db,
                "agent.completed",
                f"{agent.name}: {summary}",
                agent_id=agent_id,
                workflow_id=wf.id if wf else None,
                data={"execution_id": str(ex.id), "task_type": task_type, "duration_ms": ex.duration_ms},
            )
            db.flush()
            return output
        except (PermissionViolation, AppError) as e:  # business rejections are not retried
            sp.rollback() if sp.is_active else None
            last_err = e
            break
        except Exception as e:  # transient: retry once
            if sp.is_active:
                sp.rollback()
            last_err = e
    ex.status, ex.error, ex.attempts = "FAILED", f"{type(last_err).__name__}: {last_err}"[:500], attempt
    ex.completed_at = utcnow()
    ex.duration_ms = int((time.perf_counter() - start) * 1000)
    agent.status, agent.current_task = "ERROR", None
    events.publish(
        db,
        "agent.failed",
        f"{agent.name} failed: {str(last_err)[:120]}",
        agent_id=agent_id,
        workflow_id=wf.id if wf else None,
        data={"execution_id": str(ex.id)},
    )
    audit.record(
        db,
        actor_type="agent",
        actor_id=f"agent:{agent_id}",
        action=f"agent.{task_type}",
        resource_type="execution",
        resource_id=ex.id,
        severity="WARN",
        outcome="FAILED",
        details={"error": str(last_err)[:200]},
    )
    db.flush()
    raise last_err


def _jsonable(o):
    if isinstance(o, dict):
        return {k: _jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_jsonable(v) for v in o]
    if isinstance(o, (str, int, float, bool)) or o is None:
        return o
    return str(o)


def workflow_for(db: Session, conv: Conversation) -> Workflow:
    wf = db.scalar(select(Workflow).where(Workflow.conversation_id == conv.id))
    if not wf:
        wf = Workflow(
            kind="customer_journey",
            label=f"Journey · {conv.customer.full_name}",
            customer_id=conv.customer_id,
            conversation_id=conv.id,
            context={},
        )
        db.add(wf)
        db.flush()
        events.publish(
            db,
            "workflow.started",
            f"New customer journey: {conv.customer.full_name}",
            workflow_id=wf.id,
            data={"customer_id": str(conv.customer_id)},
        )
    return wf


# ---------------------------------------------------------------- journey steps


GREETING = (
    "Hi, I am the academy's sales assistant. I can present our AI and tech training offers, answer "
    "questions and help you enroll. What would you like to achieve?"
)
SAFE_REFUSAL = (
    "I can help with course information and enrollment only. I can't change prices, approve payments "
    "or alter policies, and those requests are logged for review. What would you like to know about "
    "our programmes?"
)


def start_conversation(db: Session, customer: Customer, channel: str = "text") -> tuple[Conversation, Workflow, str]:
    from app.core.security import new_secret, sha256

    token = new_secret()
    conv = Conversation(customer_id=customer.id, channel=channel, access_token_hash=sha256(token))
    db.add(conv)
    db.flush()
    db.refresh(conv)
    wf = workflow_for(db, conv)
    db.add(Message(conversation_id=conv.id, role="agent", content=GREETING, meta={}))
    move(db, wf, W.SALES_INTERACTION, "sales", "greeting sent")
    db.flush()
    return conv, wf, token


def handle_customer_message(db: Session, conv: Conversation, text: str) -> list[Message]:
    text = text.strip()[:2000]
    if not text:
        raise AppError(422, "EMPTY_MESSAGE", "Message is empty")
    wf = workflow_for(db, conv)
    if wf.state in (
        W.COMPLETED,
        W.ERROR,
        W.LOW_INTENT,
        W.CUSTOMER_ANALYSIS,
        W.PRODUCT_RECOMMENDATION,
    ):
        move(db, wf, W.SALES_INTERACTION, "orchestrator", "customer continued the conversation")
    elif wf.state in (W.BLOCKED, W.CANCELLED):
        raise conflict("CONVERSATION_CLOSED", "This conversation is closed")
    # Open checkout or mid-payment (session, retry, hold, processing): keep talking, never move the workflow,
    # so the pending payment can still proceed from its current state.
    in_flight = wf.state not in (W.SALES_INTERACTION, W.NEW_CUSTOMER)
    msg = Message(conversation_id=conv.id, role="customer", content=text)
    db.add(msg)
    db.flush()
    events.publish(
        db,
        "customer.message",
        f"{conv.customer.full_name}: {text[:80]}",
        workflow_id=wf.id,
        data={"conversation_id": str(conv.id)},
    )

    # 1. Security screens untrusted input BEFORE any LLM sees it.
    send(db, wf, "orchestrator", "security", "SCREEN_INPUT", {"message_id": str(msg.id)})
    verdict = execute(
        db,
        "security",
        {"task": "screen_message", "text": text, "customer_id": conv.customer_id},
        wf=wf,
        task_type="screen_message",
        triggered_by="customer.message",
        input_summary=f"customer message ({len(text)} chars)",
    )
    if verdict["detected"]:
        msg.flagged = True
        send(db, wf, "security", "orchestrator", "INPUT_REJECTED", {"patterns": verdict["patterns"]})
        reply = Message(
            conversation_id=conv.id,
            role="agent",
            content=SAFE_REFUSAL,
            meta={"notice": "This request was flagged by our security controls."},
        )
        db.add(reply)
        db.flush()
        return [msg, reply]

    # 2. Sales agent replies (structured interaction result).
    send(db, wf, "orchestrator", "sales", "CUSTOMER_TURN", {"message_id": str(msg.id)})
    s_out = execute(
        db,
        "sales",
        {"conversation_id": str(conv.id), "message": text, "message_id": str(msg.id)},
        wf=wf,
        task_type="reply",
        triggered_by="customer.message",
        input_summary="customer turn",
    )
    db.refresh(conv)

    # 3. Intelligence analyses the whole conversation and reports to sales + strategy.
    if not in_flight:
        move(db, wf, W.CUSTOMER_ANALYSIS, "intelligence", "analysing conversation")
    send(
        db,
        wf,
        "sales",
        "intelligence",
        "INTERACTION_RESULT",
        {k: s_out[k] for k in ("intent", "interest_level", "next_action", "objections")},
    )
    insight = execute(
        db,
        "intelligence",
        {"conversation_id": str(conv.id)},
        wf=wf,
        task_type="analyze_conversation",
        triggered_by="sales.interaction_result",
        input_summary="conversation transcript",
    )
    send(
        db,
        wf,
        "intelligence",
        "strategy",
        "CUSTOMER_INSIGHT",
        {
            "purchase_intent": insight["purchase_intent"],
            "objections": insight["objections"],
            "stage": insight["journey_stage"],
        },
    )

    # 4. Deterministic routing on structured outputs.
    wf.context = {
        **wf.context,
        "last_intent": s_out["intent"],
        "purchase_intent": insight["purchase_intent"],
        "recommended_product_id": s_out.get("recommended_product_id"),
        "objections": insight["objections"],
    }
    if in_flight:
        pass
    elif s_out["next_action"] == "prepare_enrollment":
        move(db, wf, W.PRODUCT_RECOMMENDATION, "sales", "purchase intent: enrollment offered")
    elif s_out["intent"] == "reject" or insight["purchase_intent"] < 0.2:
        move(db, wf, W.LOW_INTENT, "intelligence", f"low purchase intent ({insight['purchase_intent']})")
    elif s_out.get("recommended_product_id"):
        move(db, wf, W.PRODUCT_RECOMMENDATION, "sales", "product recommended")
    else:
        move(db, wf, W.SALES_INTERACTION, "orchestrator", "awaiting customer")
    reply = db.get(Message, uuid.UUID(s_out["reply_message_id"]))
    return [msg, reply]


def request_enrollment(db: Session, conv: Conversation, product_id: uuid.UUID) -> PaymentSession:
    wf = workflow_for(db, conv)
    product = db.get(Product, product_id)
    if not product:
        raise not_found("Offer")
    if wf.state not in (W.ENROLLMENT_REQUEST, W.PRODUCT_RECOMMENDATION):
        if wf.state in (W.BLOCKED, W.CANCELLED):
            raise conflict("CONVERSATION_CLOSED", "This conversation is closed")
        if W.PRODUCT_RECOMMENDATION not in ALLOWED_STATES[wf.state]:
            move(db, wf, W.SALES_INTERACTION, "orchestrator", "customer asked to enroll")
        if wf.state == W.SALES_INTERACTION:
            move(db, wf, W.CUSTOMER_ANALYSIS, "orchestrator", "direct enrollment request")
        move(db, wf, W.PRODUCT_RECOMMENDATION, "orchestrator", f"customer selected {product.name}")
    move(db, wf, W.ENROLLMENT_REQUEST, "orchestrator", f"enrollment requested: {product.name}")
    send(db, wf, "orchestrator", "payment", "CREATE_PAYMENT_SESSION", {"product_id": str(product.id)})
    move(db, wf, W.SECURITY_CHECK, "security", "pre-checkout checks")
    out = execute(
        db,
        "payment",
        {
            "task": "create_session",
            "customer_id": str(conv.customer_id),
            "product_id": str(product.id),
            "conversation_id": conv.id,
            "idempotency_key": f"enroll:{conv.id}:{product.id}:{uuid.uuid4().hex[:8]}",
        },
        wf=wf,
        task_type="create_session",
        triggered_by="customer.enroll",
        input_summary=f"enroll {product.name}",
    )
    wf.transaction_id = uuid.UUID(out["transaction_id"])
    move(db, wf, W.PAYMENT_SESSION, "payment", f"checkout ready: {out['amount']} TND")
    send(
        db,
        wf,
        "payment",
        "analyst",
        "PAYMENT_CREATED",
        {"transaction_id": out["transaction_id"], "amount": out["amount"]},
    )
    return db.get(PaymentSession, uuid.UUID(out["session_id"]))


def process_payment(db: Session, ps: PaymentSession, method: str, idempotency_key: str) -> dict:
    """Security assesses, payment agent acts on that decision, analyst + strategy react to the outcome."""
    tx = ps.transaction
    key = f"pay:{tx.id.hex}:{sha256(idempotency_key)[:48]}"  # fixed length, no truncation collisions
    prior = payments.find_attempt(db, key)
    if prior:  # idempotent replay: no new side effects
        return _result(tx, prior.outcome, replay=True)
    if method not in payments.TEST_METHODS:
        raise AppError(422, "UNKNOWN_TEST_METHOD", "Use one of the simulated test methods")
    if tx.status not in (TxStatus.PENDING, TxStatus.FAILED):
        raise conflict("NOT_PAYABLE", f"Transaction is {tx.status}")
    if ps.expires_at < utcnow():
        raise conflict("SESSION_EXPIRED", "Checkout session expired")

    conv = db.get(Conversation, ps.order.conversation_id) if ps.order.conversation_id else None
    wf = db.scalar(select(Workflow).where(Workflow.transaction_id == tx.id)) or (
        workflow_for(db, conv) if conv else None
    )
    if wf and wf.state != W.SECURITY_CHECK:
        if W.SECURITY_CHECK in ALLOWED_STATES[wf.state]:
            move(db, wf, W.SECURITY_CHECK, "security", "pre-payment risk assessment")

    send(db, wf, "payment", "security", "ASSESS_PAYMENT", {"transaction_id": str(tx.id)})
    ra = execute(
        db,
        "security",
        {"task": "assess_payment", "transaction_id": str(tx.id)},
        wf=wf,
        task_type="assess_payment",
        triggered_by="payment.attempt",
        input_summary=f"{tx.reference}",
    )
    send(db, wf, "security", "payment", "RISK_DECISION", {"decision": ra["decision"], "score": ra["score"]})

    reason = "; ".join(f["detail"] for f in ra["flags"]) or "clean"
    if wf:
        move(
            db,
            wf,
            W.PAYMENT_PROCESSING
            if ra["decision"] == "ALLOW"
            else W.AWAITING_APPROVAL
            if ra["decision"] == "HOLD"
            else W.BLOCKED,
            "security",
            f"{ra['decision']}: {reason}",
        )
    out = execute(
        db,
        "payment",
        {
            "task": "process",
            "transaction_id": str(tx.id),
            "payment_method": method,
            "idempotency_key": key,
            "risk_decision": ra["decision"],
            "reason": reason,
            "security_event_id": (ra["security_event_ids"] or [None])[0],
        },
        wf=wf,
        task_type="process_payment",
        triggered_by=f"security.{ra['decision'].lower()}",
        input_summary=f"{tx.reference} via {method}",
    )
    if out["outcome"] in ("SUCCEEDED", "FAILED"):
        after_payment(db, wf, tx)
    return _result(tx, out["outcome"])


def after_payment(db: Session, wf: Workflow | None, tx: Transaction) -> None:
    ok = tx.status == TxStatus.SUCCEEDED
    if wf:
        move(
            db,
            wf,
            W.FINANCIAL_ANALYSIS if ok else W.PAYMENT_FAILED,
            "payment",
            f"{tx.reference} {tx.status}" + (f": {tx.failure_reason}" if tx.failure_reason else ""),
        )
    send(db, wf, "payment", "analyst", "PAYMENT_RESULT", {"transaction_id": str(tx.id), "status": tx.status})
    send(db, wf, "payment", "sales", "PAYMENT_RESULT", {"status": tx.status})
    execute(
        db,
        "analyst",
        {"trigger": f"payment.{tx.status.lower()}"},
        wf=wf,
        task_type="update_metrics",
        triggered_by=f"payment.{tx.status.lower()}",
        input_summary=tx.reference,
    )
    send(db, wf, "analyst", "strategy", "METRICS_UPDATED", {"transaction_id": str(tx.id)})
    if wf and ok:
        move(db, wf, W.BUSINESS_RECOMMENDATION, "strategy", "re-evaluating strategy with new results")
    execute(
        db,
        "strategy",
        {},
        wf=wf,
        task_type="generate_recommendations",
        triggered_by="analytics.updated",
        input_summary="latest KPIs + insights",
    )
    if wf and ok:
        move(db, wf, W.COMPLETED, "orchestrator", "journey complete: customer enrolled")
    conv_id = db.get(Order, tx.order_id).conversation_id
    if conv_id:
        text = (
            "Payment confirmed (simulated). Welcome aboard! Your enrollment is active and onboarding details "
            "are on their way."
            if ok
            else f"The simulated payment did not go through ({(tx.failure_reason or 'declined').replace('_', ' ')}). "
            "You can retry with another test method; your seat is held for now."
        )
        db.add(Message(conversation_id=conv_id, role="system", content=text, meta={}))
    if ok and conv_id:
        execute(
            db,
            "intelligence",
            {"conversation_id": str(conv_id), "converted": True},
            wf=wf,
            task_type="analyze_conversation",
            triggered_by="payment.succeeded",
            input_summary="post-purchase",
        )


def _result(tx: Transaction, outcome: str, replay: bool = False) -> dict:
    messages = {
        "SUCCEEDED": "Payment succeeded (simulated). Your enrollment is active.",
        "FAILED": f"Payment failed: {(tx.failure_reason or 'declined').replace('_', ' ')}.",
        "HELD": "Your payment is under a short security review by our team.",
        "BLOCKED": "This payment was blocked by our security controls.",
    }
    status = {"HELD": "REQUIRES_APPROVAL"}.get(outcome, outcome)
    return {
        "status": status,
        "message": messages.get(outcome, outcome),
        "transaction_reference": tx.reference,
        "idempotent_replay": replay,
    }


# ---------------------------------------------------------------- approvals


def on_approval_decided(db: Session, ar: ApprovalRequest, user: User) -> None:
    tx = db.get(Transaction, ar.transaction_id) if ar.transaction_id else None
    wf = db.scalar(select(Workflow).where(Workflow.transaction_id == ar.transaction_id)) if tx else None
    actor = f"user:{user.email}"
    if ar.action == "RELEASE_PAYMENT" and tx:
        if ar.status == ApprovalStatus.APPROVED:
            if wf:
                move(db, wf, W.PAYMENT_PROCESSING, None, f"released by {user.email}")
            send(db, wf, "orchestrator", "payment", "HUMAN_RELEASE", {"approval_id": str(ar.id)})
            execute(
                db,
                "payment",
                {
                    "task": "release",
                    "transaction_id": str(tx.id),
                    "approved_by": actor,
                    "approval_id": str(ar.id),
                    "payment_method": ar.payload.get("payment_method", "sim_card_success"),
                },
                wf=wf,
                task_type="release_payment",
                triggered_by="approval.approved",
                input_summary=tx.reference,
            )
            after_payment(db, wf, tx)
        elif ar.status == ApprovalStatus.REJECTED:
            payments.cancel(db, tx, actor, "rejected at human review")
            if wf:
                move(db, wf, W.CANCELLED, None, f"rejected by {user.email}")
    elif ar.action == "REFUND" and tx:
        refund = db.scalar(select(Refund).where(Refund.approval_id == ar.id))
        if ar.status == ApprovalStatus.APPROVED and refund:
            payments.complete_refund(db, refund, actor)
            execute(
                db,
                "analyst",
                {"trigger": "payment.refunded"},
                wf=wf,
                task_type="update_metrics",
                triggered_by="refund.approved",
                input_summary=tx.reference,
            )
        elif ar.status == ApprovalStatus.REJECTED and refund:
            refund.status = "REJECTED"
    db.flush()


def request_refund(db: Session, tx: Transaction, user: User, reason: str) -> ApprovalRequest:
    from app.services import approvals

    if tx.status != TxStatus.SUCCEEDED:
        raise conflict("NOT_REFUNDABLE", f"Only SUCCEEDED transactions can be refunded (is {tx.status})")
    if db.scalar(select(Refund).where(Refund.transaction_id == tx.id, Refund.status == "PENDING_APPROVAL")):
        raise conflict("REFUND_PENDING", "A refund request is already pending")
    refund = Refund(transaction_id=tx.id, amount=tx.amount, reason=reason[:300], requested_by_id=user.id)
    db.add(refund)
    db.flush()
    ar = approvals.request(
        db,
        action="REFUND",
        reason=f"Refund {tx.amount} TND: {reason}",
        requested_by_user=user,
        customer_id=tx.customer_id,
        transaction_id=tx.id,
        risk_score=0.3,
        payload={"refund_id": str(refund.id), "amount": str(tx.amount)},
    )
    refund.approval_id = ar.id
    return ar
