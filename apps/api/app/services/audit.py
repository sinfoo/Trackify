"""Append-only, hash-chained audit trail.

Rows are appended inside the caller's transaction WITHOUT a hash. Right after that transaction commits,
`seal()` chains every unsealed row in id order under a process lock, in its own short transaction.
Hashing at commit time (not insert time) is what keeps the chain linear when several requests write
concurrently: each open transaction would otherwise read the same "latest" hash and fork the chain.
Sealed rows are never modified again (PostgreSQL trigger enforces it).
"""

import hashlib
import json
import logging
import threading

from sqlalchemy import event as sa_event
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
        prev_hash="",
        hash="",
    )
    db.add(entry)
    db.flush()
    db.info["audit_unsealed"] = True
    return entry


def _digest(e: AuditLog, prev: str) -> str:
    body = json.dumps(
        [e.actor_type, e.actor_id, e.action, e.resource_type, e.resource_id, e.outcome, e.details, prev],
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(body.encode()).hexdigest()


_seal_lock = threading.Lock()  # ponytail: per-process; several API workers need a DB advisory lock instead


def seal(bind) -> int:
    """Chain all committed-but-unsealed rows in id order. Returns how many rows were sealed."""
    with _seal_lock, Session(bind=bind) as s:
        prev = s.scalar(select(AuditLog.hash).where(AuditLog.hash != "").order_by(AuditLog.id.desc()).limit(1)) or ""
        rows = list(s.scalars(select(AuditLog).where(AuditLog.hash == "").order_by(AuditLog.id)))
        for e in rows:
            e.prev_hash = prev
            e.hash = prev = _digest(e, prev)
        s.info["audit_sealing"] = True
        s.commit()
        return len(rows)


@sa_event.listens_for(Session, "after_commit")
def _seal_after_commit(session: Session) -> None:
    if session.info.pop("audit_unsealed", False) and not session.info.get("audit_sealing"):
        try:
            seal(session.get_bind())
        except Exception:  # sealing must never break the business request; next commit retries
            logging.getLogger(__name__).exception("audit sealing failed; will retry on next commit")


def verify_chain(db: Session) -> tuple[bool, int | None]:
    """Recompute hashes of sealed rows in id order; returns (ok, first_broken_id).

    Unsealed rows may only exist at the tail (transactions still committing)."""
    prev = ""
    for e in db.scalars(select(AuditLog).where(AuditLog.hash != "").order_by(AuditLog.id)):
        if e.prev_hash != prev or _digest(e, prev) != e.hash:
            return False, e.id
        prev = e.hash
    return True, None
