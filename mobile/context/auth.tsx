import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { router } from "expo-router";
import type { RecordModel, UnsubscribeFunc } from "pocketbase";
import { ClientResponseError } from "pocketbase";
import { pb, waitForAuthStoreReady } from "@/lib/pocketbase";
import { extractMfaId } from "../lib/auth-mfa";
import {
  clearMobileSessionNonce,
  getMobileSessionNonce,
  ensureMobileSessionNonceSynced,
  registerMobileSessionAfterAuth,
  shouldLogoutMobileSessionMismatch,
} from "../lib/auth-session";
import {
  pocketBaseRealtimeDisabled,
  pocketBaseSessionPollIntervalMs,
} from "@/lib/pocketbase-realtime-config";
import {
  clearAuthSession,
  logAuthRestoreState,
  refreshAuthToken,
  registerSessionExpiredHandler,
  setupGlobal401Handler,
  triggerSessionExpired,
} from "@/lib/auth-lifecycle";
import { authLog } from "@/lib/auth-log";
import { getPocketBaseUrl } from "@/lib/env";

type AuthModel = RecordModel & {
  id: string;
  email?: string;
  name?: string;
  role?: string;
};

export type SignInPasswordResult =
  | { kind: "success" }
  | { kind: "mfa"; otpId: string; mfaId: string };

