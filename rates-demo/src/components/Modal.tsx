"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

type Props = {
  children: React.ReactNode;
  title?: string;
};

export default function Modal({ children, title }: Props) {
  const router = useRouter();
  const onClose = React.useCallback(() => router.back(), [router]);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const [maximized, setMaximized] = React.useState(false);
  const toggleMax = React.useCallback(() => setMaximized((v) => !v), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={`relative overflow-auto bg-gray-900 shadow-xl ${maximized
          ? "w-screen h-screen max-h-none rounded-none border-none"
          : "w-[min(900px,92vw)] max-h-[90vh] rounded-lg border border-gray-800"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 sticky top-0 bg-gray-900/95 backdrop-blur">
          <div className="text-sm font-medium text-gray-200">{title ?? "Swap"}</div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleMax}
              className="text-gray-400 hover:text-gray-200 px-2 py-1 text-xs uppercase tracking-wide"
            >
              {maximized ? "Restore" : "Maximize"}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 px-2 py-1">✕</button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
