"""The signed-in buyer's own space: library, orders and receipts, recommendations, seller switch."""

import uuid

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import iso, offer_out
from app.api.v1.public import _conv, _progress, journey
from app.core.deps import current_user, require
from app.db.base import get_db, utcnow
from app.models import Conversation, Enrollment, Order, Product, ProductStatus, Transaction, TxStatus, User
from app.services import buyers

router = APIRouter(prefix="/me", tags=["me"])

SELLER_PERMS = {"products:write", "approvals:decide", "payments:read", "analytics:read", "security:read", "users:write"}


def seller_flags(user: User) -> dict:
    perms = user.permission_codes
    return {
        "is_buyer": buyers.BUYER_PERM in perms,
        "is_seller": bool(perms & SELLER_PERMS),
        "roles": user.role_names,
    }


@router.get("/account")
def account(db: Session = Depends(get_db), user: User = Depends(require(buyers.BUYER_PERM))):
    cust = buyers.customer_for(db, user)
    convs = list(db.scalars(select(Conversation).where(Conversation.customer_id == cust.id)))
    seen: dict[str, dict] = {}
    for conv in sorted(convs, key=lambda c: c.created_at, reverse=True):
        for m in reversed(conv.messages):
            if m.role != "agent":
                continue
            meta = m.meta or {}
            cta = meta.get("cta") or {}
            for c in meta.get("products") or []:
                if c["id"] not in seen:
                    seen[c["id"]] = {
                        "recommended_at": iso(m.created_at),
                        "pitched": cta.get("product_id") == c["id"],
                        "conversation_id": str(conv.id),
                    }
    products = {str(p.id): p for p in db.scalars(select(Product).where(Product.status == ProductStatus.ACTIVE))}
    recommended = [offer_out(products[pid], db) | r for pid, r in seen.items() if pid in products]

    orders = list(db.scalars(select(Order).where(Order.customer_id == cust.id).order_by(Order.created_at.desc())))
    txs = {t.order_id: t for t in db.scalars(select(Transaction).where(Transaction.customer_id == cust.id))}
    enrs = {e.order_id: e for e in db.scalars(select(Enrollment).where(Enrollment.customer_id == cust.id))}
    items = []
    for o in orders:
        tx, enr = txs.get(o.id), enrs.get(o.id)
        item = o.items[0] if o.items else None
        p = item.product if item else None
        items.append(
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
                    "summary": p.summary,
                    "learning_outcomes": p.learning_outcomes,
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
    library = [i for i in items if i["enrollment_status"] == "ACTIVE"]
    arriving = [
        i for i in items if i["payment"] and i["payment"]["status"] in ("PENDING", "REQUIRES_APPROVAL", "PROCESSING")
    ]
    db.commit()
    return {
        "user": {"id": str(user.id), "full_name": user.full_name, "email": user.email, **seller_flags(user)},
        "customer": {"id": str(cust.id), "full_name": cust.full_name, "email": cust.email},
        "recommended": recommended,
        "library": library,
        "arriving": arriving,
        "orders": items,
        "conversations": [{"id": str(c.id), "created_at": iso(c.created_at), "summary": c.summary} for c in convs],
        "journey": journey(db, convs[0]) if convs else {"enrolled_product_ids": [], "open_checkouts": []},
    }


class LinkIn(BaseModel):
    conversation_id: uuid.UUID
    access_token: str = Field(min_length=10, max_length=200)


@router.post("/link-conversation")
def link_conversation(body: LinkIn, db: Session = Depends(get_db), user: User = Depends(require(buyers.BUYER_PERM))):
    """Attach a guest conversation (started before signing in) to this account."""
    conv = _conv(db, body.conversation_id, body.access_token)
    cust = buyers.attach(db, conv.customer, user)
    db.commit()
    return {"ok": True, "customer_id": str(cust.id)}


@router.get("/flags")
def flags(request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return seller_flags(user)
