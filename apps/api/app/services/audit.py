"""Append-only, hash-chained audit trail. Never update or delete rows."""

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog

SENSITIVE_KEYS = {"password", "token", "secret", "api_key", "authorization", "card", "cvv", "pin"}


def _scrub(details: dict) -> dict:
    out = {}
    for k, v in details.items():
        if any(s in k.lower() for s in SENSITIVE_KEYS):
            out[k] = "[redacted]"
        elif isinstance(v, dict):
            out[k] = _scrub(v)
        else:
            out[k] = v if isinstance(v, (int, float, bool, type(None))) else str(v)[:300]
    return out


def record(
    db: Session,
    *,
    actor_type: str,
    actor_id: str,
    action: str,
    resource_type: str | None = None,
    resource_id=None,
    severity: str = "INFO",
    outcome: str = "SUCCESS",
    details: dict | None = None,
    ip: str | None = None,
) -> AuditLog:
    prev = db.scalar(select(AuditLog.hash).order_by(AuditLog.id.desc()).limit(1)) or ""
    entry = AuditLog(
        actor_type=actor_type,
        actor_id=str(actor_id),
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id else None,
        severity=severity,
        outcome=outcome,
        details=_scrub(details or {}),
        ip=ip,
        prev_hash=prev,
    )
    body = json.dumps(
        [entry.actor_type, entry.actor_id, entry.action, entry.resource_type, entry.resource_id,
         entry.outcome, entry.details, prev],
        sort_keys=True,
        default=str,
    )
    entry.hash = hashlib.sha256(body.encode()).hexdigest()
    db.add(entry)
    db.flush()
    return entry


def verify_chain(db: Session) -> tuple[bool, int | None]:
    """Recompute hashes; returns (ok, first_broken_id)."""
    prev = ""
    for e in db.scalars(select(AuditLog).order_by(AuditLog.id)):
        body = json.dumps(
            [e.actor_type, e.actor_id, e.action, e.resource_type, e.resource_id, e.outcome, e.details, prev],
            sort_keys=True,
            default=str,
        )
        if e.prev_hash != prev or hashlib.sha256(body.encode()).hexdigest() != e.hash:
            return False, e.id
        prev = e.hash
    return True, None
