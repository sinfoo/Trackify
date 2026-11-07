"""Deterministic security engine. Works with no LLM; an LLM may only *explain* results.

1. Rules (velocity, repeated failures, duplicates, high value, amount tampering)
2. Statistical anomaly (z-score of the amount vs. historical successful payments)
3. Prompt-injection classifier (pattern rules)
"""

import re
import statistics
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.base import utcnow
from app.models import PaymentAttempt, Product, SecurityEvent, Severity, Transaction, TxStatus
from app.services import audit, events

# ---------------------------------------------------------------- prompt injection

INJECTION_PATTERNS: list[tuple[str, str, float]] = [
    ("override_instructions", r"\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|all|your|system)\b.{0,20}\b(instructions?|rules?|prompts?|polic(y|ies))", 0.9),
    ("override_fr", r"\b(ignore[rz]?|oublie[rz]?)\b.{0,30}\b(instructions?|règles|consignes)", 0.9),
    ("role_hijack", r"\b(you are now|act as|pretend (to be|you are)|from now on you)\b", 0.6),
    ("privilege_escalation", r"\b(i am|i'm)\b.{0,15}\b(admin|administrator|developer|root|manager)\b", 0.5),
    ("prompt_exfiltration", r"\b(reveal|show|print|repeat|leak)\b.{0,30}\b(system prompt|instructions|api[ _-]?key|secret|password|token)", 0.85),
    ("financial_action", r"\b(approve|authori[sz]e|mark)\b.{0,25}\b(payment|transaction|refund)\b|\b(refund me|give me .{0,10}free|set (the )?price|100% discount)\b", 0.8),
    ("jailbreak", r"\b(jailbreak|DAN mode|developer mode|do anything now)\b", 0.9),
    ("markup_injection", r"(<\s*script|</?system>|\[INST\]|<\|im_start\|>)", 0.7),
    ("sql_injection", r"('|\")\s*(or|and)\s+\d+\s*=\s*\d+|;\s*(drop|delete|update)\s+\w+|union\s+select", 0.7),
]
_COMPILED = [(n, re.compile(p, re.I), w) for n, p, w in INJECTION_PATTERNS]


@dataclass
class InjectionVerdict:
    detected: bool
    score: float
    patterns: list[str]


def classify_input(text: str) -> InjectionVerdict:
    hits = [(n, w) for n, rx, w in _COMPILED if rx.search(text)]
    if not hits:
        return InjectionVerdict(False, 0.0, [])
    score = min(1.0, max(w for _, w in hits) + 0.05 * (len(hits) - 1))
    return InjectionVerdict(score >= 0.6, round(score, 2), [n for n, _ in hits])


# ---------------------------------------------------------------- payment risk


@dataclass
class RiskFlag:
    rule: str
    severity: str
    detail: str
    weight: float


@dataclass
class RiskAssessment:
    score: float
    decision: str  # ALLOW | HOLD | BLOCK
    flags: list[RiskFlag] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {"score": self.score, "decision": self.decision,
                "flags": [f.__dict__ for f in self.flags]}


