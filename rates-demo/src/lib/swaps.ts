import prisma from "@/lib/prisma";
import { idField as generatedIdField, tableName as generatedTable } from "@/generated/blotterColumns";

export type SwapRecord = Record<string, any> & { id: string | number };

const modelProp = (generatedTable || "main_tbl")
  .split("_")
  .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
  .join("");

function coerceSwap(row: Record<string, any> | null) {
  if (!row) return null;
  const idKey = (generatedIdField || "ID") as string;
  const notionalRaw = (row as any).Notional;
  const shaped: SwapRecord = {
    ...row,
    id: (row as any)[idKey] ?? (row as any).id,
    Notional: notionalRaw == null ? null : Number(notionalRaw),
  };
  return shaped;
}

export async function fetchSwapById(id: string) {
  const repo = (prisma as any)[modelProp] || (prisma as any).mainTbl || (prisma as any).main;
  if (!repo) return null;
  const key = (generatedIdField || "ID") as string;
  const where = { [key]: id } as any;

  try {
    const swap = await repo.findUnique({ where });
    if (swap) return coerceSwap(swap);
  } catch (err) {
    console.error("[swap-og] findUnique", err);
  }

  try {
    const swap = await repo.findFirst({ where });
    if (swap) return coerceSwap(swap);
  } catch (err) {
    console.error("[swap-og] findFirst", err);
  }

  return null;
}
