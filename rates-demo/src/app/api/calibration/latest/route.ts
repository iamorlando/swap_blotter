import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const latest = await prisma.calibration.findFirst({
      where: { curve_id: "sofr" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, json: true },
    });
    if (!latest?.json) {
      return NextResponse.json({ error: "no calibration" }, { status: 404 });
    }
    return NextResponse.json({ timestamp: latest.timestamp, json: latest.json });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
