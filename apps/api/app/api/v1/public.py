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
from app.db.base import get_db
from app.models import Conversation, Customer, CustomerFeedback, Message, PaymentSession, Product, ProductStatus
from app.orchestration import orchestrator
from app.services import audit, payments

router = APIRouter(prefix="/public", tags=["public"])


def msg_out(m: Message) -> dict:
    safe_meta = {k: v for k, v in (m.meta or {}).items() if k in ("products", "cta", "notice")}
    return {"id": str(m.id), "role": m.role, "content": m.content, "created_at": iso(m.created_at), "meta": safe_meta}


def _conv(db: Session, conv_id: uuid.UUID, token: str | None) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if not conv or not token or not conv.access_token_hash or not secrets.compare_digest(conv.access_token_hash, sha256(token)):
        raise not_found("Conversation")  # same response for wrong token: no enumeration
    return conv


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
    cust = Customer(full_name=(body.full_name or "Guest visitor").strip() or "Guest visitor",
                    email=body.email.lower() if body.email else None, consent_voice=body.consent_voice,
                    segment="individual", is_fictional=True)
    db.add(cust)
    db.flush()
    conv, _, token = orchestrator.start_conversation(db, cust, body.channel)
    audit.record(db, actor_type="customer", actor_id=str(cust.id), action="conversation.started",
                 resource_type="conversation", resource_id=conv.id, ip=request.client.host if request.client else None,
                 details={"channel": body.channel, "consent_voice": body.consent_voice})
    db.commit()
    db.refresh(conv)
    return {"conversation_id": str(conv.id), "access_token": token, "messages": [msg_out(m) for m in conv.messages]}


@router.get("/conversations/{conv_id}")
def get_conv(conv_id: uuid.UUID, x_conversation_token: str | None = Header(None), db: Session = Depends(get_db)):
    conv = _conv(db, conv_id, x_conversation_token)
    return {"conversation_id": str(conv.id), "messages": [msg_out(m) for m in conv.messages]}


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


@router.post("/conversations/{conv_id}/messages")
def post_message(conv_id: uuid.UUID, body: MessageIn, x_conversation_token: str | None = Header(None),
                 db: Session = Depends(get_db)):
    conv = _conv(db, conv_id, x_conversation_token)
    before = {m.id for m in conv.messages}
    orchestrator.handle_customer_message(db, conv, body.content)
    db.commit()
    db.refresh(conv)
    return {"messages": [msg_out(m) for m in conv.messages if m.id not in before]}


class EnrollIn(BaseModel):
    product_id: uuid.UUID


@router.post("/conversations/{conv_id}/enroll")
def enroll(conv_id: uuid.UUID, body: EnrollIn, x_conversation_token: str | None = Header(None),
           db: Session = Depends(get_db)):
    conv = _conv(db, conv_id, x_conversation_token)
    ps = orchestrator.request_enrollment(db, conv, body.product_id)
    db.commit()
    return {"checkout_session_id": str(ps.id)}


def _checkout(db: Session, ps: PaymentSession) -> dict:
    tx = ps.transaction
    p = tx.product
    return {"session_id": str(ps.id), "status": tx.status, "amount": str(ps.amount), "currency": ps.currency,
            "product": {"id": str(p.id), "slug": p.slug, "name": p.name, "price": str(p.price), "currency": p.currency,
                        "duration_weeks": p.duration_weeks, "level": p.level},
            "order_reference": ps.order.reference, "transaction_reference": tx.reference,
            "test_methods": payments.settings_view()["test_methods"], "simulated": True,
            "failure_reason": tx.failure_reason, "expires_at": iso(ps.expires_at)}


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
def pay(session_id: uuid.UUID, body: PayIn, idempotency_key: str = Header(..., min_length=8, max_length=80),
        db: Session = Depends(get_db)):
    ps = db.get(PaymentSession, session_id)
    if not ps:
        raise not_found("Checkout session")
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
    db.add(CustomerFeedback(customer_id=conv.customer_id, conversation_id=conv.id, rating=body.rating,
                            comment=body.comment))
    db.commit()
    return {"ok": True}
