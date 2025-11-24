export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const alt = "Swap summary";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  const url = new URL(`/api/swap-og?id=${encodeURIComponent(params.id)}`, "http://localhost");
  // The origin will be stripped by fetch inside Vercel edge; it treats relative URLs correctly when provided a dummy base
  url.host = ""; // ensures path-only request in edge
  return fetch(url.pathname + url.search, { cache: "no-store" });
}
