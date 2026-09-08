import type { WorkContext } from "./types";

export const WORK_CONTEXT_STORAGE_KEY = "serba_work_context_v2";

export function loadWorkContextFromStorage(): WorkContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WORK_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkContext;
    if (!parsed.companyId || !parsed.storeId || !parsed.warehouseId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorkContextToStorage(ctx: WorkContext): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORK_CONTEXT_STORAGE_KEY, JSON.stringify(ctx));
}

export function clearWorkContextStorage(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WORK_CONTEXT_STORAGE_KEY);
}
