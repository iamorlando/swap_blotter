import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// This project loads real data from DuckDB → Postgres/Neon.
// Keep seeding as a no-op so `prisma db seed` succeeds without touching data.
async function main() {
  console.log("Seed skipped: data is loaded from DuckDB/Neon.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
