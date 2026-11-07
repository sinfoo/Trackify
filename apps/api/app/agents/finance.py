"""Payment Agent, Financial Data Analyst, Business Strategy Agent, Security & Fraud Agent."""

import uuid
from datetime import timedelta
from decimal import Decimal

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.agents.base import AgentContext
from app.db.base import utcnow
from app.llm import providers as llm
from app.models import (
    AnalyticsSnapshot,
    BusinessRecommendation,
    Customer,
    Product,
    SecurityEvent,
    Transaction,
    TxStatus,
)
from app.services import analytics, approvals, payments, risk

# ================================================================ Payment Agent


def payment_run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    task = payload["task"]
    if task == "create_session":
        customer = db.get(Customer, uuid.UUID(payload["customer_id"]))
        product = db.get(Product, uuid.UUID(payload["product_id"]))
        order, _ = ctx.use("order.create", payments.create_order, db, customer, product, payload.get("conversation_id"))
        ps = ctx.use("payment.create_session", payments.create_session, db, order, payload["idempotency_key"])
        tx = ps.transaction
        return (
            f"session for {order.reference}: {tx.amount} {tx.currency} (price verified server-side)",
            {
                "order_id": str(order.id),
                "session_id": str(ps.id),
                "transaction_id": str(tx.id),
                "amount": str(tx.amount),
                "status": tx.status,
            },
        )

    tx = db.get(Transaction, uuid.UUID(payload["transaction_id"]))
    if task == "process":
        decision = payload["risk_decision"]
        method, key = payload["payment_method"], payload["idempotency_key"]
        if decision == "BLOCK":
            payments.record_attempt(db, tx, method, key, "BLOCKED", "blocked by security policy")
            ctx.use("payment.process", payments.cancel, db, tx, "agent:payment", "blocked by security agent")
            return "payment blocked by security policy", {"status": tx.status, "outcome": "BLOCKED"}
        if decision == "HOLD":
            payments.record_attempt(db, tx, method, key, "HELD", "held for human review")
            tx.payment_method = method
            ctx.use(
                "payment.process",
                payments.transition,
                db,
                tx,
                TxStatus.REQUIRES_APPROVAL,
                "agent:payment",
                "held: security review required",
            )
            ar = ctx.use(
                "approval.request",
                approvals.request,
                db,
                action="RELEASE_PAYMENT",
                reason=payload.get("reason", "Security hold"),
                requested_by_agent="payment",
                customer_id=tx.customer_id,
                transaction_id=tx.id,
                risk_score=tx.risk_score,
                risk_flags=tx.risk_flags,
                payload={"payment_method": method},
                security_event_id=uuid.UUID(payload["security_event_id"]) if payload.get("security_event_id") else None,
                workflow_id=ctx.workflow_id,
            )
            return "payment held; human approval requested", {
                "status": tx.status,
                "outcome": "HELD",
                "approval_id": str(ar.id),
            }
        status = ctx.use("payment.process", payments.execute_provider, db, tx, method, "agent:payment")
        payments.record_attempt(db, tx, method, key, status.value, tx.failure_reason)
        return (
            f"{tx.reference} {status.value.lower()}" + (f" ({tx.failure_reason})" if tx.failure_reason else ""),
            {"status": tx.status, "outcome": status.value, "failure_reason": tx.failure_reason},
        )

    if task == "release":  # executes after a HUMAN approved; actor is that human
        method = payload["payment_method"]
        status = ctx.use("payment.process", payments.execute_provider, db, tx, method, payload["approved_by"])
        payments.record_attempt(
            db, tx, method, f"release:{tx.id}:{payload['approval_id']}", status.value, tx.failure_reason
        )
        return f"released by human; {status.value.lower()}", {"status": tx.status, "outcome": status.value}
    raise ValueError(f"unknown payment task {task}")


# ================================================================ Financial Data Analyst


