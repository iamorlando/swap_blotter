#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

LOCAL_URL=${LOCAL_DATABASE_URL:-"postgresql://postgres:postgres@localhost:5433/swaps"}
REMOTE_URL=${REMOTE_DATABASE_URL:-${DATABASE_URL_UNPOOLED:-"postgresql://neondb_owner:npg_euWHJknG04cS@ep-plain-sky-a41s9xc1.us-east-1.aws.neon.tech/neondb?sslmode=require"}}

convert_local_url_for_docker() {
python3 - <<'PY'
import os
from urllib.parse import urlparse, urlunparse
url = os.environ["LOCAL_URL_RAW"]
parts = urlparse(url)
if not parts.hostname:
    print(url)
    raise SystemExit(0)
host = parts.hostname
if host in {"localhost", "127.0.0.1"}:
    host = "host.docker.internal"
user = parts.username or ""
password = parts.password or ""
port = parts.port
netloc = ""
if user:
    netloc += user
    if password:
        netloc += f":{password}"
    netloc += "@"
netloc += host
if port:
    netloc += f":{port}"
new_parts = parts._replace(netloc=netloc)
print(urlunparse(new_parts))
PY
}

run_with_local_tools() {
  pg_dump "$LOCAL_URL" \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    | psql "$REMOTE_URL"
}

run_with_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required when pg_dump/psql are unavailable." >&2
    exit 1
  fi
  LOCAL_FOR_DOCKER=$(LOCAL_URL_RAW="$LOCAL_URL" convert_local_url_for_docker)
  docker run --rm \
    -e LOCAL_URL="$LOCAL_FOR_DOCKER" \
    -e REMOTE_URL="$REMOTE_URL" \
    postgres:16 \
    bash -c 'pg_dump "$LOCAL_URL" --no-owner --no-privileges --clean --if-exists | psql "$REMOTE_URL"'
}

echo "==> Resetting remote database from local snapshot"
echo "    Local : $LOCAL_URL"
echo "    Remote: $REMOTE_URL"

if command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1; then
  run_with_local_tools
else
  run_with_docker
fi

echo "==> Remote database now mirrors local"
