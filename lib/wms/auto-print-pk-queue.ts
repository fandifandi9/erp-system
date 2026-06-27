import type { SalesOrder } from "@/lib/bisnis/types";
import { getPkFromSo } from "@/lib/wms/pk-identity";
import { printPkForSalesOrder } from "@/lib/wms/print-pk-for-order";
import { markPkAutoPrinted, wasPkAutoPrinted } from "@/lib/wms/pk-print-tracker";
import { getAutoPrintPkEnabled } from "@/lib/wms/picking-preferences";
import { updateSalesWarehouseProcess } from "@/lib/wms/sales-warehouse-process";

const RECENT_WMS_MS = 3 * 60 * 1000;
const PRINT_GAP_MS = 900;

let printChain: Promise<void> = Promise.resolve();
let busy = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isRecentWmsArrival(so: Pick<SalesOrder, "send_to_warehouse_at">): boolean {
  const t = so.send_to_warehouse_at?.trim();
  if (!t) return false;
  const ms = new Date(t).getTime();
  if (Number.isNaN(ms)) return false;
  return Date.now() - ms < RECENT_WMS_MS;
}

export function shouldAutoPrintPk(
  so: SalesOrder,
  opts: { isNewInQueue: boolean },
): boolean {
  if (wasPkAutoPrinted(so.id)) return false;
  return opts.isNewInQueue || isRecentWmsArrival(so);
}

function enqueue(task: () => Promise<void>): void {
  printChain = printChain.then(task).catch(() => {});
}

export function isAutoPrintPkBusy(): boolean {
  return busy;
}

/** Assign PK bila perlu, cetak slip, tandai sudah dicetak. */
export async function autoPrintPkForOrder(
  so: SalesOrder,
  opts: { userId: string; userName?: string },
): Promise<SalesOrder> {
  if (!getAutoPrintPkEnabled() || wasPkAutoPrinted(so.id)) return so;

  let active = so;
  if (!getPkFromSo(active)) {
    active = await updateSalesWarehouseProcess(active.id, opts.userId, "start_picking", {
      userName: opts.userName,
    });
  }

  await new Promise<void>((resolve, reject) => {
    enqueue(async () => {
      busy = true;
      try {
        const ok = await printPkForSalesOrder(active);
        if (ok) markPkAutoPrinted(active.id);
        await delay(PRINT_GAP_MS);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        busy = false;
      }
    });
  });

  return active;
}

export async function autoPrintPkForOrders(
  orders: SalesOrder[],
  opts: {
    userId: string;
    userName?: string;
    knownOrderIds: Set<string>;
  },
): Promise<{ orders: SalesOrder[]; updated: Map<string, SalesOrder> }> {
  if (!getAutoPrintPkEnabled()) {
    return { orders, updated: new Map() };
  }

  const updated = new Map<string, SalesOrder>();

  for (const o of orders) {
    const isNewInQueue = !opts.knownOrderIds.has(o.id);
    if (!shouldAutoPrintPk(o, { isNewInQueue })) continue;
    try {
      const next = await autoPrintPkForOrder(o, opts);
      if (getPkFromSo(next) !== getPkFromSo(o) || next !== o) {
        updated.set(next.id, next);
      }
    } catch {
      /* jangan blokir antrean */
    }
  }

  const ordersOut = orders.map((o) => updated.get(o.id) ?? o);
  return { orders: ordersOut, updated };
}
