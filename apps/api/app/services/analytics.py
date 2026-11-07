"""Deterministic financial & business metrics. The single source for every number in the UI.

Definitions (also served by /analytics/definitions):
- interactions: conversations started in range.
- interested_customers: distinct customers whose latest insight has purchase_intent >= 0.5,
  or who created an order, in range.
- conversion_rate: distinct customers with >=1 SUCCEEDED/REFUNDED transaction / distinct customers
  with a conversation, x100 (same range). Each customer counted once.
- revenue: sum of SUCCEEDED transaction amounts (refunded excluded; shown separately).
- avg_transaction_value: revenue / succeeded transaction count.
"""

import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models import (
    AgentExecution,
    Conversation,
    Customer,
    CustomerFeedback,
    CustomerInsight,
    Enrollment,
    EnrollmentStatus,
    Order,
    Product,
    SecurityEvent,
    Severity,
    Transaction,
    TxStatus,
)

DEFINITIONS = {
    "interactions": "Customer conversations started in the period.",
    "interested_customers": "Distinct customers with purchase intent ≥ 0.5 (model estimate) or who created an order.",
    "enrollments": "Enrollments with status ACTIVE (paid).",
    "conversion_rate": "Distinct paying customers ÷ distinct customers who had a conversation × 100.",
    "revenue": "Sum of SUCCEEDED simulated transactions. Refunds are excluded and shown separately.",
    "avg_transaction_value": "Revenue ÷ number of succeeded transactions.",
    "satisfaction": "Mean customer feedback rating (1–5).",
    "security_alerts": "Security events raised in the period; high-risk = HIGH or CRITICAL severity.",
    "objections": "Objection categories detected by the Customer Intelligence Agent (model output, not verified fact).",
}


@dataclass
class Filters:
    date_from: datetime | None = None
    date_to: datetime | None = None
    product_id: uuid.UUID | None = None
    segment: str | None = None
    status: str | None = None

    @classmethod
    def build(cls, date_from: date | None, date_to: date | None, product_id=None, segment=None, status=None):
        return cls(
            datetime.combine(date_from, time.min, UTC) if date_from else None,
            datetime.combine(date_to, time.max, UTC) if date_to else None,
            uuid.UUID(str(product_id)) if product_id else None,
            segment,
            status,
        )


def _range(q: Select, col, f: Filters) -> Select:
    if f.date_from:
        q = q.where(col >= f.date_from)
    if f.date_to:
        q = q.where(col <= f.date_to)
    return q


def _cust(q: Select, model, f: Filters) -> Select:
    """Date range + customer segment for any table with created_at and customer_id."""
    q = _range(q, model.created_at, f)
    if f.segment:
        q = q.where(model.customer_id.in_(select(Customer.id).where(Customer.segment == f.segment)))
    return q


def _tx(q: Select, f: Filters) -> Select:
    q = _range(q, Transaction.created_at, f)
    if f.product_id:
        q = q.where(Transaction.product_id == f.product_id)
    if f.segment:
        q = q.join(Customer, Customer.id == Transaction.customer_id).where(Customer.segment == f.segment)
    return q


def _conv(q: Select, f: Filters) -> Select:
    q = _range(q, Conversation.created_at, f)
    if f.segment:
        q = q.join(Customer, Customer.id == Conversation.customer_id).where(Customer.segment == f.segment)
    return q


def payment_counts(db: Session, f: Filters) -> dict[str, int]:
    rows = db.execute(_tx(select(Transaction.status, func.count(Transaction.id)), f).group_by(Transaction.status))
    out = {s.value: 0 for s in TxStatus}
    for st, n in rows:
        out[str(st.value if hasattr(st, "value") else st)] = n
    return out


def revenue(db: Session, f: Filters, status: TxStatus = TxStatus.SUCCEEDED) -> Decimal:
    v = db.scalar(_tx(select(func.sum(Transaction.amount)), f).where(Transaction.status == status))
    return v if v is not None else Decimal("0.000")


