#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

LOCAL_URL=${LOCAL_DATABASE_URL:-"postgresql://postgres:postgres@localhost:5433/swaps"}
REMOTE_URL=${REMOTE_DATABASE_URL:-${DATABASE_URL_UNPOOLED:-"postgresql://neondb_owner:npg_euWHJknG04cS@ep-plain-sky-a41s9xc1.us-east-1.aws.neon.tech/neondb?sslmode=require"}}
PG_OPTIONS_DEFAULT="-c statement_timeout=0 -c lock_timeout=0"
export PGOPTIONS="${PGOPTIONS:-$PG_OPTIONS_DEFAULT}"

BIG_TABLES=("main_tbl" "risk_tbl")
TMP_SCHEMA=""
TMP_DATA=""

cleanup() {
  [[ -n "$TMP_SCHEMA" && -f "$TMP_SCHEMA" ]] && rm -f "$TMP_SCHEMA"
  [[ -n "$TMP_DATA" && -f "$TMP_DATA" ]] && rm -f "$TMP_DATA"
}
trap cleanup EXIT

log() {
  echo "[$(date +%H:%M:%S)] $*"
}

ensure_pg_tools() {
  if command -v pg_dump >/dev/null 2>&1 && command -v psql >/dev/null 2>&1 && command -v pg_restore >/dev/null 2>&1; then
    return 0
  fi
  # Common Homebrew location on macOS
  local brew_pg="/opt/homebrew/opt/libpq/bin"
  if [[ -x "$brew_pg/pg_dump" && -x "$brew_pg/psql" && -x "$brew_pg/pg_restore" ]]; then
    export PATH="$brew_pg:$PATH"
    return 0
  fi
  echo "Postgres client tools (pg_dump, pg_restore, psql) not found. Install with 'brew install libpq' and add to PATH." >&2
  return 1
}

dump_schema() {
  TMP_SCHEMA=$(mktemp -t neon_schema_XXXX.dump)
  log "Dumping schema only to $TMP_SCHEMA"
  PGOPTIONS="$PGOPTIONS" pg_dump "$LOCAL_URL" \
    --format=custom \
    --schema-only \
    --no-owner \
    --no-privileges \
    --verbose \
    --file="$TMP_SCHEMA"
}

restore_schema() {
  log "Restoring schema to remote"
  PGOPTIONS="$PGOPTIONS" pg_restore \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --verbose \
    --dbname="$REMOTE_URL" \
    "$TMP_SCHEMA"
}

collect_tables() {
  log "Collecting table list from local"
  mapfile -t TABLES < <(psql "$LOCAL_URL" -At -v ON_ERROR_STOP=1 -c "SELECT quote_ident(table_name) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")
}

dump_and_restore_small_tables() {
  local small_tables=()
  for t in "${TABLES[@]}"; do
    if printf '%s\n' "${BIG_TABLES[@]}" | grep -qx "${t}"; then
      continue
    fi
    small_tables+=("public.${t}")
  done
  if [[ ${#small_tables[@]} -eq 0 ]]; then
    log "No small tables to dump."
    return
  fi
  TMP_DATA=$(mktemp -t neon_data_XXXX.dump)
  log "Dumping small tables to $TMP_DATA"
  PGOPTIONS="$PGOPTIONS" pg_dump "$LOCAL_URL" \
    --format=custom \
    --data-only \
    --no-owner \
    --no-privileges \
    --verbose \
    $(printf ' --table=%s' "${small_tables[@]}") \
    --file="$TMP_DATA"
  log "Restoring small tables data"
  PGOPTIONS="$PGOPTIONS" pg_restore \
    --no-owner \
    --no-privileges \
    --single-transaction \
    --verbose \
    --dbname="$REMOTE_URL" \
    "$TMP_DATA"
}

copy_big_table_in_chunks() {
  local table="$1"
  local chunk="${2:-100000}"
  log "Starting chunked copy for ${table} (chunk size ${chunk})"
  local cols
  cols=$(psql "$LOCAL_URL" -At -v ON_ERROR_STOP=1 -c "SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}'")
  if [[ -z "$cols" ]]; then
    log "Could not determine columns for ${table}"
    return 1
  fi
  local row_count
  row_count=$(psql "$LOCAL_URL" -At -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM ${table}")
  log "${table}: ${row_count} rows"
  log "Truncating ${table} on remote"
  PGOPTIONS="$PGOPTIONS" psql "$REMOTE_URL" -v ON_ERROR_STOP=1 -c "TRUNCATE TABLE ${table}" >/dev/null
  local start=1
  while [[ "$start" -le "$row_count" ]]; do
    local finish=$((start + chunk))
    log "Copying ${table} rows [${start}, ${finish}) ordered by CTID"
    PGOPTIONS="$PGOPTIONS" psql "$LOCAL_URL" -v ON_ERROR_STOP=1 -c "\copy (WITH ordered AS (SELECT row_number() OVER (ORDER BY ctid) AS rn, ${cols} FROM ${table}) SELECT ${cols} FROM ordered WHERE rn >= ${start} AND rn < ${finish} ORDER BY rn) TO STDOUT" \
      | PGOPTIONS="$PGOPTIONS" psql "$REMOTE_URL" -v ON_ERROR_STOP=1 -c "COPY ${table} (${cols}) FROM STDIN" || return 1
    start=$finish
  done
  log "Finished ${table}"
}

main() {
  log "==> Resetting remote database from local snapshot"
  log "Local : $LOCAL_URL"
  log "Remote: $REMOTE_URL"
  ensure_pg_tools
  dump_schema
  restore_schema
  collect_tables
  dump_and_restore_small_tables
  for tbl in "${BIG_TABLES[@]}"; do
    copy_big_table_in_chunks "$tbl" 50000
  done
  log "==> Remote database now mirrors local"
}

main "$@"
