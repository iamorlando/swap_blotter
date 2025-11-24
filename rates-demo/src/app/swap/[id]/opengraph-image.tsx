import { ImageResponse } from "next/og";
export const runtime = "edge";
export const dynamic = "force-dynamic";
export const alt = "Swap summary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const formatUsd = (val: any) => {
  if (val == null) return "—";
  const num = Number(val);
  if (!Number.isFinite(num)) return "—";
  return usd.format(num);
};

const formatPct = (val: any) => {
  if (val == null) return "—";
  const num = Number(val)/100.0;
  if (!Number.isFinite(num)) return "—";
  return `${(num).toFixed(2)}%`;
};

const formatDate = (val: any) => {
  if (!val) return "—";
  const d = new Date(val as any);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fieldStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const;

const labelStyle = {
  display: "flex",
  alignItems: "center",
  fontSize: 18,
  color: "#94a3b8",
} as const;

const valueStyle = {
  display: "flex",
  alignItems: "center",
  fontSize: 30,
  fontWeight: 700,
  color: "#e2e8f0",
} as const;

export default async function Image({ params }: { params: { id: string } }) {
  const apiUrl = new URL(`/api/swap/${encodeURIComponent(params.id)}`, baseUrl);
  let swap: any = null;
  try {
    const res = await fetch(apiUrl.toString(), { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      swap = data?.swap ?? null;
    }
  } catch (err) {
    console.error("[swap og] fetch", err);
  }
  const idLabel = swap?.ID ?? swap?.id ?? params.id;
  const swapType = swap?.SwapType || "Interest Rate Swap";
  const payDir = swap?.PayFixed == null ? "" : swap.PayFixed ? "Pay fixed" : "Receive fixed";
  const npv = formatUsd(swap?.NPV);
  const notional = formatUsd(swap?.Notional == null ? null : Math.abs(Number(swap.Notional)));
  const par = formatPct(swap?.ParRate);
  const fixed = formatPct(swap?.FixedRate);
  const start = formatDate(swap?.StartDate);
  const end = formatDate(swap?.TerminationDate);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0b1220",
          color: "#e5e7eb",
          fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
          padding: 40,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            borderRadius: 28,
            padding: 42,
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))",
            border: "1px solid rgba(59,130,246,0.18)",
            boxShadow: "0 30px 120px rgba(0,0,0,0.45)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", fontSize: 20, color: "#94a3b8" }}>Swap</div>
              <div style={{ display: "flex", fontSize: 52, fontWeight: 800, color: "#f8fafc", letterSpacing: -0.5 }}>#{idLabel}</div>
              <div style={{ display: "flex", fontSize: 22, color: "#cbd5e1" }}>{swapType}</div>
              {payDir ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginTop: 6,
                    padding: "8px 14px",
                    borderRadius: 999,
                    border: "1px solid rgba(59,130,246,0.4)",
                    background: "rgba(59,130,246,0.08)",
                    fontSize: 18,
                    color: "#bfdbfe",
                  }}
                >
                  {payDir}
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
                padding: "12px 16px",
                borderRadius: 16,
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(226,232,240,0.08)",
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 18, color: "#cbd5e1" }}>NPV</div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: (swap?.NPV ?? 0) >= 0 ? "#34d399" : "#f87171",
                  letterSpacing: -0.5,
                }}
              >
                {npv}
              </div>
              <div style={{ fontSize: 16, color: "#94a3b8" }}>Live valuation snapshot</div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              padding: 20,
              borderRadius: 18,
              background: "rgba(30,41,59,0.65)",
              border: "1px solid rgba(148,163,184,0.16)",
            }}
          >
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Notional</div>
              <div style={valueStyle}>{notional}</div>
            </div>
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Fixed rate</div>
              <div style={valueStyle}>{fixed}</div>
            </div>
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Par rate</div>
              <div style={valueStyle}>{par}</div>
            </div>
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Start</div>
              <div style={valueStyle}>{start}</div>
            </div>
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Maturity</div>
              <div style={valueStyle}>{end}</div>
            </div>
            <div style={{ ...fieldStyle, minWidth: 220, flex: "1 1 220px" }}>
              <div style={labelStyle}>Counterparty</div>
              <div style={valueStyle}>{swap?.CounterpartyID ?? "—"}</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#94a3b8", fontSize: 18 }}>
            <div style={{ display: "flex", alignItems: "center" }}>rates-demo · live swap snapshot</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#22c55e",
                  boxShadow: "0 0 12px rgba(34,197,94,0.7)",
                }}
              />
              <span style={{ display: "flex", alignItems: "center" }}>live</span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
