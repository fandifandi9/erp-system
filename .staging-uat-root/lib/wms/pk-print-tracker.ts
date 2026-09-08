const STORAGE_KEY = "wms_pk_auto_printed_ids";
const MAX_TRACKED = 200;

function readIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x) => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const arr = [...ids].slice(-MAX_TRACKED);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export function wasPkAutoPrinted(orderId: string): boolean {
  return readIds().has(orderId);
}

export function markPkAutoPrinted(orderId: string): void {
  const ids = readIds();
  ids.add(orderId);
  writeIds(ids);
}
