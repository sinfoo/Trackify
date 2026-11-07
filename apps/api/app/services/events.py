"""Event persistence + in-process fan-out to WebSocket subscribers.

Events are written to `system_events` inside the caller's DB transaction and only
broadcast after that transaction commits, so subscribers never see an event whose
business change was rolled back.

ponytail: in-process asyncio fan-out (single API instance). For several instances,
swap `_broadcast` for Redis pub/sub; the persisted table already supports catch-up.
"""

import asyncio
import logging
from typing import Any

from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session

from app.models import SystemEvent

log = logging.getLogger(__name__)

EVENT_PERMISSIONS = {
    "security.alert": "security:read",
    "approval.requested": "approvals:read",
    "approval.resolved": "approvals:read",
    "payment.created": "payments:read",
    "payment.updated": "payments:read",
}

_loop: asyncio.AbstractEventLoop | None = None
_subscribers: set[asyncio.Queue] = set()


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=500)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


def serialize(ev: SystemEvent) -> dict[str, Any]:
    return {
        "id": ev.id,
        "type": ev.type,
        "agent_id": ev.agent_id,
        "workflow_id": ev.workflow_id,
        "summary": ev.summary,
        "data": ev.data,
        "created_at": ev.created_at.isoformat(),
        "required_permission": ev.required_permission,
    }


def _deliver(payload: dict) -> None:
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            log.warning("dropping event for slow subscriber; it will catch up via /events")


def _broadcast(payloads: list[dict]) -> None:
    if _loop is None or _loop.is_closed():
        return
    for p in payloads:
        _loop.call_soon_threadsafe(_deliver, p)


def publish(
    db: Session,
    type_: str,
    summary: str,
    *,
    agent_id: str | None = None,
    workflow_id: Any = None,
    data: dict | None = None,
) -> SystemEvent:
    ev = SystemEvent(
        type=type_,
        summary=summary[:300],
        agent_id=agent_id,
        workflow_id=str(workflow_id) if workflow_id else None,
        data=data or {},
        required_permission=EVENT_PERMISSIONS.get(type_, "events:read"),
    )
    db.add(ev)
    db.flush()
    pending = db.info.setdefault("pending_events", [])
    pending.append(ev)
    return ev


@sa_event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    pending = session.info.pop("pending_events", None)
    if pending:
        _broadcast([serialize(e) for e in pending])


@sa_event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop("pending_events", None)
