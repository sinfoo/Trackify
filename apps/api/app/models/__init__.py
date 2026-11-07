"""All ORM models. One module keeps relationships and enums in one place."""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Money, Timestamped, UTCDateTime, UUIDPk, utcnow


def _enum(cls):
    return Enum(cls, native_enum=False, length=40, validate_strings=True)


# ---------------------------------------------------------------- auth / rbac

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Uuid, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Uuid, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Uuid, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class Permission(UUIDPk, Base):
    __tablename__ = "permissions"
    code: Mapped[str] = mapped_column(String(60), unique=True)
    description: Mapped[str] = mapped_column(String(200), default="")


class Role(UUIDPk, Base):
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(String(40), unique=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, lazy="selectin")


class User(UUIDPk, Timestamped, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(300))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    roles: Mapped[list[Role]] = relationship(secondary=user_roles, lazy="selectin")

    @property
    def permission_codes(self) -> set[str]:
        return {p.code for r in self.roles for p in r.permissions}

    @property
    def role_names(self) -> list[str]:
        return sorted(r.name for r in self.roles)


class RefreshToken(UUIDPk, Timestamped, Base):
    __tablename__ = "refresh_tokens"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class PasswordResetToken(UUIDPk, Timestamped, Base):
    __tablename__ = "password_reset_tokens"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


# ---------------------------------------------------------------- sales


class ProductStatus(enum.StrEnum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"


class Product(UUIDPk, Timestamped, Base):
    """A sellable offer (training course in the demo)."""

    __tablename__ = "products"
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(60))
    summary: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="TND")
    duration_weeks: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(30))
    learning_outcomes: Mapped[list] = mapped_column(JSON, default=list)
    target_audience: Mapped[str] = mapped_column(String(300))
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    seats_total: Mapped[int] = mapped_column(Integer)
    status: Mapped[ProductStatus] = mapped_column(_enum(ProductStatus), default=ProductStatus.ACTIVE)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class Customer(UUIDPk, Timestamped, Base):
    __tablename__ = "customers"
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    segment: Mapped[str] = mapped_column(String(40), default="individual")
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    consent_voice: Mapped[bool] = mapped_column(Boolean, default=False)
    is_fictional: Mapped[bool] = mapped_column(Boolean, default=True)
    journey_stage: Mapped[str] = mapped_column(String(40), default="NEW")


class Conversation(UUIDPk, Timestamped, Base):
    __tablename__ = "conversations"
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20), default="text")  # text | voice
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    access_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    customer: Mapped[Customer] = relationship(lazy="joined")
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at", cascade="all, delete-orphan"
    )


class Message(UUIDPk, Timestamped, Base):
    __tablename__ = "messages"
    conversation_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # customer | agent | system
    content: Mapped[str] = mapped_column(Text)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # product cards, CTA (customer-safe only)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class CustomerInsight(UUIDPk, Timestamped, Base):
    """Latest structured intelligence per conversation (model output; not verified fact)."""

    __tablename__ = "customer_insights"
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), unique=True
    )
    summary: Mapped[str] = mapped_column(Text)
    needs: Mapped[list] = mapped_column(JSON, default=list)
    motivations: Mapped[list] = mapped_column(JSON, default=list)
    interests: Mapped[list] = mapped_column(JSON, default=list)
    preferred_product_ids: Mapped[list] = mapped_column(JSON, default=list)
    objections: Mapped[list] = mapped_column(JSON, default=list)
    satisfaction_signals: Mapped[list] = mapped_column(JSON, default=list)
    sentiment_score: Mapped[float] = mapped_column(Float)  # -1..1
    sentiment_label: Mapped[str] = mapped_column(String(20))
    purchase_intent: Mapped[float] = mapped_column(Float)  # 0..1
    hesitation: Mapped[bool] = mapped_column(Boolean, default=False)
    journey_stage: Mapped[str] = mapped_column(String(40))
    recommended_follow_up: Mapped[str] = mapped_column(String(300))
    confidence: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="rules")  # rules | llm
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)


