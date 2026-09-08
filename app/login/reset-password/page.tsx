"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AppVersionWatermark } from "@/components/AppVersionWatermark";
import { ShareFeedbackToast, type ShareToastState } from "@/components/bisnis/ShareFeedbackToast";
import { blurActiveElement } from "@/lib/blur-active-input";
import {
  APP_DISPLAY_NAME,
  SYSTEM_LOGO_WIDE_ASPECT,
  SYSTEM_LOGO_WIDE_PATH,
} from "@/lib/branding";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ShareToastState>(null);

  useEffect(() => {
    if (!token) {
      setToast({
        kind: "error",
        title: "Link tidak valid",
        detail: "Minta link reset baru dari halaman login.",
      });
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setToast({ kind: "error", title: "Kata sandi tidak cocok", detail: "Ulangi konfirmasi." });
      return;
    }

    setLoading(true);
    setToast({ kind: "loading", title: "Menyimpan…", detail: "Mohon tunggu" });

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setToast({
          kind: "error",
          title: "Gagal mengatur kata sandi",
          detail: data.error ?? "Token kedaluwarsa atau tidak valid",
        });
        return;
      }
      setToast({
        kind: "success",
        title: "Berhasil",
        detail: data.message ?? "Silakan login dengan kata sandi baru.",
      });
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setToast({
        kind: "error",
        title: "Gagal",
        detail: "Periksa koneksi lalu coba lagi.",
      });
    } finally {
      blurActiveElement();
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 pb-24 pt-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src={SYSTEM_LOGO_WIDE_PATH}
            alt={APP_DISPLAY_NAME}
            width={220}
            height={Math.round(220 / SYSTEM_LOGO_WIDE_ASPECT)}
            className="mb-4 object-contain"
            priority
            unoptimized
          />
          <h1 className="text-2xl font-bold text-slate-800">Kata sandi baru</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-800">Kata sandi baru</label>
            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-12 text-base outline-none focus:ring-2 focus:ring-indigo-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                disabled={!token || loading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-800">Konfirmasi</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-indigo-500"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
              disabled={!token || loading}
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={!token || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan kata sandi
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <Link href="/login" className="text-indigo-600 hover:underline">
            Kembali ke login
          </Link>
        </p>
      </div>
      <ShareFeedbackToast toast={toast} onDismiss={() => setToast(null)} />
      <AppVersionWatermark variant="login" />
    </div>
  );
}
