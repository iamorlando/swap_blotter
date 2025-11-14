import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

function modelPropFor(table: string) {
  return table.split("_").map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join("");
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = params.id;
    const repo = (prisma as any).riskTbl;
    const rows = await repo.findMany({ where: { ID: isNaN(Number(id)) ? id : Number(id) } });
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
