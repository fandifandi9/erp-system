"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export type SalesReturCancelChoice = "process_only" | "return_to_customer";

type Props = {
  open: boolean;
  busy?: boolean;
  /** Ada hold stok gudang sementara — ingatkan di UI. */
  holdActive?: boolean;
  /** Tampilkan opsi kembalikan ke pelanggan. */
  allowReturnToCustomer: boolean;
  onClose: () => void;
  onConfirmProcessOnly: (reason: string) => void | Promise<void>;
  onChooseReturnToCustomer: () => void;
};

/**
 * Dialog Batalkan: pilih tutup proses saja ( + alasan ) atau kembalikan ke pelanggan.
 */
export function SalesReturCancelDialog({
  open,
  busy,
  holdActive,
  allowReturnToCustomer,
  onClose,
  onConfirmProcessOnly,
  onChooseReturnToCustomer,
}: Props) {
  const { t } = useLocale();
  const [choice, setChoice] = useState<SalesReturCancelChoice | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) {
      setChoice(null);
      setReason("");
    }
  }, [open]);

  if (!open) return null;

  const submitProcessOnly = () => {
    void onConfirmProcessOnly(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-retur-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="cancel-retur-title" className="text-lg font-semibold text-slate-900">
              {t("sales.detailRetur.cancelDialogTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{t("sales.detailRetur.cancelDialogSubtitle")}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-2 px-5 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => setChoice("process_only")}
            className={`flex w-full flex-col items-start rounded-xl border px-4 py-3 text-left disabled:opacity-50 ${
              choice === "process_only"
                ? "border-red-400 bg-red-50"
                : "border-red-200 bg-red-50/40 hover:bg-red-50"
            }`}
          >
            <span className="text-sm font-semibold text-red-800">
              {t("sales.detailRetur.cancelProcessOnly")}
            </span>
            <span className="mt-0.5 text-xs text-red-800/80">
              {t("sales.detailRetur.cancelProcessOnlyHint")}
            </span>
          </button>

          {allowReturnToCustomer ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setChoice("return_to_customer");
                onChooseReturnToCustomer();
              }}
              className="flex w-full flex-col items-start rounded-xl border border-orange-200 bg-orange-50/60 px-4 py-3 text-left hover:bg-orange-50 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-orange-900">
                {t("sales.detailRetur.cancelReturnCustomer")}
              </span>
              <span className="mt-0.5 text-xs text-orange-900/80">
                {t("sales.detailRetur.cancelReturnCustomerHint")}
              </span>
            </button>
          ) : null}

          {choice === "process_only" ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
              {holdActive ? (
                <p className="text-xs text-amber-900">{t("sales.detailRetur.cancelHoldNote")}</p>
              ) : null}
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {t("sales.detailRetur.cancelReasonLabel")}
                </span>
                <textarea
                  rows={2}
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("sales.detailRetur.cancelReasonPlaceholder")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={submitProcessOnly}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t("sales.detailRetur.cancelConfirmProcess")}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("sales.detailRetur.resendCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
