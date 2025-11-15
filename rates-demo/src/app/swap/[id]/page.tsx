import * as React from "react";

export default function SwapFullPage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-4">Swap {id}</h1>
      <p className="text-gray-300">Direct link view. When navigated from the landing page, this opens as a modal overlay to preserve the running datafeed and calibration.</p>
    </div>
  );
}

