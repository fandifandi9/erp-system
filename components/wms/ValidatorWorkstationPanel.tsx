"use client";

import { useEffect, useState } from "react";
import { Monitor, LogOut } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import {
  fetchWmsWorkstations,
  getActiveWorkstation,
  setActiveWorkstation,
  type WmsWorkstation,
} from "@/lib/wms/workstations";

export function ValidatorWorkstationPanel({
  onWorkstationChange,
}: {
  onWorkstationChange?: (ws: WmsWorkstation | null) => void;
}) {
  const [list, setList] = useState<WmsWorkstation[]>([]);
  const [active, setActive] = useState<WmsWorkstation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchWmsWorkstations().then((rows) => {
      setList(rows);
      const saved = getActiveWorkstation();
      if (saved && rows.some((r) => r.id === saved.id)) {
        setActive(saved);
        onWorkstationChange?.(saved);
      }
      setLoading(false);
    });
  }, [onWorkstationChange]);

  const login = (ws: WmsWorkstation) => {
    setActiveWorkstation(ws);
    setActive(ws);
    onWorkstationChange?.(ws);
  };

  const logout = () => {
    setActiveWorkstation(null);
    setActive(null);
    onWorkstationChange?.(null);
  };

  const user = pb.authStore.model;
  const userName = typeof user?.name === "string" ? user.name : user?.email ?? "—";
  const userRole = String((user as { role?: string })?.role ?? "staff");

  if (loading) {
    return <p className="text-xs text-slate-500">Memuat workstation…</p>;
  }

  if (!active) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Monitor className="h-4 w-4" />
          Login Workstation Validator
        </p>
        <p className="mt-1 text-xs text-amber-900">
          Validator: <strong>{userName}</strong> ({userRole}) — pilih meja kerja sekali per shift.
          CCTV tercatat otomatis.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {list.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => login(ws)}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm hover:border-indigo-400 hover:bg-indigo-50"
            >
              <span className="font-mono font-semibold text-indigo-800">{ws.code}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{ws.location}</span>
              <span className="text-[10px] text-slate-500">CCTV: {ws.cctv}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm">
      <div>
        <p className="font-semibold text-emerald-950">
          {userName} · {active.code}
        </p>
        <p className="text-xs text-emerald-800">
          {active.location} · CCTV {active.cctv} · Role {userRole}
        </p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
      >
        <LogOut className="h-3.5 w-3.5" />
        Ganti workstation
      </button>
    </div>
  );
}
