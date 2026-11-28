#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
python=${PYTHON:-python}
audit_dir=$(mktemp -d)
project=${JUDRIVE_SMOKE_PROJECT:-judrive-smoke-$$}
compose=(docker compose --env-file /dev/null -p "$project" -f compose.yaml -f deploy/compose.smoke.yaml)
if [[ -n ${JUDRIVE_PACKAGE_CA:-} ]]; then
  compose+=(-f deploy/compose.build-ca.yaml)
fi
export JUDRIVE_DOMAIN=http://127.0.0.1 JUDRIVE_RUNTIME_IMAGE="$project-runtime"
export JUDRIVE_FLEET_DIR="$audit_dir/fleet" JUDRIVE_MANUALS_DIR="$audit_dir/pdf"
export JUDRIVE_STATE_DIR="$audit_dir/state" JUDRIVE_CA_DIR="$audit_dir/ca"
export JUDRIVE_SMOKE_STUB="$audit_dir/fake_gigachat.py"
export TEST_CHIEF_HASH TEST_SESSION_SECRET TEST_CHIEF_PASSWORD
TEST_CHIEF_PASSWORD=$("$python" -c 'from secrets import token_urlsafe; print(token_urlsafe(32))')
TEST_SESSION_SECRET=$("$python" -c 'from secrets import token_urlsafe; print(token_urlsafe(32))')
TEST_CHIEF_HASH=$(PYTHONPATH=backend "$python" -c 'from app.auth.chief_session import hash_password; from os import environ; from secrets import token_hex; print(hash_password(environ["TEST_CHIEF_PASSWORD"], token_hex(16)))')
cleanup() {
  "${compose[@]}" down --volumes --remove-orphans >&2 || true
  rm -rf -- "$audit_dir"
}
trap cleanup EXIT
mkdir -p "$JUDRIVE_STATE_DIR" "$JUDRIVE_CA_DIR"
# Container root may be remapped by Docker. Fixtures are synthetic and temporary.
cp e2e/fixtures/fake_gigachat.py "$JUDRIVE_SMOKE_STUB"
chmod 644 "$JUDRIVE_SMOKE_STUB"
chmod 755 "$audit_dir"
chmod 777 "$JUDRIVE_STATE_DIR"
"$python" e2e/fixtures/synthetic_fleet.py "$JUDRIVE_FLEET_DIR/vehicles.json"
PYTHONPATH=backend "$python" -c 'from pathlib import Path; from sys import argv; from e2e.fixtures.synthetic_manuals import generate; generate(Path(argv[1]))' "$JUDRIVE_MANUALS_DIR"
export TEST_DEMO_FLEET_SHA256
TEST_DEMO_FLEET_SHA256=$("$python" -c 'import hashlib, pathlib, sys; print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())' "$JUDRIVE_FLEET_DIR/vehicles.json")
chmod 755 "$JUDRIVE_FLEET_DIR" "$JUDRIVE_MANUALS_DIR"
chmod 644 "$JUDRIVE_FLEET_DIR/vehicles.json" "$JUDRIVE_MANUALS_DIR/"*.pdf
"${compose[@]}" config --quiet
if [[ ${JUDRIVE_SMOKE_SKIP_BUILD:-0} != 1 ]]; then
  "${compose[@]}" build backend web
fi
"${compose[@]}" up --no-build -d --wait --wait-timeout 120
base="http://127.0.0.1:${JUDRIVE_SMOKE_PORT:-18184}"
"$python" scripts/verify_compose_api.py "$base" "$audit_dir/result.json"
"${compose[@]}" exec -T backend python scripts/sqlite_snapshot.py /app/local-data/judrive.sqlite /app/local-data/snapshot.sqlite
"${compose[@]}" exec -T backend python scripts/sqlite_snapshot.py /app/local-data/snapshot.sqlite /app/local-data/restored.sqlite
"${compose[@]}" restart backend
"${compose[@]}" up --no-recreate --no-build -d --wait --wait-timeout 120
"$python" scripts/verify_compose_api.py "$base" "$audit_dir/result.json" --after-restart
"${compose[@]}" exec -T backend python -c 'import sqlite3; from pathlib import Path; db=sqlite3.connect(Path("/app/local-data/restored.sqlite").as_uri()+"?mode=ro", uri=True); assert db.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] >= 2; assert db.execute("SELECT COUNT(*) FROM ticket_submissions").fetchone()[0] >= 1'

# A fresh web container must still start when full readiness is degraded.
cat > "$audit_dir/no-provider.yaml" <<'YAML'
services:
  backend:
    environment:
      GIGACHAT_CREDENTIALS: ""
YAML
"${compose[@]}" -f "$audit_dir/no-provider.yaml" up --force-recreate --no-build -d --wait --wait-timeout 120 backend web
"$python" - "$base" <<'PY'
import sys
import httpx

with httpx.Client(base_url=sys.argv[1], trust_env=False) as client:
    assert client.get("/").status_code == 200
    assert client.get("/api/live").status_code == 200
    readiness = client.get("/api/ready")
    assert readiness.status_code == 503 and readiness.json()["gigachat_agent"] == "missing_key"
print("PASS: web and backend start without a provider key; full readiness remains degraded")
PY
