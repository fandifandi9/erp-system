import type { KeyboardEvent } from "react";

/** Focus next field in document order when user presses Enter */
export function focusNextField(current: HTMLElement) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])"),
  ).filter((el) => el.offsetParent !== null && !el.hasAttribute("aria-hidden"));

  const idx = nodes.indexOf(current);
  if (idx >= 0 && idx < nodes.length - 1) {
    const next = nodes[idx + 1];
    next.focus();
    if (next instanceof HTMLSelectElement) next.click();
    return true;
  }
  return false;
}

export function onEnterFocusNext(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  focusNextField(e.currentTarget);
}
