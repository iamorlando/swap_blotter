import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { idField as generatedIdField, columnsMeta as generatedColumns, tableName as generatedTable } from "@/generated/blotterColumns";
const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);
    const sortFieldRaw = searchParams.get("sortField") ?? generatedIdField ?? "id";
    const sortOrder = (searchParams.get("sortOrder") ?? "asc") as "asc" | "desc";

    // Validate sort field against generated columns if available
    const colSet = new Set((generatedColumns || []).map((c) => c.field));
    const sortField = colSet.size > 0 && colSet.has(sortFieldRaw) ? sortFieldRaw : (generatedIdField || sortFieldRaw);

    // Resolve Prisma model based on tableName (e.g., main -> main)
    const modelProp = (generatedTable || "main").split("_").map((p, i) => i === 0 ? p.toLowerCase() : (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join("");
    const repo = (prisma as any)[modelProp] || (prisma as any).main;

    const total = await repo.count();
    const rows = await repo.findMany({
      skip: page * pageSize,
      take: pageSize,
      orderBy: { [sortField]: sortOrder as any },
    });

    // Ensure DataGrid row id exists
    const idKey = (generatedIdField || "id") as keyof typeof rows[number];
    const shaped = rows.map((r: any) => ({ ...r, id: (r as any)[idKey] ?? (r as any).id }));

    return NextResponse.json({ total, rows: shaped });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
