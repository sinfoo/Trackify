"""Analytics numbers vs. raw DB truth, exact Money, hash-chained audit."""

from collections import Counter
from decimal import Decimal

from conftest import new_customer
from sqlalchemy import select, text, update

from app import seed
from app.db.base import SessionLocal
from app.models import AuditLog, Conversation, Product, Transaction, TxStatus
from app.services import analytics, audit


def test_overview_matches_db_after_seed_activity(db):
    seed.seed_activity(db)  # slow (~10-15 s): the only full seed in the suite
    db.expire_all()
    o = analytics.overview(db, analytics.Filters())

    txs = db.execute(select(Transaction.customer_id, Transaction.status, Transaction.amount)).all()
    assert txs, "seed produced no transactions"
    expected_rev = sum((a for _, s, a in txs if s == TxStatus.SUCCEEDED), Decimal("0.000"))
    assert Decimal(o["revenue"]) == expected_rev and o["revenue"] == f"{expected_rev:.3f}"
    refunded = sum((a for _, s, a in txs if s == TxStatus.REFUNDED), Decimal("0.000"))
    assert Decimal(o["refunded"]) == refunded

    counts = Counter(str(s) for _, s, _ in txs)
    assert {k: v for k, v in o["payments"].items() if v} == dict(counts)
    assert o["payments"]["SUCCEEDED"] > 0 and o["payments"]["FAILED"] > 0

    paying = {c for c, s, _ in txs if s in (TxStatus.SUCCEEDED, TxStatus.REFUNDED)}
    talking = set(db.scalars(select(Conversation.customer_id)))
    assert o["conversion_rate"] == round(100 * len(paying) / len(talking | paying), 1)
    assert o["customers_engaged"] == len(talking)

    succ = counts["SUCCEEDED"]
    assert Decimal(o["avg_transaction_value"]) == (expected_rev / succ).quantize(Decimal("0.001"))
    assert sum(Decimal(p["revenue"]) for p in analytics.products(db, analytics.Filters())) == expected_rev

    assert audit.verify_chain(db) == (True, None)  # shift_since rewrites created_at, which is not hashed

    # Segment filter must narrow every customer-scoped metric (regression: enrollments/insights ignored it).
    from app.models import Customer, CustomerInsight, Enrollment, EnrollmentStatus

    seg_ids = set(db.scalars(select(Customer.id).where(Customer.segment == "student")))
    fs = analytics.Filters(segment="student")
    so = analytics.overview(db, fs)
    active = db.scalars(select(Enrollment).where(Enrollment.status == EnrollmentStatus.ACTIVE)).all()
    assert so["enrollments"] == sum(1 for e in active if e.customer_id in seg_ids)
    labels = [i.sentiment_label for i in db.scalars(select(CustomerInsight)) if i.customer_id in seg_ids]
    assert sum(analytics.sentiment(db, fs).values()) == len(labels)


def test_money_round_trip_is_exact(db):
    p = Product(
        slug="money-test",
        name="Money",
        category="T",
        summary="s",
        description="d",
        price=Decimal("1890.125"),
        duration_weeks=1,
        level="x",
        target_audience="t",
        seats_total=1,
    )
    db.add(p)
    db.commit()
    assert db.execute(text("SELECT price FROM products WHERE slug='money-test'")).scalar() == 1890125
    with SessionLocal() as fresh:
        got = fresh.scalar(select(Product.price).where(Product.slug == "money-test"))
    assert got == Decimal("1890.125") and str(got) == "1890.125" and isinstance(got, Decimal)


def test_audit_chain_detects_tampering(db):
    cust = new_customer(db)
    for i in range(4):
        audit.record(
            db,
            actor_type="user",
            actor_id="admin@demo.techx",
            action=f"test.{i}",
            resource_type="customer",
            resource_id=cust.id,
            details={"n": i},
        )
    db.commit()
    assert audit.verify_chain(db) == (True, None)
    victim = db.scalars(select(AuditLog.id).order_by(AuditLog.id)).all()[2]
    db.execute(update(AuditLog).where(AuditLog.id == victim).values(details={"n": 999}))
    db.commit()
    db.expire_all()
    assert audit.verify_chain(db) == (False, victim)


def test_audit_scrubs_secrets(db):
    e = audit.record(
        db,
        actor_type="user",
        actor_id="x",
        action="t",
        details={"password": "hunter2", "nested": {"api_key": "sk-1"}, "ok": 1},
    )
    assert e.details == {"password": "[redacted]", "nested": {"api_key": "[redacted]"}, "ok": 1}


def test_forecast_and_feedback_analytics(db):
    from datetime import timedelta

    from conftest import checkout

    from app.agents.finance import _strategy_rules
    from app.db.base import utcnow
    from app.models import CustomerFeedback
    from app.orchestration import orchestrator

    assert analytics.forecast(db)["points"] == []  # no history -> no invented numbers

    conv, _, ps = checkout(db)
    assert orchestrator.process_payment(db, ps, "sim_card_success", "fc-key-001")["status"] == "SUCCEEDED"
    db.commit()
    tx = db.scalar(select(Transaction).where(Transaction.status == TxStatus.SUCCEEDED))
    for days in (3, 9, 15):  # spread history so a trend exists
        db.execute(
            update(Transaction).where(Transaction.id == tx.id).values(created_at=utcnow() - timedelta(days=days))
        )
    db.commit()
    fc = analytics.forecast(db)
    assert len(fc["points"]) == 7 and all(Decimal(p["revenue"]) >= 0 for p in fc["points"])
    assert Decimal(fc["total"]) == sum(Decimal(p["revenue"]) for p in fc["points"])

    for rating, comment in [(2, "Confusing onboarding, too long for my busy schedule"), (5, "Great"), (3, "")]:
        db.add(CustomerFeedback(customer_id=conv.customer_id, conversation_id=conv.id, rating=rating, comment=comment))
    db.commit()
    fb = analytics.feedback(db, analytics.Filters())
    assert fb["count"] == 3 and fb["low_ratings"] == 1 and fb["average"] == 3.33
    assert {"theme": "time_constraints", "count": 1} in fb["themes"]
    rec = next(r for r in _strategy_rules(db) if r.rule_key == "feedback_experience")
    assert any("3.33" in fact for fact in rec.observed_facts)
