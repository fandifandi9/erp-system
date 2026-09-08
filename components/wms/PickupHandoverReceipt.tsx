"use client";

import type { TtLineSnapshot } from "@/lib/wms/tt-number";

/** Tanda terima — padat 80mm: TT + pengambil + daftar nomor paket. */
export function PickupHandoverReceipt({
  ttNo,
  items,
  warehouseStaff,
  courierName,
  courierPhone,
  courierCompany,
  showPrintHint = true,
  printedAt,
}: {
  ttNo: string;
  items: TtLineSnapshot[];
  /** @deprecated tidak ditampilkan — toko per baris paket */
  warehouseName?: string;
  warehouseStaff?: string;
  courierName?: string;
  courierPhone?: string;
  courierCompany?: string;
  showPrintHint?: boolean;
  printedAt?: string;
}) {
  const now =
    printedAt ??
    new Date().toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="handover-receipt mx-auto w-[80mm] max-w-full bg-white px-2.5 py-2 text-slate-900 shadow-sm print:shadow-none">
      {showPrintHint ? (
        <p className="mb-1.5 text-center text-[9px] text-slate-500 print:hidden">
          Format termal 80mm
        </p>
      ) : null}

      <header className="border-b border-slate-900 pb-1 text-center">
        <h1 className="text-sm font-bold uppercase tracking-wide">Tanda Terima</h1>
        <p className="text-[9px] text-slate-600">{now}</p>
      </header>

      <div className="mt-1.5 border-2 border-slate-900 px-1.5 py-1 text-center">
        <p className="text-[8px] font-bold uppercase tracking-wide text-slate-600">No. TT</p>
        <p className="break-all font-mono text-sm font-bold leading-tight">{ttNo || "—"}</p>
      </div>

      <dl className="mt-1.5 space-y-0.5 text-[11px] leading-snug">
        <Row label="Ekspedisi" value={courierCompany?.trim() || "—"} />
        <Row label="Pengambil" value={courierName?.trim() || "—"} />
        {courierPhone?.trim() ? <Row label="HP" value={courierPhone.trim()} /> : null}
        <Row label="Paket" value={String(items.length)} />
      </dl>

      <div className="mt-1.5 border-t border-dashed border-slate-400 pt-1">
        <p className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
          Daftar
        </p>
        <ol className="space-y-0">
          {items.map((it, idx) => {
            const code =
              (it.awb?.trim() && it.awb !== "—" ? it.awb.trim() : "") ||
              (it.pk_no?.trim() && it.pk_no !== "—" ? it.pk_no.trim() : "") ||
              "—";
            const store = it.store_name?.trim() || "—";
            return (
              <li
                key={`${it.so_id}-${idx}`}
                className="flex items-baseline gap-1.5 border-t border-dashed border-slate-300 py-0.5 first:border-t-0"
              >
                <span className="w-4 shrink-0 text-[11px] font-bold text-slate-500">
                  {idx + 1}.
                </span>
                <span className="min-w-0 flex-1 break-all font-mono text-[12px] font-bold leading-tight">
                  {code}
                </span>
                <span className="max-w-[42%] shrink-0 text-right text-[9px] leading-tight text-slate-600">
                  {store}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <section className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <p className="font-semibold text-slate-600">Petugas</p>
          <div className="mt-6 border-b border-slate-400" />
          <p className="mt-0.5 text-[10px]">{warehouseStaff?.trim() || "_______________"}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-600">Pengambil</p>
          <div className="mt-6 border-b border-slate-400" />
          <p className="mt-0.5 text-[10px]">{courierName?.trim() || "_______________"}</p>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="w-16 shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-all font-medium">{value}</dd>
    </div>
  );
}
