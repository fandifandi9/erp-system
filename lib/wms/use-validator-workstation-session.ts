"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { pb } from "@/lib/pocketbase";
import { getErrorMessage } from "@/lib/errors";
import { isValidWorkstationCheckInInput } from "@/lib/wms/workstation-qr";
import {
  bindWorkstationSession,
  checkInWorkstationDesk,
  checkOutWorkstationDesk,
  fetchActiveWorkstationSession,
  fetchWorkstationDeskConfig,
  type WorkstationDeskConfig,
  type WorkstationSessionDto,
} from "@/lib/wms/workstation-session-client";
import type { WmsWorkstation } from "@/lib/wms/workstations";

/** Auto check-out setelah 1 jam tanpa aktivitas. */
export const WMS_WORKSTATION_IDLE_MS = 60 * 60 * 1000;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;

export type ValidatorWorkstationSessionApi = {
  session: WorkstationSessionDto | null;
  workstation: WmsWorkstation | null;
  sessionReady: boolean;
  loading: boolean;
  busy: boolean;
  localError: string;
  deskConfig: WorkstationDeskConfig | null;
  scanInput: string;
  setScanInput: (v: string) => void;
  refresh: () => Promise<void>;
  doCheckIn: (payload: string) => Promise<void>;
  doBind: () => Promise<void>;
  doCheckOut: (reason?: string) => Promise<void>;
  touchActivity: () => void;
};

export function useValidatorWorkstationSession(): ValidatorWorkstationSessionApi {
  const { t } = useLocale();
  const [session, setSession] = useState<WorkstationSessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanInput, setScanInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [deskConfig, setDeskConfig] = useState<WorkstationDeskConfig | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef(Date.now());

  const workstation = session && !session.needsBind ? session.workstation : null;
  const sessionReady = !!workstation && !!session && !session.needsBind;

  const applySession = useCallback((s: WorkstationSessionDto | null) => {
    setSession(s);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLocalError("");
    try {
      const s = await fetchActiveWorkstationSession();
      applySession(s);
    } catch (e) {
      setLocalError(getErrorMessage(e));
      applySession(null);
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void fetchWorkstationDeskConfig()
      .then(setDeskConfig)
      .catch(() => setDeskConfig(null));
  }, []);

  const touchActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const doCheckOut = useCallback(
    async (reason = "checkout") => {
      if (!session?.id || busy) return;
      setBusy(true);
      setLocalError("");
      try {
        await checkOutWorkstationDesk(session.id, reason);
        applySession(null);
        if (reason === "auto_idle_1h") {
          setLocalError(t("wms.workstation.autoIdleCheckout"));
        }
      } catch (e) {
        setLocalError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [session?.id, busy, applySession, t],
  );

  useEffect(() => {
    if (!sessionReady) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    const scheduleIdleCheckout = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const remaining = WMS_WORKSTATION_IDLE_MS - (Date.now() - lastActivityRef.current);
      idleTimerRef.current = setTimeout(() => {
        void doCheckOut("auto_idle_1h");
      }, Math.max(remaining, 0));
    };

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      scheduleIdleCheckout();
    };

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    scheduleIdleCheckout();

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onActivity);
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [sessionReady, doCheckOut]);

  const doCheckIn = useCallback(
    async (payload: string) => {
      const trimmed = payload.trim();
      if (!trimmed || busy) return;
      if (!isValidWorkstationCheckInInput(trimmed)) {
        setLocalError(t("wms.workstation.errInvalidCode"));
        return;
      }
      if (deskConfig && !deskConfig.checkInEnabled) {
        setLocalError(t("wms.workstation.errDesksLocked"));
        return;
      }
      setBusy(true);
      setLocalError("");
      try {
        const s = await checkInWorkstationDesk({ desk_input: trimmed, channel: "web_desk_scan" });
        applySession(s);
        setScanInput("");
        lastActivityRef.current = Date.now();
      } catch (e) {
        setLocalError(getErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, deskConfig, applySession, t],
  );

  const doBind = useCallback(async () => {
    if (!session?.id || busy) return;
    setBusy(true);
    setLocalError("");
    try {
      const s = await bindWorkstationSession(session.id);
      applySession(s);
      lastActivityRef.current = Date.now();
    } catch (e) {
      setLocalError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session?.id, busy, applySession]);

  return {
    session,
    workstation,
    sessionReady,
    loading,
    busy,
    localError,
    deskConfig,
    scanInput,
    setScanInput,
    refresh,
    doCheckIn,
    doBind,
    doCheckOut,
    touchActivity,
  };
}

export function validatorUserName(): string {
  const user = pb.authStore.model;
  return typeof user?.name === "string" ? user.name : user?.email ?? "—";
}
