"use client";

import { useEffect, useState } from "react";

/** true jika viewport ≥ breakpoint (default lg / 1024px). */
export function useMinWidth(minWidthPx: number): boolean {
  const query = `(min-width: ${minWidthPx}px)`;
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [query]);

  return matches;
}

export function useLgUp(): boolean {
  return useMinWidth(1024);
}
