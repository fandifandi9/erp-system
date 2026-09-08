"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Trash2 } from "lucide-react";
import {
  isSettlementIncomingType,
  isSettlementOutgoingType,
  legacyAmountsFromSettlement,
  parseSettlementEstimateJson,
  serializeSettlementEstimate,
  SETTLEMENT_INCOMING_LABELS,
  SETTLEMENT_OUTGOING_LABELS,
  type SalesReturSettlementEstimate,
  type SettlementIncomingType,
  type SettlementOutgoingType,
} from "@/lib/bisnis/sales-retur-expected";
import type { Retur } from "@/lib/bisnis/types";
import { formatIntegerId, parseIntegerInput } from "@/lib/format-number";
import { useLocale } from "@/components/LocaleProvider";

type SettlementDraft = {
  key: string;
  kind: "outgoing" | "incoming";
  type: SettlementOutgoingType | SettlementIncomingType;
  amount: number;
};

const OUTGOING_TYPES = Object.keys(SETTLEMENT_OUTGOING_LABELS) as SettlementOutgoingType[];
const INCOMING_TYPES = Object.keys(SETTLEMENT_INCOMING_LABELS) as SettlementIncomingType[];

const OUTGOING_LABEL_KEYS: Record<SettlementOutgoingType, string> = {
  refund_customer: "sales.createRetur.outRefundCustomer",
  seller_shipping: "sales.createRetur.outSellerShipping",
  voucher: "sales.createRetur.outVoucher",
  cashback: "sales.createRetur.outCashback",
  goodwill: "sales.createRetur.outGoodwill",
  other_expense: "sales.createRetur.outOther",
};

const INCOMING_LABEL_KEYS: Record<SettlementIncomingType, string> = {
  recovery_marketplace: "sales.createRetur.inMarketplace",
  recovery_supplier: "sales.createRetur.inSupplier",
  recovery_courier: "sales.createRetur.inCourier",
  recovery_insurance: "sales.createRetur.inInsurance",
  recovery_other: "sales.createRetur.inOther",
};

let settlementKeySeq = 0;
function nextSettlementKey() {
  settlementKeySeq += 1;
  return `st-${settlementKeySeq}`;
}

export function estimateToDrafts(estimate: SalesReturSettlementEstimate): SettlementDraft[] {
  return estimate.items
    .filter((i) => (Number(i.amount) || 0) > 0)
    .map((i) => ({
      key: nextSettlementKey(),
      kind: i.type in SETTLEMENT_OUTGOING_LABELS ? ("outgoing" as const) : ("incoming" as const),
      type: i.type,
      amount: Number(i.amount) || 0,
    }));
}

/** Estimasi dari JSON retur, atau migrasi field lama mp_claim / shipping_reimb. */
export function estimateFromRetur(retur: Pick<Retur, "settlement_estimate_json" | "mp_claim_amount" | "shipping_reimb_amount">): SalesReturSettlementEstimate {
  const parsed = parseSettlementEstimateJson(retur.settlement_estimate_json);
  if (parsed.items.length > 0) return parsed;
  const items: SalesReturSettlementEstimate["items"] = [];
  const mp = Math.max(0, Number(retur.mp_claim_amount) || 0);
  const ship = Math.max(0, Number(retur.shipping_reimb_amount) || 0);
  if (mp > 0) items.push({ type: "recovery_marketplace", amount: mp });
  if (ship > 0) items.push({ type: "seller_shipping", amount: ship });
  return { items };
}

export function draftsToEstimate(drafts: SettlementDraft[]): SalesReturSettlementEstimate {
  return {
    items: drafts
      .filter((d) => d.amount > 0)
      .map((d) => ({ type: d.type, amount: d.amount })),
  };
}

export function settlementPersistPatch(estimate: SalesReturSettlementEstimate) {
  const legacy = legacyAmountsFromSettlement(estimate);
  return {
    settlement_estimate_json:
      estimate.items.length > 0 ? serializeSettlementEstimate(estimate) : "",
    mp_claim_amount: legacy.mp_claim_amount,
    shipping_reimb_amount: legacy.shipping_reimb_amount,
  };
}

type Props = {
  value: SalesReturSettlementEstimate;
  onChange: (next: SalesReturSettlementEstimate) => void;
  disabled?: boolean;
  className?: string;
  /** Ubah saat buka modal / muat retur agar draft di-reset dari value. */
  resetKey?: string;
};

