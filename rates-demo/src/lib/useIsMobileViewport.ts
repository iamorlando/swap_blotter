import * as React from "react";

export function useIsMobileViewport(maxWidthPx = 768) {
  const [isMobile, setIsMobile] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const query = `(max-width: ${maxWidthPx}px)`;
    const mql = window.matchMedia(query);
    const update = (target: MediaQueryList | MediaQueryListEvent) => {
      setIsMobile("matches" in target ? target.matches : mql.matches);
    };
    update(mql);
    const handler = (ev: MediaQueryListEvent) => update(ev);
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [maxWidthPx]);

  return isMobile;
}
