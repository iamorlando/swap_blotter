import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.swap.deleteMany();
  const items = Array.from({ length: 100 }).map((_, i) => ({
    name: `Swap-${i + 1}`,
    maturity: `20${(25 + (i % 5)).toString()}-12-31`,
    pv: parseFloat(((Math.random() * 2000 - 1000)).toFixed(2)),
  }));
  await prisma.swap.createMany({ data: items });
  console.log("Seeded 100 swaps");
}

main().finally(() => prisma.$disconnect());

