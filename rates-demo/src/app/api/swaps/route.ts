import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "0", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
  const sortField = searchParams.get("sortField") ?? "id";
  const sortOrder = (searchParams.get("sortOrder") ?? "asc") as "asc" | "desc";

  const total = await prisma.swap.count();
  const rows = await prisma.swap.findMany({
    skip: page * pageSize,
    take: pageSize,
    orderBy: { [sortField]: sortOrder as any },
  });

  return NextResponse.json({ total, rows });
}

