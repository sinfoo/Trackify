# Deployment

## Local (no Docker)

Prerequisites: Python 3.12 via [uv](https://docs.astral.sh/uv/), Node 22+ and npm.

```bash
cp .env.example .env
cd apps/api && uv sync && uv run alembic upgrade head && uv run python -m app.seed
uv run uvicorn app.main:app --reload --port 8000        # API + Swagger at /docs
cd ../web && npm install && npm run dev                   # http://localhost:3000
```

Windows: `./scripts/dev.ps1 install`, `./scripts/dev.ps1 seed`, `./scripts/dev.ps1 dev`.

## Docker Compose (PostgreSQL)

```bash
cp .env.example .env      # adjust JWT_SECRET, POSTGRES_PASSWORD
docker compose up --build # web :3000, api :8000, postgres
```

The API container runs `alembic upgrade head`, seeds if empty, then starts uvicorn. Health checks:
`/api/v1/health/ready` (DB reachable) gates the web container.

> Status: the compose file and Dockerfiles were written but **could not be executed on the build machine**
> (Docker daemon unavailable). The same commands run locally against SQLite and were verified there.

## Production build commands

```bash
cd apps/web && npm ci && npm run build && npm run start
cd apps/api && uv sync --no-dev && uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Production checklist
- `JWT_SECRET`: 32+ random characters. `COOKIE_SECURE=true` behind HTTPS. `CORS_ORIGINS` = real origin.
- `DATABASE_URL` -> PostgreSQL (the audit-log append-only trigger is created only on PostgreSQL).
- `AI_PROVIDER=anthropic|openai` with the key in a secret store, never in the image.
- Run a single API replica, or add Redis for events and rate limiting before scaling out.
- Payments stay simulated: there is intentionally no live provider.
