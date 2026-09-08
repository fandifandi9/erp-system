"use client";

import { REPORT_ALL } from "@/lib/bisnis/report-filters";
import type { CashAccount, SalesChannel, Store } from "@/lib/bisnis/types";
import type { WarehouseOption } from "@/lib/bisnis/use-report-dimensions";

type Props = {
  companyName?: string;
  stores?: Store[];
  warehouses?: WarehouseOption[];
  channels?: SalesChannel[];
  cashAccounts?: CashAccount[];
  storeId?: string;
  onStoreChange?: (id: string) => void;
  warehouseId?: string;
  onWarehouseChange?: (id: string) => void;
  channelId?: string;
  onChannelChange?: (id: string) => void;
  cashAccountId?: string;
  onCashAccountChange?: (id: string) => void;
  showStore?: boolean;
  showWarehouse?: boolean;
  showChannel?: boolean;
  showCashAccount?: boolean;
  className?: string;
};

const selectCls =
  "appearance-none rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export function ReportDimensionFilters({
  companyName,
  stores = [],
  warehouses = [],
  channels = [],
  cashAccounts = [],
  storeId = REPORT_ALL,
  onStoreChange,
  warehouseId = REPORT_ALL,
  onWarehouseChange,
  channelId = REPORT_ALL,
  onChannelChange,
  cashAccountId = REPORT_ALL,
  onCashAccountChange,
  showStore = true,
  showWarehouse = false,
  showChannel = false,
  showCashAccount = false,
  className = "",
}: Props) {
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      {companyName && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Entitas: <span className="font-semibold text-slate-800">{companyName}</span>
        </div>
      )}
      {showStore && stores.length > 0 && onStoreChange && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Toko</label>
          <select value={storeId} onChange={(e) => onStoreChange(e.target.value)} className={selectCls}>
            <option value={REPORT_ALL}>Semua toko</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {showWarehouse && warehouses.length > 0 && onWarehouseChange && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Gudang</label>
          <select value={warehouseId} onChange={(e) => onWarehouseChange(e.target.value)} className={selectCls}>
            <option value={REPORT_ALL}>Semua gudang</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.code})
              </option>
            ))}
          </select>
        </div>
      )}
      {showChannel && channels.length > 0 && onChannelChange && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Channel</label>
          <select value={channelId} onChange={(e) => onChannelChange(e.target.value)} className={selectCls}>
            <option value={REPORT_ALL}>Semua channel</option>
            {channels.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {showCashAccount && cashAccounts.length > 0 && onCashAccountChange && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Rekening</label>
          <select value={cashAccountId} onChange={(e) => onCashAccountChange(e.target.value)} className={selectCls}>
            <option value={REPORT_ALL}>Semua rekening</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
