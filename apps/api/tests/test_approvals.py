"""Human-in-the-loop approvals: four-eyes, RBAC, notes, release, single decision."""

import pytest
from conftest import checkout, login, needs_route
from sqlalchemy import select

from app.core.errors import AppError
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    AuditLog,
    Enrollment,
    EnrollmentStatus,
    Order,
    OrderStatus,
    Refund,
    Transaction,
    TxStatus,
    User,
    Workflow,
    WorkflowState,
)
from app.orchestration import orchestrator
from app.services import approvals


def user(db, email: str) -> User:
    return db.scalar(select(User).where(User.email == email))


def paid_tx(db, slug="genai-llm") -> Transaction:
    _, _, ps = checkout(db, slug)
    assert orchestrator.process_payment(db, ps, "sim_card_success", "paid-1")["status"] == "SUCCEEDED"
    db.commit()
    return ps.transaction


def refund_request(db) -> tuple[Transaction, ApprovalRequest]:
    tx = paid_tx(db)
    ar = orchestrator.request_refund(db, tx, user(db, "finance@demo.techx"), "customer moved abroad")
    db.commit()
    return tx, ar


def held(db) -> tuple[Workflow, Transaction, ApprovalRequest]:
    _, wf, ps = checkout(db, "ai-leadership")
    assert orchestrator.process_payment(db, ps, "sim_card_success", "held-1")["status"] == "REQUIRES_APPROVAL"
    db.commit()
    ar = db.scalar(select(ApprovalRequest).where(ApprovalRequest.transaction_id == ps.transaction.id))
    return wf, ps.transaction, ar


def decide(db, ar, email, decision, notes="ok"):
    ar = approvals.decide(db, ar, user(db, email), decision, notes)
    orchestrator.on_approval_decided(db, ar, user(db, email))
    db.commit()
    return ar


# ---------------------------------------------------------------- service level (always on)


def test_refund_is_never_immediate(db):
    tx, ar = refund_request(db)
    assert tx.status == TxStatus.SUCCEEDED
    assert ar.action == "REFUND" and ar.status == ApprovalStatus.PENDING_REVIEW
    assert db.scalar(select(Refund).where(Refund.approval_id == ar.id)).status == "PENDING_APPROVAL"


def test_four_eyes_requester_cannot_approve_own_refund(db):
    tx, ar = refund_request(db)
    with pytest.raises(AppError) as e:
        approvals.decide(db, ar, user(db, "finance@demo.techx"), "APPROVED", "self")
    assert (e.value.status, e.value.code) == (403, "SELF_APPROVAL_FORBIDDEN")
    db.expire_all()
    assert db.get(ApprovalRequest, ar.id).status == ApprovalStatus.PENDING_REVIEW
    assert db.get(Transaction, tx.id).status == TxStatus.SUCCEEDED
    assert db.scalar(select(AuditLog).where(AuditLog.action == "approval.self_approval_blocked")) is not None


def test_refund_approved_by_other_admin_completes(db):
    tx, ar = refund_request(db)
    decide(db, ar, "admin@demo.techx", "APPROVED", "verified")
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.REFUNDED
    refund = db.scalar(select(Refund).where(Refund.approval_id == ar.id))
    assert refund.status == "COMPLETED" and refund.completed_at is not None
    assert db.get(Order, tx.order_id).status == OrderStatus.REFUNDED


def test_viewer_cannot_decide(db):
    _, ar = refund_request(db)
    with pytest.raises(AppError) as e:
        approvals.decide(db, ar, user(db, "viewer@demo.techx"), "APPROVED", "")
    assert e.value.status == 403


def test_reject_requires_notes(db):
    _, ar = refund_request(db)
    with pytest.raises(AppError) as e:
        approvals.decide(db, ar, user(db, "admin@demo.techx"), "REJECTED", "   ")
    assert (e.value.status, e.value.code) == (422, "NOTES_REQUIRED")


def test_approving_release_payment_resumes_workflow(db):
    wf, tx, ar = held(db)
    decide(db, ar, "security@demo.techx", "APPROVED", "customer verified")
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.SUCCEEDED
    assert db.get(Workflow, wf.id).state == WorkflowState.COMPLETED
    enr = db.scalar(select(Enrollment).where(Enrollment.order_id == tx.order_id))
    assert enr.status == EnrollmentStatus.ACTIVE


def test_rejecting_release_payment_cancels(db):
    wf, tx, ar = held(db)
    decide(db, ar, "admin@demo.techx", "REJECTED", "looks fraudulent")
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.CANCELLED
    assert db.get(Workflow, wf.id).state == WorkflowState.CANCELLED


def test_decided_approval_cannot_be_decided_again(db):
    _, _, ar = held(db)
    decide(db, ar, "admin@demo.techx", "APPROVED")
    with pytest.raises(AppError) as e:
        approvals.decide(db, db.get(ApprovalRequest, ar.id), user(db, "security@demo.techx"), "REJECTED", "late")
    assert (e.value.status, e.value.code) == (409, "APPROVAL_CLOSED")


# ---------------------------------------------------------------- HTTP (activates when the router lands)

approve_route = needs_route("POST", "/approvals/{id}/approve")


@approve_route
def test_http_self_approval_forbidden_then_admin_approves(client, db):
    tx, ar = refund_request(db)
    db.close()
    login(client, "finance@demo.techx")
    r = client.post(f"/api/v1/approvals/{ar.id}/approve", json={"notes": "mine"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "SELF_APPROVAL_FORBIDDEN"
    client.cookies.clear()
    login(client, "admin@demo.techx")
    r = client.post(f"/api/v1/approvals/{ar.id}/approve", json={"notes": "ok"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "APPROVED"
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.REFUNDED
    assert db.scalar(select(Refund).where(Refund.approval_id == ar.id)).status == "COMPLETED"
    r = client.post(f"/api/v1/approvals/{ar.id}/approve", json={"notes": "again"})
    assert r.status_code == 409


@approve_route
def test_http_viewer_forbidden_and_reject_needs_notes(client, db):
    _, ar = refund_request(db)
    db.close()
    login(client, "viewer@demo.techx")
    assert client.post(f"/api/v1/approvals/{ar.id}/approve", json={"notes": ""}).status_code == 403
    client.cookies.clear()
    login(client, "admin@demo.techx")
    r = client.post(f"/api/v1/approvals/{ar.id}/reject", json={"notes": ""})
    assert r.status_code == 422 and r.json()["error"]["code"] == "NOTES_REQUIRED"


@approve_route
def test_http_release_payment(client, db):
    wf, tx, ar = held(db)
    db.close()
    login(client, "admin@demo.techx")
    r = client.post(f"/api/v1/approvals/{ar.id}/approve", json={"notes": "verified"})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.SUCCEEDED
    assert db.get(Workflow, wf.id).state == WorkflowState.COMPLETED


@needs_route("POST", "/payments/transactions/{id}/refund")
def test_http_refund_request_creates_approval_not_refund(client, db):
    tx = paid_tx(db)
    db.close()
    login(client, "finance@demo.techx")
    r = client.post(f"/api/v1/payments/transactions/{tx.id}/refund", json={"reason": "duplicate signup"})
    assert r.status_code in (200, 201), r.text
    db.expire_all()
    assert db.get(Transaction, tx.id).status == TxStatus.SUCCEEDED
    ar = db.scalar(
        select(ApprovalRequest).where(ApprovalRequest.transaction_id == tx.id, ApprovalRequest.action == "REFUND")
    )
    assert ar is not None and ar.status == ApprovalStatus.PENDING_REVIEW
