"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UnsubscribeFunc } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import {
  clearWebSessionNonce,
  getWebSessionNonce,
  shouldLogoutForSessionMismatch,
} from "@/lib/auth-session";

/**
 * Satu langganan realtime + verifikasi sesi untuk semua rute (termasuk /entry, /attendance).
 * Logout jika `users.status` nonaktif atau `session_nonce` tidak cocok (login di perangkat lain).
 */
export default function WebSessionGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const unsubRef = useRef<UnsubscribeFunc | undefined>(undefined);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/login")) {
      return;
    }

    const verify = async () => {
      if (!pb.authStore.isValid) return;
      const uid = pb.authStore.model?.id;
      if (!uid) return;
      try {
        const fresh = await pb.collection("users").getOne(uid, { requestKey: null });
        if (fresh.status !== "active") {
          clearWebSessionNonce();
          pb.authStore.clear();
          router.replace("/login");
          return;
        }
        if (shouldLogoutForSessionMismatch(fresh as { session_nonce?: unknown })) {
          clearWebSessionNonce();
          pb.authStore.clear();
          router.replace("/login?reason=session");
        }
      } catch {
        /* offline / 401 — biarkan rute lain menangani */
      }
    };

    void verify();

    const setup = async () => {
      unsubRef.current?.();
      unsubRef.current = await pb.collection("users").subscribe("*", (e) => {
        const current = pb.authStore.model;
        if (!current || e.record?.id !== current.id) return;

        if (e.record.status !== "active") {
          clearWebSessionNonce();
          pb.authStore.clear();
          window.location.href = "/login";
          return;
        }

        const server = String(e.record.session_nonce ?? "").trim();
        const local = getWebSessionNonce()?.trim() ?? "";
        if (server && local && server !== local) {
          clearWebSessionNonce();
          pb.authStore.clear();
          window.location.href = "/login?reason=session";
        }
      });
    };

    void setup();

    return () => {
      void unsubRef.current?.();
      unsubRef.current = undefined;
    };
  }, [pathname, router]);

  return null;
}
