"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Send, Scan, Truck } from "lucide-react";
import { pb } from "@/lib/pocketbase";
import { WmsCard, WmsPrimaryButton, WmsSectionTitle, WmsBadge } from "@/components/wms/ui";
import { DeskAutoPhotoCapture } from "@/components/wms/DeskAutoPhotoCapture";
import { BISNIS_COLLECTIONS, type ReturLine, type SalesOrder } from "@/lib/bisnis/types";
import { returDisplayNo } from "@/lib/bisnis/retur-display";
import { findSalesOrderByPackageLabelScan } from "@/lib/wms/outbound-order-lookup";
import { isSoAwaitingPickup } from "@/lib/wms/outbound-queues";
import { parseOutboundWorkflow } from "@/lib/wms/outbound-workflow";
import { getPkIdentityView, orderMatchesPkScan } from "@/lib/wms/pk-identity";
import { pkCodeBody } from "@/lib/wms/pk-number";
import {
  buildWmsLineViewsFromPickLines,
  resolveInvoiceNoForSo,
  type WmsOrderLineView,
} from "@/lib/wms/wms-order-display";
import {
  findResendPickupByScan,
  type ResendPickupQueueItem,
} from "@/lib/wms/sales-return-resend";
import { getProductImageUrl } from "@/lib/inventory/client";
import { INV_COLLECTIONS, type InvProduct } from "@/lib/inventory/types";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";
import { getErrorMessage } from "@/lib/errors";
import { useLocale } from "@/components/LocaleProvider";
import { WMS_PICKUP_PHOTO_MAX } from "@/lib/wms/wms-media-limits";

async function uploadDeskPhoto(
  entityType: "biz_sales_orders" | "biz_returs",
  entityId: string,
  warehouse: string,
  file: File,
  uploadErr: string,
) {
  const fd = new FormData();
  fd.set("entity_type", entityType);
  fd.set("entity_id", entityId);
  fd.set("warehouse", warehouse || "");
  fd.set("purpose", "pickup_desk");
  fd.append("files", file);
  const res = await fetch("/api/wms/photos", { method: "POST", body: fd, credentials: "include" });
  const json = (await res.json()) as { ok?: boolean; file_ids?: string[]; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? uploadErr);
  return json.file_ids ?? [];
}

async function loadReturLines(returId: string): Promise<WmsOrderLineView[]> {
  const lines = await pb.collection(BISNIS_COLLECTIONS.returLines).getFullList<ReturLine>({
    filter: `retur = "${returId.replace(/"/g, '\\"')}"`,
    expand: "product",
    requestKey: null,
  });
  return lines.map((l) => {
    const prod = l.expand?.product;
    const qty = Number(l.actual_qty ?? l.qty) || 0;
    return {
      productId: l.product,
      name: prod?.name || "—",
      sku: prod?.sku || "—",
      qty,
      picked: qty,
      validated: qty,
      imageUrl: prod ? getProductImageUrl(prod as InvProduct, "80x80") : null,
      slotLabel: null,
    };
  });
}

