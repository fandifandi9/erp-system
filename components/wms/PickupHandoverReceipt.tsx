"use client";

import type { SalesOrder, SalesOrderLine } from "@/lib/bisnis/types";
import { buildWmsOrderHeader } from "@/lib/wms/wms-order-display";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";

export type HandoverReceiptLine = {
  sku: string;
  name: string;
  qty: number;
};

export function PickupHandoverReceipt({
  so,
  lines,
  warehouseStaff,
  courierName,
  courierPhone,
  courierCompany,
  showPrintHint = true,
}: {
  so: SalesOrder;
  lines: HandoverReceiptLine[];
  warehouseStaff?: string;
  courierName?: string;
  courierPhone?: string;
  courierCompany?: string;
  showPrintHint?: boolean;
}) {
  const h = buildWmsOrderHeader(so);
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const now = new Date().toLocaleString("id-ID");
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  return (
    <div className="handover-receipt mx-auto max-w-2xl bg-white p-6 text-slate-900 print:p-4">
      {showPrintHint ? (
        <p className="mb-4 text-center text-xs text-slate-500 print:hidden">
          Gunakan Ctrl+P / Cetak — berikan ke kurir untuk centang verifikasi fisik.
        </p>
      ) : null}

      <header className="border-b-2 border-slate-800 pb-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">SERBA ERP · WMS</p>
        <h1 className="mt-1 text-xl font-bold">Tanda Terima Serah Terima Paket</h1>
        <p className="text-xs text-slate-600">{now}</p>
      </header>

      <section className="mt-4 grid gap-2 text-sm">
        <Row label="No. Order" value={h.orderNo} mono />
        <Row label="Package Code" value={h.packageCode} mono />
        <Row label="Tipe identitas" value={h.packageCodeLabel} />
        <Row label="Invoice" value={h.invoiceNo ?? "—"} mono />
        <Row label="Gudang" value={h.warehouseName} />
        <Row label="Customer" value={h.customerName} />
        <Row label="Alamat" value={h.recipientAddress} />
        <Row label="Ekspedisi" value={courierCompany || h.courier} />
        <Row label="Validator" value={wf.validate_pack?.user_name ?? "—"} />
      </section>

      <table className="mt-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 bg-slate-50">
            <th className="px-2 py-2 text-left font-semibold">SKU</th>
            <th className="px-2 py-2 text-left font-semibold">Produk</th>
            <th className="px-2 py-2 text-right font-semibold">Qty</th>
            <th className="px-2 py-2 text-center font-semibold w-16">Cek</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.sku + l.name} className="border-b border-slate-100">
              <td className="px-2 py-2 font-mono text-xs">{l.sku}</td>
              <td className="px-2 py-2">{l.name}</td>
              <td className="px-2 py-2 text-right font-semibold">{l.qty}</td>
              <td className="px-2 py-2 text-center">
                <span className="inline-block h-4 w-4 border border-slate-400" />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="px-2 py-2 font-semibold">
              Total item / qty
            </td>
            <td className="px-2 py-2 text-right font-bold">{totalQty}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <section className="mt-5 rounded border border-slate-300 p-3 text-sm">
        <p className="font-semibold">Verifikasi fisik (centang setelah dicek di lapangan)</p>
        <ul className="mt-2 space-y-2">
          <CheckRow label="Jumlah paket / qty sesuai dengan daftar di atas" />
          <CheckRow label="Label Package Code terbaca & sesuai sistem" />
          <CheckRow label="Segel / kondisi kemasan baik (tidak rusak)" />
          <CheckRow label="Scan barcode / QR Package Code cocok dengan dokumen ini" />
        </ul>
        <p className="mt-3 text-xs text-slate-600">
          Scan verifikasi sistem:{" "}
          <span className="font-mono font-semibold">{wf.pickup?.physical_scan_code ?? "________________"}</span>
        </p>
      </section>

      <section className="mt-6 grid gap-8 sm:grid-cols-2 text-sm">
        <SignatureBlock title="Petugas gudang" name={warehouseStaff} />
        <SignatureBlock
          title="Kurir / pihak pickup"
          name={courierName}
          extra={courierPhone ? `HP: ${courierPhone}` : undefined}
        />
      </section>

      <p className="mt-6 text-center text-[10px] text-slate-500">
        Dokumen ini bagian dari audit trail WMS — tidak dapat diubah setelah status Completed.
      </p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 text-slate-500">{label}</span>
      <span className={mono ? "font-mono font-medium" : ""}>{value}</span>
    </div>
  );
}

function CheckRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 inline-block h-4 w-4 shrink-0 border border-slate-500" />
      <span>{label}</span>
    </li>
  );
}

function SignatureBlock({
  title,
  name,
  extra,
}: {
  title: string;
  name?: string;
  extra?: string;
}) {
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <div className="mt-8 border-b border-slate-400" />
      <p className="mt-1 text-xs text-slate-600">Nama: {name?.trim() || "________________________"}</p>
      {extra ? <p className="text-xs text-slate-600">{extra}</p> : null}
      <p className="mt-2 text-xs text-slate-500">Tanda tangan &amp; stempel</p>
    </div>
  );
}
