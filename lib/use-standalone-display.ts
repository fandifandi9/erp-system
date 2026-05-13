"use client";

import { useSyncExternalStore } from "react";

function getStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribe(onChange: () => void) {
  const mq1 = window.matchMedia("(display-mode: standalone)");
  const mq2 = window.matchMedia("(display-mode: minimal-ui)");
  mq1.addEventListener("change", onChange);
  mq2.addEventListener("change", onChange);
  return () => {
    mq1.removeEventListener("change", onChange);
    mq2.removeEventListener("change", onChange);
  };
}

/**
 * True saat app dibuka sebagai PWA (installed) — termasuk di Windows.
 * Dipakai agar layout drawer + hamburger tetap dipakai walau jendela lebar.
 */
export function useStandaloneDisplay(): boolean {
  return useSyncExternalStore(subscribe, getStandalone, () => false);
}
