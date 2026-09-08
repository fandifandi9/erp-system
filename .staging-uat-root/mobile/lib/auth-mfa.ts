import { ClientResponseError } from "pocketbase";

export function extractMfaId(err: unknown): string | null {
  if (!(err instanceof ClientResponseError)) return null;
  const raw = err.response as Record<string, unknown> | undefined;
  if (raw && typeof raw.mfaId === "string" && raw.mfaId.trim()) {
    return raw.mfaId.trim();
  }
  const data = err.data as Record<string, unknown> | undefined;
  if (data && typeof data.mfaId === "string" && data.mfaId.trim()) {
    return data.mfaId.trim();
  }
  return null;
}
