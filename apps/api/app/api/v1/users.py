import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.common import Page, user_out
from app.core.deps import require
from app.core.errors import AppError, not_found
from app.core.security import hash_password
from app.db.base import get_db
from app.models import Permission, Role, User
from app.services import audit

router = APIRouter(tags=["users"])


def _roles(db: Session, names: list[str], actor: User) -> list[Role]:
    rows = list(db.scalars(select(Role).where(Role.name.in_(names))))
    missing = set(names) - {r.name for r in rows}
    if missing:
        raise AppError(422, "UNKNOWN_ROLE", "Unknown role(s)", {"roles": sorted(missing)})
    # No privilege escalation: a user may only grant permissions they already hold.
    granted = {p.code for r in rows for p in r.permissions}
    if not granted <= actor.permission_codes:
        raise AppError(
            403,
            "PRIVILEGE_ESCALATION",
            "You cannot grant permissions you do not hold",
            {"permissions": sorted(granted - actor.permission_codes)},
        )
    return rows


@router.get("/users")
def list_users(
    page: Page = Depends(),
    q: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require("users:read")),
):
    stmt = select(User).order_by(User.created_at)
    if q:
        stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    return page.apply(db, stmt, user_out)


class UserIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=200)
    roles: list[str] = []


@router.post("/users", status_code=201)
def create_user(body: UserIn, db: Session = Depends(get_db), actor: User = Depends(require("users:write"))):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise AppError(409, "EMAIL_TAKEN", "An account with this email already exists")
    u = User(
        email=email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        roles=_roles(db, body.roles, actor),
    )
    db.add(u)
    db.flush()
    audit.record(
        db,
        actor_type="user",
        actor_id=actor.email,
        action="user.created",
        resource_type="user",
        resource_id=u.id,
        severity="WARN",
        details={"email": email, "roles": ",".join(body.roles)},
    )
    db.commit()
    return user_out(u)


def _user(db: Session, user_id: uuid.UUID) -> User:
    u = db.get(User, user_id)
    if not u:
        raise not_found("User")
    return u


@router.get("/users/{user_id}")
def get_user(user_id: uuid.UUID, db: Session = Depends(get_db), _: User = Depends(require("users:read"))):
    return user_out(_user(db, user_id))


class UserPatch(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    roles: list[str] | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}")
def update_user(
    user_id: uuid.UUID, body: UserPatch, db: Session = Depends(get_db), actor: User = Depends(require("users:write"))
):
    u = _user(db, user_id)
    if not u.permission_codes <= actor.permission_codes:  # no editing/demoting a higher-privileged account
        raise AppError(403, "PRIVILEGE_ESCALATION", "You cannot modify a user with permissions you do not hold")
    changes: dict = {}
    if body.full_name is not None:
        u.full_name = body.full_name
        changes["full_name"] = body.full_name
    if body.roles is not None:
        changes["roles"] = f"{','.join(u.role_names)} -> {','.join(sorted(body.roles))}"
        u.roles = _roles(db, body.roles, actor)
    if body.is_active is not None:
        if u.id == actor.id and not body.is_active:
            raise AppError(422, "CANNOT_DEACTIVATE_SELF", "You cannot deactivate your own account")
        u.is_active = body.is_active
        changes["is_active"] = body.is_active
    audit.record(
        db,
        actor_type="user",
        actor_id=actor.email,
        action="user.updated",
        resource_type="user",
        resource_id=u.id,
        severity="WARN" if "roles" in changes or "is_active" in changes else "INFO",
        details=changes,
    )
    db.commit()
    return user_out(u)


@router.get("/roles")
def list_roles(db: Session = Depends(get_db), _: User = Depends(require("users:read"))):
    return [
        {"name": r.name, "description": r.description, "permissions": sorted(p.code for p in r.permissions)}
        for r in db.scalars(select(Role).order_by(Role.name))
    ]


@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require("users:read"))):
    return [
        {"code": p.code, "description": p.description} for p in db.scalars(select(Permission).order_by(Permission.code))
    ]
