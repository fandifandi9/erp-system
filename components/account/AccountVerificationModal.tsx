"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  fetchAccountVerificationStatus,
  verifyAccountApi,
  type AccountVerificationStatus,
} from "@/lib/account-verification-client";
import { ACCOUNT_VERIFICATION_WINDOW_MINUTES } from "@/lib/account-verification-session";

type Props = {
  open: boolean;
  onVerified: () => void;
  onClose: () => void;
  /** Context label shown in modal subtitle */
  context?: "payslip" | "document" | "general";
};

const CONTEXT_HINT: Record<string, string> = {
  payslip: "Masukkan kata sandi akun Anda untuk mengakses slip gaji.",
  document:
    "Masukkan kata sandi sekali untuk membuka KTP, NPWP, KK, dan dokumen pribadi lainnya.",
  general: "Masukkan kata sandi akun Anda untuk melanjutkan.",
};

export function AccountVerificationModal({ open, onVerified, onClose, context = "general" }: Props) {
  const [status, setStatus] = useState<AccountVerificationStatus | null>(null);
  const [password, setPassword] = useState("");
  const [passwordReady, setPasswordReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputKey, setInputKey] = useState(0);

  useEffect(() => {
    if (open) {
      setPassword("");
      setPasswordReady(false);
      setError("");
      setInputKey((k) => k + 1);
      void fetchAccountVerificationStatus()
        .then(setStatus)
        .catch(() => setStatus({ verified: false, locked: false }));
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await verifyAccountApi(password);
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verifikasi gagal.");
      try {
        setStatus(await fetchAccountVerificationStatus());
      } catch {
        /* ignore */
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Verifikasi Akun</h2>
            <p className="mt-1 text-sm text-slate-600">
              Untuk melanjutkan, verifikasi bahwa Anda adalah pemilik akun ini.
            </p>
            <p className="mt-1 text-xs text-slate-500">{CONTEXT_HINT[context]}</p>
          </div>
        </div>

        {status?.locked ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Verifikasi terkunci sementara
            {status.locked_until
              ? ` (hingga ${new Date(status.locked_until).toLocaleString("id-ID")})`
              : ""}
            .
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3" autoComplete="off">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-800">Kata sandi akun</label>
            <input
              key={inputKey}
              type="password"
              name="account-verification-password"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore
              readOnly={!passwordReady}
              onFocus={() => setPasswordReady(true)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm"
              placeholder="Ketik kata sandi login Anda"
            />
            <p className="mt-1 text-xs text-slate-500">
              {password.length > 0
                ? `${password.length} karakter terisi`
                : "Ketik manual kata sandi login — hindari autofill browser jika gagal."}
            </p>
          </div>

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
          ) : null}

          <p className="text-xs text-slate-500">
            Berlaku {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit. Verifikasi ulang jika keluar modul
            selama {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit, atau diam tanpa aktivitas (scroll/
            ketik) selama {ACCOUNT_VERIFICATION_WINDOW_MINUTES} menit.
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || status?.locked || !password.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Verifikasi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
