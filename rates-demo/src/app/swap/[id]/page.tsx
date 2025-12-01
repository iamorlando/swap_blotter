import type { Metadata } from "next";
import { fetchSwapById } from "@/lib/swaps";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const swap = await fetchSwapById(params.id);
  const swapId = swap?.ID ?? swap?.id ?? params.id;
  const now = new Date();
  const asOf = `${String(now.getUTCDate()).padStart(2, "0")}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${now.getUTCFullYear()} ${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`;
  const descParts = [
    swap?.SwapType ? String(swap.SwapType) : null,
    swap?.FixedRate != null ? `Fixed ${Number(swap.FixedRate).toFixed(2)}%` : null,
    swap?.ParRate != null ? `Par ${Number(swap.ParRate).toFixed(2)}%` : null,
    swap?.Notional != null ? `Notional ${Number(swap.Notional).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : null,
  ].filter(Boolean);
  const description = descParts.length ? descParts.join(" · ") : "Live swap snapshot from the rates blotter.";
  const imagePath = `/api/swap-og?id=${encodeURIComponent(params.id)}`;

  const metadata: Metadata = {
    title: `Swap ${swapId} · As of ${asOf}`,
    description,
    openGraph: {
      title: `Swap ${swapId} · As of ${asOf}`,
      description,
      images: [imagePath],
    },
    twitter: {
      card: "summary_large_image",
      title: `Swap ${swapId} · As of ${asOf}`,
      description,
      images: [imagePath],
    },
  };

  if (baseUrl) {
    metadata.metadataBase = new URL(baseUrl);
  }

  return metadata;
}

export default function SwapFullPage({ params }: { params: { id: string } }) {
  const { id } = params;

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif", color: "#e5e7eb", background: "#0b1220", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Swap {id}</h1>
      <p style={{ color: "#cbd5e1", maxWidth: 640 }}>
        This endpoint is primarily for link previews. If you are seeing this page, please visit the datafeed view:
        <a href={`/?swap=${encodeURIComponent(id)}`} style={{ color: "#60a5fa", marginLeft: 8 }}>Open swap</a>
      </p>
      <script
        dangerouslySetInnerHTML={{
          __html: `if (typeof window !== "undefined" && !/bot|crawler|spider|preview|link|meta/i.test(navigator.userAgent)) { window.location.replace("/?swap=${encodeURIComponent(
            id
          )}"); }`,
        }}
      />
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=/?swap=${encodeURIComponent(id)}`} />
      </noscript>
    </div>
  );
}