export function WmsPickupDeskKiosk({
  onSubmitted,
}: {
  /** Dipanggil setelah permintaan meja / serah RET berhasil — refresh antrean gudang. */
  onSubmitted?: () => void | Promise<void>;
}) {
  const { t, locale } = useLocale();
  const [pkInput, setPkInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [so, setSo] = useState<SalesOrder | null>(null);
  const [resend, setResend] = useState<ResendPickupQueueItem | null>(null);
  const [lines, setLines] = useState<WmsOrderLineView[]>([]);
  const [invoiceNo, setInvoiceNo] = useState("—");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const active = !!so || !!resend;
  const pkLabel = so
    ? getPkIdentityView(so).pkNo
    : resend
      ? resend.pickupNo
      : "—";
  const totalQty = useMemo(() => lines.reduce((s, l) => s + (l.qty || 0), 0), [lines]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const resetForm = useCallback(() => {
    setPkInput("");
    setSo(null);
    setResend(null);
    setLines([]);
    setInvoiceNo("—");
    setName("");
    setPhone("");
    setPhoto(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setError("");
  }, []);

  const loadSoLines = useCallback(async (row: SalesOrder) => {
    const wf = parseOutboundWorkflow(row.outbound_workflow_json);
    const pickLines = wf.pick?.lines ?? {};
    const productIds = Object.values(pickLines)
      .map((l) => l.product_id)
      .filter(Boolean);
    const productExpand: Record<string, InvProduct> = {};
    if (productIds.length) {
      try {
        const uniq = [...new Set(productIds)];
        const filter = uniq.map((id) => `id = "${id}"`).join(" || ");
        const res = await pb.collection(INV_COLLECTIONS.products).getList<InvProduct>(1, 200, {
          filter,
          requestKey: null,
        });
        for (const p of res.items) productExpand[p.id] = p;
      } catch {
        /* tampilan tanpa gambar tetap ok */
      }
    }
    setLines(buildWmsLineViewsFromPickLines(pickLines, {}, productExpand));
    setInvoiceNo(await resolveInvoiceNoForSo(row));
  }, []);

  const lookupPk = useCallback(async () => {
    const raw = pkInput.trim();
    if (!raw) return;
    setLoading(true);
    setError("");
    setInfo("");
    setSo(null);
    setResend(null);
    setLines([]);
    setPhoto(null);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const retHit = await findResendPickupByScan(raw);
      if (retHit) {
        setResend(retHit);
        setInvoiceNo(returDisplayNo(retHit.retur));
        if (retHit.customerName && retHit.customerName !== "—") {
          setName(retHit.customerName);
        }
        setLines(await loadReturLines(retHit.retur.id));
        return;
      }

      const row = await findSalesOrderByPackageLabelScan(raw, { onlyAwaitingPickup: true });
      if (!row || !isSoAwaitingPickup(row)) {
        throw new Error(t("wms.desk.errPkNotReady"));
      }
      if (!orderMatchesPkScan(row, raw)) {
        throw new Error(t("wms.desk.errPkNotReady"));
      }
      const wf = parseOutboundWorkflow(row.outbound_workflow_json);
      if (wf.desk_request?.status === "pending") {
        setInfo(
          t("wms.desk.alreadyRequested", {
            name: wf.desk_request.requester_name,
            pk: pkCodeBody(wf.desk_request.pk_no || getPkIdentityView(row).pkNo),
          }),
        );
      }
      setSo(row);
      await loadSoLines(row);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [loadSoLines, pkInput, t]);

  const onPhotoCaptured = useCallback((file: File) => {
    setPhoto(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, []);

  const sendRequest = useCallback(async () => {
    if (!name.trim()) {
      setError(t("wms.desk.errNameRequired"));
      return;
    }
    if (!photo) {
      setError(t("wms.desk.errPhotoRequired"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const userId = pb.authStore.model?.id;
      if (!userId) throw new Error(t("wms.pickup.errRelogin"));

      if (resend) {
        const photoIds = await uploadDeskPhoto(
          "biz_returs",
          resend.retur.id,
          resend.retur.warehouse ?? "",
          photo,
          t("wms.pickup.errUploadPhoto"),
        );
        if (photoIds.length > WMS_PICKUP_PHOTO_MAX) {
          throw new Error(t("wms.desk.errPhotoRequired"));
        }
        const apiRes = await fetch("/api/wms/sales-return-resend/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            returId: resend.retur.id,
            scannedCode: pkInput.trim() || resend.pickupNo,
            driverName: name.trim(),
            driverPhone: phone.trim() || undefined,
            photoIds,
          }),
        });
        const json = (await apiRes.json()) as { ok?: boolean; error?: string };
        if (!apiRes.ok || !json.ok) {
          throw new Error(json.error || t("wms.pickup.resendErrScan"));
        }
        const pk = pkCodeBody(resend.pickupNo);
        resetForm();
        setInfo(t("wms.desk.resendDoneOk", { pk }));
        await onSubmitted?.();
        return;
      }

      if (!so) return;
      const photoIds = await uploadDeskPhoto(
        "biz_sales_orders",
        so.id,
        so.warehouse ?? "",
        photo,
        t("wms.pickup.errUploadPhoto"),
      );
      if (photoIds.length > WMS_PICKUP_PHOTO_MAX) {
        throw new Error(t("wms.desk.errPhotoRequired"));
      }
      await updateSalesWarehouseProcess(so.id, userId, "request_desk_pickup", {
        deskRequest: {
          status: "pending",
          at: new Date().toISOString(),
          requester_name: name.trim(),
          requester_phone: phone.trim() || undefined,
          photo_file_ids: photoIds,
          pk_no: pkCodeBody(getPkIdentityView(so).pkNo),
          user_id: userId,
        },
      });
      const pk = pkCodeBody(getPkIdentityView(so).pkNo);
      resetForm();
      setInfo(t("wms.desk.sentOk", { pk }));
      await onSubmitted?.();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }, [name, onSubmitted, phone, photo, pkInput, resend, resetForm, so, t]);

  return (
    <WmsCard className={resend ? "border-orange-200" : "border-indigo-200"}>
      <WmsSectionTitle title={t("wms.desk.title")} subtitle={t("wms.desk.subtitle")} />

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </div>
      ) : null}

      <div
        className={
          "mt-4 rounded-xl border-2 p-4 " +
          (resend
            ? "border-orange-300 bg-orange-50/70"
            : "border-indigo-300 bg-indigo-50/70")
        }
      >
        <p className="text-sm font-bold text-indigo-950">{t("wms.desk.pkLabel")}</p>
        <p className="mt-1 text-xs text-indigo-800">{t("wms.desk.pkHint")}</p>
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border-2 border-indigo-400 bg-white px-4 py-4 font-mono text-xl tracking-wide"
            value={pkInput}
            onChange={(e) => setPkInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void lookupPk();
              }
            }}
            placeholder={t("wms.desk.pkPlaceholder")}
            autoFocus
            inputMode="text"
            autoComplete="off"
          />
          <WmsPrimaryButton type="button" disabled={loading || !pkInput.trim()} onClick={() => void lookupPk()}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Scan className="h-5 w-5" />}
          </WmsPrimaryButton>
        </div>
      </div>

      {active ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {resend ? <WmsBadge tone="amber">RET</WmsBadge> : <WmsBadge tone="indigo">INV</WmsBadge>}
              <p className="font-mono text-2xl font-bold tracking-wide text-indigo-800">
                PK {pkCodeBody(pkLabel)}
              </p>
            </div>
            <dl className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <span className="text-slate-400">
                  {resend ? t("wms.desk.colRet") : t("wms.desk.colInv")}
                </span>{" "}
                <span className="font-mono">{invoiceNo}</span>
              </div>
              <div>
                <span className="text-slate-400">{t("wms.desk.colItems")}</span>{" "}
                {lines.length} · {totalQty} pcs
              </div>
            </dl>
            {resend ? (
              <p className="mt-2 text-xs text-orange-900">{t("wms.desk.resendHint")}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("wms.desk.productList")}
            </p>
            {lines.length === 0 ? (
              <p className="text-sm text-slate-500">{t("wms.desk.noLines")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {lines.map((l) => (
                  <li key={l.productId} className="flex items-center gap-3 px-3 py-2.5">
                    {l.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
                        SKU
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{l.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{l.sku}</p>
                    </div>
                    <p className="shrink-0 text-lg font-bold text-slate-900">×{l.qty}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DeskAutoPhotoCapture
            active={active}
            previewUrl={previewUrl}
            onCaptured={onPhotoCaptured}
            onCleared={() => {
              setPhoto(null);
              setPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {t("wms.desk.name")} <span className="text-red-500">*</span>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("wms.desk.namePlaceholder")}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm">
              {t("wms.desk.phone")}
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("wms.desk.phonePlaceholder")}
                inputMode="tel"
                autoComplete="tel"
              />
            </label>
          </div>

          <div className="w-full [&_button]:w-full [&_button]:py-4 [&_button]:text-base">
            <WmsPrimaryButton
              disabled={saving || !photo || !name.trim()}
              onClick={() => void sendRequest()}
            >
              {saving ? (
                <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
              ) : resend ? (
                <Truck className="mr-2 inline h-5 w-5" />
              ) : (
                <Send className="mr-2 inline h-5 w-5" />
              )}
              {resend ? t("wms.desk.resendSend") : t("wms.desk.send")}
            </WmsPrimaryButton>
          </div>
          <p className="text-center text-xs text-slate-500">
            {resend ? t("wms.desk.resendSendHint") : t("wms.desk.sendHint")}
          </p>
          <button
            type="button"
            className="w-full text-sm text-slate-500 underline"
            onClick={resetForm}
          >
            {t("wms.desk.reset")}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">
          {locale === "en"
            ? "Enter the PK number on the package label to start (INV or RET)."
            : "Isi nomor PK pada label paket untuk memulai (INV atau RET)."}
        </p>
      )}
    </WmsCard>
  );
}
