import type { Metadata } from "next";
import { fetchSwapById } from "@/lib/swaps";
import { redirect } from "next/navigation";

const baseUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const swap = await fetchSwapById(params.id);
  const swapId = swap?.ID ?? swap?.id ?? params.id;
  const descParts = [
    swap?.SwapType ? String(swap.SwapType) : null,
    swap?.FixedRate != null ? `Fixed ${Number(swap.FixedRate * 100).toFixed(2)}%` : null,
    swap?.ParRate != null ? `Par ${Number(swap.ParRate * 100).toFixed(2)}%` : null,
    swap?.Notional != null ? `Notional ${Number(swap.Notional).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}` : null,
  ].filter(Boolean);
  const description = descParts.length ? descParts.join(" · ") : "Live swap snapshot from the rates blotter.";
  const imagePath = `/swap/${params.id}/opengraph-image`;

  const metadata: Metadata = {
    title: `Swap ${swapId} | Rates Demo`,
    description,
    openGraph: {
      title: `Swap ${swapId} | Rates Demo`,
      description,
      images: [imagePath],
    },
    twitter: {
      card: "summary_large_image",
      title: `Swap ${swapId} | Rates Demo`,
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
  redirect(`/?swap=${encodeURIComponent(id)}`);
}