def overview(db: Session, f: Filters) -> dict:
    interactions = db.scalar(_conv(select(func.count(Conversation.id)), f)) or 0
    talking = set(db.scalars(_conv(select(Conversation.customer_id).distinct(), f)))

    intent_q = select(CustomerInsight.customer_id).where(CustomerInsight.purchase_intent >= 0.5)
    intent_q = _cust(intent_q, CustomerInsight, f)
    order_q = _range(select(Order.customer_id), Order.created_at, f)
    interested = set(db.scalars(intent_q)) | set(db.scalars(order_q))
    if f.segment:
        seg = set(db.scalars(select(Customer.id).where(Customer.segment == f.segment)))
        interested &= seg

    paying = set(
        db.scalars(
            _tx(select(Transaction.customer_id).distinct(), f).where(
                Transaction.status.in_([TxStatus.SUCCEEDED, TxStatus.REFUNDED])
            )
        )
    )
    eligible = talking | paying  # a payer without a logged conversation is still a converted customer
    conversion = round(100 * len(paying) / len(eligible), 1) if eligible else 0.0

    counts = payment_counts(db, f)
    rev = revenue(db, f)
    refunded = revenue(db, f, TxStatus.REFUNDED)
    succ = counts["SUCCEEDED"]
    avg = (rev / succ).quantize(Decimal("0.001")) if succ else Decimal("0.000")

    enr_q = _cust(select(func.count(Enrollment.id)), Enrollment, f).where(Enrollment.status == EnrollmentStatus.ACTIVE)
    if f.product_id:
        enr_q = enr_q.where(Enrollment.product_id == f.product_id)
    enrollments = db.scalar(enr_q) or 0

    sat = db.scalar(_cust(select(func.avg(CustomerFeedback.rating)), CustomerFeedback, f))
    fb_n = db.scalar(_cust(select(func.count(CustomerFeedback.id)), CustomerFeedback, f)) or 0

    sec_total = db.scalar(_range(select(func.count(SecurityEvent.id)), SecurityEvent.created_at, f)) or 0
    sec_high = (
        db.scalar(
            _range(select(func.count(SecurityEvent.id)), SecurityEvent.created_at, f).where(
                SecurityEvent.severity.in_([Severity.HIGH, Severity.CRITICAL])
            )
        )
        or 0
    )
    sec_open = db.scalar(select(func.count(SecurityEvent.id)).where(SecurityEvent.status == "OPEN")) or 0
    sec_types = dict(
        db.execute(
            _range(
                select(SecurityEvent.event_type, func.count(SecurityEvent.id)), SecurityEvent.created_at, f
            ).group_by(SecurityEvent.event_type)
        ).all()
    )

    return {
        "interactions": interactions,
        "customers_engaged": len(talking),
        "interested_customers": len(interested),
        "enrollments": enrollments,
        "conversion_rate": conversion,
        "revenue": str(rev),
        "refunded": str(refunded),
        "currency": "TND",
        "payments": counts,
        "pending_payments": counts["PENDING"] + counts["REQUIRES_APPROVAL"] + counts["PROCESSING"] + counts["CREATED"],
        "avg_transaction_value": str(avg),
        "satisfaction": round(float(sat), 2) if sat is not None else None,
        "feedback_count": fb_n,
        "security_alerts": sec_total,
        "high_risk_events": sec_high,
        "open_security_events": sec_open,
        "security_event_types": sec_types,
        "top_products": products(db, f)[:5],
        "top_objections": objections(db, f)[:6],
    }


def revenue_series(db: Session, f: Filters, days: int = 30) -> list[dict]:
    end = (f.date_to or utcnow()).date()
    start = f.date_from.date() if f.date_from else end - timedelta(days=days - 1)
    buckets: dict[date, dict] = {}
    d = start
    while d <= end:
        buckets[d] = {"date": d.isoformat(), "revenue": Decimal("0.000"), "succeeded": 0, "failed": 0}
        d += timedelta(days=1)
    q = _tx(select(Transaction.created_at, Transaction.amount, Transaction.status), f)
    for created, amount, st in db.execute(q):
        b = buckets.get(created.date())
        if not b:
            continue
        if st == TxStatus.SUCCEEDED:
            b["revenue"] += amount
            b["succeeded"] += 1
        elif st == TxStatus.FAILED:
            b["failed"] += 1
    return [{**b, "revenue": str(b["revenue"])} for b in buckets.values()]


def funnel(db: Session, f: Filters) -> list[dict]:
    o = overview(db, f)
    started = db.scalar(_tx(select(func.count(func.distinct(Transaction.customer_id))), f)) or 0
    paid = (
        db.scalar(
            _tx(select(func.count(func.distinct(Transaction.customer_id))), f).where(
                Transaction.status.in_([TxStatus.SUCCEEDED, TxStatus.REFUNDED])
            )
        )
        or 0
    )
    return [
        {"stage": "Conversations", "customers": o["customers_engaged"]},
        {"stage": "Interested", "customers": o["interested_customers"]},
        {"stage": "Checkout started", "customers": started},
        {"stage": "Paid", "customers": paid},
    ]