class OrderStatus(enum.StrEnum):
    PENDING_PAYMENT = "PENDING_PAYMENT"
    PAID = "PAID"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class Order(UUIDPk, Timestamped, Base):
    __tablename__ = "orders"
    reference: Mapped[str] = mapped_column(String(20), unique=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), default=OrderStatus.PENDING_PAYMENT)
    total: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3), default="TND")
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    customer: Mapped[Customer] = relationship(lazy="joined")
    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class OrderItem(UUIDPk, Base):
    __tablename__ = "order_items"
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Money)
    product: Mapped[Product] = relationship(lazy="joined")


class EnrollmentStatus(enum.StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    CANCELLED = "CANCELLED"


class Enrollment(UUIDPk, Timestamped, Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("order_id", "product_id"),)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    status: Mapped[EnrollmentStatus] = mapped_column(_enum(EnrollmentStatus), default=EnrollmentStatus.PENDING)
    customer: Mapped[Customer] = relationship(lazy="joined")
    product: Mapped[Product] = relationship(lazy="joined")


class CustomerFeedback(UUIDPk, Timestamped, Base):
    __tablename__ = "customer_feedback"
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[int] = mapped_column(Integer)  # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- payments


class TxStatus(enum.StrEnum):
    CREATED = "CREATED"
    PENDING = "PENDING"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"
    PROCESSING = "PROCESSING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class PaymentSession(UUIDPk, Timestamped, Base):
    __tablename__ = "payment_sessions"
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3))
    provider: Mapped[str] = mapped_column(String(30), default="simulated")
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    order: Mapped[Order] = relationship(lazy="joined")
    transaction: Mapped["Transaction"] = relationship(back_populates="session", uselist=False, lazy="joined")


class Transaction(UUIDPk, Timestamped, Base):
    __tablename__ = "transactions"
    reference: Mapped[str] = mapped_column(String(24), unique=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payment_sessions.id", ondelete="CASCADE"), unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[TxStatus] = mapped_column(_enum(TxStatus), default=TxStatus.CREATED, index=True)
    provider: Mapped[str] = mapped_column(String(30), default="simulated")
    payment_method: Mapped[str | None] = mapped_column(String(40), nullable=True)  # fictional token only
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    session: Mapped[PaymentSession] = relationship(back_populates="transaction")
    customer: Mapped[Customer] = relationship(lazy="joined")
    product: Mapped[Product] = relationship(lazy="joined")
    attempts: Mapped[list["PaymentAttempt"]] = relationship(order_by="PaymentAttempt.created_at", lazy="selectin")
    history: Mapped[list["TransactionStatusChange"]] = relationship(
        order_by="TransactionStatusChange.created_at", lazy="selectin"
    )


class TransactionStatusChange(UUIDPk, Timestamped, Base):
    __tablename__ = "transaction_status_changes"
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    to_status: Mapped[str] = mapped_column(String(30))
    actor: Mapped[str] = mapped_column(String(80))  # "agent:payment" | "user:<email>"
    reason: Mapped[str] = mapped_column(String(300), default="")


class PaymentAttempt(UUIDPk, Timestamped, Base):
    __tablename__ = "payment_attempts"
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True)
    payment_method: Mapped[str] = mapped_column(String(40))
    amount: Mapped[Decimal] = mapped_column(Money)
    outcome: Mapped[str] = mapped_column(String(30))  # SUCCEEDED | FAILED | HELD | BLOCKED
    failure_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    provider_reference: Mapped[str | None] = mapped_column(String(60), nullable=True)


class Refund(UUIDPk, Timestamped, Base):
    __tablename__ = "refunds"
    transaction_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    reason: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="PENDING_APPROVAL")  # PENDING_APPROVAL|COMPLETED|REJECTED
    requested_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    approval_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


