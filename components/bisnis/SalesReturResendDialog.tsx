"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { CourierServiceFields } from "@/components/bisnis/CourierServiceFields";
import { fmtNum, parseNum } from "@/components/bisnis/NumSpinnerInput";
import { useLocale } from "@/components/LocaleProvider";
import type { ResendShippingPayer } from "@/lib/bisnis/sales-retur-resend-shipping";

export type SalesReturResendFormValue = {
  method: "pickup" | "ship";
  courier: string;
  shipping_service: string;
  recipient_address: string;
  shipping_cost: number;
  shipping_payer: ResendShippingPayer;
};

type Props = {
  open: boolean;
  submitting?: boolean;
  /** Prefill alamat / ekspedisi dari SO. */
  defaults?: Partial<SalesReturResendFormValue>;
  onClose: () => void;
  onConfirm: (value: SalesReturResendFormValue) => void | Promise<void>;
};

const emptyForm = (d?: Partial<SalesReturResendFormValue>): SalesReturResendFormValue => ({
  method: d?.method === "ship" ? "ship" : "pickup",
  courier: d?.courier?.trim() || "",
  shipping_service: d?.shipping_service?.trim() || "",
  recipient_address: d?.recipient_address?.trim() || "",
  shipping_cost: Number(d?.shipping_cost) > 0 ? Number(d?.shipping_cost) : 0,
  shipping_payer: d?.shipping_payer === "customer" ? "customer" : "seller",
});

/**
 * Form putusan Kirim kembali: ambil sendiri vs kurir,
 * plus ekspedisi / layanan / ongkir / penanggung ongkir.
 */
export function SalesReturResendDialog({
  open,
  submitting,
  defaults,
  onClose,
  onConfirm,
}: Props) {
  const { t } = useLocale();
  const [form, setForm] = useState<SalesReturResendFormValue>(() => emptyForm(defaults));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(defaults));
    setLocalError("");
  }, [open, defaults]);

  if (!open) return null;

  const set = (patch: Partial<SalesReturResendFormValue>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    setLocalError("");
    if (form.method === "ship") {
      if (!form.courier.trim()) {
        setLocalError(t("sales.detailRetur.resendErrCourier"));
        return;
      }
      if (!form.shipping_service.trim()) {
        setLocalError(t("sales.detailRetur.resendErrService"));
        return;
      }
      if (!form.recipient_address.trim()) {
        setLocalError(t("sales.detailRetur.resendErrAddress"));
        return;
      }
    }
    await onConfirm(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="resend-retur-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="resend-retur-title" className="text-lg font-semibold text-slate-900">
              {t("sales.detailRetur.resendDialogTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t("sales.detailRetur.resendDialogSubtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-800">
              {t("sales.detailRetur.resendMethodLabel")}
            </legend>
            <label
              className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 ${
                form.method === "pickup"
                  ? "border-orange-400 bg-orange-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="resend-method"
                className="mt-1"
                checked={form.method === "pickup"}
                onChange={() => set({ method: "pickup" })}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {t("sales.detailRetur.resendPickup")}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t("sales.detailRetur.resendPickupHint")}
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer gap-3 rounded-xl border px-3 py-3 ${
                form.method === "ship"
                  ? "border-orange-400 bg-orange-50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="resend-method"
                className="mt-1"
                checked={form.method === "ship"}
                onChange={() => set({ method: "ship" })}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">
                  {t("sales.detailRetur.resendShip")}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t("sales.detailRetur.resendShipHint")}
                </span>
              </span>
            </label>
          </fieldset>

          {form.method === "ship" ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <CourierServiceFields
                courierName={form.courier}
                serviceName={form.shipping_service}
                onCourierChange={(courier) => set({ courier, shipping_service: "" })}
                onServiceChange={(shipping_service) => set({ shipping_service })}
                onCourierServiceChange={(courier, shipping_service) =>
                  set({ courier, shipping_service })
                }
              />
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  {t("sales.detailRetur.resendAddress")}
                </span>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={form.recipient_address}
                  onChange={(e) => set({ recipient_address: e.target.value })}
                  placeholder={t("sales.detailRetur.resendAddressPlaceholder")}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-slate-700">
                    {t("sales.detailRetur.resendShippingCost")}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={form.shipping_cost > 0 ? fmtNum(form.shipping_cost) : ""}
                    onChange={(e) =>
                      set({ shipping_cost: Math.max(0, parseNum(e.target.value)) })
                    }
                    placeholder="0"
                  />
                </label>
                <fieldset className="block text-sm">
                  <legend className="mb-1 font-medium text-slate-700">
                    {t("sales.detailRetur.resendPayerLabel")}
                  </legend>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="resend-payer"
                        checked={form.shipping_payer === "seller"}
                        onChange={() => set({ shipping_payer: "seller" })}
                      />
                      <span>{t("sales.detailRetur.resendPayerSeller")}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="resend-payer"
                        checked={form.shipping_payer === "customer"}
                        onChange={() => set({ shipping_payer: "customer" })}
                      />
                      <span>{t("sales.detailRetur.resendPayerCustomer")}</span>
                    </label>
                  </div>
                </fieldset>
              </div>
              <p className="text-xs text-slate-500">{t("sales.detailRetur.resendPayerHint")}</p>
            </div>
          ) : (
            <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {t("sales.detailRetur.resendPickupNote")}
            </p>
          )}

          {localError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {t("sales.detailRetur.resendCancel")}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("sales.detailRetur.resendConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
