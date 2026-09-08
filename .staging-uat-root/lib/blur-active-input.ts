/** Blur focused field so mobile web virtual keyboard closes. */
export function blurActiveElement(): void {
  if (typeof document === "undefined") return;
  const el = document.activeElement;
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  ) {
    el.blur();
  }
}
