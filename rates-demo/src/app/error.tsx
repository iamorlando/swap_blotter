"use client";

import * as React from "react";

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  React.useEffect(() => {
    console.error("Global error boundary caught:", error, "stack:", error?.stack);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center">
        <div className="max-w-lg p-6 rounded-lg border border-red-500/40 bg-red-900/20">
          <div className="text-lg font-semibold text-red-200 mb-2">Application error</div>
          <div className="text-sm text-red-100 whitespace-pre-wrap mb-4">
            {error?.message || "Unknown error"}
            {error?.stack ? `\n\nStack:\n${error.stack}` : ""}
          </div>
          <button
            className="px-3 py-1.5 rounded-md border border-red-400 text-red-200 hover:bg-red-400/10"
            onClick={() => reset()}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
