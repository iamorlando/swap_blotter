"use client";

import * as React from "react";

type Props = {
  initialLeftPct?: number; // 0..1
  minLeftPct?: number;
  minRightPct?: number;
  left: React.ReactNode;
  right: React.ReactNode;
};

export default function HorizontalSplit({
  initialLeftPct = 0.65,
  minLeftPct = 0.4,
  minRightPct = 0.25,
  left,
  right,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [leftPct, setLeftPct] = React.useState(initialLeftPct);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const c = containerRef.current;
      if (!c) return;
      const rect = c.getBoundingClientRect();
      let pct = (e.clientX - rect.left) / rect.width;
      const minL = minLeftPct;
      const maxL = 1 - minRightPct;
      pct = Math.max(minL, Math.min(maxL, pct));
      setLeftPct(pct);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [minLeftPct, minRightPct]);

  function onDown() {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div ref={containerRef} className="w-full h-full flex">
      <div className="min-w-0 overflow-auto" style={{ width: `${leftPct * 100}%` }}>
        {left}
      </div>
      <div
        className="w-1 cursor-col-resize bg-gray-800 hover:bg-gray-700 active:bg-gray-600"
        onMouseDown={onDown}
        role="separator"
        aria-orientation="vertical"
      />
      <div className="flex-1 min-w-0 overflow-auto">{right}</div>
    </div>
  );
}

