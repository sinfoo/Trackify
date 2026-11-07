import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()
ALGO = "HS256"


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_secret() -> str:
    return secrets.token_urlsafe(32)


def create_access_token(user_id: uuid.UUID) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(minutes=s.access_token_minutes), "typ": "access"}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGO)


def decode_access_token(token: str) -> uuid.UUID | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGO])
        if payload.get("typ") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


# ---------------------------------------------------------------- RBAC catalogue

PERMISSIONS: dict[str, str] = {
    "users:read": "View users and roles",
    "users:write": "Create and edit users",
    "products:read": "View products",
    "products:write": "Create, edit, archive products and prices",
    "customers:read": "View customers and intelligence",
    "customers:write": "Edit customers",
    "conversations:read": "View conversations",
    "orders:read": "View orders and enrollments",
    "orders:write": "Create orders and enrollments",
    "payments:read": "View payments and transactions",
    "payments:refund": "Request refunds",
    "approvals:read": "View approval requests",
    "approvals:decide": "Approve or reject sensitive operations",
    "analytics:read": "View analytics and export reports",
    "security:read": "View security events",
    "security:write": "Resolve security events, run analysis",
    "strategy:read": "View recommendations",
    "strategy:write": "Generate recommendations and give feedback",
    "audit:read": "View audit logs",
    "agents:read": "View agents and executions",
    "agents:write": "Configure and execute agents",
    "workflows:read": "View workflows",
    "workflows:write": "Start and cancel workflows, run demo scenarios",
    "events:read": "Receive the live event stream",
    "settings:read": "View system settings",
    "settings:write": "Change system settings",
}

_ALL = set(PERMISSIONS)
_READ = {p for p in PERMISSIONS if p.endswith(":read")}

ROLES: dict[str, tuple[str, set[str]]] = {
    "SUPER_ADMIN": ("Full access", _ALL),
    "ADMIN": ("Operates the platform", _ALL - {"settings:write"}),
    "FINANCE_MANAGER": (
        "Payments, refunds, approvals, analytics",
        _READ - {"users:read", "settings:read"} | {"payments:refund", "approvals:decide", "strategy:write"},
    ),
    "SECURITY_ANALYST": (
        "Security events, approvals, audit",
        _READ - {"users:read", "settings:read"} | {"security:write", "approvals:decide"},
    ),
    "SALES_MANAGER": (
        "Products, customers, strategy",
        {
            "products:read",
            "products:write",
            "customers:read",
            "customers:write",
            "conversations:read",
            "orders:read",
            "orders:write",
            "analytics:read",
            "strategy:read",
            "strategy:write",
            "agents:read",
            "workflows:read",
            "workflows:write",
            "events:read",
        },
    ),
    "VIEWER": ("Read-only", _READ - {"users:read", "audit:read", "settings:read"}),
}
