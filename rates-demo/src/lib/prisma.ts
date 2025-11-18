import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid
// exhausting connections on Neon.
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

// Ensure we always have a DB URL at runtime. Vercel injects env vars, but as a safety
// net fall back to the known Neon URL when none is provided.
const defaultUrl = "postgresql://neondb_owner:npg_euWHJknG04cS@ep-plain-sky-a41s9xc1-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require";
const dbUrl = process.env.DATABASE_URL || defaultUrl;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    datasources: { db: { url: dbUrl } },
    // You can tweak timeouts/retries if needed for serverless/pooled connections.
    // log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
