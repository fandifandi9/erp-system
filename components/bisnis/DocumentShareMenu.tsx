"use client";

import { useState, useCallback, useContext, useEffect } from "react";
import { MessageCircle, Mail, Link2, Check, Loader2, ExternalLink } from "lucide-react";
import {
  ActionMenuDropdown,
  ActionMenuCloseContext,
} from "@/components/bisnis/ActionMenuDropdown";
import { ShareFeedbackToast, type ShareToastState } from "@/components/bisnis/ShareFeedbackToast";
import {
  normalizeWhatsAppPhone,
  openWhatsAppShare,
  openSharePreviewInNewTab,
  type DocSharePayload,
} from "@/lib/bisnis/doc-share";
import { useLocale } from "@/components/LocaleProvider";

type ShareActionId = "wa" | "email" | "copy" | "preview" | null;

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function ShareMenuButton({
  icon: Icon,
  children,
  onClick,
  busy,
  done,
}: {
  icon: typeof MessageCircle;
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  done?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-70 ${
        busy ? "animate-share-pulse-row" : ""
      }`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-indigo-600" />
      ) : done ? (
        <Check className="h-3.5 w-3.5 shrink-0 animate-share-pop text-emerald-600" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className={done ? "font-medium text-emerald-800" : ""}>{children}</span>
    </button>
  );
}

export function DocumentShareMenu({
  share,
  linkLabel,
  iconOnly,
}: {
  share: DocSharePayload;
  linkLabel: string;
  iconOnly?: boolean;
}) {
  const { t } = useLocale();
  const closeMenu = useContext(ActionMenuCloseContext);
  const [toast, setToast] = useState<ShareToastState>(null);
  const [active, setActive] = useState<ShareActionId>(null);
  const [done, setDone] = useState<ShareActionId>(null);
  const [resolvedShare, setResolvedShare] = useState(share);

  useEffect(() => {
    setResolvedShare(share);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/bisnis/share/ensure-url", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: share.docKind, id: share.docId }),
        });
        const data = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !data.url || cancelled) return;
        setResolvedShare({
          ...share,
          url: data.url,
          message: share.message.split(share.url).join(data.url),
        });
      } catch {
        /* fallback ke URL lama */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [share]);

  const finishSuccess = useCallback(
    (action: ShareActionId, title: string, detail: string) => {
      setDone(action);
      setToast({ kind: "success", title, detail });
      setTimeout(() => {
        closeMenu();
        setActive(null);
        setDone(null);
      }, 700);
    },
    [closeMenu],
  );

  const finishError = useCallback((title: string, detail: string) => {
    setToast({ kind: "error", title, detail });
    setActive(null);
  }, []);

  const sendWhatsApp = () => {
    setActive("wa");
    setToast({
      kind: "loading",
      title: "Membuka WhatsApp…",
      detail: "Sebentar — pastikan pop-up diizinkan",
    });

    window.setTimeout(() => {
      let phone = resolvedShare.toPhone;
      if (!phone) {
        setToast(null);
        const raw = prompt("Nomor WhatsApp (08xxx atau 62xxx):", "");
        if (!raw?.trim()) {
          finishError("Dibatalkan", "Nomor WhatsApp tidak diisi.");
          return;
        }
        phone = normalizeWhatsAppPhone(raw);
        if (!phone) {
          finishError("Nomor tidak valid", "Gunakan format 08… atau 62…");
          return;
        }
        setToast({ kind: "loading", title: "Membuka WhatsApp…" });
      }

      const opened = openWhatsAppShare(phone, resolvedShare.message);
      if (!opened) {
        finishError(
          "Pop-up diblokir",
          "Izinkan pop-up untuk situs ini agar WhatsApp terbuka di tab baru tanpa menutup ERP.",
        );
        return;
      }
      finishSuccess(
        "wa",
        "WhatsApp dibuka di tab baru",
        "Kirim pesan di WhatsApp. Link pratinjau akan membuka halaman landasan dulu.",
      );
    }, 120);
  };

  const sendEmail = () => {
    setActive("email");
    setToast({
      kind: "loading",
      title: "Mengirim email…",
      detail: "Resend — mohon tunggu",
    });

    void (async () => {
      let to = resolvedShare.toEmail?.trim();
      if (!to) {
        setToast(null);
        const manual = prompt("Email penerima:", "");
        if (!manual?.trim()) {
          finishError("Dibatalkan", "Email penerima tidak diisi.");
          return;
        }
        to = manual.trim();
        setToast({ kind: "loading", title: "Mengirim email…", detail: "Resend" });
      }

      try {
        const res = await fetch("/api/email/send", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: resolvedShare.docKind,
            id: resolvedShare.docId,
            to,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          message?: string;
          hint?: string;
          to?: string;
        };

        if (!res.ok) {
          const detail = data.hint
            ? `${data.error ?? "Gagal mengirim"}. ${data.hint}`
            : (data.error ?? "Gagal mengirim email");
          finishError("Gagal mengirim email", detail);
          return;
        }

        finishSuccess(
          "email",
          "Email terkirim",
          data.message ?? `Ke ${data.to ?? to} via Resend. Cek inbox/spam penerima.`,
        );
      } catch (e: unknown) {
        finishError(
          "Gagal mengirim email",
          e instanceof Error ? e.message : "Periksa koneksi dan konfigurasi Resend",
        );
      }
    })();
  };

  const openPreview = () => {
    setActive("preview");
    const opened = openSharePreviewInNewTab(resolvedShare.url);
    if (opened) {
      finishSuccess("preview", "Pratinjau dibuka", "Dibuka di tab baru browser.");
    } else {
      finishError(
        "Pop-up diblokir",
        "Izinkan pop-up, atau salin link lalu buka di tab baru.",
      );
    }
  };

  const copyLink = () => {
    setActive("copy");
    setToast({ kind: "loading", title: "Menyalin link…" });
    void (async () => {
      try {
        await navigator.clipboard.writeText(resolvedShare.url);
        finishSuccess(
          "copy",
          "Link disalin",
          "Bagikan ke pelanggan. Saat diklik dari WA Web, pilih Buka pratinjau (tab baru).",
        );
      } catch {
        prompt("Salin link:", resolvedShare.url);
        finishSuccess("copy", "Link ditampilkan", "Salin dari kotak dialog.");
      }
    })();
  };

  const sellerHint =
    resolvedShare.seller?.phone || resolvedShare.seller?.email
      ? t("share.sellerInfo", {
          name: resolvedShare.seller.name,
          phone: resolvedShare.seller.phone ? ` · WA ${resolvedShare.seller.phone}` : "",
        })
      : t("share.sellerHint");

  return (
    <>
      <ActionMenuDropdown iconOnly={iconOnly}>
        <MenuSection title={t("share.share")}>
          <p className="px-3 pb-1 text-[10px] leading-snug text-slate-500">{sellerHint}</p>
          <ShareMenuButton
            icon={MessageCircle}
            onClick={sendWhatsApp}
            busy={active === "wa"}
            done={done === "wa"}
          >
            {t("share.viaWhatsApp")}
          </ShareMenuButton>
          <ShareMenuButton
            icon={Mail}
            onClick={sendEmail}
            busy={active === "email"}
            done={done === "email"}
          >
            {t("share.viaEmail")}
          </ShareMenuButton>
          <ShareMenuButton
            icon={ExternalLink}
            onClick={openPreview}
            busy={active === "preview"}
            done={done === "preview"}
          >
            {t("share.openPreview")}
          </ShareMenuButton>
          <ShareMenuButton
            icon={Link2}
            onClick={copyLink}
            busy={active === "copy"}
            done={done === "copy"}
          >
            {linkLabel}
          </ShareMenuButton>
        </MenuSection>
      </ActionMenuDropdown>
      <ShareFeedbackToast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
