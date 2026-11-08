"""Payment state machine, idempotency, server-side pricing, risk rules."""

from decimal import Decimal

import pytest
from conftest import checkout, new_customer, product
from sqlalchemy import func, select

from app.core.errors import AppError
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    AuditLog,
    PaymentAttempt,
    SecurityEvent,
    Transaction,
    TransactionStatusChange,
    TxStatus,
    Workflow,
    WorkflowState,
)
from app.orchestration import orchestrator
from app.services import payments, risk

S = TxStatus


# ---------------------------------------------------------------- state machine


def test_valid_path_created_pending_processing_succeeded(db):
    _, _, ps = checkout(db)
    tx = ps.transaction
    assert tx.status == S.PENDING
    payments.transition(db, tx, S.PROCESSING, "agent:payment")
    payments.transition(db, tx, S.SUCCEEDED, "agent:payment")
    db.commit()
    assert tx.status == S.SUCCEEDED and tx.completed_at is not None
    hist = db.execute(
        select(TransactionStatusChange.from_status, TransactionStatusChange.to_status)
        .where(TransactionStatusChange.transaction_id == tx.id)
        .order_by(TransactionStatusChange.created_at)
    ).all()
    assert [tuple(h) for h in hist] == [
        (None, "CREATED"),
        ("CREATED", "PENDING"),
        ("PENDING", "PROCESSING"),
        ("PROCESSING", "SUCCEEDED"),
    ]


@pytest.mark.parametrize(
    "frm,to",
    [
        (S.SUCCEEDED, S.PENDING),
        (S.SUCCEEDED, S.FAILED),
        (S.PENDING, S.SUCCEEDED),
        (S.CANCELLED, S.PENDING),
        (S.REFUNDED, S.SUCCEEDED),
        (S.CREATED, S.SUCCEEDED),
    ],
)
def test_invalid_transitions_raise(db, frm, to):
    _, _, ps = checkout(db)
    tx = ps.transaction
    tx.status = frm
    with pytest.raises(payments.InvalidTransition) as e:
        payments.transition(db, tx, to, "user:admin@demo.techx")
    assert e.value.status == 409 and e.value.code == "INVALID_TRANSITION"
    assert tx.status == frm


def test_agent_cannot_release_held_payment_but_human_can(db):
    _, _, ps = checkout(db)
    tx = ps.transaction
    payments.transition(db, tx, S.REQUIRES_APPROVAL, "agent:payment", "hold")  # agent may hold
    with pytest.raises(payments.InvalidTransition, match="requires human approval"):
        payments.transition(db, tx, S.PROCESSING, "agent:payment")
    assert tx.status == S.REQUIRES_APPROVAL
    assert (
        db.scalar(
            select(AuditLog).where(AuditLog.action == "payment.transition_denied", AuditLog.resource_id == str(tx.id))
        )
        is not None
    )
    payments.transition(db, tx, S.PROCESSING, "user:admin@demo.techx", "released")
    assert tx.status == S.PROCESSING


def test_agent_cannot_refund_but_human_can(db):
    _, _, ps = checkout(db)
    tx = ps.transaction
    payments.execute_provider(db, tx, "sim_card_success", "agent:payment")
    assert tx.status == S.SUCCEEDED
    with pytest.raises(payments.InvalidTransition):
        payments.transition(db, tx, S.REFUNDED, "agent:payment")
    payments.transition(db, tx, S.REFUNDED, "user:finance@demo.techx")
    assert tx.status == S.REFUNDED


# ---------------------------------------------------------------- idempotency


def _public_checkout(client, db, slug="genai-llm"):
    r = client.post(
        "/api/v1/public/conversations", json={"full_name": "Idem Potent", "consent_voice": False, "channel": "text"}
    )
    assert r.status_code == 201
    conv_id, token = r.json()["conversation_id"], r.json()["access_token"]
    pid = str(product(db, slug).id)
    db.rollback()  # release the read snapshot before the API writes
    r = client.post(
        f"/api/v1/public/conversations/{conv_id}/enroll",
        json={"product_id": pid},
        headers={"X-Conversation-Token": token},
    )
    assert r.status_code == 200, r.text
    return r.json()["checkout_session_id"]


