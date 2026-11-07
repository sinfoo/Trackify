# Unix/macOS helpers. On Windows use scripts/dev.ps1 (same targets).
.PHONY: install migrate seed reset api web dev test test-api test-web e2e up down

install:
	cd apps/api && uv sync
	cd apps/web && npm install

migrate:
	cd apps/api && uv run alembic upgrade head

seed: migrate
	cd apps/api && uv run python -m app.seed

reset: migrate
	cd apps/api && uv run python -m app.seed --reset

api:
	cd apps/api && uv run uvicorn app.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

dev:
	$(MAKE) -j2 api web

test: test-api test-web

test-api:
	cd apps/api && uv run pytest -q

test-web:
	cd apps/web && npm test

e2e:
	cd apps/web && npx playwright test

up:
	docker compose up --build

down:
	docker compose down
