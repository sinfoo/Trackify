import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import (
    Page,
    approval_out,
    customer_out,
    security_event_out,
    tx_out,
)
from app.core.deps import require
from app.core.errors import not_found
from app.db.base import get_db
from app.models import (
    ApprovalRequest,
    ApprovalStatus,
    Customer,
    SecurityEvent,
    Transaction,
    User,
)
from app.orchestration import orchestrator
from app.services import approvals as approvals_svc

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("")
def list_approvals(
    page: Page = Depends(),
    status: ApprovalStatus | None = None,
    action: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("approvals:read")),
):
    if approvals_svc.expire_stale(db):
        db.commit()
    q = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())
    if status:
        q = q.where(ApprovalRequest.status == status)
    if action:
        q = q.where(ApprovalRequest.action == action)
    return page.apply(db, q, lambda a: approval_out(a, db))


def _approval(db: Session, aid: uuid.UUID) -> ApprovalRequest:
    a = db.get(ApprovalRequest, aid)
    if not a:
        raise not_found("Approval")
    return a


@router.get("/{aid}")
def get_approval(aid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("approvals:read"))):
    if approvals_svc.expire_stale(db):
        db.commit()
    a = _approval(db, aid)
    tx = db.get(Transaction, a.transaction_id) if a.transaction_id else None
    cust = db.get(Customer, a.customer_id) if a.customer_id else None
    ev = db.get(SecurityEvent, a.security_event_id) if a.security_event_id else None
    return approval_out(a, db) | {
        "context": {
            "transaction": tx_out(tx) if tx else None,
            "customer": customer_out(cust, db) if cust else None,
            "security_event": security_event_out(ev) if ev else None,
        }
    }


class DecisionIn(BaseModel):
    notes: str = Field("", max_length=1000)


def _decide(db: Session, aid: uuid.UUID, user: User, decision: str, notes: str) -> dict:
    ar = approvals_svc.decide(db, _approval(db, aid), user, decision, notes)
    if decision in ("APPROVED", "REJECTED"):
        orchestrator.on_approval_decided(db, ar, user)
    # No commit on failure: a half-applied decision must roll back with the session.
    db.commit()
    return approval_out(ar, db)


@router.post("/{aid}/approve")
def approve(
    aid: uuid.UUID, body: DecisionIn, db: Session = Depends(get_db), user: User = Depends(require("approvals:decide"))
):
    return _decide(db, aid, user, "APPROVED", body.notes)


@router.post("/{aid}/reject")
def reject(
    aid: uuid.UUID, body: DecisionIn, db: Session = Depends(get_db), user: User = Depends(require("approvals:decide"))
):
    return _decide(db, aid, user, "REJECTED", body.notes)


@router.post("/{aid}/request-information")
def request_information(
    aid: uuid.UUID, body: DecisionIn, db: Session = Depends(get_db), user: User = Depends(require("approvals:decide"))
):
    return _decide(db, aid, user, "INFO_REQUESTED", body.notes)