def test_same_idempotency_key_twice_creates_one_attempt(client, db):
    sid = _public_checkout(client, db)
    h = {"Idempotency-Key": "idem-key-0001"}
    r1 = client.post(f"/api/v1/public/checkout/{sid}/pay", json={"payment_method": "sim_card_success"}, headers=h)
    r2 = client.post(f"/api/v1/public/checkout/{sid}/pay", json={"payment_method": "sim_card_success"}, headers=h)
    assert r1.status_code == r2.status_code == 200
    assert r1.json()["status"] == r2.json()["status"] == "SUCCEEDED"
    assert r1.json()["idempotent_replay"] is False
    assert r2.json()["idempotent_replay"] is True
    assert r1.json()["transaction_reference"] == r2.json()["transaction_reference"]
    db.expire_all()
    tx = db.scalar(select(Transaction).where(Transaction.reference == r1.json()["transaction_reference"]))
    assert db.scalar(select(func.count(PaymentAttempt.id)).where(PaymentAttempt.transaction_id == tx.id)) == 1
    succeeded = db.scalar(
        select(func.count(TransactionStatusChange.id)).where(
            TransactionStatusChange.transaction_id == tx.id, TransactionStatusChange.to_status == "SUCCEEDED"
        )
    )
    assert succeeded == 1


def test_pay_requires_idempotency_key(client, db):
    sid = _public_checkout(client, db)
    r = client.post(f"/api/v1/public/checkout/{sid}/pay", json={"payment_method": "sim_card_success"})
    assert r.status_code == 422


def test_session_idempotency_key_reuse_for_other_order_conflicts(db):
    cust = new_customer(db)
    o1, _ = payments.create_order(db, cust, product(db, "genai-llm"))
    o2, _ = payments.create_order(db, cust, product(db, "intro-ai"))
    ps1 = payments.create_session(db, o1, "session-key-1")
    assert payments.create_session(db, o1, "session-key-1").id == ps1.id  # same order: replay
    with pytest.raises(AppError) as e:
        payments.create_session(db, o2, "session-key-1")
    assert e.value.status == 409 and e.value.code == "IDEMPOTENCY_KEY_REUSED"
    assert db.scalar(select(func.count(Transaction.id)).where(Transaction.order_id == o1.id)) == 1


def test_distinct_long_idempotency_keys_are_not_replays(db):
    _, _, ps = checkout(db)
    base = "k" * 59
    r1 = orchestrator.process_payment(db, ps, "sim_card_declined", base + "A" * 21)
    db.commit()
    r2 = orchestrator.process_payment(db, ps, "sim_card_success", base + "B" * 21)
    db.commit()
    assert r1["status"] == "FAILED"
    assert r2["idempotent_replay"] is False and r2["status"] == "SUCCEEDED"


# ---------------------------------------------------------------- server-side price


def test_amount_comes_from_catalog(db):
    _, _, ps = checkout(db, "genai-llm")
    tx = ps.transaction
    assert ps.amount == tx.amount == product(db, "genai-llm").price == Decimal("1890.000")
    assert ps.order.total == Decimal("1890.000")


def test_order_total_mismatch_rejected_at_session_creation(db):
    cust = new_customer(db)
    order, _ = payments.create_order(db, cust, product(db, "genai-llm"))
    order.total = Decimal("1.000")
    with pytest.raises(AppError) as e:
        payments.create_session(db, order, "price-mismatch-key")
    assert e.value.code == "PRICE_MISMATCH"


