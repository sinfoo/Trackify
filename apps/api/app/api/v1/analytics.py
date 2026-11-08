import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.v1.common import customer_out, iso
from app.core.deps import require
from app.core.errors import not_found
from app.db.base import get_db
from app.models import AnalyticsSnapshot, Customer, SecurityEvent, Transaction
from app.services import analytics as svc

router = APIRouter(tags=["analytics"], dependencies=[Depends(require("analytics:read"))])


def filters(
    date_from: date | None = None,
    date_to: date | None = None,
    product_id: uuid.UUID | None = None,
    segment: str | None = None,
) -> svc.Filters:
    return svc.Filters.build(date_from, date_to, product_id, segment)


F = Depends(filters)


@router.get("/analytics/overview")
def overview(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.overview(db, f)


@router.get("/analytics/revenue")
def revenue(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.revenue_series(db, f)


@router.get("/analytics/conversion")
def conversion(f: svc.Filters = F, db: Session = Depends(get_db)):
    return {"funnel": svc.funnel(db, f), "conversion_rate": svc.overview(db, f)["conversion_rate"]}


@router.get("/analytics/products")
def products(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.products(db, f)


@router.get("/analytics/payments")
def payments(f: svc.Filters = F, db: Session = Depends(get_db)):
    o = svc.overview(db, f)
    return {
        "counts": o["payments"],
        "revenue": o["revenue"],
        "refunded": o["refunded"],
        "currency": "TND",
        "avg_transaction_value": o["avg_transaction_value"],
        "pending_payments": o["pending_payments"],
        "series": svc.revenue_series(db, f),
    }


@router.get("/analytics/customers")
def customers(f: svc.Filters = F, db: Session = Depends(get_db)):
    seg_q = select(Customer.segment, func.count(Customer.id)).group_by(Customer.segment)
    if f.segment:
        seg_q = seg_q.where(Customer.segment == f.segment)
    return {
        "sentiment": svc.sentiment(db, f),
        "interests": svc.interests(db, f),
        "intent": svc.intent_distribution(db, f),
        "objections": svc.objections(db, f),
        "segments": [{"segment": s, "count": n} for s, n in db.execute(seg_q)],
    }


@router.get("/analytics/security")
def security(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.security(db, f)


@router.get("/analytics/agents")
def agents(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.agents(db, f)


@router.get("/analytics/forecast")
def forecast(db: Session = Depends(get_db)):
    return svc.forecast(db)


@router.get("/analytics/feedback")
def feedback(f: svc.Filters = F, db: Session = Depends(get_db)):
    return svc.feedback(db, f)


@router.get("/analytics/definitions")
def definitions():
    return svc.DEFINITIONS


@router.get("/analytics/snapshots/latest")
def latest_snapshot(db: Session = Depends(get_db)):
    s = db.scalar(select(AnalyticsSnapshot).order_by(AnalyticsSnapshot.created_at.desc()).limit(1))
    if not s:
        return None
    return {
        "id": str(s.id),
        "metrics": s.metrics,
        "narrative": s.narrative,
        "trigger": s.trigger,
        "created_at": iso(s.created_at),
    }


# ---------------------------------------------------------------- CSV reports


def _cell(v) -> str:
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s  # spreadsheet formula injection


def _rows(kind: str, db: Session, f: svc.Filters) -> tuple[list[str], list[list]]:
    if kind == "financial":
        cols = ["date", "revenue", "succeeded", "failed"]
        return cols, [[r[c] for c in cols] for r in svc.revenue_series(db, f)]
    if kind == "customers":
        q = select(Customer).order_by(Customer.created_at)
        if f.segment:
            q = q.where(Customer.segment == f.segment)
        cols = [
            "id",
            "full_name",
            "email",
            "segment",
            "city",
            "journey_stage",
            "purchase_intent",
            "sentiment_label",
            "orders_count",
            "total_spent",
            "created_at",
        ]
        rows = [customer_out(c, db) for c in db.scalars(svc._range(q, Customer.created_at, f))]
        return cols, [[r[k] for k in cols] for r in rows]
    if kind == "transactions":
        cols = [
            "reference",
            "status",
            "amount",
            "currency",
            "customer",
            "product",
            "payment_method",
            "failure_reason",
            "risk_score",
            "created_at",
            "completed_at",
        ]
        txs = db.scalars(svc._tx(select(Transaction), f).order_by(Transaction.created_at))
        return cols, [
            [
                t.reference,
                t.status,
                t.amount,
                t.currency,
                t.customer.full_name,
                t.product.name,
                t.payment_method,
                t.failure_reason,
                t.risk_score,
                iso(t.created_at),
                iso(t.completed_at),
            ]
            for t in txs
        ]
    if kind == "security":
        cols = [
            "id",
            "created_at",
            "event_type",
            "category",
            "severity",
            "status",
            "risk_score",
            "recommended_action",
            "detector",
            "description",
        ]
        q = svc._range(select(SecurityEvent), SecurityEvent.created_at, f).order_by(SecurityEvent.created_at)
        evs = db.scalars(q)
        return cols, [
            [
                e.id,
                iso(e.created_at),
                e.event_type,
                e.category,
                e.severity,
                e.status,
                e.risk_score,
                e.recommended_action,
                e.detector,
                e.description,
            ]
            for e in evs
        ]
    cols = ["agent_id", "succeeded", "failed", "avg_ms"]
    return cols, [[r[c] for c in cols] for r in svc.agents(db, f)]


REPORTS = {"financial", "customers", "transactions", "security", "agents"}


@router.get("/reports/{kind}.csv")
def report(kind: str, f: svc.Filters = F, db: Session = Depends(get_db)):
    if kind not in REPORTS:
        raise not_found("Report")
    cols, rows = _rows(kind, db, f)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    w.writerows([[_cell(v) for v in r] for r in rows])
    return Response(
        buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{kind}-report.csv"'},
    )