def analyst_run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    now = utcnow()
    f_all = analytics.Filters()
    cur = analytics.Filters(date_from=now - timedelta(days=7), date_to=now)
    prev = analytics.Filters(date_from=now - timedelta(days=14), date_to=now - timedelta(days=7))
    m = ctx.use("analytics.read", analytics.overview, db, f_all)
    r_cur = ctx.use("analytics.read", analytics.revenue, db, cur)
    r_prev = ctx.use("analytics.read", analytics.revenue, db, prev)
    change = None if r_prev == 0 else round(float((r_cur - r_prev) / r_prev * 100), 1)
    failed, succ = m["payments"]["FAILED"], m["payments"]["SUCCEEDED"]
    fail_rate = round(100 * failed / (failed + succ), 1) if failed + succ else 0.0
    anomalies = []
    if change is not None and abs(change) >= 30:
        anomalies.append(f"7-day revenue {'up' if change > 0 else 'down'} {abs(change)}% vs previous week")
    if fail_rate >= 25:
        anomalies.append(f"payment failure rate {fail_rate}% is above 25%")

    narrative = (
        f"Simulated revenue {Decimal(m['revenue']):,.3f} TND from {succ} successful payments "
        f"(avg {m['avg_transaction_value']} TND). Conversion {m['conversion_rate']}% across "
        f"{m['customers_engaged']} engaged customers. Last 7 days: {r_cur:,.3f} TND"
        f"{f' ({change:+}% vs prior week)' if change is not None else ''}. "
        f"Failure rate {fail_rate}%; {m['pending_payments']} payment(s) pending."
    )
    cfg = ctx.config
    try:
        res = llm.complete(
            "You explain financial KPIs. Use ONLY the numbers in METRICS, never invent figures. Max 70 words.",
            [{"role": "user", "content": f"METRICS: {narrative} ANOMALIES: {anomalies}"}],
            provider=cfg.provider,
            model=cfg.model,
            max_tokens=250,
        )
        if res.text.strip():
            narrative = narrative + "\n\nAnalyst note: " + res.text.strip()[:600]
            ctx.provider, ctx.tokens_in, ctx.tokens_out = res.provider, res.tokens_in, res.tokens_out
    except llm.LLMUnavailable:
        pass

    metrics = {
        k: m[k]
        for k in (
            "revenue",
            "conversion_rate",
            "avg_transaction_value",
            "interactions",
            "interested_customers",
            "enrollments",
            "pending_payments",
            "security_alerts",
        )
    }
    metrics |= {
        "payments": m["payments"],
        "revenue_7d": str(r_cur),
        "revenue_prev_7d": str(r_prev),
        "revenue_change_pct": change,
        "failure_rate": fail_rate,
        "anomalies": anomalies,
    }
    snap = ctx.use(
        "snapshot.write",
        lambda: _add(
            db, AnalyticsSnapshot(metrics=metrics, narrative=narrative, trigger=payload.get("trigger", "manual"))
        ),
    )
    from app.services import events

    events.publish(
        db,
        "analytics.updated",
        f"KPIs recomputed: revenue {m['revenue']} TND, conversion {m['conversion_rate']}%",
        agent_id="analyst",
        workflow_id=ctx.workflow_id,
        data={"snapshot_id": str(snap.id)},
    )
    return f"revenue {m['revenue']} TND · conversion {m['conversion_rate']}% · {len(anomalies)} anomaly(ies)", metrics


def _add(db, obj):
    db.add(obj)
    db.flush()
    return obj


# ================================================================ Business Strategy Agent


class Rec(BaseModel):
    rule_key: str
    title: str
    description: str
    category: str
    observed_facts: list[str]
    hypothesis: str
    metrics: dict
    expected_impact: str
    priority: str
    confidence: float = Field(ge=0, le=1)
    suggested_action: str
    requires_approval: bool = False


