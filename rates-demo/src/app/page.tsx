import * as React from "react";
import DatafeedPage from "@/app/datafeed/page";

export default function Page() {
  return (
    <React.Suspense fallback={null}>
      <DatafeedPage />
    </React.Suspense>
  );
}
