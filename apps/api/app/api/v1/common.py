"""Shared helpers for routers: pagination and serializers matching ARCHITECTURE.md."""

from typing import Any

from fastapi import Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.agents.base import SPECS
from app.models import (
    Agent,
    ApprovalRequest,
    AuditLog,
    BusinessRecommendation,
    Conversation,
    Customer,
    CustomerInsight,
    Enrollment,
    Message,
    Order,
    Product,
    SecurityEvent,
    Transaction,
    TxStatus,
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
    return {
        "id": str(u.id),
        "email": u.email,
        "full_name": u.full_name,
        "roles": u.role_names,
        "permissions": sorted(u.permission_codes),
        "is_active": u.is_active,
        "created_at": iso(u.created_at),
        "last_login_at": iso(u.last_login_at),
    }


def offer_out(p: Product, db: Session | None = None) -> dict:
    taken = payments.seats_taken(db, p.id) if db else 0
    return {
        "id": str(p.id),
        "slug": p.slug,
        "name": p.name,
        "category": p.category,
        "summary": p.summary,
        "description": p.description,
        "price": str(p.price),
        "currency": p.currency,
        "duration_weeks": p.duration_weeks,
        "level": p.level,
        "learning_outcomes": p.learning_outcomes,
        "target_audience": p.target_audience,
        "seats_total": p.seats_total,
        "seats_left": max(0, p.seats_total - taken),
        "status": p.status,
    }


def insight_out(i: CustomerInsight) -> dict:
    return {
        "id": str(i.id),
        "conversation_id": str(i.conversation_id),
        "summary": i.summary,
        "needs": i.needs,
        "motivations": i.motivations,
        "interests": i.interests,
        "preferred_product_ids": i.preferred_product_ids,
        "objections": i.objections,
        "satisfaction_signals": i.satisfaction_signals,
        "sentiment_score": i.sentiment_score,
        "sentiment_label": i.sentiment_label,
        "purchase_intent": i.purchase_intent,
        "hesitation": i.hesitation,
        "journey_stage": i.journey_stage,
        "recommended_follow_up": i.recommended_follow_up,
        "confidence": i.confidence,
        "source": i.source,
        "updated_at": iso(i.updated_at),
    }


def tx_out(t: Transaction) -> dict:
    return {
        "id": str(t.id),
        "reference": t.reference,
        "status": t.status,
        "amount": str(t.amount),
        "currency": t.currency,
        "provider": t.provider,
        "payment_method": t.payment_method,
        "failure_reason": t.failure_reason,
        "risk_score": t.risk_score,
        "risk_flags": t.risk_flags,
        "customer": {"id": str(t.customer_id), "full_name": t.customer.full_name},
        "product": {"id": str(t.product_id), "name": t.product.name},
        "order_id": str(t.order_id),
        "session_id": str(t.session_id),
        "created_at": iso(t.created_at),
        "completed_at": iso(t.completed_at),
    }


def order_out(o: Order, db: Session) -> dict:
    tx = db.scalar(select(Transaction).where(Transaction.order_id == o.id))
    return {
        "id": str(o.id),
        "reference": o.reference,
        "status": o.status,
        "total": str(o.total),
        "currency": o.currency,
        "customer": {"id": str(o.customer_id), "full_name": o.customer.full_name},
        "items": [
            {
                "product_id": str(i.product_id),
                "product_name": i.product.name,
                "unit_price": str(i.unit_price),
                "quantity": i.quantity,
            }
            for i in o.items
        ],
        "transaction": {"id": str(tx.id), "reference": tx.reference, "status": tx.status} if tx else None,
        "conversation_id": str(o.conversation_id) if o.conversation_id else None,
        "created_at": iso(o.created_at),
    }


def security_event_out(e: SecurityEvent) -> dict:
    return {
        "id": str(e.id),
        "event_type": e.event_type,
        "category": e.category,
        "severity": e.severity,
        "description": e.description,
        "risk_score": e.risk_score,
        "recommended_action": e.recommended_action,
        "status": e.status,
        "detector": e.detector,
        "customer_id": str(e.customer_id) if e.customer_id else None,
        "transaction_id": str(e.transaction_id) if e.transaction_id else None,
        "agent_id": e.agent_id,
        "evidence": e.evidence,
        "explanation": e.explanation,
        "resolved_at": iso(e.resolved_at),
        "resolution_note": e.resolution_note,
        "created_at": iso(e.created_at),
    }


def approval_out(a: ApprovalRequest, db: Session) -> dict:
    cust = db.get(Customer, a.customer_id) if a.customer_id else None
    tx = db.get(Transaction, a.transaction_id) if a.transaction_id else None
    req_user = db.get(User, a.requested_by_user_id) if a.requested_by_user_id else None
    return {
        "id": str(a.id),
        "action": a.action,
        "status": a.status,
        "reason": a.reason,
        "requested_by_agent": a.requested_by_agent,
        "requested_by_user": req_user.email if req_user else None,
        "customer": {"id": str(cust.id), "full_name": cust.full_name} if cust else None,
        "transaction": {"id": str(tx.id), "reference": tx.reference, "amount": str(tx.amount), "status": tx.status}
        if tx
        else None,
        "security_event_id": str(a.security_event_id) if a.security_event_id else None,
        "risk_score": a.risk_score,
        "risk_flags": a.risk_flags,
        "payload": a.payload,
        "expires_at": iso(a.expires_at),
        "created_at": iso(a.created_at),
        "decisions": [
            {
                "decision": d.decision,
                "decided_by_email": d.decided_by_email,
                "notes": d.notes,
                "created_at": iso(d.created_at),
            }
            for d in a.decisions
        ],
    }


def workflow_out(w: Workflow, db: Session) -> dict:
    cust = db.get(Customer, w.customer_id) if w.customer_id else None
    return {
        "id": str(w.id),
        "kind": w.kind,
        "label": w.label,
        "state": w.state,
        "customer_id": str(w.customer_id) if w.customer_id else None,
        "customer_name": cust.full_name if cust else None,
        "conversation_id": str(w.conversation_id) if w.conversation_id else None,
        "transaction_id": str(w.transaction_id) if w.transaction_id else None,
        "context": w.context,
        "error": w.error,
        "created_at": iso(w.created_at),
        "updated_at": iso(w.updated_at),
    }


def execution_out(e) -> dict:
    return {
        "id": str(e.id),
        "agent_id": e.agent_id,
        "workflow_id": str(e.workflow_id) if e.workflow_id else None,
        "task_type": e.task_type,
        "triggered_by": e.triggered_by,
        "status": e.status,
        "input_summary": e.input_summary,
        "output_summary": e.output_summary,
        "output": e.output,
        "provider": e.provider,
        "tokens_in": e.tokens_in,
        "tokens_out": e.tokens_out,
        "attempts": e.attempts,
        "error": e.error,
        "started_at": iso(e.started_at),
        "completed_at": iso(e.completed_at),
        "duration_ms": e.duration_ms,
    }


def agent_out(a: Agent, stats: dict | None = None) -> dict:
    spec = SPECS[a.id]
    return {
        "id": a.id,
        "name": a.name,
        "description": a.description,
        "icon": spec.icon,
        "status": a.status,
        "current_task": a.current_task,
        "last_run_at": iso(a.last_run_at),
        "enabled": a.enabled,
        "provider": a.provider,
        "model": a.model,
        "temperature": a.temperature,
        "tools": sorted(spec.tools),
        "responsibilities": list(spec.responsibilities),
        "stats": stats or {"succeeded": 0, "failed": 0, "avg_ms": 0},
    }


# ---------------------------------------------------------------- admin serializers


def product_out(p: Product, db: Session) -> dict:
    st = db.execute(
        select(func.sum(Transaction.amount), func.count(Transaction.id)).where(
            Transaction.product_id == p.id, Transaction.status == TxStatus.SUCCEEDED
        )
    ).one()
    taken = payments.seats_taken(db, p.id)
    return offer_out(p, db) | {
        "keywords": p.keywords,
        "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
        "stats": {"revenue": str(st[0] if st[0] is not None else "0.000"), "sales": st[1], "seats_taken": taken},
    }


def latest_insight(db: Session, customer_id) -> CustomerInsight | None:
    return db.scalar(
        select(CustomerInsight)
        .where(CustomerInsight.customer_id == customer_id)
        .order_by(CustomerInsight.updated_at.desc())
        .limit(1)
    )


def customer_out(c: Customer, db: Session) -> dict:
    ins = latest_insight(db, c.id)
    spent = db.scalar(
        select(func.sum(Transaction.amount)).where(
            Transaction.customer_id == c.id, Transaction.status == TxStatus.SUCCEEDED
        )
    )
    orders = db.scalar(select(func.count(Order.id)).where(Order.customer_id == c.id)) or 0
    return {
        "id": str(c.id),
        "full_name": c.full_name,
        "email": c.email,
        "segment": c.segment,
        "city": c.city,
        "journey_stage": c.journey_stage,
        "created_at": iso(c.created_at),
        "purchase_intent": ins.purchase_intent if ins else None,
        "sentiment_label": ins.sentiment_label if ins else None,
        "objections": ins.objections if ins else [],
        "orders_count": orders,
        "total_spent": str(spent if spent is not None else "0.000"),
        "consent_voice": c.consent_voice,
        "is_fictional": c.is_fictional,
    }


def message_out(m: Message) -> dict:
    """Admin view: includes flagged messages and full meta."""
    return {
        "id": str(m.id),
        "role": m.role,
        "content": m.content,
        "flagged": m.flagged,
        "meta": m.meta,
        "created_at": iso(m.created_at),
    }


def conversation_out(c: Conversation, db: Session) -> dict:
    n = db.scalar(select(func.count(Message.id)).where(Message.conversation_id == c.id)) or 0
    flagged = db.scalar(select(func.count(Message.id)).where(Message.conversation_id == c.id, Message.flagged)) or 0
    ins = db.scalar(select(CustomerInsight).where(CustomerInsight.conversation_id == c.id))
    return {
        "id": str(c.id),
        "customer": {"id": str(c.customer_id), "full_name": c.customer.full_name},
        "channel": c.channel,
        "status": c.status,
        "summary": c.summary,
        "messages_count": n,
        "flagged_count": flagged,
        "purchase_intent": ins.purchase_intent if ins else None,
        "sentiment_label": ins.sentiment_label if ins else None,
        "created_at": iso(c.created_at),
    }


def enrollment_out(e: Enrollment) -> dict:
    return {
        "id": str(e.id),
        "status": e.status,
        "customer": {"id": str(e.customer_id), "full_name": e.customer.full_name},
        "product": {"id": str(e.product_id), "name": e.product.name},
        "order_id": str(e.order_id),
        "created_at": iso(e.created_at),
    }


def recommendation_out(r: BusinessRecommendation) -> dict:
    return {
        "id": str(r.id),
        "rule_key": r.rule_key,
        "title": r.title,
        "description": r.description,
        "category": r.category,
        "observed_facts": r.observed_facts,
        "hypothesis": r.hypothesis,
        "metrics": r.metrics,
        "expected_impact": r.expected_impact,
        "priority": r.priority,
        "confidence": r.confidence,
        "suggested_action": r.suggested_action,
        "requires_approval": r.requires_approval,
        "status": r.status,
        "feedback": r.feedback,
        "feedback_note": r.feedback_note,
        "source": r.source,
        "created_at": iso(r.created_at),
    }


def audit_out(a: AuditLog) -> dict:
    return {
        "id": a.id,
        "created_at": iso(a.created_at),
        "actor_type": a.actor_type,
        "actor_id": a.actor_id,
        "action": a.action,
        "resource_type": a.resource_type,
        "resource_id": a.resource_id,
        "severity": a.severity,
        "outcome": a.outcome,
        "details": a.details,
        "ip": a.ip,
        "prev_hash": a.prev_hash,
        "hash": a.hash,
    }
