"""Test harness. Env MUST be set before any `app` import: settings are lru_cached and the
engine is built when app.db.base is imported."""

import os
import re
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_TMP = Path(tempfile.mkdtemp(prefix="fintech-tests-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_TMP / 'test_fintech.db').as_posix()}",
        "APP_ENV": "test",
        "AI_PROVIDER": "mock",  # never hit a real LLM, even if a key is exported on this machine
        "ANTHROPIC_API_KEY": "",
        "OPENAI_API_KEY": "",
        "COOKIE_SECURE": "false",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app import seed  # noqa: E402
from app.api.v1 import auth as auth_router  # noqa: E402
from app.db.base import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Product  # noqa: E402
from app.orchestration import orchestrator  # noqa: E402

PASSWORD = "Demo!2026"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    seed.create_schema()
    yield
    engine.dispose()
    shutil.rmtree(_TMP, ignore_errors=True)


@pytest.fixture(autouse=True)
def _fresh_db():
    """Every test starts from reference data only (roles, demo users, agents, products)."""
    with SessionLocal() as db:
        seed.wipe(db)
        seed.seed_reference(db)
    auth_router._failures.clear()  # in-process login rate limiter
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.rollback()
    s.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client: TestClient, email: str, password: str = PASSWORD):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def product(db, slug: str) -> Product:
    return db.scalar(select(Product).where(Product.slug == slug))


def new_customer(db, name: str = "Test Customer") -> Customer:
    c = Customer(
        full_name=name,
        email=f"{uuid.uuid4().hex[:10]}@example.test",
        segment="professional",
        city="Tunis",
        is_fictional=True,
    )
    db.add(c)
    db.flush()
    return c


def checkout(db, slug: str = "genai-llm", name: str = "Test Customer"):
    """Fast path to a PENDING checkout without chatting: returns (conv, wf, payment_session)."""
    conv, wf, _ = orchestrator.start_conversation(db, new_customer(db, name))
    db.commit()
    ps = orchestrator.request_enrollment(db, conv, product(db, slug).id)
    db.commit()
    return conv, wf, ps


# ---------------------------------------------------------------- route existence (admin routers in flight)


def _norm(path: str) -> str:
    return re.sub(r"\{[^}]+\}", "{}", path)


# FastAPI 0.162 nests included routers (_IncludedRouter has no .path), so read the OpenAPI paths instead.
_ROUTES = {(m.upper(), _norm(p)) for p, ops in app.openapi()["paths"].items() for m in ops}


def has_route(method: str, path: str) -> bool:
    return (method.upper(), _norm("/api/v1" + path)) in _ROUTES


def needs_route(method: str, path: str):
    return pytest.mark.skipif(not has_route(method, path), reason=f"route {method} /api/v1{path} not implemented yet")
