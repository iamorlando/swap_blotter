"use client";

import * as React from "react";

export function ShareSwapButton({ swapId }: { swapId: string }) {
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const shareUrl = React.useCallback(() => {
    if (typeof window === "undefined") return `/swap/${encodeURIComponent(swapId)}`;
    return `${window.location.origin}/swap/${encodeURIComponent(swapId)}`;
  }, [swapId]);

  const handleShare = React.useCallback(async () => {
    const url = shareUrl();
    const title = `Swap ${swapId}`;
    const setNote = (msg: string) => {
      setFeedback(msg);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setFeedback(null), 1800);
    };
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setNote("Shared");
        return;
      }
    } catch (err) {
      console.error("[share] navigator.share", err);
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setNote("Link copied");
        return;
      }
    } catch (err) {
      console.error("[share] clipboard", err);
    }
    setNote("Link ready");
  }, [shareUrl, swapId]);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleShare}
        className="text-gray-400 hover:text-gray-200 p-2"
        title="Share link"
        aria-label="Share link"
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M13.75 2.5a3.75 3.75 0 013.75 3.75v7.5a3.75 3.75 0 01-3.75 3.75h-7.5A3.75 3.75 0 012.5 13.75v-7.5A3.75 3.75 0 016.25 2.5h7.5zm0 1.5h-7.5A2.25 2.25 0 004 6.25v7.5A2.25 2.25 0 006.25 16h7.5A2.25 2.25 0 0016 13.75v-7.5A2.25 2.25 0 0013.75 4z" />
          <path d="M10.53 5.47a.75.75 0 00-1.06 0L7.22 7.72a.75.75 0 101.06 1.06L9.25 7.81v3.69a.75.75 0 001.5 0V7.81l1 1a.75.75 0 001.06-1.06l-2.28-2.28z" />
        </svg>
      </button>
      {feedback && <span className="text-[11px] text-amber-300">{feedback}</span>}
    </div>
  );
}
