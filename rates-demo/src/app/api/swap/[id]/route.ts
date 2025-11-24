import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { idField as generatedIdField, tableName as generatedTable } from "@/generated/blotterColumns";

const modelProp = (generatedTable || "main_tbl")
  .split("_")
  .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
  .join("");

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const repo = (prisma as any)[modelProp] || (prisma as any).mainTbl || (prisma as any).main;
  if (!repo) {
    return NextResponse.json({ error: "repository unavailable" }, { status: 500 });
  }

  const key = (generatedIdField || "ID") as string;
  const where = { [key]: params.id } as any;

  try {
    const swap = await repo.findUnique({ where });
    if (!swap) return NextResponse.json({ swap: null }, { status: 404 });
    const notionalRaw = (swap as any).Notional;
    const shaped = {
      ...swap,
      id: (swap as any)[key] ?? (swap as any).id,
      Notional: notionalRaw == null ? null : Number(notionalRaw),
    };
    return NextResponse.json({ swap: shaped });
  } catch (err: any) {
    console.error("[api/swap] error", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
