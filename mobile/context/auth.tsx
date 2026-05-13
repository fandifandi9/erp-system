import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RecordModel, UnsubscribeFunc } from "pocketbase";
import { pb } from "@/lib/pocketbase";
import { extractMfaId } from "../lib/auth-mfa";
import {
  clearMobileSessionNonce,
  getMobileSessionNonce,
  registerMobileSessionAfterAuth,
  shouldLogoutMobileSessionMismatch,
} from "../lib/auth-session";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [, bump] = useState(0);
  const unsubRef = useRef<UnsubscribeFunc | undefined>(undefined);

  useEffect(() => {
    const unsub = pb.authStore.onChange(() => {
      bump((n) => n + 1);
    }, true);
    const t = setTimeout(() => setHydrated(true), 50);
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  const user = (pb.authStore.record as AuthModel | null) ?? null;
  const token = pb.authStore.token;

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInPasswordResult> => {
      try {
        await pb.collection("users").authWithPassword(email.trim(), password);
        try {
          await registerMobileSessionAfterAuth(pb);
        } catch (regErr) {
          console.error(regErr);
          pb.authStore.clear();
          throw new Error(
            "Gagal memperbarui sesi. Tambahkan field `session_nonce` di users dan izinkan update sendiri di PocketBase."
          );
        }
        return { kind: "success" };
      } catch (err: unknown) {
        const mfaId = extractMfaId(err);
        if (mfaId) {
          const sent = await pb.collection("users").requestOTP(email.trim());
          const otpId =
            typeof sent === "object" &&
            sent !== null &&
            "otpId" in sent &&
            typeof (sent as { otpId: unknown }).otpId === "string"
              ? (sent as { otpId: string }).otpId
              : null;
          if (!otpId) {
            throw new Error(
              "MFA aktif tetapi OTP tidak terkirim. Periksa email atau PocketBase."
            );
          }
          return { kind: "mfa", otpId, mfaId };
        }
        throw err;
      }
    },
    []
  );

  const signInWithOtp = useCallback(
    async (otpId: string, code: string, mfaId: string) => {
      await pb.collection("users").authWithOTP(otpId, code.trim(), {
        query: { mfaId },
      });
      try {
        await registerMobileSessionAfterAuth(pb);
      } catch (regErr) {
        console.error(regErr);
        pb.authStore.clear();
        throw new Error(
          "Gagal memperbarui sesi. Tambahkan field `session_nonce` di users dan izinkan update sendiri di PocketBase."
        );
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearMobileSessionNonce();
    pb.authStore.clear();
  }, []);

  useEffect(() => {
    if (!user?.id) {
      void unsubRef.current?.();
      unsubRef.current = undefined;
      return;
    }

    const uid = user.id;

    const verify = async () => {
      if (!pb.authStore.isValid) return;
      try {
        const fresh = await pb.collection("users").getOne(uid, { requestKey: null });
        if (
          await shouldLogoutMobileSessionMismatch(
            fresh as { session_nonce?: unknown }
          )
        ) {
          await clearMobileSessionNonce();
          pb.authStore.clear();
        }
      } catch {
        /* ignore */
      }
    };

    void verify();

    void (async () => {
      unsubRef.current?.();
      unsubRef.current = await pb.collection("users").subscribe("*", async (e) => {
        if (e.record?.id !== uid) return;
        const server = String(e.record.session_nonce ?? "").trim();
        const local = (await getMobileSessionNonce())?.trim() ?? "";
        if (server && local && server !== local) {
          await clearMobileSessionNonce();
          pb.authStore.clear();
        }
      });
    })();

    return () => {
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
