import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.common import (
    Page,
    conversation_out,
    customer_out,
    enrollment_out,
    insight_out,
    message_out,
    order_out,
    tx_out,
    workflow_out,
)
from app.core.deps import require
from app.core.errors import AppError, not_found
from app.db.base import get_db
from app.models import (
    Conversation,
    Customer,
    CustomerInsight,
    Enrollment,
    Message,
    Order,
    Transaction,
    User,
    Workflow,
)
from app.orchestration import orchestrator
from app.services import audit

router = APIRouter(tags=["customers"])


# ---------------------------------------------------------------- customers


@router.get("/customers")
def list_customers(
    page: Page = Depends(),
    q: str | None = None,
    segment: str | None = None,
    stage: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("customers:read")),
):
    stmt = select(Customer).order_by(Customer.created_at.desc())
    if q:
        stmt = stmt.where(or_(Customer.full_name.ilike(f"%{q}%"), Customer.email.ilike(f"%{q}%")))
    if segment:
        stmt = stmt.where(Customer.segment == segment)
    if stage:
        stmt = stmt.where(Customer.journey_stage == stage)
    return page.apply(db, stmt, lambda c: customer_out(c, db))


class CustomerIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    email: EmailStr | None = None
    segment: str = Field("individual", max_length=40)
    city: str | None = Field(None, max_length=80)
    journey_stage: str = Field("NEW", max_length=40)


@router.post("/customers", status_code=201)
def create_customer(body: CustomerIn, db: Session = Depends(get_db), user: User = Depends(require("customers:write"))):
    c = Customer(**body.model_dump() | {"email": body.email.lower() if body.email else None})
    db.add(c)
    db.flush()
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="customer.created",
        resource_type="customer",
        resource_id=c.id,
    )
    db.commit()
    return customer_out(c, db)


def _customer(db: Session, cid: uuid.UUID) -> Customer:
    c = db.get(Customer, cid)
    if not c:
        raise not_found("Customer")
    return c


@router.get("/customers/{cid}")
def get_customer(cid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("customers:read"))):
    return customer_out(_customer(db, cid), db)


class CustomerPatch(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=120)
    email: EmailStr | None = None
    segment: str | None = Field(None, max_length=40)
    city: str | None = Field(None, max_length=80)
    journey_stage: str | None = Field(None, max_length=40)


@router.patch("/customers/{cid}")
def update_customer(
    cid: uuid.UUID, body: CustomerPatch, db: Session = Depends(get_db), user: User = Depends(require("customers:write"))
):
    c = _customer(db, cid)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("email"):
        changes["email"] = changes["email"].lower()
    for k, v in changes.items():
        setattr(c, k, v)
    audit.record(
        db,
        actor_type="user",
        actor_id=user.email,
        action="customer.updated",
        resource_type="customer",
        resource_id=c.id,
        details={"fields": ",".join(sorted(changes))},
    )
    db.commit()
    return customer_out(c, db)


@router.get("/customers/{cid}/history")
def customer_history(cid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("customers:read"))):
    c = _customer(db, cid)
    convs = db.scalars(select(Conversation).where(Conversation.customer_id == c.id).order_by(Conversation.created_at))
    orders = db.scalars(select(Order).where(Order.customer_id == c.id).order_by(Order.created_at))
    txs = db.scalars(select(Transaction).where(Transaction.customer_id == c.id).order_by(Transaction.created_at))
    enrs = db.scalars(select(Enrollment).where(Enrollment.customer_id == c.id).order_by(Enrollment.created_at))
    return {
        "conversations": [conversation_out(x, db) for x in convs],
        "orders": [order_out(o, db) for o in orders],
        "transactions": [tx_out(t) for t in txs],
        "enrollments": [enrollment_out(e) for e in enrs],
    }


@router.get("/customers/{cid}/insights")
def customer_insights(cid: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("customers:read"))):
    c = _customer(db, cid)
    rows = db.scalars(
        select(CustomerInsight).where(CustomerInsight.customer_id == c.id).order_by(CustomerInsight.updated_at.desc())
    )
    return [insight_out(i) for i in rows]


# ---------------------------------------------------------------- conversations


@router.get("/conversations")
def list_conversations(
    page: Page = Depends(),
    customer_id: uuid.UUID | None = None,
    flagged: bool | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("conversations:read")),
):
    stmt = select(Conversation).order_by(Conversation.created_at.desc())
    if customer_id:
        stmt = stmt.where(Conversation.customer_id == customer_id)
    if flagged:
        stmt = stmt.where(Conversation.id.in_(select(Message.conversation_id).where(Message.flagged)))
    return page.apply(db, stmt, lambda c: conversation_out(c, db))


def _conversation(db: Session, conv_id: uuid.UUID) -> Conversation:
    c = db.get(Conversation, conv_id)
    if not c:
        raise not_found("Conversation")
    return c


def _workflow(db: Session, conv_id: uuid.UUID) -> Workflow | None:
    return db.scalar(select(Workflow).where(Workflow.conversation_id == conv_id))


def _insight(db: Session, conv_id: uuid.UUID) -> CustomerInsight | None:
    return db.scalar(select(CustomerInsight).where(CustomerInsight.conversation_id == conv_id))


@router.get("/conversations/{conv_id}")
def get_conversation(
    conv_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("conversations:read"))
):
    c = _conversation(db, conv_id)
    ins, wf = _insight(db, c.id), _workflow(db, c.id)
    return conversation_out(c, db) | {
        "messages": [message_out(m) for m in c.messages],
        "insight": insight_out(ins) if ins else None,
        "workflow": workflow_out(wf, db) if wf else None,
    }


@router.post("/conversations/{conv_id}/analyze")
def analyze_conversation(
    conv_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(require("agents:write"))
):
    c = _conversation(db, conv_id)
    try:
        orchestrator.execute(
            db,
            "intelligence",
            {"conversation_id": str(c.id)},
            wf=_workflow(db, c.id),
            task_type="analyze_conversation",
            triggered_by=f"user:{user.email}",
            input_summary="manual re-analysis",
        )
    except AppError:
        db.commit()  # keep the FAILED execution record
        raise
    db.commit()
    ins = _insight(db, c.id)
    return insight_out(ins) if ins else None


@router.get("/conversations/{conv_id}/insights")
def conversation_insights(
    conv_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("conversations:read"))
):
    c = _conversation(db, conv_id)
    ins = _insight(db, c.id)
    return [insight_out(ins)] if ins else []
