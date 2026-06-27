"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { createCustomer } from "@/lib/bisnis/client";
import {
  buildQuickCustomerCode,
  validateQuickCustomerInput,
  type QuickCustomerValidationError,
} from "@/lib/bisnis/customer-quick-add";
import { findCustomerByPhone } from "@/lib/bisnis/customer-lookup";
import type { Customer } from "@/lib/bisnis/types";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";

const EMPTY = { name: "", phone: "", email: "" };

const VALIDATION_KEYS: Record<QuickCustomerValidationError, string> = {
  name: "sales.customerQuick.errName",
  phone: "sales.customerQuick.errPhone",
  email: "sales.customerQuick.errEmail",
  emailFormat: "sales.customerQuick.errEmailFormat",
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
};

export function QuickAddCustomerModal({ open, onClose, onCreated }: Props) {
  const { t } = useLocale();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const resetAndClose = () => {
    setForm(EMPTY);
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateQuickCustomerInput(form);
    if (validation) {
      setError(t(VALIDATION_KEYS[validation]));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const existing = await findCustomerByPhone(form.phone);
      if (existing) {
        setForm(EMPTY);
        onCreated(existing);
        return;
      }
      const created = await createCustomer({
        code: buildQuickCustomerCode(form.name),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        customer_type: "regular",
        is_active: true,
      });
      setForm(EMPTY);
      onCreated(created);
    } catch (err) {
      setError(getErrorMessage(err, t("sales.customerQuick.errSave")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">{t("sales.customerQuick.title")}</h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-4 py-4">
          <p className="mb-3 text-xs text-slate-500">
            {t("sales.customerQuick.hint")}
          </p>
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">
                {t("sales.customerQuick.name")} <span className="text-red-500">*</span>
              </label>
              <input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t("sales.customerQuick.namePlaceholder")}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">
                {t("sales.customerQuick.phone")} <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder={t("sales.customerQuick.phonePlaceholder")}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-xs font-medium text-slate-600">
                {t("sales.create.email")} <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder={t("sales.customerQuick.emailPlaceholder")}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("sales.customerQuick.saveSelect")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
