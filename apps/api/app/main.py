import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import ROUTERS
from app.core import errors
from app.core.config import get_settings
from app.core.deps import ACCESS_COOKIE, user_from_token
from app.db.base import SessionLocal
from app.services import events

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    events.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(
    title="The Autonomous FinTech Team API",
    version="1.0.0",
    description="Six specialised agents, one orchestrator, simulated payments, human-in-the-loop controls. "
    "All data is fictional; no real payment can be triggered.",
    lifespan=lifespan,
)
errors.install(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Cache-Control"] = resp.headers.get("Cache-Control", "no-store")
    return resp


v1 = APIRouter(prefix="/api/v1")
for r in ROUTERS:
    v1.include_router(r)


@v1.get("/health", tags=["health"])
def health():
    return {"status": "ok", "ai_provider": settings.ai_provider, "payments": "simulated"}


@v1.get("/health/live", tags=["health"])
def live():
    return {"status": "alive"}


@v1.get("/health/ready", tags=["health"])
def ready():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except Exception as e:  # pragma: no cover
        raise errors.AppError(503, "NOT_READY", f"database unavailable: {type(e).__name__}") from e


app.include_router(v1)


@app.websocket("/ws/events")
async def ws_events(ws: WebSocket):
    with SessionLocal() as db:
        user = user_from_token(db, ws.cookies.get(ACCESS_COOKIE) or ws.query_params.get("token"))
        perms = user.permission_codes if user else set()
    if not user or "events:read" not in perms:
        await ws.close(code=4401)
        return
    await ws.accept()
    q = events.subscribe()
    await ws.send_json({"type": "hello", "user": user.email})
    try:
        while True:
            try:
                ev = await asyncio.wait_for(q.get(), timeout=20)
            except TimeoutError:
                await ws.send_json({"type": "ping"})
                continue
            if ev.get("required_permission", "events:read") in perms:
                await ws.send_json(ev)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        events.unsubscribe(q)
        with contextlib.suppress(Exception):
            await ws.close()
