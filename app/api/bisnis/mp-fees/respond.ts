import { NextResponse } from "next/server";

export function mpFeeError(e: unknown, fallback: string) {
  const err = e as {
    status?: number;
    message?: string;
    response?: { data?: Record<string, { code?: string; message?: string }> };
  };
  let msg = e instanceof Error ? e.message : err.message ?? fallback;
  // Sertakan detail validasi per-field dari PocketBase agar tidak generik.
  const fieldErrors = err.response?.data;
  if (fieldErrors && typeof fieldErrors === "object") {
    const details = Object.entries(fieldErrors)
      .map(([field, info]) => `${field}: ${info?.message ?? info?.code ?? "invalid"}`)
      .join("; ");
    if (details) msg = `${msg} (${details})`;
  }
  if (/wasn't found|404.*collection|collection.*404/i.test(msg)) {
    msg = "Collection fee engine belum dibuat di PocketBase. Ikuti POCKETBASE_MP_FEE_SKU_SETUP.md.";
  }
  const status = typeof err.status === "number" && err.status >= 400 ? err.status : 500;
  return NextResponse.json({ ok: false, error: msg }, { status });
}
