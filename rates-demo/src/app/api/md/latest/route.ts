import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const latest = await prisma.oneDimensionalMarketData.findFirst({
      where: { curve_id: "sofr" },
      orderBy: { quote_time: "desc" },
      select: { quote_time: true },
    });
    if (!latest?.quote_time) {
      return NextResponse.json({ error: "no market data" }, { status: 404 });
    }

    // Postgres keeps microsecond precision while JS Date is millisecond; use a small window instead of strict equals.
    const start = new Date(latest.quote_time);
    const end = new Date(start.getTime() + 1000);

    const rows = await prisma.oneDimensionalMarketData.findMany({
      where: {
        curve_id: "sofr",
        quote_time: { gte: start, lt: end },
      },
      select: { Term: true, Rate: true },
      orderBy: { Term: "asc" },
    });
    if (!rows?.length) return NextResponse.json({ error: "no market data rows" }, { status: 404 });

    return NextResponse.json({ quote_time: latest.quote_time, rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
