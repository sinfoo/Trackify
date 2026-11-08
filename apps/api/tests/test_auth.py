"""Authentication, rate limiting, refresh rotation, RBAC + audited denials."""

from conftest import PASSWORD, login
from sqlalchemy import select

from app.models import AuditLog, RefreshToken

A = "/api/v1/auth"


def test_login_sets_httponly_cookies(client):
    r = login(client, "admin@demo.techx")
    body = r.json()
    assert body["email"] == "admin@demo.techx" and "SUPER_ADMIN" in body["roles"]
    assert "password_hash" not in body
    cookies = r.headers.get_list("set-cookie")
    assert any(c.startswith("access_token=") and "HttpOnly" in c for c in cookies)
    assert any(c.startswith("refresh_token=") and "HttpOnly" in c and "Path=/api/v1/auth" in c for c in cookies)
    assert client.get(f"{A}/me").json()["email"] == "admin@demo.techx"


def test_wrong_password_401(client):
    r = client.post(f"{A}/login", json={"email": "admin@demo.techx", "password": "nope"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_sixth_attempt_rate_limited_even_with_right_password(client, db):
    for _ in range(5):
        assert client.post(f"{A}/login", json={"email": "sales@demo.techx", "password": "bad"}).status_code == 401
    r = client.post(f"{A}/login", json={"email": "sales@demo.techx", "password": PASSWORD})
    assert r.status_code == 429 and r.json()["error"]["code"] == "RATE_LIMITED"
    assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.login_rate_limited")) is not None


def test_me_without_cookie_401(client):
    r = client.get(f"{A}/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_refresh_rotation_and_reuse_revokes_family(client, db):
    login(client, "finance@demo.techx")
    old = client.cookies.get("refresh_token")
    r = client.post(f"{A}/refresh")
    assert r.status_code == 200
    new = client.cookies.get("refresh_token")
    assert new and new != old
    client.cookies.clear()
    r = client.post(f"{A}/refresh", headers={"Cookie": f"refresh_token={old}"})  # replayed old token
    assert r.status_code == 401
    r = client.post(f"{A}/refresh", headers={"Cookie": f"refresh_token={new}"})  # family is now dead
    assert r.status_code == 401
    db.expire_all()
    assert all(t.revoked_at is not None for t in db.scalars(select(RefreshToken)))
    assert db.scalar(select(AuditLog).where(AuditLog.action == "auth.refresh_reuse_detected")) is not None


def test_logout_revokes_refresh(client):
    login(client, "viewer@demo.techx")
    rt = client.cookies.get("refresh_token")
    assert client.post(f"{A}/logout").status_code == 200
    client.cookies.clear()
    assert client.post(f"{A}/refresh", headers={"Cookie": f"refresh_token={rt}"}).status_code == 401


def test_rbac_viewer_forbidden_admin_allowed_and_denial_audited(client, db):
    path = "/api/v1/demo/scenarios/successful_journey/run"
    login(client, "viewer@demo.techx")
    r = client.post(path)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN"
    denied = db.scalar(select(AuditLog).where(AuditLog.action == "authz.denied"))
    assert denied.actor_id == "viewer@demo.techx" and denied.outcome == "DENIED"
    assert denied.details == {"required": "workflows:write"}
    client.cookies.clear()
    login(client, "admin@demo.techx")
    assert client.post(path).status_code == 200


def test_register_creates_viewer(client):
    r = client.post(
        f"{A}/register", json={"email": "new.user@example.com", "full_name": "New User", "password": "longenough123"}
    )
    assert r.status_code == 201 and r.json()["roles"] == ["VIEWER"]
    assert (
        client.post(
            f"{A}/register", json={"email": "new.user@example.com", "full_name": "Again", "password": "longenough123"}
        ).status_code
        == 409
    )


def test_register_business_owner_is_signed_in_with_profile(client):
    r = client.post(
        f"{A}/register",
        json={
            "email": "owner@newbiz.com",
            "full_name": "Owner One",
            "password": "longenough1",
            "role": "owner",
            "business_name": "NewBiz Academy",
            "field_of_activity": "Education & training",
            "team_size": "2-10",
            "country": "Tunisia",
            "phone": "+216 20 000 000",
        },
    )
    assert r.status_code == 201 and r.json()["roles"] == ["SUPER_ADMIN"]
    assert r.json()["business_name"] == "NewBiz Academy"
    assert "access_token" in r.cookies  # signed in right away
    assert client.get(f"{A}/me").json()["email"] == "owner@newbiz.com"


def test_register_rejects_short_password_and_unknown_role(client):
    base = {"email": "x@newbiz.com", "full_name": "X Y"}
    assert client.post(f"{A}/register", json=base | {"password": "short1"}).status_code == 422
    assert client.post(f"{A}/register", json=base | {"password": "longenough1", "role": "god"}).status_code == 422
