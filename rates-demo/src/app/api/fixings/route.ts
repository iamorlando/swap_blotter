import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const index = searchParams.get("index");
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    if (!index || !start || !end) {
      return NextResponse.json({ error: "index, start, and end are required" }, { status: 400 });
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
      return NextResponse.json({ error: "invalid date range" }, { status: 400 });
    }
    const rows = await prisma.fixing.findMany({
      where: {
        indexName: index,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: "asc" },
      select: { indexName: true, date: true, value: true },
    });
    return NextResponse.json({ rows });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
