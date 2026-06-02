"use client";

import type { ShippingInfo } from "@/lib/bisnis/shipping-notes";
import { onEnterFocusNext } from "@/lib/bisnis/form-nav";
import { fmtNum, parseNum } from "@/components/bisnis/NumSpinnerInput";

type Props = {
  shipping: ShippingInfo;
  onChange: (next: ShippingInfo) => void;
  /** Sembunyikan checkbox (toggle di tempat lain, mis. samping Email). */
  showToggle?: boolean;
};

export function ShippingInfoToggle({
  shipping,
  onChange,
}: Pick<Props, "shipping" | "onChange">) {
  return (
    <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-slate-600">
      <input
        type="checkbox"
        checked={shipping.enabled}
        onChange={(e) => onChange({ ...shipping, enabled: e.target.checked })}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      Info pengiriman
    </label>
  );
}

export function ShippingInfoSection({ shipping, onChange, showToggle = true }: Props) {
  const set = (patch: Partial<ShippingInfo>) => onChange({ ...shipping, ...patch });

  if (!shipping.enabled && !showToggle) return null;

  return (
    <div className={showToggle ? "mt-4 border-t border-slate-100 pt-4" : ""}>
      {showToggle && <ShippingInfoToggle shipping={shipping} onChange={onChange} />}
      {shipping.enabled && (
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${showToggle ? "mt-3" : ""}`}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Expedisi</label>
            <input
              type="text"
              data-nav
              value={shipping.courier}
              onChange={(e) => set({ courier: e.target.value })}
              onKeyDown={onEnterFocusNext}
              placeholder="JNE, J&T, SiCepat, …"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nomor lacak</label>
            <input
              type="text"
              data-nav
              value={shipping.tracking_no}
              onChange={(e) => set({ tracking_no: e.target.value })}
              onKeyDown={onEnterFocusNext}
              placeholder="No. resi / tracking"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Ongkir</label>
            <input
              type="text"
              data-nav
              inputMode="numeric"
              value={shipping.shipping_cost ? fmtNum(shipping.shipping_cost) : ""}
              onChange={(e) => set({ shipping_cost: Math.max(0, parseNum(e.target.value)) })}
              onKeyDown={onEnterFocusNext}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Alamat penerima</label>
            <textarea
              data-nav
              rows={2}
              value={shipping.recipient_address}
              onChange={(e) => set({ recipient_address: e.target.value })}
              onKeyDown={onEnterFocusNext}
              placeholder="Alamat pengiriman / penerima"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}