def products(db: Session, f: Filters) -> list[dict]:
    out = []
    for p in db.scalars(select(Product).order_by(Product.name)):
        if f.product_id and p.id != f.product_id:
            continue
        pf = Filters(f.date_from, f.date_to, p.id, f.segment)
        c = payment_counts(db, pf)
        attempts = c["SUCCEEDED"] + c["FAILED"] + c["REFUNDED"]
        seats = (
            db.scalar(
                select(func.count(Enrollment.id)).where(
                    Enrollment.product_id == p.id, Enrollment.status == EnrollmentStatus.ACTIVE
                )
            )
            or 0
        )
        out.append(
            {
                "product_id": str(p.id),
                "name": p.name,
                "category": p.category,
                "price": str(p.price),
                "status": p.status,
                "revenue": str(revenue(db, pf)),
                "sales": c["SUCCEEDED"],
                "failed": c["FAILED"],
                "payment_success_rate": round(100 * (c["SUCCEEDED"] + c["REFUNDED"]) / attempts, 1)
                if attempts
                else None,
                "seats_taken": seats,
                "seats_total": p.seats_total,
            }
        )
    out.sort(key=lambda r: Decimal(r["revenue"]), reverse=True)
    return out


def objections(db: Session, f: Filters) -> list[dict]:
    c: Counter = Counter()
    for objs in db.scalars(_cust(select(CustomerInsight.objections), CustomerInsight, f)):
        c.update(set(objs or []))
    total = sum(c.values()) or 1
    return [{"objection": k, "count": n, "share": round(100 * n / total, 1)} for k, n in c.most_common()]


def sentiment(db: Session, f: Filters) -> dict:
    rows = db.scalars(_cust(select(CustomerInsight.sentiment_label), CustomerInsight, f))
    c = Counter(rows)
    return {k: c.get(k, 0) for k in ("positive", "neutral", "negative")}


def interests(db: Session, f: Filters) -> list[dict]:
    c: Counter = Counter()
    for i in db.scalars(_cust(select(CustomerInsight.interests), CustomerInsight, f)):
        c.update(set(i or []))
    return [{"interest": k, "count": n} for k, n in c.most_common()]


def intent_distribution(db: Session, f: Filters) -> list[dict]:
    bands = {"low (<0.3)": 0, "medium (0.3–0.6)": 0, "high (≥0.6)": 0}
    for v in db.scalars(_cust(select(CustomerInsight.purchase_intent), CustomerInsight, f)):
        bands["low (<0.3)" if v < 0.3 else "medium (0.3–0.6)" if v < 0.6 else "high (≥0.6)"] += 1
    return [{"band": k, "count": n} for k, n in bands.items()]


def security(db: Session, f: Filters, days: int = 14) -> dict:
    end = (f.date_to or utcnow()).date()
    start = f.date_from.date() if f.date_from else end - timedelta(days=days - 1)
    series = {}
    d = start
    while d <= end:
        series[d] = {"date": d.isoformat(), "LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        d += timedelta(days=1)
    for created, sev in db.execute(
        _range(select(SecurityEvent.created_at, SecurityEvent.severity), SecurityEvent.created_at, f)
    ):
        if created.date() in series:
            series[created.date()][sev.value if hasattr(sev, "value") else sev] += 1
    by_cat = dict(
        db.execute(
            _range(select(SecurityEvent.category, func.count(SecurityEvent.id)), SecurityEvent.created_at, f).group_by(
                SecurityEvent.category
            )
        ).all()
    )
    return {"series": list(series.values()), "by_category": by_cat}


def agents(db: Session, f: Filters) -> list[dict]:
    q = _range(
        select(
            AgentExecution.agent_id,
            AgentExecution.status,
            func.count(AgentExecution.id),
            func.avg(AgentExecution.duration_ms),
        ),
        AgentExecution.created_at,
        f,
    )
    stats: dict[str, dict] = {}
    for agent_id, status, n, avg in db.execute(q.group_by(AgentExecution.agent_id, AgentExecution.status)):
        s = stats.setdefault(agent_id, {"agent_id": agent_id, "succeeded": 0, "failed": 0, "avg_ms": 0, "_n": 0})
        s["succeeded" if status == "SUCCEEDED" else "failed" if status == "FAILED" else "_running"] = n
        s["avg_ms"] = round(((s["avg_ms"] * s["_n"]) + (avg or 0) * n) / (s["_n"] + n))
        s["_n"] += n
    return [{k: v for k, v in s.items() if not k.startswith("_")} for s in stats.values()]