type AuthContextValue = {
  hydrated: boolean;
  user: AuthModel | null;
  token: string;
  signInWithPassword: (
    email: string,
    password: string
  ) => Promise<SignInPasswordResult>;
  signInWithOtp: (
    otpId: string,
    code: string,
    mfaId: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function logoutSessionNonceMismatch(): Promise<void> {
  authLog.autoLogout("session_nonce_mismatch");
  await clearAuthSession();
  router.replace("/(auth)/login");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [, bump] = useState(0);
  const unsubRef = useRef<UnsubscribeFunc | undefined>(undefined);
  const refreshLock = useRef(false);
  /** Blocks session-nonce verify/subscribe while login is finishing nonce registration. */
  const sessionSetupRef = useRef(false);

  useEffect(() => {
    setupGlobal401Handler(pb);
    registerSessionExpiredHandler(() => {
      router.replace("/(auth)/login");
    });

    return () => {
      registerSessionExpiredHandler(null);
    };
  }, []);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      bump((n) => n + 1);
    }, false);

    let cancelled = false;

    void (async () => {
      await waitForAuthStoreReady();
      if (cancelled) return;

      logAuthRestoreState(pb);

      if (pb.authStore.isValid) {
        const result = await refreshAuthToken(pb);
        if (result === "expired") {
          await triggerSessionExpired("token_expired_on_startup");
        }
      }

      if (!cancelled) {
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const runRefresh = async (source: "foreground") => {
      if (refreshLock.current) return;
      if (!pb.authStore.isValid) return;
      refreshLock.current = true;
      try {
        const result = await refreshAuthToken(pb);
        if (result === "expired") {
          await triggerSessionExpired(`token_expired_on_${source}`);
        }
      } finally {
        refreshLock.current = false;
      }
    };

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        void runRefresh("foreground");
      }
    };

    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => sub.remove();
  }, [hydrated]);

  const user = (pb.authStore.record as AuthModel | null) ?? null;
  const token = pb.authStore.token;

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInPasswordResult> => {
      const pbHost = (() => {
        try {
          return new URL(getPocketBaseUrl()).host;
        } catch {
          return "(invalid)";
        }
      })();
      authLog.loginStart(pbHost);
      sessionSetupRef.current = true;
      try {
        await clearMobileSessionNonce();
        await pb.collection("users").authWithPassword(email.trim().toLowerCase(), password);
        authLog.loginPbAuthOk(pb.authStore.model?.id);
        try {
          await registerMobileSessionAfterAuth(pb);
          authLog.sessionNonceSaved(true);
        } catch (regErr) {
          authLog.sessionNonceSaved(false);
          console.error(regErr);
          pb.authStore.clear();
          throw new Error(
            "Gagal memperbarui sesi. Silakan coba lagi atau hubungi HR."
          );
        }
        return { kind: "success" };
      } catch (err: unknown) {
        const mfaId = extractMfaId(err);
        if (mfaId) {
          const sent = await pb.collection("users").requestOTP(email.trim().toLowerCase());
          const otpId =
            typeof sent === "object" &&
            sent !== null &&
            "otpId" in sent &&
            typeof (sent as { otpId: unknown }).otpId === "string"
              ? (sent as { otpId: string }).otpId
              : null;
          if (!otpId) {
            throw new Error(
              "MFA aktif tetapi kode OTP tidak terkirim. Periksa email Anda atau hubungi HR."
            );
          }
          return { kind: "mfa", otpId, mfaId };
        }
        const status = err instanceof ClientResponseError ? err.status : 0;
        const category =
          status === 400
            ? "invalid_credentials"
            : status === 401
              ? "unauthorized"
              : status === 0
                ? "network"
                : "error";
        authLog.loginFail(status, category);
        throw err;
      } finally {
        sessionSetupRef.current = false;
      }
    },
    []
  );

  const signInWithOtp = useCallback(
    async (otpId: string, code: string, mfaId: string) => {
      sessionSetupRef.current = true;
      try {
        await clearMobileSessionNonce();
        await pb.collection("users").authWithOTP(otpId, code.trim(), {
          query: { mfaId },
        });
        authLog.loginPbAuthOk(pb.authStore.model?.id);
        try {
          await registerMobileSessionAfterAuth(pb);
          authLog.sessionNonceSaved(true);
        } catch (regErr) {
          authLog.sessionNonceSaved(false);
          console.error(regErr);
          pb.authStore.clear();
          throw new Error(
            "Gagal memperbarui sesi. Silakan coba lagi atau hubungi HR."
          );
        }
      } finally {
        sessionSetupRef.current = false;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearAuthSession();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      void unsubRef.current?.();
      unsubRef.current = undefined;
      return;
    }

    const uid = user.id;

    const verify = async () => {
      if (sessionSetupRef.current) return;
      if (!pb.authStore.isValid) return;
      try {
        await ensureMobileSessionNonceSynced(pb);
        const fresh = await pb.collection("users").getOne(uid, { requestKey: null });
        if (
          await shouldLogoutMobileSessionMismatch(
            fresh as { mobile_session_nonce?: unknown }
          )
        ) {
          await logoutSessionNonceMismatch();
        }
      } catch {
        /* offline / sementara — jangan logout */
      }
    };

    void verify();

    let pollId: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      unsubRef.current?.();
      unsubRef.current = undefined;

      if (pocketBaseRealtimeDisabled()) {
        const every = pocketBaseSessionPollIntervalMs();
        pollId = setInterval(() => void verify(), every);
        return;
      }

      try {
        unsubRef.current = await pb.collection("users").subscribe(uid, async (e) => {
          try {
            if (sessionSetupRef.current) return;
            if (e.record?.id !== uid) return;
            const server = String(e.record.mobile_session_nonce ?? "").trim();
            const local = (await getMobileSessionNonce())?.trim() ?? "";
            if (server && local && server !== local) {
              await logoutSessionNonceMismatch();
            }
          } catch {
            /* jangan biarkan callback realtime mem-crash app */
          }
        });
      } catch {
        const every = pocketBaseSessionPollIntervalMs();
        pollId = setInterval(() => void verify(), every);
      }
    })();

    return () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = undefined;
      }
      void unsubRef.current?.();
      unsubRef.current = undefined;
    };
  }, [user?.id]);

  const value = useMemo(
    () => ({
      hydrated,
      user,
      token,
      signInWithPassword,
      signInWithOtp,
      signOut,
    }),
    [hydrated, user, token, signInWithPassword, signInWithOtp, signOut]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
