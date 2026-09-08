"use client";

import { useState } from "react";
import { Camera, Video, X } from "lucide-react";
import {
  SETTLEMENT_OUTGOING_LABELS,
  parseSettlementEstimateJson,
} from "@/lib/bisnis/sales-retur-expected";
import {
  settlementSummaryLines,
  settlementTotals,
} from "@/lib/bisnis/sales-retur-settlement";
import type { Retur } from "@/lib/bisnis/types";
import {
  parseResendShippingJson,
  resendShippingPayerLabel,
} from "@/lib/bisnis/sales-retur-resend-shipping";
import { parseUnboxingMedia, unboxingMediaApiUrl } from "@/lib/wms/unboxing-media";

export type WmsAuditDisplay = {
  name?: string;
  startedAt?: string | null;
  endedAt?: string | null;
};

type Props = {
  retur: Retur;
  processorName?: string;
  /** Override dari recovery staff-activity / backfill. */
  audit?: WmsAuditDisplay;
  onSettled?: () => void | Promise<void>;
};

function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(v);

function CompactSettlement({ retur }: { retur: Retur }) {
  const estimate = parseSettlementEstimateJson(retur.settlement_estimate_json);
  const lines = settlementSummaryLines(retur);
  const totals = settlementTotals(estimate);
  const mpClaim = Number(retur.mp_claim_amount) || 0;
  const shippingReimb = Number(retur.shipping_reimb_amount) || 0;
  const hasLines = lines.length > 0;
  const hasLegacy = mpClaim > 0 || shippingReimb > 0;

  if (!hasLines && !hasLegacy) {
    return (
      <p className="text-[10px] leading-snug text-slate-500">
        Tidak ada beban / kompensasi tambahan.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {hasLines ? (
        <ul className="space-y-1 text-[11px]">
          {lines.map((l) => {
            const isOut = l.type in SETTLEMENT_OUTGOING_LABELS;
            return (
              <li key={l.type} className="flex justify-between gap-2">
                <span className={isOut ? "text-rose-800" : "text-emerald-800"}>
                  {isOut ? "− " : "+ "}
                  {l.label}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-slate-800">{fmtMoney(l.amount)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-1 text-[11px]">
          {mpClaim > 0 ? (
            <li className="flex justify-between gap-2 text-emerald-800">
              <span>+ Kompensasi MP</span>
              <span className="font-mono tabular-nums">{fmtMoney(mpClaim)}</span>
            </li>
          ) : null}
          {shippingReimb > 0 ? (
            <li className="flex justify-between gap-2 text-rose-800">
              <span>− Reimburse ongkir</span>
              <span className="font-mono tabular-nums">{fmtMoney(shippingReimb)}</span>
            </li>
          ) : null}
        </ul>
      )}
      {(totals.outgoingTotal > 0 || totals.incomingTotal > 0) && (
        <div className="flex flex-col gap-0.5 border-t border-violet-100 pt-1.5 text-[10px] font-semibold">
          {totals.outgoingTotal > 0 ? (
            <span className="text-rose-700">Total beban {fmtMoney(totals.outgoingTotal)}</span>
          ) : null}
          {totals.incomingTotal > 0 ? (
            <span className="text-emerald-700">Total kompensasi {fmtMoney(totals.incomingTotal)}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Kartu padat pernyataan + audit WMS — tidak mengubah claim bisnis. */
export function SalesReturWmsStatementCard({
  retur,
  processorName,
  audit,
}: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const media = parseUnboxingMedia(retur.unboxing_video_path);
  const dispute = retur.wms_dispute_note?.trim() || "";
  const note = retur.wms_note?.trim() || "";
  const decision = retur.wms_claim_decision;

  const name =
    audit?.name?.trim() ||
    processorName?.trim() ||
    (typeof retur.wms_processed_by_name === "string" && retur.wms_processed_by_name.trim()) ||
    "";
  const started = audit?.startedAt || retur.wms_process_started_at || null;
  const ended =
    audit?.endedAt || retur.wms_process_completed_at || retur.wms_received_at || null;

  const hasEvidence = Boolean(dispute || note || media.video || (media.photos?.length ?? 0) > 0);
  const wmsAgreed = decision === "agree";
  const wmsDisputed = decision === "disagree";
  const completed = retur.status === "completed" || retur.workflow_phase === "completed";
  const isResend = retur.workflow_phase === "resend";
  const resendShip = parseResendShippingJson(retur.resend_shipping_json);
  const awaitingBusiness =
    !completed &&
    !isResend &&
    (retur.workflow_phase === "awaiting_business" ||
      retur.workflow_phase === "wms_received" ||
      retur.workflow_phase === "awaiting_settlement" ||
      (retur.wms_receive_status === "complete" && retur.status !== "cancelled"));
  const showSettlementHistory =
    completed &&
    (parseSettlementEstimateJson(retur.settlement_estimate_json).items.length > 0 ||
      Number(retur.mp_claim_amount) > 0 ||
      Number(retur.shipping_reimb_amount) > 0);

  return (
    <>
      <div className="w-full space-y-2">
        <div className="w-full rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-left shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
                Pernyataan WMS
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-violet-800/75">
                {isResend
                  ? "Hold selesai — alur kirim kembali ke pelanggan."
                  : decision === "disagree"
                    ? "WMS membantah claim bisnis (Hold)."
                    : decision === "agree"
                      ? "WMS menerima claim bisnis."
                      : "Klarifikasi gudang — claim bisnis tetap utuh."}
              </p>
            </div>
            {decision ? (
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                  decision === "disagree"
                    ? "bg-amber-200 text-amber-950"
                    : "bg-emerald-200 text-emerald-900"
                }`}
              >
                {decision === "disagree" ? "Bantah" : "Terima"}
              </span>
            ) : null}
          </div>

          <div className="mt-2 space-y-0.5 rounded-md border border-violet-100 bg-white/80 px-2 py-1.5 text-[11px] text-slate-600">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Pencatatan proses WMS
            </p>
            <p>
              <span className="text-slate-500">Oleh:</span>{" "}
              <span className="font-medium text-slate-800">{name || "—"}</span>
            </p>
            <p>
              <span className="text-slate-500">Mulai:</span> {fmtTime(started)}
            </p>
            <p>
              <span className="text-slate-500">Selesai:</span> {fmtTime(ended)}
            </p>
            {!name && !started && hasEvidence ? (
              <p className="mt-1 text-[10px] leading-snug text-amber-800">
                Bukti ada, tapi identitas prosesor belum tercatat (data lama).
              </p>
            ) : null}
          </div>

          {dispute || note ? (
            <div className="mt-2 space-y-2">
              {dispute ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-950">
                  <span className="font-semibold">Sanggahan: </span>
                  {dispute}
                </p>
              ) : null}
              {note ? (
                <p className="rounded-md border border-violet-100 bg-white px-2 py-1.5 text-xs leading-snug text-slate-800">
                  {note}
                </p>
              ) : null}
            </div>
          ) : !decision ? (
            <p className="mt-2 text-xs text-slate-500">Belum ada pernyataan dari WMS.</p>
          ) : null}

          {(media.photos?.length ?? 0) > 0 || media.video ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {media.photos?.map((_, i) => {
                const src = unboxingMediaApiUrl(retur.id, "photo", i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLightbox(src)}
                    className="group relative overflow-hidden rounded-md border border-violet-200 bg-white"
                    title="Perbesar foto"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={`Bukti ${i + 1}`}
                      className="h-12 w-12 object-cover transition group-hover:opacity-90"
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">
                      <Camera className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
              {media.video ? (
                <a
                  href={unboxingMediaApiUrl(retur.id, "video")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center gap-1 rounded-md border border-violet-200 bg-white px-2 text-[11px] font-medium text-violet-800 hover:bg-violet-50"
                >
                  <Video className="h-3.5 w-3.5" />
                  Video
                </a>
              ) : null}
            </div>
          ) : null}

          {showSettlementHistory ? (
            <div className="mt-2 rounded-md border border-violet-100 bg-white/90 px-2 py-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Riwayat pembukuan
              </p>
              <div className="mt-1">
                <CompactSettlement retur={retur} />
              </div>
            </div>
          ) : null}

          {isResend ? (
            <div className="mt-2 space-y-1 rounded-md border border-orange-200 bg-orange-50/80 px-2 py-1.5 text-[10px] leading-snug text-orange-950">
              <p>
                Kirim kembali — pickup{" "}
                <span className="font-mono font-semibold">{retur.resend_pickup_no || "—"}</span>
                {retur.resend_method === "ship" ? " · kurir" : " · ambil sendiri"}. Antrean WMS:{" "}
                <a
                  href="/wms/permintaan-barang/pickup"
                  className="font-semibold underline underline-offset-2"
                >
                  Pickup
                </a>
                .
              </p>
              {retur.resend_method === "ship" && resendShip ? (
                <p>
                  {resendShip.courier}
                  {resendShip.shipping_service ? ` · ${resendShip.shipping_service}` : ""}
                  {" · "}
                  {resendShippingPayerLabel(resendShip.shipping_payer)}
                  {resendShip.shipping_cost > 0
                    ? ` · Rp ${resendShip.shipping_cost.toLocaleString("id-ID")}`
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}

          {wmsDisputed && awaitingBusiness ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50/80 px-2 py-1.5 text-[10px] leading-snug text-amber-950">
              Hold gudang sementara — proses belum selesai. Sesuaikan lewat Ubah, atau Batalkan
              (tutup proses / kembalikan ke pelanggan). WMS hanya menunggu.
            </p>
          ) : null}

          {wmsAgreed && awaitingBusiness ? (
            <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-[10px] leading-snug text-emerald-950">
              Claim diterima. Stok hold sampai bisnis menekan Setuju (simpan gudang + pembukuan), atau
              Ubah dulu bila perlu.
            </p>
          ) : null}
        </div>
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          <button
            type="button"
            aria-label="Tutup"
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white"
            onClick={() => setLightbox(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Bukti diperbesar"
            className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
