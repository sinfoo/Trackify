"""Customer-facing endpoints. Never expose insights, internal reasoning, risk data or other customers."""

import secrets
import uuid

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import iso, offer_out
from app.core.errors import AppError, not_found
from app.core.security import sha256
from app.db.base import get_db, utcnow
from app.models import (
    Conversation,
    Customer,
    CustomerFeedback,
    EnrollmentStatus,
    Message,
    PaymentSession,
    Product,
    ProductStatus,
)
from app.orchestration import orchestrator
from app.services import audit, payments

router = APIRouter(prefix="/public", tags=["public"])


def msg_out(m: Message) -> dict:
    safe_meta = {k: v for k, v in (m.meta or {}).items() if k in ("products", "cta", "notice")}
    return {"id": str(m.id), "role": m.role, "content": m.content, "created_at": iso(m.created_at), "meta": safe_meta}


def journey(db: Session, conv: Conversation) -> dict:
    """Customer-safe journey state so the chat can disable stale Enroll buttons and offer resume."""
    from app.models import Transaction, TxStatus

    enrolled = [str(i) for i in orchestrator.enrolled_product_ids(db, conv.customer_id)]
    open_tx = db.scalars(
        select(Transaction).where(
            Transaction.customer_id == conv.customer_id,
            Transaction.status.in_([TxStatus.PENDING, TxStatus.FAILED, TxStatus.REQUIRES_APPROVAL]),
        )
    )
    checkouts = [
        {
            "product_id": str(t.product_id),
            "product_name": t.product.name,
            "session_id": str(t.session_id),
            "status": t.status,
        }
        for t in open_tx
        if t.session.expires_at > utcnow()
    ]
    return {"enrolled_product_ids": enrolled, "open_checkouts": checkouts}


def _conv(db: Session, conv_id: uuid.UUID, token: str | None) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if (
        not conv
        or not token
        or not conv.access_token_hash
        or not secrets.compare_digest(conv.access_token_hash, sha256(token))
    ):
        raise not_found("Conversation")  # same response for wrong token: no enumeration
    return conv


@router.get("/business")
def business_profile(db: Session = Depends(get_db)):
    """Who the customer is buying from (public, no secrets)."""
    from app.services import business

    row = business.get(db)
    db.commit()
    return business.out(row)


@router.get("/offers")
def offers(db: Session = Depends(get_db)):
    rows = db.scalars(select(Product).where(Product.status == ProductStatus.ACTIVE).order_by(Product.price))
    return [offer_out(p, db) for p in rows]


@router.get("/offers/{slug}")
def offer(slug: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.slug == slug, Product.status == ProductStatus.ACTIVE))
    if not p:
        raise not_found("Offer")
    return offer_out(p, db)


class StartIn(BaseModel):
    full_name: str | None = Field(None, max_length=120)
    email: EmailStr | None = None
    consent_voice: bool = False
    channel: str = Field("text", pattern="^(text|voice)$")


@router.post("/conversations", status_code=201)
def start(body: StartIn, request: Request, db: Session = Depends(get_db)):
    if body.channel == "voice" and not body.consent_voice:
        raise AppError(422, "CONSENT_REQUIRED", "Voice mode requires explicit consent")
    cust = Customer(
        full_name=(body.full_name or "Guest visitor").strip() or "Guest visitor",
        email=body.email.lower() if body.email else None,
        consent_voice=body.consent_voice,
        segment="individual",
        is_fictional=True,
    )
    db.add(cust)
    db.flush()
    conv, _, token = orchestrator.start_conversation(db, cust, body.channel)
    audit.record(
        db,
        actor_type="customer",
        actor_id=str(cust.id),
        action="conversation.started",
        resource_type="conversation",
        resource_id=conv.id,
        ip=request.client.host if request.client else None,
        details={"channel": body.channel, "consent_voice": body.consent_voice},
    )
    db.commit()
    db.refresh(conv)
    return {
        "conversation_id": str(conv.id),
        "access_token": token,
        "messages": [msg_out(m) for m in conv.messages],
        "journey": journey(db, conv),
    }


@router.get("/conversations/{conv_id}")
def get_conv(conv_id: uuid.UUID, x_conversation_token: str | None = Header(None), db: Session = Depends(get_db)):
    conv = _conv(db, conv_id, x_conversation_token)
    return {
        "conversation_id": str(conv.id),
        "messages": [msg_out(m) for m in conv.messages],
        "journey": journey(db, conv),
    }


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


