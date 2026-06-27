"use client";

import { isShippingActive, type ShippingInfo } from "@/lib/bisnis/shipping-notes";
import { onEnterFocusNext } from "@/lib/bisnis/form-nav";
import { fmtNum, parseNum } from "@/components/bisnis/NumSpinnerInput";
import { CourierServiceFields } from "@/components/bisnis/CourierServiceFields";
import { AwbLabelPanel } from "@/components/bisnis/AwbLabelPanel";
import type { AwbSource } from "@/lib/bisnis/awb-label";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  shipping: ShippingInfo;
  onChange: (next: ShippingInfo) => void;
  /** Sembunyikan checkbox (toggle di tempat lain, mis. samping Email). */
  showToggle?: boolean;
  /** sidebar = panel kanan ringkas; default = full width di bawah */
  layout?: "default" | "sidebar";
  /** Mode preview — tampilkan teks saja, tanpa fetch master ekspedisi. */
  readOnly?: boolean;
  /** SO sudah ada — upload langsung; kosong = mode pending (buat order baru). */
  /** Sembunyikan panel AWB (mis. instance mobile duplikat). */
  includeAwb?: boolean;
  salesOrderId?: string | null;
  pendingAwbFile?: File | null;
  onPendingAwbFileChange?: (file: File | null) => void;
  awbUploadSource?: AwbSource;
};

const compactInput =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100";
const compactLabel = "mb-0.5 block text-xs font-medium text-slate-600";

export function ShippingInfoToggle({
  shipping,
  onChange,
}: Pick<Props, "shipping" | "onChange">) {
  const { t } = useLocale();
  return (
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-slate-600">
      <input
        type="checkbox"
        checked={shipping.enabled}
        onChange={(e) => onChange({ ...shipping, enabled: e.target.checked })}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {t("sales.shipping.toggle")}
    </label>
  );
}

export function ShippingInfoSection({
  shipping,
  onChange,
  showToggle = true,
  layout = "default",
  readOnly = false,
  includeAwb = true,
  salesOrderId,
  pendingAwbFile,
  onPendingAwbFileChange,
  awbUploadSource = "manual",
}: Props) {
  const { t } = useLocale();
  const set = (patch: Partial<ShippingInfo>) => onChange({ ...shipping, ...patch });
  const isSidebar = layout === "sidebar";
  const inputCls = isSidebar ? compactInput : "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";
  const labelCls = isSidebar ? compactLabel : "mb-1 block text-sm font-medium text-slate-700";
  const blockGap = isSidebar ? "space-y-2" : "space-y-4";

  if (!isShippingActive(shipping) && !showToggle) return null;

  if (readOnly && isShippingActive(shipping)) {
    const rowLabel = isSidebar ? "text-[10px] font-semibold uppercase tracking-wide text-slate-500" : "text-xs font-medium text-slate-500";
    const rowValue = isSidebar ? "text-sm text-slate-800" : "text-sm text-slate-900";
    return (
      <div className={showToggle && !isSidebar ? "mt-4 border-t border-slate-100 pt-4" : ""}>
        {showToggle && <ShippingInfoToggle shipping={shipping} onChange={onChange} />}
        <div className={`${blockGap} ${showToggle && !isSidebar ? "mt-3" : ""}`}>
          <div className={isSidebar ? "space-y-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
            <div>
              <p className={rowLabel}>{t("sales.shipping.courier")}</p>
              <p className={rowValue}>{shipping.courier.trim() || "—"}</p>
            </div>
            <div>
              <p className={rowLabel}>{t("sales.shipping.service")}</p>
              <p className={rowValue}>{shipping.shipping_service.trim() || "—"}</p>
            </div>
            <div>
              <p className={rowLabel}>{t("sales.shipping.trackingNo")}</p>
              <p className={`${rowValue} font-mono`}>{shipping.tracking_no.trim() || "—"}</p>
            </div>
            <div>
              <p className={rowLabel}>{t("sales.shipping.shippingCost")}</p>
              <p className={rowValue}>
                {shipping.shipping_cost > 0 ? fmtNum(shipping.shipping_cost) : "—"}
              </p>
            </div>
            <div className={isSidebar ? "" : "sm:col-span-2"}>
              <p className={rowLabel}>{t("sales.shipping.recipientAddress")}</p>
              <p className={`${rowValue} whitespace-pre-wrap`}>
                {shipping.recipient_address.trim() || "—"}
              </p>
            </div>
          </div>
          {includeAwb ? (
            <AwbLabelPanel
              salesOrderId={salesOrderId}
              pendingFile={pendingAwbFile}
              onPendingFileChange={onPendingAwbFileChange}
              uploadSource={awbUploadSource}
              compact
              readOnly
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={showToggle && !isSidebar ? "mt-4 border-t border-slate-100 pt-4" : ""}>
      {showToggle && <ShippingInfoToggle shipping={shipping} onChange={onChange} />}
      {isShippingActive(shipping) && (
        <div className={`${blockGap} ${showToggle && !isSidebar ? "mt-3" : ""}`}>
          <CourierServiceFields
            courierName={shipping.courier}
            serviceName={shipping.shipping_service}
            onCourierChange={(name) => set({ courier: name })}
            onServiceChange={(name) => set({ shipping_service: name })}
            courierLabel={t("sales.shipping.courier")}
            serviceLabel={t("sales.shipping.service")}
            inputClassName={inputCls}
            labelClassName={labelCls}
            dataNav
          />
          <div className={isSidebar ? "space-y-2" : "grid grid-cols-1 gap-4 sm:grid-cols-2"}>
          <div>
            <label className={labelCls}>{t("sales.shipping.trackingNo")}</label>
            <input
              type="text"
              data-nav
              value={shipping.tracking_no}
              onChange={(e) => set({ tracking_no: e.target.value })}
              onKeyDown={onEnterFocusNext}
              placeholder={t("sales.shipping.trackingPlaceholder")}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t("sales.shipping.shippingCost")}</label>
            <input
              type="text"
              data-nav
              inputMode="numeric"
              value={shipping.shipping_cost ? fmtNum(shipping.shipping_cost) : ""}
              onChange={(e) => set({ shipping_cost: Math.max(0, parseNum(e.target.value)) })}
              onKeyDown={onEnterFocusNext}
              placeholder="0"
              className={`${inputCls} text-right`}
            />
          </div>
          <div className={isSidebar ? "" : "sm:col-span-2"}>
            <label className={labelCls}>{t("sales.shipping.recipientAddress")}</label>
            <textarea
              data-nav
              rows={isSidebar ? 3 : 2}
              value={shipping.recipient_address}
              onChange={(e) => set({ recipient_address: e.target.value })}
              onKeyDown={onEnterFocusNext}
              placeholder={t("sales.shipping.addressPlaceholder")}
              className={inputCls}
            />
          </div>
          </div>
          {includeAwb ? (
            <AwbLabelPanel
              salesOrderId={salesOrderId}
              pendingFile={pendingAwbFile}
              onPendingFileChange={onPendingAwbFileChange}
              uploadSource={awbUploadSource}
              compact
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
