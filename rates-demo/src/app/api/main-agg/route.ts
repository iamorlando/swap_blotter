import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function modelPropFor(table: string) {
  return table.split("_").map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join("");
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const rowType = searchParams.get("rowType");
    if (!id || !rowType) return NextResponse.json({ error: "id and rowType are required" }, { status: 400 });
    const repo = (prisma as any)[modelPropFor("main_agg")] || (prisma as any).mainAgg;
    const row = await repo.findFirst({ where: { ID: isNaN(Number(id)) ? id : Number(id), RowType: rowType } });
    const safe = row ? { ...row, Notional: (row as any).Notional == null ? null : Number((row as any).Notional) } : null;
    return NextResponse.json({ row: safe });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
