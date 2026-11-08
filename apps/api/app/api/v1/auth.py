import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.v1.common import user_out
from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE, REFRESH_COOKIE, client_ip, current_user
from app.core.errors import AppError
from app.core.security import create_access_token, hash_password, new_secret, sha256, verify_password
from app.db.base import get_db, utcnow
from app.models import PasswordResetToken, RefreshToken, Role, User
from app.services import audit, risk

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("auth")

# ponytail: in-process sliding window; move to Redis when running several API instances.
_failures: dict[str, deque] = defaultdict(deque)


def _rate_key(request: Request, email: str) -> str:
    return f"{client_ip(request)}|{email.lower()}"


def _limited(key: str) -> bool:
    s = get_settings()
    q = _failures[key]
    now = time.monotonic()
    while q and now - q[0] > s.login_window_seconds:
        q.popleft()
    return len(q) >= s.login_max_attempts


def _set_cookies(resp: Response, db: Session, user: User, family: uuid.UUID | None = None) -> None:
    s = get_settings()
    raw = new_secret()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=sha256(raw),
            family_id=family or uuid.uuid4(),
            expires_at=utcnow() + timedelta(days=s.refresh_token_days),
        )
    )
    common = {"httponly": True, "samesite": "lax", "secure": s.cookie_secure}
    resp.set_cookie(
        ACCESS_COOKIE, create_access_token(user.id), max_age=s.access_token_minutes * 60, path="/", **common
    )
    resp.set_cookie(REFRESH_COOKIE, raw, max_age=s.refresh_token_days * 86400, path="/api/v1/auth", **common)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = _rate_key(request, body.email)
    if _limited(key):
        audit.record(
            db,
            actor_type="user",
            actor_id=body.email,
            action="auth.login_rate_limited",
            severity="WARN",
            outcome="DENIED",
            ip=client_ip(request),
        )
        db.commit()
        raise AppError(429, "RATE_LIMITED", "Too many failed attempts. Try again in a few minutes.")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        _failures[key].append(time.monotonic())
        audit.record(
            db,
            actor_type="user",
            actor_id=body.email,
            action="auth.login_failed",
            severity="WARN",
            outcome="FAILED",
            ip=client_ip(request),
        )
        if len(_failures[key]) == get_settings().login_max_attempts:
            risk.raise_event(
                db,
                event_type="BRUTE_FORCE_SUSPECTED",
                category="ACCESS",
                severity="HIGH",
                description=f"{len(_failures[key])} failed logins for {body.email}",
                risk_score=0.75,
                recommended_action="LOCK_AND_REVIEW",
                evidence={"ip": client_ip(request), "email": body.email},
            )
        db.commit()
        raise AppError(401, "INVALID_CREDENTIALS", "Invalid email or password")
    _failures.pop(key, None)
    user.last_login_at = utcnow()
    _set_cookies(response, db, user)
    audit.record(db, actor_type="user", actor_id=user.email, action="auth.login", ip=client_ip(request))
    db.commit()
    return user_out(user)


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw))) if raw else None
    if not rt or rt.expires_at < utcnow():
        raise AppError(401, "UNAUTHENTICATED", "Session expired")
    if rt.revoked_at:  # reuse of a rotated token: revoke the whole family
        for t in db.scalars(select(RefreshToken).where(RefreshToken.family_id == rt.family_id)):
            t.revoked_at = t.revoked_at or utcnow()
        audit.record(
            db,
            actor_type="user",
            actor_id=str(rt.user_id),
            action="auth.refresh_reuse_detected",
            severity="CRITICAL",
            outcome="DENIED",
            ip=client_ip(request),
        )
        db.commit()
        raise AppError(401, "UNAUTHENTICATED", "Session revoked")
    rt.revoked_at = utcnow()
    user = db.get(User, rt.user_id)
    if not user or not user.is_active:
        raise AppError(401, "UNAUTHENTICATED", "Session expired")
    _set_cookies(response, db, user, rt.family_id)
    db.commit()
    return user_out(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw and (rt := db.scalar(select(RefreshToken).where(RefreshToken.token_hash == sha256(raw)))):
        for t in db.scalars(select(RefreshToken).where(RefreshToken.family_id == rt.family_id)):
            t.revoked_at = t.revoked_at or utcnow()
        audit.record(db, actor_type="user", actor_id=str(rt.user_id), action="auth.logout", ip=client_ip(request))
        db.commit()
    response.delete_cookie(ACCESS_COOKIE, path="/")
    response.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


SIGNUP_ROLES = {
    "owner": "SUPER_ADMIN",
    "finance": "FINANCE_MANAGER",
    "security": "SECURITY_ANALYST",
    "sales": "SALES_MANAGER",
    "viewer": "VIEWER",
}


class RegisterIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    # Business onboarding (demo self-service). Stored on the user profile; the role is applied below.
    role: Literal["owner", "finance", "security", "sales", "viewer"] = "viewer"
    business_name: str = Field("", max_length=120)
    field_of_activity: str = Field("", max_length=80)
    team_size: str = Field("", max_length=20)
    country: str = Field("", max_length=80)
    phone: str = Field("", max_length=40)


@router.post("/register", status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise AppError(409, "EMAIL_TAKEN", "An account with this email already exists")
    # ponytail: self-service admin sign-up is a demo convenience; production should set SELF_SIGNUP_ADMIN=false.
    wanted = SIGNUP_ROLES[body.role]
    if wanted == "SUPER_ADMIN" and not get_settings().self_signup_admin:
        wanted = "VIEWER"
    role = db.scalar(select(Role).where(Role.name == wanted))
    u = User(
        email=body.email.lower(),
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        roles=[role] if role else [],
        preferences={
            "business_name": body.business_name,
            "field_of_activity": body.field_of_activity,
            "team_size": body.team_size,
            "country": body.country,
            "phone": body.phone,
        },
    )
    db.add(u)
    db.flush()
    audit.record(
        db,
        actor_type="user",
        actor_id=u.email,
        action="auth.register",
        ip=client_ip(request),
        details={"role": wanted, "business_name": body.business_name},
    )
    _set_cookies(response, db, u)  # signed in right away, like the prototype
    db.commit()
    return user_out(u) | {"business_name": body.business_name}


class ForgotIn(BaseModel):
    email: EmailStr


@router.post("/forgot-password")
def forgot(body: ForgotIn, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        raw = new_secret()
        db.add(PasswordResetToken(user_id=user.id, token_hash=sha256(raw), expires_at=utcnow() + timedelta(minutes=30)))
        audit.record(db, actor_type="user", actor_id=user.email, action="auth.reset_requested", ip=client_ip(request))
        db.commit()
        # ponytail: no mail server in the demo; link goes to the server log only (never to the response).
        log.warning("DEV OUTBOX password reset for %s: /reset-password?token=%s", user.email, raw)
    return {"ok": True, "message": "If the account exists, a reset link has been sent."}


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=200, pattern=r".*\d.*")  # >= 8 chars with a digit


@router.post("/reset-password")
def reset(body: ResetIn, request: Request, db: Session = Depends(get_db)):
    t = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256(body.token)))
    if not t or t.used_at or t.expires_at < utcnow():
        raise AppError(400, "INVALID_TOKEN", "Reset link is invalid or expired")
    user = db.get(User, t.user_id)
    user.password_hash = hash_password(body.password)
    t.used_at = utcnow()
    for rt in db.scalars(
        select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    ):
        rt.revoked_at = utcnow()
    audit.record(db, actor_type="user", actor_id=user.email, action="auth.password_reset", ip=client_ip(request))
    db.commit()
    return {"ok": True}
