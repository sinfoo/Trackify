"""Buyer accounts: a user with the BUYER role owns exactly one customer record.

Guests can chat without an account. Buying needs one: at enrollment (or on "link my conversation")
the guest customer behind the conversation is attached to the signed-in user, or merged into the
customer that user already owns, so the library, receipts and recommendations stay in one place.
"""

import uuid

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.base import Base
from app.models import Customer, User
from app.services import audit

BUYER_PERM = "buyer:self"


def is_buyer(user: User | None) -> bool:
    return bool(user) and BUYER_PERM in user.permission_codes


def require_buyer(user: User | None) -> User:
    if not user:
        raise AppError(401, "BUYER_ACCOUNT_REQUIRED", "Sign in or create a buyer account to enroll.")
    if not is_buyer(user):
        raise AppError(403, "BUYER_ACCOUNT_REQUIRED", "This account cannot buy programs. Create a buyer account.")
    return user


def customer_for(db: Session, user: User) -> Customer:
    """The user's own customer record; created lazily so a fresh account has a library right away."""
    c = db.scalar(select(Customer).where(Customer.user_id == user.id))
    if not c:
        c = Customer(
            full_name=user.full_name,
            email=user.email,
            segment="individual",
            is_fictional=True,
            user_id=user.id,
        )
        db.add(c)
        db.flush()
    return c


def _tables_with_customer_id():
    return [t for t in Base.metadata.sorted_tables if "customer_id" in t.c and t.name != "customers"]


def attach(db: Session, guest: Customer, user: User) -> Customer:
    """Make `guest` (the customer behind a conversation) belong to `user`.

    - guest already owned by this user: nothing to do.
    - guest owned by another account: refuse (a conversation token must not hijack someone else's history).
    - user has no customer yet: adopt the guest record.
    - user already has a customer: move every row that points at the guest, then drop the empty guest.
    """
    if guest.user_id == user.id:
        return guest
    if guest.user_id is not None:
        raise AppError(403, "CONVERSATION_OWNED", "This conversation belongs to another account.")
    mine = db.scalar(select(Customer).where(Customer.user_id == user.id))
    if not mine:
        guest.user_id = user.id
        guest.full_name = user.full_name or guest.full_name
        guest.email = user.email
        db.flush()
        audit.record(
            db,
            actor_type="user",
            actor_id=user.email,
            action="buyer.customer_linked",
            resource_type="customer",
            resource_id=guest.id,
        )
        return guest
    for t in _tables_with_customer_id():
        db.execute(update(t).where(t.c.customer_id == guest.id).values(customer_id=mine.id))
    if mine.journey_stage != "CUSTOMER" and guest.journey_stage == "CUSTOMER":
        mine.journey_stage = "CUSTOMER"
    db.delete(guest)
    db.flush()
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="buyer.customer_merged",
        resource_type="customer",
        resource_id=mine.id,
        details={"merged_from": str(guest.id)},
    )
    return mine


def owns(db: Session, user: User | None, customer_id: uuid.UUID) -> bool:
    if not user:
        return False
    c = db.get(Customer, customer_id)
    return bool(c) and c.user_id == user.id