def _strategy_rules(db) -> list[Rec]:
    f = analytics.Filters()
    o = analytics.overview(db, f)
    objs = analytics.objections(db, f)
    prods = analytics.products(db, f)
    recs: list[Rec] = []
    share = {x["objection"]: x for x in objs}

    if "price" in share and share["price"]["share"] >= 20:
        x = share["price"]
        recs.append(
            Rec(
                rule_key="pricing_experiment",
                category="PRICING",
                priority="HIGH",
                title="Test an instalment-first price presentation",
                description="Price is the most frequent objection. Lead with the 3-instalment plan and run an A/B test "
                "on an early-bird price for the most objected offer.",
                observed_facts=[
                    f"Price objections: {x['count']} ({x['share']}% of all objections)",
                    f"Conversion rate: {o['conversion_rate']}%",
                ],
                hypothesis="Customers perceive the upfront amount as high; framing per-month cost may lift conversion.",
                metrics={
                    "price_objections": x["count"],
                    "price_share_pct": x["share"],
                    "conversion_rate": o["conversion_rate"],
                },
                expected_impact="+3 to +6 pts conversion on price-sensitive leads (hypothesis, to validate by A/B test)",
                confidence=0.62,
                suggested_action="Approve a 2-week A/B test of a 10% early-bird price on one offer.",
                requires_approval=True,
            )
        )
    for key, label, act in (
        ("time_constraints", "Promote the evening/weekend cohort", "Add schedule details to the sales script opener."),
        (
            "trust",
            "Put proof up front: instructors, alumni, certificate",
            "Add 2 alumni stories and the certificate sample to offer pages.",
        ),
        ("technical_difficulty", "Offer a free placement quiz", "Route hesitant beginners to the Intro course first."),
        (
            "missing_information",
            "Send the syllabus proactively",
            "Sales agent shares syllabus link in the first answer.",
        ),
    ):
        if key in share and share[key]["count"] >= 2:
            x = share[key]
            recs.append(
                Rec(
                    rule_key=f"script_{key}",
                    category="SCRIPT",
                    priority="MEDIUM",
                    title=label,
                    description=f"'{key.replace('_', ' ')}' objections appear in {x['count']} conversations.",
                    observed_facts=[f"{key}: {x['count']} conversations ({x['share']}% of objections)"],
                    hypothesis="Addressing this concern earlier in the script should reduce drop-off.",
                    metrics={"count": x["count"], "share_pct": x["share"]},
                    expected_impact="Fewer stalled conversations at consideration stage",
                    confidence=0.55,
                    suggested_action=act,
                )
            )

    succ, failed = o["payments"]["SUCCEEDED"], o["payments"]["FAILED"]
    if failed and failed / max(1, succ + failed) >= 0.2:
        rate = round(100 * failed / (succ + failed), 1)
        recs.append(
            Rec(
                rule_key="checkout_recovery",
                category="JOURNEY",
                priority="HIGH",
                title="Recover failed checkouts automatically",
                description="A large share of payments fail. Trigger a follow-up message with alternative test methods "
                "and a retry link within 10 minutes.",
                observed_facts=[f"{failed} failed vs {succ} succeeded payments ({rate}% failure rate)"],
                hypothesis="Many failures are recoverable (insufficient funds, declined) with a second method.",
                metrics={"failed": failed, "succeeded": succ, "failure_rate_pct": rate},
                expected_impact="Recover 20-30% of failed payments (hypothesis)",
                confidence=0.58,
                suggested_action="Enable automatic recovery message from the Sales agent after a FAILED payment.",
            )
        )

    sold = [p for p in prods if p["status"] == "ACTIVE"]
    if len(sold) >= 3:
        weakest = min(sold, key=lambda p: (p["sales"], Decimal(p["revenue"])))
        best = max(sold, key=lambda p: Decimal(p["revenue"]))
        if weakest["product_id"] != best["product_id"]:
            recs.append(
                Rec(
                    rule_key="underperforming_offer",
                    category="OFFER",
                    priority="MEDIUM",
                    title=f"Rework the '{weakest['name']}' offer",
                    description=f"'{weakest['name']}' has the fewest sales. Bundle it with '{best['name']}' or refresh "
                    "its outcomes and target audience.",
                    observed_facts=[
                        f"{weakest['name']}: {weakest['sales']} sales, {weakest['revenue']} TND",
                        f"{best['name']}: {best['sales']} sales, {best['revenue']} TND",
                    ],
                    hypothesis="Positioning, not demand, limits this offer; a bundle can borrow demand from the best seller.",
                    metrics={"weak_sales": weakest["sales"], "best_sales": best["sales"]},
                    expected_impact="+2 to +4 sales/month on the weak offer (hypothesis)",
                    confidence=0.48,
                    suggested_action="Draft a bundle offer for admin review (no price change without approval).",
                    requires_approval=True,
                )
            )

    if o["interested_customers"] > 0 and o["conversion_rate"] < 40:
        gap = o["interested_customers"] - round(o["customers_engaged"] * o["conversion_rate"] / 100)
        recs.append(
            Rec(
                rule_key="retention_followup",
                category="RETENTION",
                priority="MEDIUM",
                title="Follow up with interested but unconverted leads",
                description="Several high-intent customers did not pay. Schedule a personalised follow-up based on "
                "their top objection.",
                observed_facts=[
                    f"{o['interested_customers']} interested customers",
                    f"Conversion {o['conversion_rate']}%",
                ],
                hypothesis="A timely, objection-specific follow-up converts part of the warm pipeline.",
                metrics={"interested": o["interested_customers"], "approx_unconverted": max(gap, 0)},
                expected_impact="Convert 10-15% of the warm pipeline (hypothesis)",
                confidence=0.5,
                suggested_action="Generate follow-up drafts per customer from the intelligence summaries.",
            )
        )
    return recs


