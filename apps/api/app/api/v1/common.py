"""Shared helpers for routers: pagination and serializers matching ARCHITECTURE.md."""

from typing import Any

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.agents.base import SPECS
from app.models import (
    Agent,
    ApprovalRequest,
    Customer,
    CustomerInsight,
    Order,
    Product,
    SecurityEvent,
    Transaction,
    User,
    Workflow,
)
from app.services import payments


class Page:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
        self.page, self.page_size = page, page_size

    def apply(self, db: Session, q: Select, mapper) -> dict[str, Any]:
        total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
        rows = db.scalars(q.offset((self.page - 1) * self.page_size).limit(self.page_size)).unique().all()
        return {"items": [mapper(r) for r in rows], "total": total, "page": self.page, "page_size": self.page_size}


def iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def user_out(u: User) -> dict:
    return {"id": str(u.id), "email": u.email, "full_name": u.full_name, "roles": u.role_names,
            "permissions": sorted(u.permission_codes), "is_active": u.is_active, "created_at": iso(u.created_at),
            "last_login_at": iso(u.last_login_at)}


def offer_out(p: Product, db: Session | None = None) -> dict:
    taken = payments.seats_taken(db, p.id) if db else 0
    return {"id": str(p.id), "slug": p.slug, "name": p.name, "category": p.category, "summary": p.summary,
            "description": p.description, "price": str(p.price), "currency": p.currency,
            "duration_weeks": p.duration_weeks, "level": p.level, "learning_outcomes": p.learning_outcomes,
            "target_audience": p.target_audience, "seats_total": p.seats_total,
            "seats_left": max(0, p.seats_total - taken), "status": p.status}


def insight_out(i: CustomerInsight) -> dict:
    return {"id": str(i.id), "conversation_id": str(i.conversation_id), "summary": i.summary, "needs": i.needs,
            "motivations": i.motivations, "interests": i.interests, "preferred_product_ids": i.preferred_product_ids,
            "objections": i.objections, "satisfaction_signals": i.satisfaction_signals,
            "sentiment_score": i.sentiment_score, "sentiment_label": i.sentiment_label,
            "purchase_intent": i.purchase_intent, "hesitation": i.hesitation, "journey_stage": i.journey_stage,
            "recommended_follow_up": i.recommended_follow_up, "confidence": i.confidence, "source": i.source,
            "updated_at": iso(i.updated_at)}


def tx_out(t: Transaction) -> dict:
    return {"id": str(t.id), "reference": t.reference, "status": t.status, "amount": str(t.amount),
            "currency": t.currency, "provider": t.provider, "payment_method": t.payment_method,
            "failure_reason": t.failure_reason, "risk_score": t.risk_score, "risk_flags": t.risk_flags,
            "customer": {"id": str(t.customer_id), "full_name": t.customer.full_name},
            "product": {"id": str(t.product_id), "name": t.product.name}, "order_id": str(t.order_id),
            "session_id": str(t.session_id), "created_at": iso(t.created_at), "completed_at": iso(t.completed_at)}


def order_out(o: Order, db: Session) -> dict:
    tx = db.scalar(select(Transaction).where(Transaction.order_id == o.id))
    return {"id": str(o.id), "reference": o.reference, "status": o.status, "total": str(o.total),
            "currency": o.currency, "customer": {"id": str(o.customer_id), "full_name": o.customer.full_name},
            "items": [{"product_id": str(i.product_id), "product_name": i.product.name,
                       "unit_price": str(i.unit_price), "quantity": i.quantity} for i in o.items],
            "transaction": {"id": str(tx.id), "reference": tx.reference, "status": tx.status} if tx else None,
            "conversation_id": str(o.conversation_id) if o.conversation_id else None,
            "created_at": iso(o.created_at)}


def security_event_out(e: SecurityEvent) -> dict:
    return {"id": str(e.id), "event_type": e.event_type, "category": e.category, "severity": e.severity,
            "description": e.description, "risk_score": e.risk_score, "recommended_action": e.recommended_action,
            "status": e.status, "detector": e.detector,
            "customer_id": str(e.customer_id) if e.customer_id else None,
            "transaction_id": str(e.transaction_id) if e.transaction_id else None, "agent_id": e.agent_id,
            "evidence": e.evidence, "explanation": e.explanation, "resolved_at": iso(e.resolved_at),
            "resolution_note": e.resolution_note, "created_at": iso(e.created_at)}


def approval_out(a: ApprovalRequest, db: Session) -> dict:
    cust = db.get(Customer, a.customer_id) if a.customer_id else None
    tx = db.get(Transaction, a.transaction_id) if a.transaction_id else None
    req_user = db.get(User, a.requested_by_user_id) if a.requested_by_user_id else None
    return {"id": str(a.id), "action": a.action, "status": a.status, "reason": a.reason,
            "requested_by_agent": a.requested_by_agent,
            "requested_by_user": req_user.email if req_user else None,
            "customer": {"id": str(cust.id), "full_name": cust.full_name} if cust else None,
            "transaction": {"id": str(tx.id), "reference": tx.reference, "amount": str(tx.amount),
                            "status": tx.status} if tx else None,
            "security_event_id": str(a.security_event_id) if a.security_event_id else None,
            "risk_score": a.risk_score, "risk_flags": a.risk_flags, "payload": a.payload,
            "expires_at": iso(a.expires_at), "created_at": iso(a.created_at),
            "decisions": [{"decision": d.decision, "decided_by_email": d.decided_by_email, "notes": d.notes,
                           "created_at": iso(d.created_at)} for d in a.decisions]}


def workflow_out(w: Workflow, db: Session) -> dict:
    cust = db.get(Customer, w.customer_id) if w.customer_id else None
    return {"id": str(w.id), "kind": w.kind, "label": w.label, "state": w.state,
            "customer_id": str(w.customer_id) if w.customer_id else None,
            "customer_name": cust.full_name if cust else None,
            "conversation_id": str(w.conversation_id) if w.conversation_id else None,
            "transaction_id": str(w.transaction_id) if w.transaction_id else None, "context": w.context,
            "error": w.error, "created_at": iso(w.created_at), "updated_at": iso(w.updated_at)}


def execution_out(e) -> dict:
    return {"id": str(e.id), "agent_id": e.agent_id, "workflow_id": str(e.workflow_id) if e.workflow_id else None,
            "task_type": e.task_type, "triggered_by": e.triggered_by, "status": e.status,
            "input_summary": e.input_summary, "output_summary": e.output_summary, "output": e.output,
            "provider": e.provider, "tokens_in": e.tokens_in, "tokens_out": e.tokens_out, "attempts": e.attempts,
            "error": e.error, "started_at": iso(e.started_at), "completed_at": iso(e.completed_at),
            "duration_ms": e.duration_ms}


def agent_out(a: Agent, stats: dict | None = None) -> dict:
    spec = SPECS[a.id]
    return {"id": a.id, "name": a.name, "description": a.description, "icon": spec.icon, "status": a.status,
            "current_task": a.current_task, "last_run_at": iso(a.last_run_at), "enabled": a.enabled,
            "provider": a.provider, "model": a.model, "temperature": a.temperature, "tools": sorted(spec.tools),
            "responsibilities": list(spec.responsibilities),
            "stats": stats or {"succeeded": 0, "failed": 0, "avg_ms": 0}}
