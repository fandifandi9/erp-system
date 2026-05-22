"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { fetchMissedCheckoutReminderRows, type MissedCheckoutRow } from "@/lib/missed-checkout-reminder";

const REFRESH_MS = 45_000;

export function MissedCheckoutReminderBanner() {
  const [rows, setRows] = useState<MissedCheckoutRow[]>([]);

  const load = useCallback(async () => {
    try {
      const next = await fetchMissedCheckoutReminderRows();
      setRows(next);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (rows.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-amber-200/80 p-2">
          <LogOut className="h-5 w-5 text-amber-900" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold leading-snug">
            Karyawan masih check-in: melewati akhir shift + 30 menit (tanpa lembur HR-approved hari ini)
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.userId}>
                <Link
                  href={`/hr/employees/${r.userId}`}
                  className="font-medium text-amber-900 underline decoration-amber-600/50 underline-offset-2 hover:decoration-amber-900"
                >
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
