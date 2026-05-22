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
import { shouldDenyOperationalWebAccess } from "@/lib/operational-access-gate";
import {
  pocketBaseRealtimeDisabled,
  pocketBaseSessionPollIntervalMs,
} from "@/lib/pocketbase-realtime-config";
import { syncPbAuthCookie } from "@/lib/pb-auth-cookie";

/**
 * Satu langganan realtime + verifikasi sesi untuk semua rute (termasuk /profile).
 * Logout jika `users.status` nonaktif atau `session_nonce` tidak cocok (login di perangkat lain).
 * Jika `web_access` jatuh false (mis. check-out dari mobile), arahkan ke /erp-locked selaras middleware.
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
          return;
        }
        const token = pb.authStore.token;
        if (token) pb.authStore.save(token, fresh as never);
        syncPbAuthCookie(pb);
        if (shouldDenyOperationalWebAccess(pathname, fresh as Record<string, unknown>)) {
          const next = pathname && pathname !== "/erp-locked" ? `?next=${encodeURIComponent(pathname)}` : "";
          router.replace(`/erp-locked${next}`);
        }
      } catch {
        /* offline / 401 — biarkan rute lain menangani */
      }
    };

    void verify();

    let pollId: ReturnType<typeof setInterval> | undefined;

    const setup = async () => {
      unsubRef.current?.();
      unsubRef.current = undefined;

      if (pocketBaseRealtimeDisabled()) {
        const every = pocketBaseSessionPollIntervalMs();
        pollId = setInterval(() => void verify(), every);
        return;
      }

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
          return;
        }

        const token = pb.authStore.token;
        if (token && e.record) {
          pb.authStore.save(token, e.record as never);
        }
        if (e.record && shouldDenyOperationalWebAccess(pathname, e.record as Record<string, unknown>)) {
          const next = pathname && pathname !== "/erp-locked" ? `?next=${encodeURIComponent(pathname)}` : "";
          window.location.href = `/erp-locked${next}`;
        }
      });
    };

    void setup();

    return () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = undefined;
      }
      void unsubRef.current?.();
      unsubRef.current = undefined;
    };
  }, [pathname, router]);

  return null;
}
