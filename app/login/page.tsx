"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { isPocketBaseUnreachable } from "@/lib/errors";
import { ensureAndSyncProfile } from "@/lib/profile";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";
import { extractMfaId } from "@/lib/auth-mfa";
import { registerWebSessionAfterAuth } from "@/lib/auth-session";
import { blurActiveElement } from "@/lib/blur-active-input";
import { getDefaultRouteForUser } from "@/lib/rbac";
import { syncPbAuthCookie } from "@/lib/pb-auth-cookie";
import Image from "next/image";
import {
  APP_DISPLAY_NAME,
  SYSTEM_LOGO_WIDE_ASPECT,
  SYSTEM_LOGO_WIDE_PATH,
} from "@/lib/branding";

type LoginStep = "password" | "otp";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<LoginStep>("password");
  const [otpId, setOtpId] = useState<string | null>(null);
  const mfaIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("reason") === "session") {
      setError(
        "Sesi Anda berakhir karena akun masuk di perangkat lain. Silakan login lagi."
      );
    }
  }, []);

  async function finalizeSuccessfulLogin(userId: string) {
    await ensureAndSyncProfile(userId);
    try {
      await registerWebSessionAfterAuth(pb);
    } catch (e) {
      console.error(e);
      pb.authStore.clear();
      throw new Error(
        "Login berhasil tetapi gagal memperbarui sesi perangkat. Pastikan koleksi users punya field `session_nonce` (text) dan aturan update mengizinkan user memperbarui rekaman sendiri."
      );
    }
    syncPbAuthCookie(pb);
    blurActiveElement();
    router.push(getDefaultRouteForUser(pb.authStore.model as Record<string, unknown>));
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const authData = await pb
        .collection("users")
        .authWithPassword(email.trim(), password);

      const user = authData.record;
      if (user.status !== "active") {
        pb.authStore.clear();
        setError("Akun Anda dinonaktifkan oleh owner");
        return;
      }

      await finalizeSuccessfulLogin(user.id);
    } catch (err: unknown) {
      const mfaId = extractMfaId(err);
      if (mfaId && email.trim()) {
        mfaIdRef.current = mfaId;
        try {
          const sent = await pb.collection("users").requestOTP(email.trim());
          const id =
            typeof sent === "object" &&
            sent !== null &&
            "otpId" in sent &&
            typeof (sent as { otpId: unknown }).otpId === "string"
              ? (sent as { otpId: string }).otpId
              : null;
          if (!id) {
            setError("Gagal mengirim kode OTP. Periksa pengaturan MFA di PocketBase.");
            mfaIdRef.current = null;
            return;
          }
          setOtpId(id);
          setStep("otp");
          setError("");
        } catch (otpErr) {
          console.error("requestOTP:", otpErr);
          setError("Gagal mengirim kode ke email. Coba lagi atau hubungi admin.");
          mfaIdRef.current = null;
        }
        return;
      }

      console.error("LOGIN ERROR:", err);
      if (isPocketBaseUnreachable(err)) {
        const host =
          typeof process.env.NEXT_PUBLIC_POCKETBASE_URL === "string"
            ? process.env.NEXT_PUBLIC_POCKETBASE_URL
            : "PocketBase";
        setError(
          `Tidak terhubung ke server (${host}). Pastikan PocketBase online, URL di .env.local benar, dan jaringan Anda tidak memblokir akses (timeout / firewall).`
        );
        return;
      }
      const hasEmailError =
        typeof err === "object" &&
        err !== null &&
        "data" in err &&
        typeof (err as { data?: unknown }).data === "object" &&
        (err as { data?: { email?: unknown } }).data?.email;

      const hasPasswordError =
        typeof err === "object" &&
        err !== null &&
        "data" in err &&
        typeof (err as { data?: unknown }).data === "object" &&
        (err as { data?: { password?: unknown } }).data?.password;

      if (hasEmailError) {
        setError("Email tidak valid");
      } else if (hasPasswordError) {
        setError("Email atau kata sandi salah");
      } else {
        setError("Login gagal, cek kembali");
      }
    } finally {
      blurActiveElement();
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !otpId || !mfaIdRef.current) return;

    setLoading(true);
    setError("");

    try {
      const authData = await pb.collection("users").authWithOTP(
        otpId,
        otpCode.trim(),
        { query: { mfaId: mfaIdRef.current } }
      );

      const user = authData.record;
      if (user.status !== "active") {
        pb.authStore.clear();
        setError("Akun Anda dinonaktifkan oleh owner");
        return;
      }

      await finalizeSuccessfulLogin(user.id);
    } catch (err: unknown) {
      console.error("OTP LOGIN:", err);
      if (isPocketBaseUnreachable(err)) {
        setError(
          "Tidak terhubung ke server PocketBase. Periksa koneksi internet dan status backend sebelum mencoba lagi."
        );
        return;
      }
      setError("Kode OTP salah atau kedaluwarsa. Coba kirim ulang dari langkah sebelumnya.");
    } finally {
      blurActiveElement();
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Masukkan email terlebih dahulu");
      return;
    }

    try {
      await pb.collection("users").requestPasswordReset(email);
      alert("Link reset dikirim ke email");
    } catch {
      setError("Gagal kirim email reset");
    } finally {
      blurActiveElement();
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 pb-24 pt-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src={SYSTEM_LOGO_WIDE_PATH}
            alt="SDI"
            width={220}
            height={Math.round(220 / SYSTEM_LOGO_WIDE_ASPECT)}
            className="mb-4 object-contain"
            priority
          />
          <h1 className="text-2xl font-bold text-slate-800">{APP_DISPLAY_NAME}</h1>
          <p className="mt-1 text-sm text-slate-700">
            {step === "otp"
              ? "Masukkan kode OTP dari email (verifikasi kedua MFA)."
              : "Masuk ke dashboard ERP Anda"}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {step === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-800">Email</label>
              <input
                type="email"
                placeholder="email@domain.com"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-slate-800">Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimal 8 karakter"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-base text-slate-900 outline-none placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-700 hover:text-slate-900"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-sm text-indigo-600 hover:underline"
              >
                Lupa password?
              </button>
            </div>

            <button
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <p className="text-sm text-slate-600">
              Kode sekali pakai telah dikirim ke <strong>{email}</strong>. Buka kotak
              masuk (dan folder spam).
            </p>
            <div>
              <label className="text-sm font-medium text-slate-800">Kode OTP</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6 digit"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-300 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setStep("password");
                  setOtpCode("");
                  setOtpId(null);
                  mfaIdRef.current = null;
                  setError("");
                }}
              >
                Kembali
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? "Memverifikasi..." : "Verifikasi"}
              </button>
            </div>
          </form>
        )}
      </div>

      <AppVersionWatermark variant="login" />
    </div>
  );
}
