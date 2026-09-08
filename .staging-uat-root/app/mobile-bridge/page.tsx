"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { pb } from "@/lib/pocketbase";
import { registerWebSessionAfterAuth } from "@/lib/auth-session";
import { getDefaultRouteForUser } from "@/lib/rbac";

type BridgeAuth = { token?: string; record?: Record<string, unknown> };

function readAuthFromHash(): BridgeAuth | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const b64 = params.get("auth");
  if (!b64) return null;
  try {
    const json = decodeURIComponent(b64);
    const decoded =
      typeof globalThis.atob === "function"
        ? globalThis.atob(json)
        : Buffer.from(json, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as BridgeAuth;
    if (!parsed?.token || !parsed?.record) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setPbAuthCookie(token: string, model: Record<string, unknown>) {
  const payload = JSON.stringify({ token, model });
  const maxAge = 60 * 60 * 24 * 30;
  document.cookie = `pb_auth=${encodeURIComponent(payload)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/** Sinkronkan sesi PocketBase dari app native → web (cookie middleware + localStorage SDK). */
export default function MobileBridgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const auth = readAuthFromHash();
      if (!auth?.token || !auth.record) {
        setError("Sesi dari app tidak valid. Tutup layar ini dan buka lagi dari menu Kerja.");
        return;
      }

      try {
        pb.authStore.save(auth.token, auth.record as never);
        setPbAuthCookie(auth.token, auth.record);

        try {
          await registerWebSessionAfterAuth(pb);
        } catch (e) {
          console.error("mobile-bridge session_nonce:", e);
        }

        if (cancelled) return;

        const next = searchParams.get("next");
        const safeNext =
          next && next.startsWith("/") && !next.startsWith("//") ? next : null;
        router.replace(safeNext ?? getDefaultRouteForUser(auth.record));
      } catch (e) {
        console.error(e);
        setError("Gagal membuka ERP web. Coba login ulang di app.");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm text-center">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-slate-700">Membuka modul ERP…</p>
            <p className="mt-2 text-xs text-slate-500">Menyelaraskan sesi dari aplikasi mobile.</p>
          </>
        )}
      </div>
    </div>
  );
}
