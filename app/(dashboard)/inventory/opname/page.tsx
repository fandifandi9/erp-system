"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { InventoryGate } from "@/components/inventory/InventoryGate";
import { InventoryShell } from "@/components/inventory/InventoryShell";
import {
  createOpnameSessionApi,
  fetchOpnameSessions,
  fetchWarehouses,
} from "@/lib/inventory/client";
import { canManageOpnameSession } from "@/lib/inventory/access";
import { getErrorMessage } from "@/lib/errors";
import {
  OPNAME_COUNT_METHODS,
  type InvOpnameSession,
  type InvWarehouse,
  type OpnameCountMethod,
} from "@/lib/inventory/types";
import { labelOpnameMethod, labelOpnameStatus } from "@/lib/inventory/labels";
import { Loader2, Plus } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export default function InventoryOpnamePage() {
  const { t } = useLocale();
  const user = pb.authStore.model;
  const canCreate = user && canManageOpnameSession(user);
  const [warehouses, setWarehouses] = useState<InvWarehouse[]>([]);
  const [items, setItems] = useState<InvOpnameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    warehouse: "",
    count_method: "full" as OpnameCountMethod,
    notes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchOpnameSessions();
      setItems(res.items as unknown as InvOpnameSession[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchWarehouses().then((list) => {
      setWarehouses(list);
      if (list[0]) setForm((f) => ({ ...f, warehouse: list[0].id }));
    });
    void load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) return;
    setSaving(true);
    setError("");
    try {
      await createOpnameSessionApi(form);
      setModal(false);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryGate>
      <InventoryShell title={t("inventory.opname.title")} subtitle={t("inventory.opname.subtitle")}>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setModal(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" /> {t("inventory.common.add")}
          </button>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">No</th>
                <th className="px-4 py-3">{t("inventory.common.warehouse")}</th>
                <th className="px-4 py-3">{t("inventory.common.status")}</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-600" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {t("inventory.opname.empty")}
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono">{s.opname_no}</td>
                    <td className="px-4 py-3">
                      {s.expand?.warehouse?.code || s.warehouse}
                    </td>
                    <td className="px-4 py-3">{labelOpnameStatus(s.status)}</td>
                    <td className="px-4 py-3">{labelOpnameMethod(s.count_method)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventory/opname/${s.id}`} className="text-indigo-600 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {modal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold">Sesi opname baru</h3>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  {t("inventory.common.warehouse")}
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.warehouse}
                    onChange={(e) => setForm({ ...form, warehouse: e.target.value })}
                    required
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} — {w.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Metode
                  <select
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.count_method}
                    onChange={(e) =>
                      setForm({ ...form, count_method: e.target.value as OpnameCountMethod })
                    }
                  >
                    {OPNAME_COUNT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  {t("inventory.common.note")}
                  <textarea
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">
                  {t("inventory.common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {t("inventory.common.add")}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </InventoryShell>
    </InventoryGate>
  );
}
