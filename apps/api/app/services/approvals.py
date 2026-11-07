"""Human-in-the-loop approvals. Enforced here, in the backend, not by hidden buttons."""

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, conflict
from app.db.base import utcnow
from app.models import ApprovalDecision, ApprovalRequest, ApprovalStatus, User
from app.services import audit, events

OPEN = (ApprovalStatus.PENDING_REVIEW, ApprovalStatus.INFO_REQUESTED)


def request(
    db: Session,
    *,
    action: str,
    reason: str,
    requested_by_agent: str | None = None,
    requested_by_user: User | None = None,
    customer_id=None,
    transaction_id=None,
    security_event_id=None,
    risk_score: float = 0.0,
    risk_flags: list | None = None,
    payload: dict | None = None,
    workflow_id=None,
) -> ApprovalRequest:
    ar = ApprovalRequest(
        action=action, reason=reason[:500], requested_by_agent=requested_by_agent,
        requested_by_user_id=requested_by_user.id if requested_by_user else None,
        customer_id=customer_id, transaction_id=transaction_id, security_event_id=security_event_id,
        risk_score=risk_score, risk_flags=risk_flags or [], payload=payload or {},
        expires_at=utcnow() + timedelta(hours=get_settings().approval_ttl_hours),
    )
    db.add(ar)
    db.flush()
    who = f"agent:{requested_by_agent}" if requested_by_agent else f"user:{requested_by_user.email}"
    audit.record(db, actor_type="agent" if requested_by_agent else "user", actor_id=who,
                 action="approval.requested", resource_type="approval", resource_id=ar.id,
                 severity="WARN", details={"action": action})
    events.publish(db, "approval.requested", f"Approval needed: {action}", agent_id=requested_by_agent,
                   workflow_id=workflow_id, data={"approval_id": str(ar.id), "action": action, "risk_score": risk_score})
    return ar


def expire_stale(db: Session) -> int:
    n = 0
    for ar in db.scalars(select(ApprovalRequest).where(ApprovalRequest.status.in_(OPEN),
                                                       ApprovalRequest.expires_at < utcnow())):
        ar.status = ApprovalStatus.EXPIRED
        audit.record(db, actor_type="system", actor_id="system", action="approval.expired",
                     resource_type="approval", resource_id=ar.id)
        n += 1
    return n


def decide(db: Session, ar: ApprovalRequest, user: User, decision: str, notes: str) -> ApprovalRequest:
    """decision: APPROVED | REJECTED | INFO_REQUESTED. Caller must already hold approvals:decide."""
    if not isinstance(user, User) or not user.is_active:
        raise AppError(403, "HUMAN_REQUIRED", "Only an authenticated human administrator can decide")
    if "approvals:decide" not in user.permission_codes:
        raise AppError(403, "FORBIDDEN", "Missing permission: approvals:decide")
    if ar.status not in OPEN:
        raise conflict("APPROVAL_CLOSED", f"Approval is already {ar.status}")
    if ar.expires_at < utcnow():
        ar.status = ApprovalStatus.EXPIRED
        db.flush()
        raise conflict("APPROVAL_EXPIRED", "Approval request has expired")
    if ar.requested_by_user_id and ar.requested_by_user_id == user.id and decision != "INFO_REQUESTED":
        audit.record(db, actor_type="user", actor_id=user.email, action="approval.self_approval_blocked",
                     resource_type="approval", resource_id=ar.id, severity="CRITICAL", outcome="DENIED")
        db.commit()
        raise AppError(403, "SELF_APPROVAL_FORBIDDEN", "Four-eyes rule: you cannot decide your own request")
    if decision == "REJECTED" and not notes.strip():
        raise AppError(422, "NOTES_REQUIRED", "A rejection needs a note")
    ar.status = ApprovalStatus(decision)
    db.add(ApprovalDecision(approval_id=ar.id, decision=decision, decided_by_id=user.id,
                            decided_by_email=user.email, notes=notes[:1000]))
    audit.record(db, actor_type="user", actor_id=user.email, action=f"approval.{decision.lower()}",
                 resource_type="approval", resource_id=ar.id, severity="WARN",
                 details={"action": ar.action, "notes": notes})
    events.publish(db, "approval.resolved", f"{ar.action} {decision.lower()} by {user.full_name}",
                   data={"approval_id": str(ar.id), "decision": decision})
    db.flush()
    db.refresh(ar)
    return ar
