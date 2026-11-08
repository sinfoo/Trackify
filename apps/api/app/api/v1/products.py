import uuid
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import product_out
from app.core.deps import require
from app.core.errors import AppError, conflict, not_found
from app.db.base import get_db
from app.models import Product, ProductStatus, User
from app.services import approvals, audit

router = APIRouter(prefix="/products", tags=["products"])

SLUG = r"^[a-z0-9]+(-[a-z0-9]+)*$"


def _price(v: str | None) -> str | None:
    if v is None:
        return None
    try:
        d = Decimal(str(v).strip())
    except InvalidOperation as e:
        raise ValueError("price must be a decimal string") from e
    if not d.is_finite() or d <= 0:
        raise ValueError("price must be > 0")
    if d.as_tuple().exponent < -3:
        raise ValueError("price has at most 3 decimals")
    if d >= Decimal(1000000000):
        raise ValueError("price too large")
    return str(d.quantize(Decimal("0.001")))


class ProductPatch(BaseModel):
    slug: str | None = Field(None, max_length=80, pattern=SLUG)
    name: str | None = Field(None, min_length=2, max_length=120)
    category: str | None = Field(None, max_length=60)
    summary: str | None = Field(None, max_length=300)
    description: str | None = None
    price: str | None = None
    duration_weeks: int | None = Field(None, ge=1, le=520)
    level: str | None = Field(None, max_length=30)
    learning_outcomes: list[str] | None = None
    target_audience: str | None = Field(None, max_length=300)
    keywords: list[str] | None = None
    seats_total: int | None = Field(None, ge=0, le=100000)
    status: ProductStatus | None = None

    @field_validator("price", mode="before")
    @classmethod
    def _v_price(cls, v):
        return _price(v)


class ProductIn(ProductPatch):
    slug: str = Field(max_length=80, pattern=SLUG)
    name: str = Field(min_length=2, max_length=120)
    category: str = Field(max_length=60)
    summary: str = Field(max_length=300)
    description: str = ""
    price: str
    duration_weeks: int = Field(ge=1, le=520)
    level: str = Field(max_length=30)
    learning_outcomes: list[str] = []
    target_audience: str = Field("", max_length=300)
    keywords: list[str] = []
    seats_total: int = Field(ge=0, le=100000)
    status: ProductStatus = ProductStatus.ACTIVE


def _check_slug(db: Session, slug: str, own_id: uuid.UUID | None = None) -> None:
    other = db.scalar(select(Product).where(Product.slug == slug))
    if other and other.id != own_id:
        raise conflict("SLUG_TAKEN", "Another product already uses this slug")


@router.get("")
def list_products(
    status: ProductStatus | None = None, db: Session = Depends(get_db), _: User = Depends(require("products:read"))
):
    q = select(Product).order_by(Product.created_at.desc())  # newest first: what you just added is on top
    if status:
        q = q.where(Product.status == status)
    return [product_out(p, db) for p in db.scalars(q)]


@router.post("", status_code=201)
def create_product(body: ProductIn, db: Session = Depends(get_db), user: User = Depends(require("products:write"))):
    _check_slug(db, body.slug)
    data = body.model_dump()
    p = Product(**data | {"price": Decimal(data["price"]), "currency": "TND"})
    db.add(p)
    db.flush()
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="product.created",
        resource_type="product",
        resource_id=p.id,
        details={"slug": p.slug, "price": str(p.price), "status": p.status},
    )
    db.commit()
    return product_out(p, db)


def _product(db: Session, pid: uuid.UUID) -> Product:
    p = db.get(Product, pid)
    if not p:
        raise not_found("Product")
    return p


@router.get("/{pid}")
def get_product(pid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("products:read"))):
    return product_out(_product(db, pid), db)


@router.patch("/{pid}")
def update_product(
    pid: uuid.UUID, body: ProductPatch, db: Session = Depends(get_db), user: User = Depends(require("products:write"))
):
    p = _product(db, pid)
    changes = body.model_dump(exclude_unset=True)
    if any(changes.get(k) is None for k in changes):
        raise AppError(
            422, "NULL_FIELD", "Fields cannot be set to null", {"fields": [k for k, v in changes.items() if v is None]}
        )
    if "slug" in changes:
        _check_slug(db, changes["slug"], p.id)
    diff: dict = {}
    pending_price = None
    for k, v in changes.items():
        if k == "price":
            v = Decimal(v)
            if p.status == ProductStatus.ACTIVE and v != p.price:
                pending_price = v  # live price: needs a second pair of eyes
                continue
        old = getattr(p, k)
        if old != v:
            diff[k] = {"old": str(old), "new": str(v)} if k in ("price", "status", "slug", "seats_total") else "changed"
            setattr(p, k, v)
    approval = None
    if pending_price is not None:
        approval = approvals.request(
            db,
            action="CHANGE_PRICE",
            reason=f"Change price of {p.name} from {p.price} to {pending_price} TND (active program)",
            requested_by_user=user,
            risk_score=0.2,
            payload={"product_id": str(p.id), "old_price": str(p.price), "new_price": str(pending_price)},
        )
        diff["price"] = {"old": str(p.price), "requested": str(pending_price), "approval_id": str(approval.id)}
    if diff:
        audit.record(
            db,
            actor_type="user",
            actor_id=user.email,
            action="product.updated",
            resource_type="product",
            resource_id=p.id,
            severity="WARN" if "price" in diff else "INFO",
            details=diff,
        )
    db.commit()
    out = product_out(p, db)
    if approval:
        out["pending_approval"] = {"id": str(approval.id), "action": "CHANGE_PRICE", "new_price": str(pending_price)}
    return out


@router.delete("/{pid}")
def archive_product(pid: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require("products:write"))):
    """Archives; never hard-deletes (orders and transactions keep referencing it)."""
    p = _product(db, pid)
    if p.status != ProductStatus.ARCHIVED:
        old = p.status
        p.status = ProductStatus.ARCHIVED
        audit.record(
            db,
            actor_type="user",
            actor_id=user.email,
            action="product.archived",
            resource_type="product",
            resource_id=p.id,
            severity="WARN",
            details={"status": {"old": str(old), "new": "ARCHIVED"}},
        )
        db.commit()
    return product_out(p, db)
