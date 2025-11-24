"use client";

import * as React from "react";

type Props = {
  initialTopHeight?: number; // px
  initialTopRatio?: number; // 0..1, used when height not provided
  minTop?: number; // px
  minBottom?: number; // px
  top: React.ReactNode;
  bottom: React.ReactNode;
};

export default function VerticalSplit({
  initialTopHeight,
  initialTopRatio = 0.5,
  minTop = 240,
  minBottom = 96,
  top,
  bottom,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [topH, setTopH] = React.useState<number>(initialTopHeight ?? 0);
  const dragging = React.useRef(false);

  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let newH = e.clientY - rect.top;
      const maxTop = rect.height - minBottom;
      newH = Math.max(minTop, Math.min(maxTop, newH));
      setTopH(newH);
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
  }, [minBottom, minTop]);

  React.useEffect(() => {
    if (initialTopHeight != null) return;
    if (topH > 0) return;
    const c = containerRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const target = rect.height * initialTopRatio;
    const maxTop = rect.height - minBottom;
    const clamped = Math.max(minTop, Math.min(maxTop, target));
    setTopH(clamped);
  }, [initialTopHeight, initialTopRatio, minBottom, minTop, topH]);

  function onDown() {
    dragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div ref={containerRef} className="flex flex-col min-h-[70vh] h-[calc(100vh-2rem)]">
      <div className="min-h-0 overflow-hidden" style={{ height: topH || minTop }}>
        <div className="h-full min-h-0 flex flex-col">
          {top}
        </div>
      </div>
      <div
        className="h-2 cursor-row-resize bg-gray-800 hover:bg-gray-700 active:bg-gray-600"
        onMouseDown={onDown}
        role="separator"
        aria-orientation="horizontal"
      />
      <div className="flex-1 min-h-0 overflow-auto">{bottom}</div>
    </div>
  );
}
