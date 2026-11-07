import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, security_event_out
from app.core.deps import require
from app.core.errors import not_found
from app.db.base import get_db, utcnow
from app.models import SecurityEvent, Severity, User
from app.services import audit, risk

router = APIRouter(prefix="/security", tags=["security"])

EventStatus = Literal["OPEN", "INVESTIGATING", "RESOLVED", "DISMISSED"]


def _counts(db: Session, col) -> dict:
    rows = db.execute(select(col, func.count(SecurityEvent.id)).group_by(col))
    return {str(getattr(k, "value", k)): n for k, n in rows}


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require("security:read"))):
    recent = db.scalars(select(SecurityEvent).order_by(SecurityEvent.created_at.desc()).limit(10))
    return {
        "total": db.scalar(select(func.count(SecurityEvent.id))) or 0,
        "by_severity": {s.value: 0 for s in Severity} | _counts(db, SecurityEvent.severity),
        "by_status": _counts(db, SecurityEvent.status),
        "by_category": _counts(db, SecurityEvent.category),
        "recent": [security_event_out(e) for e in recent],
    }


def _list(db: Session, page: Page, severity, category, status):
    q = select(SecurityEvent).order_by(SecurityEvent.created_at.desc())
    if severity:
        q = q.where(SecurityEvent.severity == severity)
    if category:
        q = q.where(SecurityEvent.category == category)
    if status:
        q = q.where(SecurityEvent.status == status)
    return page.apply(db, q, security_event_out)


@router.get("/events")
def list_events(
    page: Page = Depends(),
    severity: Severity | None = None,
    category: str | None = None,
    status: EventStatus | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("security:read")),
):
    return _list(db, page, severity, category, status)


@router.get("/fraud-alerts")
def fraud_alerts(
    page: Page = Depends(),
    severity: Severity | None = None,
    status: EventStatus | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("security:read")),
):
    return _list(db, page, severity, "FRAUD", status)


def _event(db: Session, eid: uuid.UUID) -> SecurityEvent:
    e = db.get(SecurityEvent, eid)
    if not e:
        raise not_found("Security event")
    return e


@router.get("/events/{eid}")
def get_event(eid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("security:read"))):
    return security_event_out(_event(db, eid))


class ResolveIn(BaseModel):
    status: Literal["RESOLVED", "DISMISSED", "INVESTIGATING"]
    note: str = Field("", max_length=500)


@router.post("/events/{eid}/resolve")
def resolve(
    eid: uuid.UUID, body: ResolveIn, db: Session = Depends(get_db), user: User = Depends(require("security:write"))
):
    e = _event(db, eid)
    old = e.status
    e.status, e.resolution_note = body.status, body.note
    e.resolved_by_id, e.resolved_at = user.id, utcnow() if body.status != "INVESTIGATING" else None
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="security.event_resolved",
        resource_type="security_event",
        resource_id=e.id,
        severity="WARN",
        details={"from": old, "to": body.status, "note": body.note},
    )
    db.commit()
    return security_event_out(e)


class AnalyzeIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@router.post("/analyze")
def analyze(body: AnalyzeIn, db: Session = Depends(get_db), user: User = Depends(require("security:write"))):
    """Ad-hoc injection check. The submitted text is never stored or logged."""
    v = risk.classify_input(body.text)
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="security.analyze",
        details={"detected": v.detected, "score": v.score, "patterns": ",".join(v.patterns), "length": len(body.text)},
    )
    db.commit()
    return {
        "detected": v.detected,
        "score": v.score,
        "patterns": v.patterns,
        "verdict": "INJECTION" if v.detected else "CLEAN",
    }
