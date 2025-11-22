import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const RISK_TERMS = [
  "1W", "2W", "3W", "1M", "2M", "3M", "4M", "5M", "6M", "7M", "8M", "9M", "10M", "11M", "12M",
  "18M", "2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "9Y", "10Y", "12Y", "15Y", "20Y", "25Y", "30Y", "40Y",
];

type BucketKey = {
  key: string;
  label: string;
  startDate: string;
  startDays: number;
  spanDays: number;
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date) {
  const dow = d.getDay(); // 0 = Sun
  const diff = (dow === 0 ? -6 : 1 - dow); // Monday as start
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  return startOfDay(start);
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d: Date) {
  return new Date(d.getFullYear(), 0, 1);
}

function daysBetween(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function bucketForDate(raw: Date, today: Date): BucketKey | null {
  const date = startOfDay(raw);
  const diffDays = daysBetween(date, today);
  if (diffDays < 0) return null;

  // Daily up to 1 week
  if (diffDays <= 7) {
    const label = date.toISOString().slice(0, 10);
    return { key: `day:${label}`, label, startDate: label, startDays: diffDays, spanDays: 1 };
  }

  // Weekly up to 1 month
  if (diffDays <= 30) {
    const start = startOfWeek(date);
    const label = `Week of ${start.toISOString().slice(0, 10)}`;
    const spanDays = 7;
    return { key: `week:${start.toISOString().slice(0, 10)}`, label, startDate: start.toISOString().slice(0, 10), startDays: daysBetween(start, today), spanDays };
  }

  // Monthly up to 1 year
  if (diffDays <= 365) {
    const start = startOfMonth(date);
    const nextMonth = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const spanDays = Math.max(28, daysBetween(nextMonth, start));
    const label = start.toISOString().slice(0, 7);
    return { key: `month:${label}`, label, startDate: start.toISOString().slice(0, 10), startDays: daysBetween(start, today), spanDays };
  }

  // Yearly up to 10 years
  if (diffDays <= 365 * 10) {
    const start = startOfYear(date);
    const spanDays = daysBetween(new Date(start.getFullYear() + 1, 0, 1), start);
    const label = String(start.getFullYear());
    return { key: `year:${label}`, label, startDate: start.toISOString().slice(0, 10), startDays: daysBetween(start, today), spanDays };
  }

  // 5-year buckets up to 40 years
  const baseYear = today.getFullYear();
  const year = date.getFullYear();
  if (year > baseYear + 40) return null;
  const offset = Math.floor((year - baseYear) / 5);
  const startYear = baseYear + offset * 5;
  const start = new Date(startYear, 0, 1);
  const end = new Date(startYear + 5, 0, 1);
  const spanDays = daysBetween(end, start);
  const label = `${startYear}-${startYear + 4}`;
  return { key: `5y:${label}`, label, startDate: start.toISOString().slice(0, 10), startDays: daysBetween(start, today), spanDays };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const counterpartyId = searchParams.get("counterpartyId") || searchParams.get("id");
    if (!counterpartyId) {
      return NextResponse.json({ error: "counterpartyId is required" }, { status: 400 });
    }
    const today = startOfDay(new Date());

    const [cfRows, riskRows] = await Promise.all([
      prisma.cashflowTbl.findMany({
        where: { CounterpartyID: counterpartyId, PaymentDate: { gte: today } },
        select: { PaymentDate: true, TotalCashflow: true, TotalWeight: true },
      }),
      prisma.cashflowRiskTbl.findMany({
        where: { CounterpartyID: counterpartyId, PaymentDate: { gte: today } },
      }),
    ]);

    const buckets = new Map<string, {
      key: BucketKey;
      cashflow: number;
      weight: number;
      risk: Record<string, number>;
    }>();

    const upsertBucket = (bucket: BucketKey) => {
      const existing = buckets.get(bucket.key);
      if (existing) return existing;
      const next = { key: bucket, cashflow: 0, weight: 0, risk: {} as Record<string, number> };
      buckets.set(bucket.key, next);
      return next;
    };

    cfRows.forEach((row) => {
      if (!row.PaymentDate) return;
      const bucket = bucketForDate(new Date(row.PaymentDate), today);
      if (!bucket) return;
      const entry = upsertBucket(bucket);
      entry.cashflow += Number(row.TotalCashflow ?? 0);
      entry.weight += Number(row.TotalWeight ?? 0);
    });

    riskRows.forEach((row) => {
      if (!row.PaymentDate) return;
      const bucket = bucketForDate(new Date(row.PaymentDate), today);
      if (!bucket) return;
      const entry = upsertBucket(bucket);
      RISK_TERMS.forEach((term) => {
        const key = `c_${term}` as keyof typeof row;
        const val = row[key];
        if (val == null) return;
        const num = Number(val);
        if (!Number.isFinite(num)) return;
        entry.risk[key] = (entry.risk[key] ?? 0) + num;
      });
    });

    const out = Array.from(buckets.values())
      .map((entry) => {
        const { key, cashflow, weight, risk } = entry;
        return {
          bucket: key.key,
          label: key.label,
          startDate: key.startDate,
          startDays: key.startDays,
          spanDays: key.spanDays,
          cashflow,
          weight,
          risk,
        };
      })
      .sort((a, b) => (a.startDays ?? 0) - (b.startDays ?? 0));

    return NextResponse.json({ buckets: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
