import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, enrollment_out, iso, order_out
from app.core.deps import require
from app.core.errors import not_found
from app.db.base import get_db
from app.models import (
    Customer,
    Enrollment,
    EnrollmentStatus,
    Order,
    OrderStatus,
    Product,
    Transaction,
    User,
)
from app.services import audit, payments

router = APIRouter(tags=["orders"])


class OrderIn(BaseModel):
    customer_id: uuid.UUID
    product_id: uuid.UUID


def _create(db: Session, body: OrderIn, user: User) -> tuple[Order, Enrollment]:
    cust = db.get(Customer, body.customer_id)
    if not cust:
        raise not_found("Customer")
    product = db.get(Product, body.product_id)
    if not product:
        raise not_found("Product")
    order, enr = payments.create_order(db, cust, product)
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="order.created",
        resource_type="order",
        resource_id=order.id,
        details={"product_id": str(product.id), "total": str(order.total)},
    )
    db.commit()
    return order, enr


@router.get("/orders")
def list_orders(
    page: Page = Depends(),
    status: OrderStatus | None = None,
    customer_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("orders:read")),
):
    q = select(Order).order_by(Order.created_at.desc())
    if status:
        q = q.where(Order.status == status)
    if customer_id:
        q = q.where(Order.customer_id == customer_id)
    return page.apply(db, q, lambda o: order_out(o, db))


@router.post("/orders", status_code=201)
def create_order(body: OrderIn, db: Session = Depends(get_db), user: User = Depends(require("orders:write"))):
    order, _ = _create(db, body, user)
    return order_out(order, db)


@router.get("/orders/{order_id}")
def get_order(order_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("orders:read"))):
    o = db.get(Order, order_id)
    if not o:
        raise not_found("Order")
    timeline = [
        {
            "type": "order.created",
            "status": "PENDING_PAYMENT",
            "actor": None,
            "note": f"order {o.reference}",
            "created_at": iso(o.created_at),
        }
    ]
    tx = db.scalar(select(Transaction).where(Transaction.order_id == o.id))
    if tx:
        timeline += [
            {
                "type": "transaction.status",
                "status": h.to_status,
                "from_status": h.from_status,
                "actor": h.actor,
                "note": h.reason,
                "created_at": iso(h.created_at),
            }
            for h in tx.history
        ]
    timeline.sort(key=lambda e: e["created_at"] or "")
    return order_out(o, db) | {"timeline": timeline}


@router.get("/enrollments")
def list_enrollments(
    page: Page = Depends(),
    status: EnrollmentStatus | None = None,
    product_id: uuid.UUID | None = None,
    customer_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("orders:read")),
):
    q = select(Enrollment).order_by(Enrollment.created_at.desc())
    if status:
        q = q.where(Enrollment.status == status)
    if product_id:
        q = q.where(Enrollment.product_id == product_id)
    if customer_id:
        q = q.where(Enrollment.customer_id == customer_id)
    return page.apply(db, q, enrollment_out)


@router.post("/enrollments", status_code=201)
def create_enrollment(body: OrderIn, db: Session = Depends(get_db), user: User = Depends(require("orders:write"))):
    """An enrollment is always backed by an order (PENDING until paid)."""
    _, enr = _create(db, body, user)
    return enrollment_out(enr)


@router.get("/enrollments/{enr_id}")
def get_enrollment(enr_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("orders:read"))):
    e = db.get(Enrollment, enr_id)
    if not e:
        raise not_found("Enrollment")
    return enrollment_out(e)
