import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in dev to avoid
// exhausting connections on Neon.
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // You can tweak timeouts/retries if needed for serverless/pooled connections.
    // log: ["query", "info", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;

