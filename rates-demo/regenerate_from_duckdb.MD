To rebuild the Postgres DB from your DuckDB in one go:

Make sure Postgres is running (your cluster is on port 5433).
From rates-demo:
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/swaps" \
  ./scripts/migrate_from_duckdb.sh swaps.duckdb
That script:

Exports CSVs from swaps.duckdb
Ensures the schema matches Prisma
Loads all tables (main_tbl, risk_tbl, main_agg, risk_agg, fixings) via psql COPY
If you ever change the Prisma schema and get a mismatch error, reset first:

DATABASE_URL="postgresql://postgres:postgres@localhost:5433/swaps" \
  npx prisma db push --accept-data-loss --force-reset
Then rerun the migrate script.

To sanity-check counts:

psql "postgresql://postgres:postgres@localhost:5433/swaps" -c \
"SELECT 'main_tbl', count(*) FROM main_tbl UNION ALL
 SELECT 'risk_tbl', count(*) FROM risk_tbl UNION ALL
 SELECT 'main_agg', count(*) FROM main_agg UNION ALL
 SELECT 'risk_agg', count(*) FROM risk_agg UNION ALL
 SELECT 'fixings', count(*) FROM fixings;"
That’s it—run the script whenever you need to regenerate the DB from DuckDB.