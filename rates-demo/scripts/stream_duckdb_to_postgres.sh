#!/usr/bin/env bash
set -euo pipefail

# Stream data from a DuckDB file directly into Postgres/Neon using DuckDB's Postgres extension.
# This avoids writing large CSVs and is suitable for multi-million row loads.
#
# Usage:
#   ./scripts/stream_duckdb_to_postgres.sh <path-to-swaps.duckdb> <DIRECT_POSTGRES_URL> [truncate]
#
# Notes:
# - Use a DIRECT (non-pooled) Postgres URL for bulk load, e.g. Neon direct connection
#   (not PgBouncer). Include sslmode=require if needed.
# - The Prisma schema is pushed first to ensure tables exist with correct types/PKs.
# - If the 3rd arg is 'truncate', target tables are cleared before insert.

DUCKDB_FILE=${1:-"../swaps.duckdb"}
DIRECT_URL=${2:-""}
DO_TRUNCATE=${3:-""}

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)

if [ -z "$DIRECT_URL" ]; then
  echo "Error: DIRECT_POSTGRES_URL is required as 2nd argument." >&2
  echo "Example: ./scripts/stream_duckdb_to_postgres.sh ../swaps.duckdb 'postgresql://user:pass@host/db?sslmode=require' truncate" >&2
  exit 1
fi

if [ ! -f "$DUCKDB_FILE" ]; then
  echo "Error: DuckDB file not found at $DUCKDB_FILE" >&2
  exit 1
fi

if ! command -v duckdb >/dev/null 2>&1; then
  echo "Error: duckdb CLI not found in PATH." >&2
  echo "Install DuckDB CLI: https://duckdb.org/docs/installation/cli.html" >&2
  exit 1
fi

echo "==> Pushing Prisma schema to Postgres (using DIRECT URL)"
(cd "$ROOT_DIR" && DATABASE_URL="$DIRECT_URL" npx prisma generate >/dev/null && DATABASE_URL="$DIRECT_URL" npx prisma db push)

echo "==> Loading DuckDB postgres extension and streaming tables to Postgres"
TRUNCATE_SQL=""
if [ "$DO_TRUNCATE" = "truncate" ]; then
  TRUNCATE_SQL="TRUNCATE TABLE pg.public.risk_agg; TRUNCATE TABLE pg.public.main_agg; TRUNCATE TABLE pg.public.risk_tbl; TRUNCATE TABLE pg.public.main_tbl;"
fi

duckdb "$DUCKDB_FILE" <<SQL
INSTALL postgres; 
LOAD postgres;
ATTACH '$DIRECT_URL' AS pg (TYPE POSTGRES);
BEGIN TRANSACTION;
${TRUNCATE_SQL}

-- main_tbl
INSERT INTO pg.public.main_tbl (
  "RowType","ID","CounterpartyID","StartDate","TerminationDate","FixedRate","NPV","ParRate","Spread","SwapType","PayFixed"
)
SELECT 
  "RowType","ID","CounterpartyID","StartDate","TerminationDate","FixedRate","NPV","ParRate","Spread","SwapType","PayFixed"
FROM main_tbl;

-- risk_tbl
INSERT INTO pg.public.risk_tbl (
  "ID","1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M","10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y","9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y","N","R","z","RowType"
)
SELECT 
  "ID","1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M","10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y","9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y","N","R","z","RowType"
FROM risk_tbl;

-- main_agg
INSERT INTO pg.public.main_agg (
  "RowType","ID","NPV"
)
SELECT 
  "RowType","ID","NPV"
FROM main_agg;

-- risk_agg
INSERT INTO pg.public.risk_agg (
  "RowType","ID","1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M","10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y","9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y","N","R","z"
)
SELECT 
  "RowType","ID","1W","2W","3W","1M","2M","3M","4M","5M","6M","7M","8M","9M","10M","11M","12M","18M","2Y","3Y","4Y","5Y","6Y","7Y","8Y","9Y","10Y","12Y","15Y","20Y","25Y","30Y","40Y","N","R","z"
FROM risk_agg;

COMMIT;

-- Show counts from remote Postgres
SELECT 'main_tbl' AS table, COUNT(*) AS rows FROM pg.public.main_tbl;
SELECT 'risk_tbl' AS table, COUNT(*) AS rows FROM pg.public.risk_tbl;
SELECT 'main_agg' AS table, COUNT(*) AS rows FROM pg.public.main_agg;
SELECT 'risk_agg' AS table, COUNT(*) AS rows FROM pg.public.risk_agg;
SQL

echo "==> Done streaming DuckDB to Postgres."

