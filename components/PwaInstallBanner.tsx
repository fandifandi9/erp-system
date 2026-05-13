"use client";

import { useCallback, useEffect, useState } from "react";
import { Smartphone } from "lucide-react";

const DISMISS_KEY = "serba_erp_pwa_install_banner_until";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

type WebInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const until = parseInt(raw, 10);
  if (Number.isNaN(until)) return false;
  return Date.now() < until;
}

/**
 * Banner login: **Instal sekarang** satu ketukan (dialog browser) jika `beforeinstallprompt`
 * tersedia — mudah untuk pengguna awam. iOS/Safari tetap petunjuk singkat (tanpa API instal).
 */
export default function PwaInstallBanner() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [iosLike, setIosLike] = useState(false);
  const [deferred, setDeferred] = useState<WebInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (readDismissed()) return;

    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIosLike(ios);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as WebInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    const onInstalled = () => {
      setDeferred(null);
      setVisible(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    setVisible(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS));
    } catch {
      /* private mode */
    }
    setVisible(false);
  }, []);

  const runInstall = useCallback(async () => {
    if (!deferred || busy) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice.catch(() => {});
    } catch {
      /* dibatalkan */
    } finally {
      setDeferred(null);
      setBusy(false);
    }
  }, [deferred, busy]);

  if (!mounted || !visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
      role="region"
      aria-label="Pasang aplikasi"
    >
      <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-slate-800 bg-slate-950 text-white shadow-lg ring-1 ring-white/5">
        <div className="flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 sm:h-8 sm:w-8">
            <Smartphone className="h-3.5 w-3.5 text-white sm:h-4 sm:w-4" strokeWidth={2} aria-hidden />
          </div>

          <div className="min-w-0 flex-1">
            {deferred ? (
              <>
                <p className="text-[11px] font-semibold leading-tight text-white sm:text-xs">
                  Pasang aplikasi SERBA ERP?
                </p>
                <p className="mt-0.5 text-[10px] leading-snug text-white/80 sm:text-[11px]">
                  Ketuk <span className="font-semibold text-white">Instal</span> — ikuti jendela yang muncul, selesai.
                </p>
              </>
            ) : iosLike ? (
              <p className="text-[11px] leading-snug text-white/90 sm:text-xs">
                Di <span className="font-semibold">iPhone/iPad</span>: Safari →{" "}
                <span className="font-semibold">Bagikan</span> →{" "}
                <span className="font-semibold">Tambahkan ke Layar Utama</span>.
              </p>
            ) : (
              <p className="text-[11px] leading-snug text-white/90 sm:text-xs">
                Pakai <span className="font-semibold">Chrome atau Edge</span>. Lihat ikon kecil di{" "}
                <span className="font-semibold">kanan bilah alamat</span> (mis. “Instal” / “Open in app”) lalu ketuk
                di sana. Atau jalankan <code className="rounded bg-white/15 px-0.5 text-[10px]">npm run build</code> +{" "}
                <code className="rounded bg-white/15 px-0.5 text-[10px]">npm start</code> agar tombol di bawah bisa
                muncul.
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-1 sm:flex-row sm:items-center">
            {deferred ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void runInstall()}
                className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 disabled:opacity-50 sm:px-3 sm:text-xs"
              >
                {busy ? "…" : "Instal"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md px-2 py-1 text-center text-[11px] font-medium text-white/75 transition hover:bg-white/10 hover:text-white sm:px-2.5 sm:text-xs"
            >
              Nanti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
