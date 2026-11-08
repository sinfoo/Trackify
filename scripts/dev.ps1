# Windows helper. Usage: ./scripts/dev.ps1 <install|seed|reset|api|web|dev|test|e2e|up|down>
param([Parameter(Mandatory = $true)][string]$Target)
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root "apps/api"
$web = Join-Path $root "apps/web"
switch ($Target) {
  "install" { Push-Location $api; uv sync; Pop-Location; Push-Location $web; npm install; Pop-Location }
  "seed"    { Push-Location $api; uv run alembic upgrade head; uv run python -m app.seed; Pop-Location }
  "reset"   { Push-Location $api; uv run alembic upgrade head; uv run python -m app.seed --reset; Pop-Location }
  "api"     { Push-Location $api; uv run uvicorn app.main:app --port 8000; Pop-Location }
  "web"     { Push-Location $web; npm run dev; Pop-Location }
  "dev"     {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$api'; uv run uvicorn app.main:app --port 8000"
    Push-Location $web; npm run dev; Pop-Location
  }
  "test"    { Push-Location $api; uv run pytest -q; Pop-Location; Push-Location $web; npm test; Pop-Location }
  "e2e"     { Push-Location $web; npx playwright test; Pop-Location }
  "up"      { docker compose up --build }
  "down"    { docker compose down }
  default   { Write-Error "Unknown target $Target" }
}
