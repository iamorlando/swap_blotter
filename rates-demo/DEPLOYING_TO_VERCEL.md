Deploying to Vercel (Next.js + Prisma + Pyodide)

Prereqs
- Node 18+ locally
- A Postgres database (Vercel Postgres recommended)

1) Create the Vercel project
- Import this repo in Vercel and set the project root to `rates-demo`.
- Framework preset: Next.js

2) Provision Postgres
- In Vercel, add the Postgres integration to the project (or use Neon/other Postgres).
- Copy the pooled connection string and set it in project env vars as `DATABASE_URL`.

3) Local setup (one-time)
- `cd rates-demo`
- `cp .env.example .env` and set `DATABASE_URL` to your Postgres connection string.
- Push schema and seed:
  - `npm i`
  - `npx prisma db push`
  - `npx prisma db seed`

4) Build & deploy
- Push to your Git provider; Vercel will build automatically.
- Next.js is auto-detected; `postinstall` runs `prisma generate` during the build.

5) Routes and runtime
- `/api/swaps` uses Prisma (Node runtime, default).
- Client-side Web Workers (datafeed and calibration) load Pyodide from the jsDelivr CDN and read Python from `/public/py`.

Notes
- SQLite is not supported on Vercel for production; this project is configured for Postgres.
- If Pyodide CDN access must be overridden, set `PYODIDE_BASE`/`PYODIDE_URL` env vars.
- For multi-million row imports from DuckDB, prefer streaming:
  - Use a DIRECT Postgres URL (Neon direct) for bulk load: set `DIRECT_DATABASE_URL` locally.
  - Run: `npm run migrate:duckdb:stream` (uses DuckDB's Postgres extension; no CSVs).
  - After load, keep app `DATABASE_URL` pointed at the pooled URL (PgBouncer) for runtime.
