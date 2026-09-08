"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import type { SelfPayrollBankView } from "@/lib/hr/payroll-bank-account-types";
import { PAYROLL_BANK_OPTIONS } from "@/lib/hr/payroll-bank-options";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  FormField,
  Input,
  LoadingState,
  SectionHeader,
  StatusBadge,
  Select,
} from "@/components/ui";

type Props = {
  onToast: (kind: "success" | "error", title: string, detail?: string) => void;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (pb.authStore.token) h.Authorization = `Bearer ${pb.authStore.token}`;
  return h;
}

function formatDt(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function PayrollBankAccountSection({ onToast }: Props) {
  const [data, setData] = useState<SelfPayrollBankView | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ bank_name: "", account_number: "", account_holder_name: "", note: "" });
  const [customBank, setCustomBank] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/self/payroll-bank", { credentials: "include", headers: authHeaders() });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: SelfPayrollBankView; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Gagal memuat rekening payroll.");
      setData(json.data ?? { active: null, pending: null, last_rejected: null });
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "Gagal memuat rekening payroll.");
      setData({ active: null, pending: null, last_rejected: null });
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/profile/self/payroll-bank", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; data?: SelfPayrollBankView; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || "Pengajuan gagal.");
      setData(json.data ?? null);
      setShowForm(false);
      setForm({ bank_name: "", account_number: "", account_holder_name: "", note: "" });
      setCustomBank(false);
      onToast("success", "Pengajuan rekening berhasil dikirim ke HR/Finance.");
    } catch (e) {
      onToast("error", e instanceof Error ? e.message : "Pengajuan gagal.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <LoadingState label="Memuat rekening payroll…" />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Rekening Bank"
        description="Rekening payroll aktif dan pengajuan perubahan melalui HR/Finance."
      />

      {data?.active ? (
        <>
          <div className="mb-3">
            <StatusBadge label="Aktif" tone="success" />
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-erp-text-muted">Bank</dt>
            <dd className="font-medium text-erp-text">{data.active.bank_name}</dd>
          </div>
          <div>
            <dt className="text-erp-text-muted">Nomor rekening</dt>
            <dd className="font-mono font-medium text-erp-text">{data.active.account_number_masked}</dd>
          </div>
          <div>
            <dt className="text-erp-text-muted">Nama pemilik</dt>
            <dd className="font-medium text-erp-text">{data.active.account_holder_name}</dd>
          </div>
          <div>
            <dt className="text-erp-text-muted">Berlaku dari</dt>
            <dd className="font-medium text-erp-text">{data.active.effective_from || "—"}</dd>
          </div>
        </dl>
        </>
      ) : (
        <p className="text-sm text-erp-text-muted">Belum ada rekening payroll aktif.</p>
      )}

      {data?.pending ? (
        <Alert tone="warning" title="Menunggu persetujuan HR/Finance" className="mt-4">
          <p>
            {data.pending.bank_name} · {data.pending.account_number_masked} · {data.pending.account_holder_name}
          </p>
          <p className="mt-1 text-xs opacity-90">Diajukan: {formatDt(data.pending.created)}</p>
        </Alert>
      ) : null}

      {data?.last_rejected ? (
        <Alert tone="danger" title="Pengajuan terakhir ditolak" className="mt-4">
          <p>
            {data.last_rejected.bank_name} · {data.last_rejected.account_number_masked}
          </p>
          <p className="mt-1 text-xs">Alasan: {data.last_rejected.rejection_reason}</p>
          <p className="text-xs opacity-90">{formatDt(data.last_rejected.rejected_at)}</p>
        </Alert>
      ) : null}

      {!data?.pending ? (
        <>
          {!showForm ? (
            <Button type="button" variant="secondary" className="mt-4" onClick={() => setShowForm(true)}>
              <Building2 className="h-4 w-4" aria-hidden />
              Ajukan perubahan rekening
            </Button>
          ) : (
            <form onSubmit={(e) => void submitRequest(e)} className="mt-4 space-y-4 border-t border-erp-border pt-4">
              <FormField label="Bank">
                {!customBank ? (
                  <Select
                    value={form.bank_name}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "Lainnya") {
                        setCustomBank(true);
                        setForm((f) => ({ ...f, bank_name: "" }));
                      } else {
                        setForm((f) => ({ ...f, bank_name: v }));
                      }
                    }}
                    required={!customBank}
                  >
                    <option value="">Pilih bank</option>
                    {PAYROLL_BANK_OPTIONS.map((b) => (
                      <option key={b} value={b === "Lainnya" ? "Lainnya" : b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={form.bank_name}
                    onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
                    placeholder="Nama bank"
                    required
                  />
                )}
              </FormField>
              <FormField label="Nomor rekening">
                <Input
                  inputMode="numeric"
                  className="font-mono"
                  value={form.account_number}
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                  required
                />
              </FormField>
              <FormField label="Nama pemilik rekening">
                <Input
                  value={form.account_holder_name}
                  onChange={(e) => setForm((f) => ({ ...f, account_holder_name: e.target.value }))}
                  required
                />
              </FormField>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" loading={busy} className="flex-1">
                  {busy ? "Mengirim…" : "Ajukan perubahan"}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Batal
                </Button>
              </div>
            </form>
          )}
        </>
      ) : (
        <p className="mt-3 text-xs text-erp-text-muted">
          Pengajuan perubahan rekening menunggu persetujuan HR/Finance.
        </p>
      )}
    </Card>
  );
}
