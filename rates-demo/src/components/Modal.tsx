"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  children: React.ReactNode;
  title?: string;
};

export default function Modal({ children, title }: Props) {
  const router = useRouter();
  const onClose = () => router.back();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[min(900px,92vw)] max-h-[90vh] overflow-auto rounded-lg border border-gray-800 bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 sticky top-0 bg-gray-900/95 backdrop-blur">
          <div className="text-sm font-medium text-gray-200">{title ?? "Swap"}</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 px-2 py-1">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

