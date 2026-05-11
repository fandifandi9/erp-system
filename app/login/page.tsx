"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { getDefaultRouteForUser } from "@/lib/rbac";
import { ensureAndSyncProfile } from "@/lib/profile";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // =========================
  // 🔐 LOGIN
  // =========================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const authData = await pb
        .collection("users")
        .authWithPassword(email, password);

      const user = authData.record;

      // 🔥 VALIDASI STATUS (KONSEP UTAMA KAMU)
      if (user.status !== "active") {
        pb.authStore.clear();
        setError("Akun Anda dinonaktifkan oleh owner"); 
        return;
      }

      // Ensure HR profile data is available and synced with users.
      await ensureAndSyncProfile(user.id);

      const path = getDefaultRouteForUser(user);
      
      if (!path) {
        setError("Role tidak dikenali");
        return;
      }
      
      router.push(path);

    } catch (err: unknown) {
      console.error("LOGIN ERROR:", err);

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
        setError("Password salah");
      } else {
        setError("Login gagal, cek kembali");
      }
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // 🔁 RESET PASSWORD
  // =========================
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
    }
  };

  // =========================
  // 🎨 UI
  // =========================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center px-4">

      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">

        {/* HEADER */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">
            Serba ERP System
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Masuk ke dashboard ERP Anda
          </p>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 text-sm bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100">
            {error}
          </div>
        )}

        {/* FORM */}
        <form onSubmit={handleLogin} className="space-y-4">

          {/* EMAIL */}
          <div>
            <label className="text-sm text-slate-600">Email</label>
            <input
              type="email"
              placeholder="email@domain.com"
              className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* PASSWORD */}
          <div>
            <label className="text-sm text-slate-600">Password</label>

            <div className="relative mt-1">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* FORGOT */}
          <div className="text-right">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-indigo-600 hover:underline"
            >
              Lupa password?
            </button>
          </div>

          {/* BUTTON */}
          <button
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium disabled:opacity-60"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>

        </form>
      </div>
    </div>
  );
}