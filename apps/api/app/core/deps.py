from collections.abc import Callable

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import decode_access_token
from app.db.base import get_db
from app.models import User
from app.services import audit

ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def token_from_request(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:]
    return request.cookies.get(ACCESS_COOKIE)


def user_from_token(db: Session, token: str | None) -> User | None:
    uid = decode_access_token(token) if token else None
    if not uid:
        return None
    user = db.get(User, uid)
    return user if user and user.is_active else None


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, token_from_request(request))
    if not user:
        raise AppError(401, "UNAUTHENTICATED", "Authentication required")
    return user


def require(permission: str) -> Callable[..., User]:
    """Backend RBAC gate. Denials are audited; hiding buttons in the UI is not the control."""

    def dep(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)) -> User:
        if permission not in user.permission_codes:
            audit.record(
                db,
                actor_type="user",
                actor_id=user.email,
                action="authz.denied",
                resource_type="endpoint",
                resource_id=f"{request.method} {request.url.path}"[:60],
                severity="WARN",
                outcome="DENIED",
                details={"required": permission},
                ip=client_ip(request),
            )
            db.commit()
            raise AppError(403, "FORBIDDEN", f"Missing permission: {permission}")
        return user

    return dep
