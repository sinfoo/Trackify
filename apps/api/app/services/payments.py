"""Simulated payments: explicit state machine, server-side pricing, idempotency.

There is no live provider. Payment methods are fictional tokens; no card data exists.
"""

import secrets
import string
import uuid
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, conflict, not_found
from app.db.base import utcnow
from app.models import (
    Customer,
    Enrollment,
    EnrollmentStatus,
    Order,
    OrderItem,
    OrderStatus,
    PaymentAttempt,
    PaymentSession,
    Product,
    ProductStatus,
    Refund,
    Transaction,
    TransactionStatusChange,
    TxStatus,
)
from app.services import audit, events

S = TxStatus
TRANSITIONS: dict[TxStatus, set[TxStatus]] = {
    S.CREATED: {S.PENDING, S.CANCELLED},
    S.PENDING: {S.PROCESSING, S.REQUIRES_APPROVAL, S.CANCELLED},
    S.REQUIRES_APPROVAL: {S.PROCESSING, S.CANCELLED},
    S.PROCESSING: {S.SUCCEEDED, S.FAILED},
    S.FAILED: {S.PROCESSING, S.REQUIRES_APPROVAL, S.CANCELLED},
    S.SUCCEEDED: {S.REFUNDED},
    S.CANCELLED: set(),
    S.REFUNDED: set(),
}
# Transitions only a human (actor "user:...") may perform.
HUMAN_ONLY = {(S.REQUIRES_APPROVAL, S.PROCESSING), (S.REQUIRES_APPROVAL, S.CANCELLED), (S.SUCCEEDED, S.REFUNDED)}

# Fictional test methods. Outcome is deterministic per token.
TEST_METHODS: dict[str, dict] = {
    "sim_card_success": {"label": "Test card · always succeeds", "outcome": "SUCCEEDED"},
    "sim_wallet_success": {"label": "Test e-wallet · always succeeds", "outcome": "SUCCEEDED"},
    "sim_card_declined": {"label": "Test card · declined", "outcome": "FAILED", "reason": "card_declined"},
    "sim_insufficient_funds": {"label": "Test card · insufficient funds", "outcome": "FAILED", "reason": "insufficient_funds"},
    "sim_provider_error": {"label": "Test card · provider error", "outcome": "FAILED", "reason": "provider_unavailable"},
}


def _ref(prefix: str, n: int = 8) -> str:
    return prefix + "-" + "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(n))


class InvalidTransition(AppError):
    def __init__(self, frm: TxStatus, to: TxStatus, why: str = "not allowed"):
        super().__init__(409, "INVALID_TRANSITION", f"Transaction cannot move {frm} -> {to}: {why}")


def transition(db: Session, tx: Transaction, to: TxStatus, actor: str, reason: str = "") -> None:
    frm = tx.status
    if to not in TRANSITIONS[frm]:
        raise InvalidTransition(frm, to)
    if (frm, to) in HUMAN_ONLY and not actor.startswith("user:"):
        audit.record(db, actor_type="agent", actor_id=actor, action="payment.transition_denied",
                     resource_type="transaction", resource_id=tx.id, severity="CRITICAL", outcome="DENIED",
                     details={"from": frm, "to": to})
        raise InvalidTransition(frm, to, "requires human approval")
    tx.status = to
    if to in (S.SUCCEEDED, S.FAILED, S.CANCELLED, S.REFUNDED):
        tx.completed_at = utcnow()
    db.add(TransactionStatusChange(transaction_id=tx.id, from_status=frm, to_status=to, actor=actor, reason=reason[:300]))
    actor_type = "user" if actor.startswith("user:") else "agent"
    audit.record(db, actor_type=actor_type, actor_id=actor, action="payment.status_changed",
                 resource_type="transaction", resource_id=tx.id, details={"from": frm, "to": to, "reason": reason})
    events.publish(db, "payment.updated", f"{tx.reference}: {frm} → {to}", agent_id="payment",
                   data={"transaction_id": str(tx.id), "from": frm, "to": to, "reference": tx.reference})
    db.flush()


def seats_taken(db: Session, product_id) -> int:
    return db.scalar(
        select(func.count(Enrollment.id)).where(
            Enrollment.product_id == product_id, Enrollment.status == EnrollmentStatus.ACTIVE
        )
    ) or 0


def create_order(db: Session, customer: Customer, product: Product, conversation_id=None) -> tuple[Order, Enrollment]:
    if product.status != ProductStatus.ACTIVE:
        raise conflict("PRODUCT_UNAVAILABLE", "This offer is not available for enrollment")
    taken = seats_taken(db, product.id)
    if taken >= product.seats_total:
        raise conflict("SOLD_OUT", "No seats left for this offer")
    order = Order(reference=_ref("ORD", 6), customer_id=customer.id, conversation_id=conversation_id,
                  total=product.price, currency=product.currency)
    order.items.append(OrderItem(product_id=product.id, quantity=1, unit_price=product.price))
    db.add(order)
    db.flush()
    enr = Enrollment(customer_id=customer.id, product_id=product.id, order_id=order.id)
    db.add(enr)
    db.flush()
    return order, enr


