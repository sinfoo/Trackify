import uuid

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, approval_out, iso, security_event_out, tx_out
from app.core.deps import require
from app.core.errors import AppError, not_found
from app.db.base import get_db
from app.models import (
    ApprovalRequest,
    Customer,
    Order,
    PaymentSession,
    Refund,
    SecurityEvent,
    Transaction,
    TxStatus,
    User,
)
from app.orchestration import orchestrator
from app.services import audit
from app.services import payments as payments_svc

router = APIRouter(prefix="/payments", tags=["payments"])

IdemKey = Header(..., alias="Idempotency-Key", min_length=8, max_length=80)


def session_out(ps: PaymentSession) -> dict:
    tx = ps.transaction
    return {
        "id": str(ps.id),
        "order_id": str(ps.order_id),
        "order_reference": ps.order.reference,
        "amount": str(ps.amount),
        "currency": ps.currency,
        "provider": ps.provider,
        "status": tx.status if tx else None,
        "expires_at": iso(ps.expires_at),
        "created_at": iso(ps.created_at),
        "transaction": tx_out(tx) if tx else None,
        "simulated": True,
    }


# ---------------------------------------------------------------- sessions
# ponytail: there is no payments:write permission; opening/simulating a checkout is part of order handling,
# so it is gated by orders:write. Add a dedicated permission if finance needs to separate the two.


class SessionIn(BaseModel):
    order_id: uuid.UUID


@router.post("/sessions", status_code=201)
def create_session(
    body: SessionIn,
    idempotency_key: str = IdemKey,
    db: Session = Depends(get_db),
    user: User = Depends(require("orders:write")),
):
    order = db.get(Order, body.order_id)
    if not order:
        raise not_found("Order")
    ps = payments_svc.create_session(db, order, f"admin:{idempotency_key}", actor=f"user:{user.email}")
    db.commit()
    return session_out(ps)


def _session(db: Session, sid: uuid.UUID) -> PaymentSession:
    ps = db.get(PaymentSession, sid)
    if not ps:
        raise not_found("Payment session")
    return ps


@router.get("/sessions/{sid}")
def get_session(sid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("payments:read"))):
    return session_out(_session(db, sid))


class SimulateIn(BaseModel):
    payment_method: str = Field(min_length=3, max_length=40)


@router.post("/sessions/{sid}/simulate")
def simulate(
    sid: uuid.UUID,
    body: SimulateIn,
    idempotency_key: str = IdemKey,
    db: Session = Depends(get_db),
    _: User = Depends(require("orders:write")),
):
    result = orchestrator.process_payment(db, _session(db, sid), body.payment_method, idempotency_key)
    db.commit()
    return result


# ---------------------------------------------------------------- transactions


@router.get("/transactions")
def list_transactions(
    page: Page = Depends(),
    status: TxStatus | None = None,
    q: str | None = None,
    customer_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("payments:read")),
):
    stmt = select(Transaction).order_by(Transaction.created_at.desc())
    if status:
        stmt = stmt.where(Transaction.status == status)
    if customer_id:
        stmt = stmt.where(Transaction.customer_id == customer_id)
    if q:
        stmt = stmt.where(
            or_(
                Transaction.reference.ilike(f"%{q}%"),
                Transaction.customer_id.in_(select(Customer.id).where(Customer.full_name.ilike(f"%{q}%"))),
            )
        )
    return page.apply(db, stmt, tx_out)


@router.get("/transactions/{tx_id}")
def get_transaction(tx_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("payments:read"))):
    tx = payments_svc.get_tx(db, tx_id)
    sec = db.scalars(
        select(SecurityEvent).where(SecurityEvent.transaction_id == tx.id).order_by(SecurityEvent.created_at)
    )
    refunds = db.scalars(select(Refund).where(Refund.transaction_id == tx.id).order_by(Refund.created_at))
    aps = db.scalars(
        select(ApprovalRequest).where(ApprovalRequest.transaction_id == tx.id).order_by(ApprovalRequest.created_at)
    )
    return tx_out(tx) | {
        "attempts": [
            {
                "id": str(a.id),
                "payment_method": a.payment_method,
                "amount": str(a.amount),
                "outcome": a.outcome,
                "failure_reason": a.failure_reason,
                "provider_reference": a.provider_reference,
                "created_at": iso(a.created_at),
            }
            for a in tx.attempts
        ],
        "history": [
            {
                "id": str(h.id),
                "from_status": h.from_status,
                "to_status": h.to_status,
                "actor": h.actor,
                "reason": h.reason,
                "created_at": iso(h.created_at),
            }
            for h in tx.history
        ],
        "security_events": [security_event_out(e) for e in sec],
        "refunds": [
            {
                "id": str(r.id),
                "amount": str(r.amount),
                "reason": r.reason,
                "status": r.status,
                "approval_id": str(r.approval_id) if r.approval_id else None,
                "created_at": iso(r.created_at),
                "completed_at": iso(r.completed_at),
            }
            for r in refunds
        ],
        "approvals": [approval_out(a, db) for a in aps],
    }


class RefundIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/transactions/{tx_id}/refund", status_code=201)
def request_refund(
    tx_id: uuid.UUID, body: RefundIn, db: Session = Depends(get_db), user: User = Depends(require("payments:refund"))
):
    """Never refunds immediately: creates an approval a different human must decide."""
    tx = payments_svc.get_tx(db, tx_id)
    if not body.reason.strip():
        raise AppError(422, "REASON_REQUIRED", "A refund needs a reason")
    ar = orchestrator.request_refund(db, tx, user, body.reason.strip())
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="refund.requested",
        resource_type="transaction",
        resource_id=tx.id,
        severity="WARN",
        details={"amount": str(tx.amount), "approval_id": str(ar.id)},
    )
    db.commit()
    return approval_out(ar, db)


@router.get("/settings")
def payment_settings(_: User = Depends(require("payments:read"))):
    return payments_svc.settings_view()
