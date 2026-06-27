import type { KeyboardEvent } from "react";

/** Focus next field in document order when user presses Enter */
export function focusNextField(current: HTMLElement) {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("[data-nav]:not([disabled])"),
  ).filter((el) => el.offsetParent !== null && !el.hasAttribute("aria-hidden"));

  const idx = nodes.indexOf(current);
  if (idx >= 0 && idx < nodes.length - 1) {
    nodes[idx + 1].focus();
    return true;
  }
  return false;
}

export function onEnterFocusNext(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  focusNextField(e.currentTarget);
}

const LINE_FIELD_ORDER = ["product", "qty", "unit", "unit_price", "discount"] as const;

function focusLineField(lineIdx: number, field: (typeof LINE_FIELD_ORDER)[number]) {
  const el = document.querySelector<HTMLElement>(
    `[data-line="${lineIdx}"][data-field="${field}"]:not([disabled])`,
  );
  if (el && el.offsetParent !== null) {
    el.focus();
    return true;
  }
  return false;
}

function focusFirstSerial(lineIdx: number) {
  const el = document.querySelector<HTMLElement>(`[data-sn-line="${lineIdx}"][data-sn-unit="0"]`);
  if (el && el.offsetParent !== null) {
    el.focus();
    return true;
  }
  return false;
}

/** Enter pada baris produk: urutan kolom lalu SN — tidak loncat ke baris berikutnya. */
export function onLineFieldEnter(e: KeyboardEvent<HTMLElement>, lineIdx: number) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const field = e.currentTarget.getAttribute("data-field");
  if (!field) return;

  const i = LINE_FIELD_ORDER.indexOf(field as (typeof LINE_FIELD_ORDER)[number]);
  if (i < 0) return;

  for (let j = i + 1; j < LINE_FIELD_ORDER.length; j++) {
    if (focusLineField(lineIdx, LINE_FIELD_ORDER[j])) return;
  }
  focusFirstSerial(lineIdx);
}

export function onLineSpinnerEnter(lineIdx: number, field: (typeof LINE_FIELD_ORDER)[number]) {
  const i = LINE_FIELD_ORDER.indexOf(field);
  for (let j = i + 1; j < LINE_FIELD_ORDER.length; j++) {
    if (focusLineField(lineIdx, LINE_FIELD_ORDER[j])) return;
  }
  focusFirstSerial(lineIdx);
}

export function onSerialFieldEnter(e: KeyboardEvent<HTMLInputElement>, lineIdx: number) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const unit = Number(e.currentTarget.getAttribute("data-sn-unit") ?? 0);
  const next = document.querySelector<HTMLElement>(
    `[data-sn-line="${lineIdx}"][data-sn-unit="${unit + 1}"]`,
  );
  if (next && next.offsetParent !== null) next.focus();
}