def assess_payment(db: Session, tx: Transaction) -> RiskAssessment:
    s = get_settings()
    now = utcnow()
    flags: list[RiskFlag] = []

    product = db.get(Product, tx.product_id)
    if tx.amount != product.price:
        flags.append(RiskFlag("AMOUNT_TAMPERING", "CRITICAL",
                              f"Amount {tx.amount} differs from catalog price {product.price}", 1.0))

    recent = db.scalar(select(func.count(PaymentAttempt.id)).where(
        PaymentAttempt.customer_id == tx.customer_id,
        PaymentAttempt.created_at >= now - timedelta(minutes=s.velocity_window_minutes)))
    if recent >= s.velocity_max_attempts:
        flags.append(RiskFlag("PAYMENT_VELOCITY", "HIGH",
                              f"{recent} payment attempts in {s.velocity_window_minutes} min", 0.7))

    failed = db.scalar(select(func.count(PaymentAttempt.id)).where(
        PaymentAttempt.customer_id == tx.customer_id, PaymentAttempt.outcome == "FAILED",
        PaymentAttempt.created_at >= now - timedelta(hours=1)))
    if failed >= s.failed_attempts_threshold:
        flags.append(RiskFlag("REPEATED_FAILURES", "HIGH", f"{failed} failed attempts in the last hour", 0.65))

    dup = db.scalar(select(func.count(Transaction.id)).where(
        Transaction.customer_id == tx.customer_id, Transaction.product_id == tx.product_id,
        Transaction.id != tx.id,
        Transaction.status.in_([TxStatus.SUCCEEDED, TxStatus.PROCESSING, TxStatus.REQUIRES_APPROVAL])))
    if dup:
        flags.append(RiskFlag("DUPLICATE_TRANSACTION", "MEDIUM",
                              "Customer already has a paid or in-flight transaction for this offer", 0.5))

    if tx.amount >= s.high_value_threshold:
        flags.append(RiskFlag("HIGH_VALUE", "MEDIUM",
                              f"Amount {tx.amount} ≥ review threshold {s.high_value_threshold}", 0.45))

    amounts = [float(a) for a in db.scalars(
        select(Transaction.amount).where(Transaction.status == TxStatus.SUCCEEDED).limit(500))]
    if len(amounts) >= 10:
        mu, sd = statistics.mean(amounts), statistics.pstdev(amounts)
        if sd > 0:
            z = (float(tx.amount) - mu) / sd
            if z > 3:
                flags.append(RiskFlag("STATISTICAL_OUTLIER", "MEDIUM", f"Amount z-score {z:.1f} vs history", 0.4))

    score = 0.0
    for f in flags:  # noisy-OR combination keeps score in [0,1]
        score = 1 - (1 - score) * (1 - f.weight)
    score = round(score, 2)
    if any(f.severity == "CRITICAL" for f in flags):
        decision = "BLOCK"
    elif any(f.severity == "HIGH" for f in flags) or score >= 0.6:
        decision = "HOLD"
    elif tx.amount >= s.high_value_threshold or any(f.rule == "DUPLICATE_TRANSACTION" for f in flags):
        decision = "HOLD"
    else:
        decision = "ALLOW"
    return RiskAssessment(score, decision, flags)


# ---------------------------------------------------------------- events

RULE_TO_EVENT = {
    "PAYMENT_VELOCITY": ("SUSPICIOUS_PAYMENT_PATTERN", "FRAUD"),
    "REPEATED_FAILURES": ("REPEATED_FAILED_PAYMENTS", "FRAUD"),
    "DUPLICATE_TRANSACTION": ("POTENTIAL_DUPLICATE_TRANSACTION", "FRAUD"),
    "HIGH_VALUE": ("HIGH_VALUE_TRANSACTION", "FRAUD"),
    "AMOUNT_TAMPERING": ("TRANSACTION_TAMPERING", "FRAUD"),
    "STATISTICAL_OUTLIER": ("ANOMALOUS_AMOUNT", "FRAUD"),
}

ACTION_FOR = {"BLOCK": "BLOCK_TRANSACTION", "HOLD": "REQUIRE_HUMAN_REVIEW", "ALLOW": "MONITOR"}


def raise_event(
    db: Session,
    *,
    event_type: str,
    category: str,
    severity: str,
    description: str,
    risk_score: float,
    recommended_action: str,
    detector: str = "rule",
    customer_id=None,
    transaction_id=None,
    agent_id: str | None = "security",
    evidence: dict | None = None,
    workflow_id=None,
) -> SecurityEvent:
    ev = SecurityEvent(event_type=event_type, category=category, severity=Severity(severity), description=description[:500],
                       risk_score=risk_score, recommended_action=recommended_action, detector=detector,
                       customer_id=customer_id, transaction_id=transaction_id, agent_id=agent_id,
                       evidence=evidence or {})
    db.add(ev)
    db.flush()
    audit.record(db, actor_type="agent", actor_id="agent:security", action="security.event_raised",
                 resource_type="security_event", resource_id=ev.id,
                 severity="CRITICAL" if severity in ("HIGH", "CRITICAL") else "WARN",
                 details={"event_type": event_type, "severity": severity})
    events.publish(db, "security.alert", f"[{severity}] {event_type}: {description}", agent_id="security",
                   workflow_id=workflow_id,
                   data={"security_event_id": str(ev.id), "severity": severity, "event_type": event_type})
    return ev


def events_for_assessment(db: Session, tx: Transaction, ra: RiskAssessment, workflow_id=None) -> list[SecurityEvent]:
    out = []
    for f in ra.flags:
        etype, cat = RULE_TO_EVENT[f.rule]
        out.append(raise_event(
            db, event_type=etype, category=cat, severity=f.severity, description=f.detail,
            risk_score=ra.score, recommended_action=ACTION_FOR[ra.decision],
            detector="statistical" if f.rule == "STATISTICAL_OUTLIER" else "rule",
            customer_id=tx.customer_id, transaction_id=tx.id, evidence={"rule": f.rule, "amount": str(tx.amount)},
            workflow_id=workflow_id))
    return out

