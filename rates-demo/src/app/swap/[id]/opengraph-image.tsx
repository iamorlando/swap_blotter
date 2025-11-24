export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "Swap summary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  return fetch(`/api/swap-og?id=${encodeURIComponent(params.id)}`, { cache: "no-store" });
}
