"use client";

import { useEffect, useRef } from "react";
import { revokeAccountVerificationApi } from "@/lib/account-verification-client";
import {
  ACCOUNT_VERIFICATION_WINDOW_MS,
  enterSensitiveVerificationModule,
  leaveSensitiveVerificationModule,
  type SensitiveVerificationModule,
} from "@/lib/account-verification-session";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
  "mousemove",
  "wheel",
];

type Options = {
  /** Called after verification cookie is revoked (idle / away). */
  onRevoked?: () => void;
  enabled?: boolean;
};

/**
 * While mounted on payslip/documents: track activity + module presence.
 * Idle 15m or return after 15m away → revoke account verification grant.
 */
export function useSensitiveVerificationSession(
  module: SensitiveVerificationModule,
  options: Options = {},
) {
  const { onRevoked, enabled = true } = options;
  const onRevokedRef = useRef(onRevoked);
  onRevokedRef.current = onRevoked;
  const lastActivityRef = useRef(Date.now());
  const revokingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const revoke = async () => {
      if (revokingRef.current) return;
      revokingRef.current = true;
      try {
        await revokeAccountVerificationApi();
        onRevokedRef.current?.();
      } catch {
        /* still treat as locked locally */
        onRevokedRef.current?.();
      } finally {
        revokingRef.current = false;
      }
    };

    if (enterSensitiveVerificationModule(module)) {
      void revoke();
    }

    lastActivityRef.current = Date.now();
    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= ACCOUNT_VERIFICATION_WINDOW_MS) {
        void revoke();
      }
    }, 10_000);

    return () => {
      leaveSensitiveVerificationModule(module);
      window.clearInterval(idleTimer);
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
    };
  }, [module, enabled]);
}
