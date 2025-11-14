#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/migrate_from_duckdb.sh <path-to-swaps.duckdb> [DATABASE_URL]
#
# Requires in PATH: duckdb, psql, node (for prisma), npx

DUCKDB_FILE=${1:-"../swaps.duckdb"}
DB_URL_ARG=${2:-""}

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT_DIR/.migrate_csv"
mkdir -p "$OUT_DIR"

if ! command -v duckdb >/dev/null 2>&1; then
  echo "Error: duckdb CLI not found in PATH." >&2
  echo "Install DuckDB CLI: https://duckdb.org/docs/installation/cli.html" >&2
  exit 1
fi

USE_PSQL=1
if ! command -v psql >/dev/null 2>&1; then
  echo "Note: psql not found; will load via Prisma instead of psql COPY." >&2
  USE_PSQL=0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Error: npx not found. Please install Node.js >= 18." >&2
  exit 1
fi

if [ ! -f "$DUCKDB_FILE" ]; then
  echo "Error: DuckDB file not found at $DUCKDB_FILE" >&2
  exit 1
fi

if [ -n "$DB_URL_ARG" ]; then
  export DATABASE_URL="$DB_URL_ARG"
fi

# Fallback: read from rates-demo/.env if not provided
if [ -z "${DATABASE_URL:-}" ] && [ -f "$ROOT_DIR/.env" ]; then
  ENV_URL=$(grep -E '^DATABASE_URL=' "$ROOT_DIR/.env" | sed -e 's/^DATABASE_URL=//' -e 's/^"//' -e 's/"$//') || true
  if [ -n "$ENV_URL" ]; then
    export DATABASE_URL="$ENV_URL"
  fi
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL not set. Provide as 2nd argument or in rates-demo/.env" >&2
  exit 1
fi

if [ "$DUCKDB_FILE" = "none" ] || [ "$DUCKDB_FILE" = "skip" ]; then
  echo "==> Skipping DuckDB export (using existing CSVs in $OUT_DIR)"
else
  echo "==> Exporting CSVs from DuckDB: $DUCKDB_FILE"
  duckdb "$DUCKDB_FILE" <<'SQL'
COPY (SELECT * FROM main_tbl) TO 'main_tbl.csv' (HEADER, DELIMITER ',');
COPY (SELECT * FROM risk_tbl) TO 'risk_tbl.csv' (HEADER, DELIMITER ',');
COPY (SELECT * FROM main_agg) TO 'main_agg.csv' (HEADER, DELIMITER ',');
COPY (SELECT * FROM risk_agg) TO 'risk_agg.csv' (HEADER, DELIMITER ',');
SQL

  mv -f main_tbl.csv "$OUT_DIR/" || true
  mv -f risk_tbl.csv "$OUT_DIR/" || true
  mv -f main_agg.csv "$OUT_DIR/" || true
  mv -f risk_agg.csv "$OUT_DIR/" || true
fi

echo "==> Creating tables in Postgres via Prisma (db push)"
(cd "$ROOT_DIR" && npx prisma generate && npx prisma db push)

if [ "$USE_PSQL" -eq 1 ]; then
  echo "==> Loading CSVs into Postgres using psql COPY"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "COPY \"main_tbl\" (\"RowType\",\"ID\",\"CounterpartyID\",\"StartDate\",\"TerminationDate\",\"FixedRate\",\"NPV\",\"ParRate\",\"Spread\",\"SwapType\",\"PayFixed\") FROM '$OUT_DIR/main_tbl.csv' WITH (FORMAT csv, HEADER true)" 
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "COPY \"risk_tbl\" (\"ID\",\"1W\",\"2W\",\"3W\",\"1M\",\"2M\",\"3M\",\"4M\",\"5M\",\"6M\",\"7M\",\"8M\",\"9M\",\"10M\",\"11M\",\"12M\",\"18M\",\"2Y\",\"3Y\",\"4Y\",\"5Y\",\"6Y\",\"7Y\",\"8Y\",\"9Y\",\"10Y\",\"12Y\",\"15Y\",\"20Y\",\"25Y\",\"30Y\",\"40Y\",\"N\",\"R\",\"z\",\"RowType\") FROM '$OUT_DIR/risk_tbl.csv' WITH (FORMAT csv, HEADER true)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "COPY \"main_agg\" (\"RowType\",\"ID\",\"NPV\") FROM '$OUT_DIR/main_agg.csv' WITH (FORMAT csv, HEADER true)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "COPY \"risk_agg\" (\"RowType\",\"ID\",\"1W\",\"2W\",\"3W\",\"1M\",\"2M\",\"3M\",\"4M\",\"5M\",\"6M\",\"7M\",\"8M\",\"9M\",\"10M\",\"11M\",\"12M\",\"18M\",\"2Y\",\"3Y\",\"4Y\",\"5Y\",\"6Y\",\"7Y\",\"8Y\",\"9Y\",\"10Y\",\"12Y\",\"15Y\",\"20Y\",\"25Y\",\"30Y\",\"40Y\",\"N\",\"R\",\"z\") FROM '$OUT_DIR/risk_agg.csv' WITH (FORMAT csv, HEADER true)"
else
  echo "==> Loading via Prisma (no psql)"
  (cd "$ROOT_DIR" && npx tsx scripts/load_csv_to_postgres.ts)
fi

echo "==> Done. Row counts (if psql available):"
if [ "$USE_PSQL" -eq 1 ]; then
  psql "$DATABASE_URL" -c "SELECT 'main_tbl' AS table, COUNT(*) FROM \"main_tbl\" UNION ALL SELECT 'risk_tbl', COUNT(*) FROM \"risk_tbl\" UNION ALL SELECT 'main_agg', COUNT(*) FROM \"main_agg\" UNION ALL SELECT 'risk_agg', COUNT(*) FROM \"risk_agg\";" || true
fi

echo "==> Start the app: npm run dev"