/** UI pembukuan sama untuk Buat Retur & klarifikasi: − Beban / + Pemulihan. */
export function SalesReturSettlementEditor({
  value,
  onChange,
  disabled,
  className = "",
  resetKey = "",
}: Props) {
  const { t } = useLocale();
  const [drafts, setDrafts] = useState<SettlementDraft[]>(() => estimateToDrafts(value));
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setDrafts(estimateToDrafts(value));
    setHelpOpen(false);
    // Hanya reset saat konteks berubah (bukan tiap onChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetKey drives remount from value
  }, [resetKey]);

  const emit = (next: SettlementDraft[]) => {
    setDrafts(next);
    onChange(draftsToEstimate(next));
  };

  const addSettlement = (kind: SettlementDraft["kind"]) => {
    if (disabled) return;
    emit([
      ...drafts,
      {
        key: nextSettlementKey(),
        kind,
        type: kind === "outgoing" ? "refund_customer" : "recovery_marketplace",
        amount: 0,
      },
    ]);
  };

  const patchSettlement = (key: string, patch: Partial<SettlementDraft>) => {
    if (disabled) return;
    emit(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const removeSettlement = (key: string) => {
    if (disabled) return;
    emit(drafts.filter((d) => d.key !== key));
  };

  return (
    <div className={`rounded-lg border border-slate-100 bg-slate-50 p-4 ${className}`}>
      <p className="text-sm font-semibold text-slate-800">{t("sales.createRetur.settlementTitle")}</p>
      <p className="mt-0.5 text-xs text-slate-500">{t("sales.createRetur.settlementHint")}</p>

      <button
        type="button"
        onClick={() => setHelpOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
        aria-expanded={helpOpen}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition ${helpOpen ? "rotate-180" : ""}`} />
        {t("sales.createRetur.settlementHelpToggle")}
      </button>
      {helpOpen ? (
        <p className="mt-2 rounded-lg border border-indigo-100 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
          {t("sales.createRetur.settlementHelpBody")}
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {drafts.map((row) => {
            const typeOptions = row.kind === "outgoing" ? OUTGOING_TYPES : INCOMING_TYPES;
            const labelKeys = row.kind === "outgoing" ? OUTGOING_LABEL_KEYS : INCOMING_LABEL_KEYS;
            const isBurden = row.kind === "outgoing";
            return (
              <li
                key={row.key}
                className={`flex flex-wrap items-end gap-2 rounded-lg border bg-white p-3 ${
                  isBurden ? "border-rose-200" : "border-emerald-200"
                }`}
              >
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold uppercase ${
                    isBurden ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  <span aria-hidden>{isBurden ? "−" : "+"}</span>
                  {isBurden ? t("sales.createRetur.burden") : t("sales.createRetur.recovery")}
                </span>
                <select
                  value={row.type}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (
                      row.kind === "outgoing" &&
                      isSettlementOutgoingType(next as SettlementOutgoingType)
                    ) {
                      patchSettlement(row.key, { type: next as SettlementOutgoingType });
                    } else if (
                      row.kind === "incoming" &&
                      isSettlementIncomingType(next as SettlementIncomingType)
                    ) {
                      patchSettlement(row.key, { type: next as SettlementIncomingType });
                    }
                  }}
                  className="min-w-[10rem] flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm disabled:bg-slate-50"
                >
                  {typeOptions.map((typeKey) => (
                    <option key={typeKey} value={typeKey}>
                      {t(labelKeys[typeKey as keyof typeof labelKeys])}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">Rp</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={disabled}
                    placeholder="0"
                    value={row.amount > 0 ? formatIntegerId(row.amount) : ""}
                    onChange={(e) =>
                      patchSettlement(row.key, {
                        amount: Math.max(0, parseIntegerInput(e.target.value)),
                      })
                    }
                    className="w-32 rounded border border-slate-200 px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-slate-50"
                  />
                </div>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => removeSettlement(row.key)}
                    className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => addSettlement("outgoing")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
          >
            {t("sales.createRetur.addBurden")}
          </button>
          <button
            type="button"
            onClick={() => addSettlement("incoming")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            {t("sales.createRetur.addRecovery")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