# ---------------------------------------------------------------- agents & workflows


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # stable key e.g. "sales"
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(String(400))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    provider: Mapped[str | None] = mapped_column(String(20), nullable=True)  # override, else global
    model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.3)
    status: Mapped[str] = mapped_column(String(20), default="IDLE")  # IDLE | RUNNING | ERROR
    current_task: Mapped[str | None] = mapped_column(String(200), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class WorkflowState(enum.StrEnum):
    NEW_CUSTOMER = "NEW_CUSTOMER"
    SALES_INTERACTION = "SALES_INTERACTION"
    CUSTOMER_ANALYSIS = "CUSTOMER_ANALYSIS"
    PRODUCT_RECOMMENDATION = "PRODUCT_RECOMMENDATION"
    ENROLLMENT_REQUEST = "ENROLLMENT_REQUEST"
    SECURITY_CHECK = "SECURITY_CHECK"
    PAYMENT_SESSION = "PAYMENT_SESSION"
    PAYMENT_PROCESSING = "PAYMENT_PROCESSING"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    FINANCIAL_ANALYSIS = "FINANCIAL_ANALYSIS"
    BUSINESS_RECOMMENDATION = "BUSINESS_RECOMMENDATION"
    COMPLETED = "COMPLETED"
    BLOCKED = "BLOCKED"
    CANCELLED = "CANCELLED"
    LOW_INTENT = "LOW_INTENT"
    ERROR = "ERROR"


class Workflow(UUIDPk, Timestamped, Base):
    __tablename__ = "workflows"
    kind: Mapped[str] = mapped_column(String(40), default="customer_journey")
    label: Mapped[str] = mapped_column(String(160), default="")
    state: Mapped[WorkflowState] = mapped_column(_enum(WorkflowState), default=WorkflowState.NEW_CUSTOMER, index=True)
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, unique=True
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    context: Mapped[dict] = mapped_column(JSON, default=dict)  # structured, non-sensitive
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
    steps: Mapped[list["WorkflowStep"]] = relationship(order_by="WorkflowStep.created_at", lazy="selectin")


class WorkflowStep(UUIDPk, Timestamped, Base):
    __tablename__ = "workflow_steps"
    workflow_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("workflows.id", ondelete="CASCADE"), index=True)
    from_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_state: Mapped[str] = mapped_column(String(40))
    agent_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    note: Mapped[str] = mapped_column(String(300), default="")


class AgentExecution(UUIDPk, Timestamped, Base):
    __tablename__ = "agent_executions"
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True, index=True
    )
    task_type: Mapped[str] = mapped_column(String(60))
    triggered_by: Mapped[str] = mapped_column(String(80))  # event or actor that caused the task
    status: Mapped[str] = mapped_column(String(20), default="RUNNING")  # RUNNING|SUCCEEDED|FAILED
    input_summary: Mapped[str] = mapped_column(String(500), default="")
    output_summary: Mapped[str] = mapped_column(String(500), default="")
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    provider: Mapped[str] = mapped_column(String(20), default="rules")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)


class AgentMessage(UUIDPk, Timestamped, Base):
    """Structured agent-to-agent communication routed through the orchestrator."""

    __tablename__ = "agent_messages"
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("workflows.id", ondelete="SET NULL"), nullable=True, index=True
    )
    from_agent: Mapped[str] = mapped_column(String(40))
    to_agent: Mapped[str] = mapped_column(String(40))
    message_type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class ToolInvocation(UUIDPk, Timestamped, Base):
    __tablename__ = "tool_invocations"
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    execution_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_executions.id", ondelete="SET NULL"), nullable=True
    )
    tool: Mapped[str] = mapped_column(String(60))
    allowed: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20))  # OK | DENIED | ERROR
    args_summary: Mapped[str] = mapped_column(String(300), default="")
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------- security & governance


class Severity(enum.StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class SecurityEvent(UUIDPk, Timestamped, Base):
    __tablename__ = "security_events"
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    category: Mapped[str] = mapped_column(String(30), index=True)  # FRAUD | PROMPT_INJECTION | ACCESS | AGENT
    severity: Mapped[Severity] = mapped_column(_enum(Severity), index=True)
    description: Mapped[str] = mapped_column(String(500))
    risk_score: Mapped[float] = mapped_column(Float)
    recommended_action: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="OPEN", index=True)  # OPEN|INVESTIGATING|RESOLVED|DISMISSED
    detector: Mapped[str] = mapped_column(String(30), default="rule")  # rule | statistical | llm
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agent_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(String(500), nullable=True)