def test_tampered_amount_is_blocked(db):
    _, wf, ps = checkout(db, "genai-llm")
    tx = ps.transaction
    tx.amount = Decimal("1.000")
    db.commit()
    assert risk.assess_payment(db, tx).decision == "BLOCK"
    res = orchestrator.process_payment(db, ps, "sim_card_success", "tamper-key-1")
    db.commit()
    assert res["status"] == "BLOCKED"
    db.expire_all()
    assert db.get(Transaction, tx.id).status == S.CANCELLED
    assert db.get(Workflow, wf.id).state == WorkflowState.BLOCKED
    ev = db.scalar(
        select(SecurityEvent).where(
            SecurityEvent.event_type == "TRANSACTION_TAMPERING", SecurityEvent.transaction_id == tx.id
        )
    )
    assert ev is not None and ev.severity == "CRITICAL" and ev.recommended_action == "BLOCK_TRANSACTION"


def test_catalog_price_change_mid_checkout_is_not_tampering(db):
    _, wf, ps = checkout(db, "genai-llm")
    product(db, "genai-llm").price = Decimal("1990")
    db.commit()
    res = orchestrator.process_payment(db, ps, "sim_card_success", "price-edit-1")
    db.commit()
    assert res["status"] != "BLOCKED"


# ---------------------------------------------------------------- risk rules


def test_clean_payment_is_allowed(db):
    _, _, ps = checkout(db, "genai-llm")
    ra = risk.assess_payment(db, ps.transaction)
    assert (ra.decision, ra.flags, ra.score) == ("ALLOW", [], 0.0)


def test_high_value_is_held_for_approval(db):
    _, wf, ps = checkout(db, "ai-leadership")
    tx = ps.transaction
    assert tx.amount == Decimal("2400.000")
    ra = risk.assess_payment(db, tx)
    assert ra.decision == "HOLD" and [f.rule for f in ra.flags] == ["HIGH_VALUE"]
    res = orchestrator.process_payment(db, ps, "sim_card_success", "high-value-1")
    db.commit()
    assert res["status"] == "REQUIRES_APPROVAL"
    db.expire_all()
    assert db.get(Transaction, tx.id).status == S.REQUIRES_APPROVAL
    assert db.get(Workflow, wf.id).state == WorkflowState.AWAITING_APPROVAL
    ar = db.scalar(select(ApprovalRequest).where(ApprovalRequest.transaction_id == tx.id))
    assert ar.action == "RELEASE_PAYMENT" and ar.status == ApprovalStatus.PENDING_REVIEW
    assert ar.requested_by_agent == "payment" and "HIGH_VALUE" in ar.risk_flags


def test_velocity_and_repeated_failures_hold_payment(db):
    _, wf, ps = checkout(db, "cybersecurity")
    tx = ps.transaction
    for i, m in enumerate(["sim_card_declined", "sim_insufficient_funds", "sim_card_declined"]):
        assert orchestrator.process_payment(db, ps, m, f"vel-{i}")["status"] == "FAILED"
        db.commit()
    res = orchestrator.process_payment(db, ps, "sim_card_success", "vel-final")
    db.commit()
    assert res["status"] == "REQUIRES_APPROVAL"
    db.expire_all()
    tx = db.get(Transaction, tx.id)
    assert tx.status == S.REQUIRES_APPROVAL
    assert {"PAYMENT_VELOCITY", "REPEATED_FAILURES"} <= set(tx.risk_flags)
    ar = db.scalar(select(ApprovalRequest).where(ApprovalRequest.transaction_id == tx.id))
    assert ar.action == "RELEASE_PAYMENT" and ar.status == ApprovalStatus.PENDING_REVIEW
    types = set(db.scalars(select(SecurityEvent.event_type).where(SecurityEvent.transaction_id == tx.id)))
    assert {"SUSPICIOUS_PAYMENT_PATTERN", "REPEATED_FAILED_PAYMENTS"} <= types
    assert db.get(Workflow, wf.id).state == WorkflowState.AWAITING_APPROVAL
