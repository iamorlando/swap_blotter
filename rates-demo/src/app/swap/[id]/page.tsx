import PyodideRandom from "@/components/PyodideRandom";

type Props = { params: { id: string } };

export default async function SwapDetailPage({ params }: Props) {
  const { id } = params;
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">im a swpa details page</h1>
      <div className="text-sm">Swap ID: {id}</div>
      <div>
        <div className="text-sm text-gray-600">client-side Pyodide, updating as fast as possible</div>
        <PyodideRandom fps={0} />
      </div>
    </div>
  );
}