class ApprovalStatus(enum.StrEnum):
    PENDING_REVIEW = "PENDING_REVIEW"
    INFO_REQUESTED = "INFO_REQUESTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class ApprovalRequest(UUIDPk, Timestamped, Base):
    __tablename__ = "approval_requests"
    action: Mapped[str] = mapped_column(String(40), index=True)  # RELEASE_PAYMENT | REFUND | ...
    status: Mapped[ApprovalStatus] = mapped_column(
        _enum(ApprovalStatus), default=ApprovalStatus.PENDING_REVIEW, index=True
    )
    reason: Mapped[str] = mapped_column(String(500))
    requested_by_agent: Mapped[str | None] = mapped_column(String(40), nullable=True)
    requested_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    customer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), nullable=True
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    security_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("security_events.id", ondelete="SET NULL"), nullable=True
    )
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    risk_flags: Mapped[list] = mapped_column(JSON, default=list)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    decisions: Mapped[list["ApprovalDecision"]] = relationship(
        order_by="ApprovalDecision.created_at", lazy="selectin"
    )


class ApprovalDecision(UUIDPk, Timestamped, Base):
    __tablename__ = "approval_decisions"
    approval_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("approval_requests.id", ondelete="CASCADE"), index=True)
    decision: Mapped[str] = mapped_column(String(30))  # APPROVED | REJECTED | INFO_REQUESTED
    decided_by_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    decided_by_email: Mapped[str] = mapped_column(String(200))
    notes: Mapped[str] = mapped_column(String(1000), default="")


class AuditLog(Base):
    """Append-only. No update/delete code path exists; Postgres trigger guards it too (see migration)."""

    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    actor_type: Mapped[str] = mapped_column(String(20), index=True)  # user | agent | system | customer
    actor_id: Mapped[str] = mapped_column(String(200), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    severity: Mapped[str] = mapped_column(String(10), default="INFO", index=True)  # INFO|WARN|CRITICAL
    outcome: Mapped[str] = mapped_column(String(20), default="SUCCESS")
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    hash: Mapped[str] = mapped_column(String(64), default="")


class BusinessRecommendation(UUIDPk, Timestamped, Base):
    __tablename__ = "business_recommendations"
    rule_key: Mapped[str] = mapped_column(String(60), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40))  # PRICING | OFFER | SCRIPT | JOURNEY | RETENTION
    observed_facts: Mapped[list] = mapped_column(JSON, default=list)  # computed from data
    hypothesis: Mapped[str] = mapped_column(Text)  # AI/heuristic interpretation, not fact
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    expected_impact: Mapped[str] = mapped_column(String(300))
    priority: Mapped[str] = mapped_column(String(10))  # HIGH | MEDIUM | LOW
    confidence: Mapped[float] = mapped_column(Float)
    suggested_action: Mapped[str] = mapped_column(String(400))
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", index=True)  # ACTIVE|SUPERSEDED
    feedback: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ACCEPTED|REJECTED|DEFERRED
    feedback_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="rules")


class AnalyticsSnapshot(UUIDPk, Timestamped, Base):
    __tablename__ = "analytics_snapshots"
    metrics: Mapped[dict] = mapped_column(JSON)
    narrative: Mapped[str] = mapped_column(Text, default="")
    trigger: Mapped[str] = mapped_column(String(80))


class SystemEvent(Base):
    """Persisted event log; WebSocket broadcast happens only after the row is committed."""

    __tablename__ = "system_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, index=True)
    type: Mapped[str] = mapped_column(String(40), index=True)
    agent_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    workflow_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    summary: Mapped[str] = mapped_column(String(300))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    required_permission: Mapped[str] = mapped_column(String(60), default="events:read")
