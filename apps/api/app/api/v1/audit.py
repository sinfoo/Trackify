"""Read-only audit trail. No update or delete endpoint exists by design."""

from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, audit_out
from app.core.deps import require
from app.core.errors import not_found
from app.db.base import get_db
from app.models import AuditLog
from app.services import audit as audit_svc

router = APIRouter(prefix="/audit", tags=["audit"], dependencies=[Depends(require("audit:read"))])


@router.get("/logs")
def list_logs(
    page: Page = Depends(),
    actor_type: str | None = None,
    actor_id: str | None = None,
    action: str | None = None,
    severity: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    q = select(AuditLog).order_by(AuditLog.id.desc())
    for col, v in (
        (AuditLog.actor_type, actor_type),
        (AuditLog.actor_id, actor_id),
        (AuditLog.severity, severity),
        (AuditLog.resource_type, resource_type),
        (AuditLog.resource_id, resource_id),
    ):
        if v:
            q = q.where(col == v)
    if action:
        q = q.where(AuditLog.action.startswith(action))  # "payment." matches all payment actions
    if date_from:
        q = q.where(AuditLog.created_at >= datetime.combine(date_from, time.min, UTC))
    if date_to:
        q = q.where(AuditLog.created_at <= datetime.combine(date_to, time.max, UTC))
    return page.apply(db, q, audit_out)


@router.get("/verify")
def verify(db: Session = Depends(get_db)):
    ok, broken = audit_svc.verify_chain(db)
    return {"ok": ok, "first_broken_id": broken}


@router.get("/logs/{log_id}")
def get_log(log_id: int, db: Session = Depends(get_db)):
    a = db.get(AuditLog, log_id)
    if not a:
        raise not_found("Audit log")
    return audit_out(a)
