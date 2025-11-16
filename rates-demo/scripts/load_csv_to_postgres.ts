/*
  Loads data exported from DuckDB into Postgres via Prisma, without psql.
  Expects files in .migrate_csv/: main_tbl.csv, risk_tbl.csv, main_agg.csv, risk_agg.csv
*/
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseCSV(filePath: string): Record<string, string | null>[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return [];
  // naive CSV split that handles simple quoted fields
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; }
          else { inQuotes = false; }
        } else {
          cur += ch;
        }
      } else {
        if (ch === ',') { out.push(cur); cur = ''; }
        else if (ch === '"') { inQuotes = true; }
        else { cur += ch; }
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseLine(line);
    const obj: Record<string, string | null> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = (i < vals.length ? (vals[i] === '' ? null : vals[i]) : null);
    }
    return obj;
  });
}

function toFloat(v: any): number | null { if (v == null) return null; const n = Number(v); return isFinite(n) ? n : null; }
function toBool(v: any): boolean | null { if (v == null) return null; const s = String(v).toLowerCase(); if (s === 'true' || s === 't' || s === '1') return true; if (s === 'false' || s === 'f' || s === '0') return false; return null; }
function toDate(v: any): Date | null { if (v == null) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }

async function loadMainTbl(dir: string) {
  const fp = path.join(dir, 'main_tbl.csv');
  if (!fs.existsSync(fp)) { console.warn('skip: main_tbl.csv not found'); return; }
  const rows = parseCSV(fp);
  if (!rows.length) { console.log('main_tbl: no rows'); return; }
  const data = rows.map(r => ({
    ID: r['ID']!,
    RowType: r['RowType'] ?? undefined,
    CounterpartyID: r['CounterpartyID'] ?? undefined,
    StartDate: toDate(r['StartDate']) ?? undefined,
    TerminationDate: toDate(r['TerminationDate']) ?? undefined,
    FixedRate: toFloat(r['FixedRate']) ?? undefined,
    NPV: toFloat(r['NPV']) ?? undefined,
    ParRate: toFloat(r['ParRate']) ?? undefined,
    // ParSpread: toFloat(r['ParSpread']) ?? undefined,
    SwapType: r['SwapType'] ?? undefined,
    PayFixed: toBool(r['PayFixed']) ?? undefined,
  }));
  await (prisma as any).mainTbl.createMany({ data, skipDuplicates: true });
  console.log(`main_tbl: inserted ${data.length}`);
}

const bucketCols = ['1W','2W','3W','1M','2M','3M','4M','5M','6M','7M','8M','9M','10M','11M','12M','18M','2Y','3Y','4Y','5Y','6Y','7Y','8Y','9Y','10Y','12Y','15Y','20Y','25Y','30Y','40Y'];

async function loadRiskTbl(dir: string) {
  const fp = path.join(dir, 'risk_tbl.csv');
  if (!fs.existsSync(fp)) { console.warn('skip: risk_tbl.csv not found'); return; }
  const rows = parseCSV(fp);
  if (!rows.length) { console.log('risk_tbl: no rows'); return; }
  const data = rows.map(r => {
    const o: any = { ID: r['ID']! };
    for (const b of bucketCols) o[`c_${b}`] = toFloat(r[b]) ?? undefined;
    o['R'] = toFloat(r['R']) ?? undefined;
    o['z'] = toFloat(r['z']) ?? undefined;
    o['RowType'] = r['RowType'] ?? undefined;
    return o;
  });
  await (prisma as any).riskTbl.createMany({ data, skipDuplicates: true });
  console.log(`risk_tbl: inserted ${data.length}`);
}

async function loadMainAgg(dir: string) {
  const fp = path.join(dir, 'main_agg.csv');
  if (!fs.existsSync(fp)) { console.warn('skip: main_agg.csv not found'); return; }
  const rows = parseCSV(fp);
  if (!rows.length) { console.log('main_agg: no rows'); return; }
  const data = rows.map(r => ({
    RowType: r['RowType']!,
    ID: r['ID']!,
    NPV: toFloat(r['NPV']) ?? undefined,
  }));
  await (prisma as any).mainAgg.createMany({ data, skipDuplicates: true });
  console.log(`main_agg: inserted ${data.length}`);
}

async function loadRiskAgg(dir: string) {
  const fp = path.join(dir, 'risk_agg.csv');
  if (!fs.existsSync(fp)) { console.warn('skip: risk_agg.csv not found'); return; }
  const rows = parseCSV(fp);
  if (!rows.length) { console.log('risk_agg: no rows'); return; }
  const data = rows.map(r => {
    const o: any = { RowType: r['RowType']!, ID: r['ID']! };
    for (const b of bucketCols) o[`c_${b}`] = toFloat(r[b]) ?? undefined;
    o['R'] = toFloat(r['R']) ?? undefined;
    o['z'] = toFloat(r['z']) ?? undefined;
    return o;
  });
  await (prisma as any).riskAgg.createMany({ data, skipDuplicates: true });
  console.log(`risk_agg: inserted ${data.length}`);
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, '.migrate_csv');
  await loadMainTbl(outDir);
  await loadRiskTbl(outDir);
  await loadMainAgg(outDir);
  await loadRiskAgg(outDir);
}

main().finally(() => prisma.$disconnect());