@router.post("/conversations/{conv_id}/messages")
def post_message(
    conv_id: uuid.UUID, body: MessageIn, x_conversation_token: str | None = Header(None), db: Session = Depends(get_db)
):
    conv = _conv(db, conv_id, x_conversation_token)
    before = {m.id for m in conv.messages}
    orchestrator.handle_customer_message(db, conv, body.content)
    db.commit()
    db.refresh(conv)
    return {"messages": [msg_out(m) for m in conv.messages if m.id not in before], "journey": journey(db, conv)}


class EnrollIn(BaseModel):
    product_id: uuid.UUID


@router.post("/conversations/{conv_id}/enroll")
def enroll(
    conv_id: uuid.UUID,
    body: EnrollIn,
    request: Request,
    x_conversation_token: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Buying needs a buyer account: the guest conversation is attached to the signed-in buyer here."""
    from app.core.deps import token_from_request, user_from_token
    from app.services import buyers

    conv = _conv(db, conv_id, x_conversation_token)
    user = buyers.require_buyer(user_from_token(db, token_from_request(request)))
    buyers.attach(db, conv.customer, user)
    db.refresh(conv)
    ps = orchestrator.request_enrollment(db, conv, body.product_id)
    db.commit()
    return {"checkout_session_id": str(ps.id)}


def _checkout(db: Session, ps: PaymentSession) -> dict:
    tx = ps.transaction
    p = tx.product
    return {
        "session_id": str(ps.id),
        "status": tx.status,
        "amount": str(ps.amount),
        "currency": ps.currency,
        "product": {
            "id": str(p.id),
            "slug": p.slug,
            "name": p.name,
            "price": str(p.price),
            "currency": p.currency,
            "duration_weeks": p.duration_weeks,
            "level": p.level,
        },
        "order_reference": ps.order.reference,
        "transaction_reference": tx.reference,
        "test_methods": payments.settings_view()["test_methods"],
        "simulated": True,
        "failure_reason": tx.failure_reason,
        "expires_at": iso(ps.expires_at),
    }


@router.get("/checkout/{session_id}")
def checkout(session_id: uuid.UUID, db: Session = Depends(get_db)):
    # ponytail: session UUID acts as an unguessable capability (like hosted checkout links).
    ps = db.get(PaymentSession, session_id)
    if not ps:
        raise not_found("Checkout session")
    return _checkout(db, ps)


class PayIn(BaseModel):
    payment_method: str = Field(min_length=3, max_length=40)


@router.post("/checkout/{session_id}/pay")
def pay(
    session_id: uuid.UUID,
    body: PayIn,
    request: Request,
    idempotency_key: str = Header(..., min_length=8, max_length=80),
    db: Session = Depends(get_db),
):
    from app.core.deps import token_from_request, user_from_token

    ps = db.get(PaymentSession, session_id)
    if not ps:
        raise not_found("Checkout session")
    owner_id = ps.order.customer.user_id
    if owner_id is not None:  # a buyer's checkout can only be paid by that buyer
        user = user_from_token(db, token_from_request(request))
        if not user:
            raise AppError(401, "BUYER_ACCOUNT_REQUIRED", "Sign in to pay for this order.")
        if user.id != owner_id:
            raise AppError(403, "NOT_YOUR_ORDER", "This checkout belongs to another account.")
    result = orchestrator.process_payment(db, ps, body.payment_method, idempotency_key)
    db.commit()
    return result


class FeedbackIn(BaseModel):
    conversation_id: uuid.UUID
    rating: int = Field(ge=1, le=5)
    comment: str = Field("", max_length=1000)


@router.post("/feedback", status_code=201)
def feedback(body: FeedbackIn, x_conversation_token: str | None = Header(None), db: Session = Depends(get_db)):
    conv = _conv(db, body.conversation_id, x_conversation_token)
    db.add(
        CustomerFeedback(
            customer_id=conv.customer_id, conversation_id=conv.id, rating=body.rating, comment=body.comment
        )
    )
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- buyer hub ("My Trackify")


def _progress(tx, enrollment) -> list[dict]:
    """Buyer-facing progress of one enrollment. Deterministic from statuses; no invented dates."""
    from app.models import TxStatus

    paid = tx is not None and tx.status in (TxStatus.SUCCEEDED, TxStatus.REFUNDED)
    held = tx is not None and tx.status == TxStatus.REQUIRES_APPROVAL
    failed = tx is not None and tx.status in (TxStatus.FAILED, TxStatus.CANCELLED)
    refunded = tx is not None and tx.status == TxStatus.REFUNDED
    seat = enrollment is not None and enrollment.status == EnrollmentStatus.ACTIVE
    steps = [
        {"key": "order", "label": "Order placed", "state": "done"},
        {
            "key": "payment",
            "label": "Payment",
            "state": "done" if paid else "held" if held else "failed" if failed else "pending",
            "detail": (f"{tx.amount} {tx.currency} · {tx.reference}" if tx else None),
        },
        {"key": "seat", "label": "Seat confirmed", "state": "done" if seat else "pending"},
        {
            "key": "welcome",
            "label": "Welcome pack sent",
            "state": "done" if seat else "pending",
            "detail": "Confirmation posted in your conversation (simulated email)" if seat else None,
        },
        {"key": "cohort", "label": "Cohort starts", "state": "upcoming" if seat else "pending"},
    ]
    if refunded:
        steps.append({"key": "refund", "label": "Refunded", "state": "done"})
    return steps


@router.get("/conversations/{conv_id}/account")
def account(conv_id: uuid.UUID, x_conversation_token: str | None = Header(None), db: Session = Depends(get_db)):
    """Everything the buyer may see about their own journey: recommendations, enrollments, receipts, progress."""
    from app.models import Enrollment, Order, Transaction, TxStatus

    conv = _conv(db, conv_id, x_conversation_token)
    cust = conv.customer

    # Programs the assistant recommended in this conversation (latest first, de-duplicated).
    seen: dict[str, dict] = {}
    for m in reversed(conv.messages):
        if m.role != "agent":
            continue
        meta = m.meta or {}
        cta = meta.get("cta") or {}
        for c in meta.get("products") or []:
            if c["id"] not in seen:
                seen[c["id"]] = {
                    "product_id": c["id"],
                    "slug": c["slug"],
                    "recommended_at": iso(m.created_at),
                    "pitched": cta.get("product_id") == c["id"],
                }
    products = {str(p.id): p for p in db.scalars(select(Product).where(Product.status == ProductStatus.ACTIVE))}
    recommended = [
        offer_out(products[pid], db) | {"recommended_at": r["recommended_at"], "pitched": r["pitched"]}
        for pid, r in seen.items()
        if pid in products
    ]

    orders = list(db.scalars(select(Order).where(Order.customer_id == cust.id).order_by(Order.created_at.desc())))
    txs = {t.order_id: t for t in db.scalars(select(Transaction).where(Transaction.customer_id == cust.id))}
    enrs = {e.order_id: e for e in db.scalars(select(Enrollment).where(Enrollment.customer_id == cust.id))}
    enrollments = []
    for o in orders:
        tx, enr = txs.get(o.id), enrs.get(o.id)
        item = o.items[0] if o.items else None
        p = item.product if item else None
        enrollments.append(
            {
                "order_id": str(o.id),
                "order_reference": o.reference,
                "order_status": o.status,
                "created_at": iso(o.created_at),
                "product": {
                    "id": str(p.id),
                    "slug": p.slug,
                    "name": p.name,
                    "duration_weeks": p.duration_weeks,
                    "level": p.level,
                    "category": p.category,
                }
                if p
                else None,
                "amount": str(o.total),
                "currency": o.currency,
                "enrollment_status": enr.status if enr else None,
                "payment": {
                    "transaction_reference": tx.reference,
                    "status": tx.status,
                    "method": tx.payment_method,
                    "paid_at": iso(tx.completed_at) if tx.status in (TxStatus.SUCCEEDED, TxStatus.REFUNDED) else None,
                    "failure_reason": tx.failure_reason,
                    "session_id": str(tx.session_id),
                    "checkout_open": tx.status in (TxStatus.PENDING, TxStatus.FAILED, TxStatus.REQUIRES_APPROVAL)
                    and tx.session.expires_at > utcnow(),
                }
                if tx
                else None,
                "progress": _progress(tx, enr),
            }
        )
    return {
        "customer": {"full_name": cust.full_name, "email": cust.email},
        "recommended": recommended,
        "enrollments": enrollments,
        "journey": journey(db, conv),
    }
