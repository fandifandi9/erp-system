import AsyncStorage from "@react-native-async-storage/async-storage";
import type { OfflineQueueItem, OfflineQueueSnapshot } from "./types";
import { OFFLINE_QUEUE_STORAGE_KEY } from "./types";

const MAX_ITEMS = 200;
const MAX_FAILED_KEEP = 24;

function nowIso() {
  return new Date().toISOString();
}

export async function loadQueueSnapshot(): Promise<OfflineQueueSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
    if (!raw) return { items: [], updated_at: nowIso() };
    const parsed = JSON.parse(raw) as OfflineQueueSnapshot;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [], updated_at: nowIso() };
    return {
      items: parsed.items.filter((x) => x && typeof x.id === "string"),
      updated_at: parsed.updated_at || nowIso(),
    };
  } catch {
    return { items: [], updated_at: nowIso() };
  }
}

export async function clearOfflineQueue(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
}

export async function saveQueueSnapshot(items: OfflineQueueItem[]): Promise<void> {
  const trimmed = trimQueue(items);
  const snap: OfflineQueueSnapshot = { items: trimmed, updated_at: nowIso() };
  await AsyncStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(snap));
}

function trimQueue(items: OfflineQueueItem[]): OfflineQueueItem[] {
  const pending = items.filter((i) => i.status === "pending");
  const failed = items.filter((i) => i.status === "failed");
  const failedTail = failed.slice(-MAX_FAILED_KEEP);
  const merged = [...pending, ...failedTail];
  if (merged.length <= MAX_ITEMS) return merged;
  /** Utamakan pending — buang failed tertua. */
  const drop = merged.length - MAX_ITEMS;
  const f2 = failedTail.slice(drop);
  return [...pending, ...f2].slice(-MAX_ITEMS);
}

export function countPending(items: OfflineQueueItem[]): number {
  return items.filter((i) => i.status === "pending").length;
}

export function countFailed(items: OfflineQueueItem[]): number {
  return items.filter((i) => i.status === "failed").length;
}
