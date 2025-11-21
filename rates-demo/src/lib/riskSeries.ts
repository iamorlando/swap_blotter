export type RiskExposure = { term: string; exposure: number };

const EXCLUDED_KEYS = new Set(["r", "pricingtime", "z", "rowtype", "id", "__typename"]);

export function buildRiskSeries(row?: Record<string, any> | null) {
  if (!row) return { exposures: [] as RiskExposure[], dvo1: 0 };
  const entries: RiskExposure[] = [];
  Object.entries(row).forEach(([key, val]) => {
    const normalized = key.toLowerCase();
    if (EXCLUDED_KEYS.has(normalized)) return;
    const num = typeof val === "number" ? val : Number(val);
    if (!Number.isFinite(num) || Math.abs(num) < 1e-10 || num === 0) return;
    const term = key.startsWith("c_") ? key.slice(2) : key;
    entries.push({ term, exposure: num });
  });
  entries.sort((a, b) => compareTenors(a.term, b.term));
  const dvo1 = entries.reduce((acc, e) => acc + (Number.isFinite(e.exposure) ? e.exposure : 0), 0);
  return { exposures: entries, dvo1 };
}

function compareTenors(a: string, b: string) {
  const va = tenorSortValue(a);
  const vb = tenorSortValue(b);
  if (Number.isFinite(va) && Number.isFinite(vb)) return va - vb;
  if (Number.isFinite(va)) return -1;
  if (Number.isFinite(vb)) return 1;
  return String(a).localeCompare(String(b));
}

function tenorSortValue(term: string) {
  const m = String(term).trim().toUpperCase().match(/^([0-9.]+)([WMY])$/);
  if (!m) return Number.POSITIVE_INFINITY;
  const value = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  if (unit === "W") return value * 7;
  if (unit === "M") return value * 30;
  if (unit === "Y") return value * 365;
  return Number.POSITIVE_INFINITY;
}
