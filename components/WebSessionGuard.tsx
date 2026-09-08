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
import {
  buildErpLockedUrl,
  DESKTOP_ATTENDANCE_UNLOCK_PATH,
  ERP_LOCKED_PATH,
  shouldDenyOperationalWebAccess,
} from "@/lib/operational-access-gate";
import {
  pocketBaseRealtimeDisabled,
  pocketBaseSessionPollIntervalMs,
} from "@/lib/pocketbase-realtime-config";
import { syncAuthStoreFromPbRecord } from "@/lib/pb-auth-cookie";

function redirectToLock(pathname: string | null, hard = false): string | null {
  if (!pathname) return null;
  if (pathname.startsWith(ERP_LOCKED_PATH)) return null;
  if (pathname.startsWith(DESKTOP_ATTENDANCE_UNLOCK_PATH)) return null;
  const url = buildErpLockedUrl(pathname);
  if (hard) {
    window.location.href = url;
    return null;
  }
  return url;
}

/**
 * Satu langganan realtime + verifikasi sesi untuk semua rute (termasuk /profile).
 * Logout jika `users.status` nonaktif atau `session_nonce` tidak cocok (login di perangkat lain).
 * Jika `web_access` jatuh false → layar lock (peringatan), lalu user lanjut ke absensi.
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
        if (!token) return;

        await syncAuthStoreFromPbRecord(pb, token, fresh as Record<string, unknown>);

        const accessUser = pb.authStore.model as Record<string, unknown>;
        if (shouldDenyOperationalWebAccess(pathname, accessUser)) {
          const url = redirectToLock(pathname);
          if (url) router.replace(url);
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
          void syncAuthStoreFromPbRecord(pb, token, e.record as Record<string, unknown>).then(
            (accessUser) => {
              if (shouldDenyOperationalWebAccess(pathname, accessUser)) {
                redirectToLock(pathname, true);
              }
            },
          );
          return;
        }
        if (e.record && shouldDenyOperationalWebAccess(pathname, e.record as Record<string, unknown>)) {
          redirectToLock(pathname, true);
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