def create_session(db: Session, order: Order, idempotency_key: str, actor: str = "agent:payment") -> PaymentSession:
    existing = db.scalar(select(PaymentSession).where(PaymentSession.idempotency_key == idempotency_key))
    if existing:
        if existing.order_id != order.id:
            raise conflict("IDEMPOTENCY_KEY_REUSED", "Idempotency key already used for a different order")
        return existing
    if order.status != OrderStatus.PENDING_PAYMENT:
        raise conflict("ORDER_NOT_PAYABLE", f"Order is {order.status}")
    # Server-side price verification: recompute from catalog, never trust a client amount.
    amount = sum((i.product.price * i.quantity for i in order.items), Decimal("0"))
    if amount != order.total:
        raise conflict("PRICE_MISMATCH", "Order total no longer matches catalog price")
    product = order.items[0].product
    ps = PaymentSession(order_id=order.id, idempotency_key=idempotency_key, amount=amount,
                        currency=order.currency, expires_at=utcnow() + timedelta(hours=1))
    db.add(ps)
    db.flush()
    tx = Transaction(reference=_ref("TXN"), session_id=ps.id, order_id=order.id, customer_id=order.customer_id,
                     product_id=product.id, amount=amount, currency=order.currency, status=S.CREATED)
    db.add(tx)
    db.flush()
    db.add(TransactionStatusChange(transaction_id=tx.id, from_status=None, to_status=S.CREATED, actor=actor,
                                   reason="session created"))
    transition(db, tx, S.PENDING, actor, "awaiting customer payment")
    events.publish(db, "payment.created", f"Payment session {tx.reference} for {amount} {order.currency}",
                   agent_id="payment", data={"transaction_id": str(tx.id), "session_id": str(ps.id)})
    db.refresh(ps)
    return ps


def find_attempt(db: Session, key: str) -> PaymentAttempt | None:
    return db.scalar(select(PaymentAttempt).where(PaymentAttempt.idempotency_key == key))


def record_attempt(db: Session, tx: Transaction, method: str, key: str, outcome: str, reason: str | None = None) -> PaymentAttempt:
    a = PaymentAttempt(transaction_id=tx.id, customer_id=tx.customer_id, idempotency_key=key, payment_method=method,
                       amount=tx.amount, outcome=outcome, failure_reason=reason,
                       provider_reference=_ref("SIM", 10) if outcome in ("SUCCEEDED", "FAILED") else None)
    db.add(a)
    db.flush()
    audit.record(db, actor_type="agent", actor_id="agent:payment", action="payment.attempt",
                 resource_type="transaction", resource_id=tx.id,
                 severity="INFO" if outcome == "SUCCEEDED" else "WARN",
                 outcome=outcome, details={"method": method, "reason": reason})
    return a


def execute_provider(db: Session, tx: Transaction, method: str, actor: str) -> TxStatus:
    """Run the simulated provider. tx must be PENDING/FAILED (agent) or REQUIRES_APPROVAL (human release)."""
    spec = TEST_METHODS.get(method)
    if not spec:
        raise AppError(422, "UNKNOWN_TEST_METHOD", "Unknown simulated payment method")
    transition(db, tx, S.PROCESSING, actor, f"processing with {method}")
    tx.payment_method = method
    if spec["outcome"] == "SUCCEEDED":
        transition(db, tx, S.SUCCEEDED, "agent:payment", "simulated provider approved")
        tx.failure_reason = None
        order = db.get(Order, tx.order_id)
        order.status = OrderStatus.PAID
        for e in db.scalars(select(Enrollment).where(Enrollment.order_id == order.id)):
            e.status = EnrollmentStatus.ACTIVE
        cust = db.get(Customer, tx.customer_id)
        cust.journey_stage = "CUSTOMER"
    else:
        tx.failure_reason = spec["reason"]
        transition(db, tx, S.FAILED, "agent:payment", f"simulated provider declined: {spec['reason']}")
    db.flush()
    return tx.status


def cancel(db: Session, tx: Transaction, actor: str, reason: str) -> None:
    transition(db, tx, S.CANCELLED, actor, reason)
    order = db.get(Order, tx.order_id)
    order.status = OrderStatus.CANCELLED
    for e in db.scalars(select(Enrollment).where(Enrollment.order_id == order.id)):
        e.status = EnrollmentStatus.CANCELLED


def complete_refund(db: Session, refund: Refund, actor: str) -> None:
    tx = db.get(Transaction, refund.transaction_id)
    transition(db, tx, S.REFUNDED, actor, f"refund approved: {refund.reason}")
    refund.status = "COMPLETED"
    refund.completed_at = utcnow()
    order = db.get(Order, tx.order_id)
    order.status = OrderStatus.REFUNDED
    for e in db.scalars(select(Enrollment).where(Enrollment.order_id == order.id)):
        e.status = EnrollmentStatus.CANCELLED


def get_tx(db: Session, tx_id: uuid.UUID) -> Transaction:
    tx = db.get(Transaction, tx_id)
    if not tx:
        raise not_found("Transaction")
    return tx


def settings_view() -> dict:
    s = get_settings()
    return {
        "provider": s.payment_provider,
        "live_mode": False,
        "currency": s.currency,
        "high_value_threshold": str(s.high_value_threshold),
        "velocity_max_attempts": s.velocity_max_attempts,
        "velocity_window_minutes": s.velocity_window_minutes,
        "failed_attempts_threshold": s.failed_attempts_threshold,
        "test_methods": [{"id": k, "label": v["label"]} for k, v in TEST_METHODS.items()],
    }