def strategy_run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    recs = ctx.use("analytics.read", _strategy_rules, db)
    cfg = ctx.config
    for r in recs:
        try:
            res = llm.complete(
                "Rewrite this hypothesis in one sharper sentence. Do not add numbers that are not given.",
                [{"role": "user", "content": f"FACTS: {r.observed_facts}\nHYPOTHESIS: {r.hypothesis}"}],
                provider=cfg.provider,
                model=cfg.model,
                max_tokens=150,
            )
            if res.text.strip():
                r.hypothesis = res.text.strip()[:500]
                ctx.provider = res.provider
                ctx.tokens_in += res.tokens_in
                ctx.tokens_out += res.tokens_out
        except llm.LLMUnavailable:
            break

    def _write():
        active = {
            o.rule_key: o
            for o in db.scalars(select(BusinessRecommendation).where(BusinessRecommendation.status == "ACTIVE"))
        }
        rows = []
        for r in recs:
            old = active.get(r.rule_key)
            if old and old.metrics == r.metrics and old.title == r.title:
                rows.append(old)  # evidence unchanged: keep the existing recommendation
                continue
            if old:
                old.status = "SUPERSEDED"
            row = BusinessRecommendation(**r.model_dump(), source=ctx.provider)
            db.add(row)
            rows.append(row)
        db.flush()
        return rows

    rows = ctx.use("recommendation.write", _write)
    return f"{len(rows)} recommendation(s) generated", {
        "recommendation_ids": [str(r.id) for r in rows],
        "titles": [r.title for r in rows],
    }


# ================================================================ Security & Fraud Agent


def security_run(ctx: AgentContext, payload: dict) -> tuple[str, dict]:
    db = ctx.db
    task = payload["task"]
    if task == "screen_message":
        v = ctx.use("security.scan", risk.classify_input, payload["text"])
        out = {"detected": v.detected, "score": v.score, "patterns": v.patterns}
        if v.detected:
            ev = ctx.use(
                "security.raise",
                risk.raise_event,
                db,
                event_type="PROMPT_INJECTION_ATTEMPT",
                category="PROMPT_INJECTION",
                severity="HIGH",
                description=f"Customer message matched injection patterns: {', '.join(v.patterns)}",
                risk_score=v.score,
                recommended_action="BLOCK_INSTRUCTION_KEEP_PERMISSIONS",
                customer_id=payload.get("customer_id"),
                evidence={"patterns": v.patterns, "excerpt": payload["text"][:160]},
                workflow_id=ctx.workflow_id,
            )
            out["security_event_id"] = str(ev.id)
            return f"injection detected ({v.score}) → neutralised, permissions unchanged", out
        return "input clean", out

    if task == "assess_payment":
        tx = db.get(Transaction, uuid.UUID(payload["transaction_id"]))
        ra = ctx.use("security.assess", risk.assess_payment, db, tx)
        tx.risk_score, tx.risk_flags = ra.score, [f.rule for f in ra.flags]
        evs = ctx.use("security.raise", risk.events_for_assessment, db, tx, ra, ctx.workflow_id) if ra.flags else []
        out = ra.as_dict() | {"security_event_ids": [str(e.id) for e in evs]}
        return f"risk {ra.score} → {ra.decision}" + (f" ({', '.join(tx.risk_flags)})" if ra.flags else ""), out

    if task == "explain":
        ev = db.get(SecurityEvent, uuid.UUID(payload["security_event_id"]))
        text = (
            f"Rule-based detector raised {ev.event_type} ({ev.severity}). {ev.description}. "
            f"Recommended action: {ev.recommended_action.replace('_', ' ').lower()}. "
            "The decision is enforced by deterministic rules; this explanation cannot change it."
        )
        cfg = ctx.config
        try:
            res = llm.complete(
                SPEC_SECURITY_PROMPT,
                [
                    {
                        "role": "user",
                        "content": llm.wrap_untrusted(
                            "alert", f"{ev.event_type} {ev.severity} {ev.description} evidence={ev.evidence}"
                        ),
                    }
                ],
                provider=cfg.provider,
                model=cfg.model,
                max_tokens=200,
            )
            text = res.text.strip()[:800] or text
            ctx.provider = res.provider
        except llm.LLMUnavailable:
            pass
        ev.explanation = text
        return "alert explained", {"explanation": text}
    raise ValueError(f"unknown security task {task}")


SPEC_SECURITY_PROMPT = "You explain security alerts for analysts in 2 sentences. Never change the decision."
