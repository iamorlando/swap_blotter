"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useIsMobileViewport } from "@/lib/useIsMobileViewport";

type Props = {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  onClose?: () => void;
};

export default function Modal({ children, title, actions, onClose }: Props) {
  const router = useRouter();
  const handleClose = React.useMemo(() => onClose ?? (() => router.back()), [onClose, router]);
  const onCloseRef = React.useRef(handleClose);
  React.useEffect(() => { onCloseRef.current = handleClose; }, [handleClose]);
  const isMobile = useIsMobileViewport();
  const [maximized, setMaximized] = React.useState(() => isMobile);
  const toggleMax = React.useCallback(() => {
    if (isMobile) return;
    setMaximized((v) => !v);
  }, [isMobile]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (isMobile) {
      setMaximized(true);
    }
  }, [isMobile]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCloseRef.current} />
      <div
        className={`relative overflow-auto bg-gray-900 shadow-xl ${maximized
          ? "w-screen h-screen max-h-none rounded-none border-none"
          : "w-[min(900px,92vw)] max-h-[90vh] rounded-lg border border-gray-800"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 sticky top-0 bg-gray-900/95 backdrop-blur">
          <div className="text-sm font-medium text-gray-200">{title ?? "Swap"}</div>
          <div className="flex items-center gap-1">
            {actions}
            {!isMobile && (
              <button
                onClick={toggleMax}
                className="text-gray-400 hover:text-gray-200 p-2"
                title={maximized ? "Restore" : "Maximize"}
                aria-label={maximized ? "Restore" : "Maximize"}
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path d="M5 3a2 2 0 00-2 2v2a1 1 0 102 0V5h2a1 1 0 000-2H5zM13 3a1 1 0 000 2h2v2a1 1 0 102 0V5a2 2 0 00-2-2h-2zM3 13a1 1 0 112 0v2h2a1 1 0 110 2H5a2 2 0 01-2-2v-2zM17 13a1 1 0 10-2 0v2h-2a1 1 0 100 2h2a2 2 0 002-2v-2z" />
                </svg>
              </button>
            )}
            <button onClick={onCloseRef.current} className="text-gray-400 hover:text-gray-200 p-2" aria-label="Close">
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 8.586L4.293 2.879A1 1 0 102.879 4.293L8.586 10l-5.707 5.707a1 1 0 101.414 1.414L10 11.414l5.707 5.707a1 1 0 001.414-1.414L11.414 10l5.707-5.707A1 1 0 0015.707 2.88L10 8.586z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
