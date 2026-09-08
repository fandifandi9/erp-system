import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type SalesOrder } from "@/lib/bisnis/types";
import { sendPkReadyEmail } from "@/lib/email/send-pk-ready-email";
import { isResendConfigured } from "@/lib/email/resend";
import type { StoreEmailOverrides } from "@/lib/email/sender";
import { isWmsPickupFulfillment } from "@/lib/wms/fulfillment-mode";
import {
  parseOutboundWorkflow,
  serializeOutboundWorkflow,
} from "@/lib/wms/outbound-workflow";
import { pkCodeBody } from "@/lib/wms/pk-number";
import { getPkFromSo } from "@/lib/wms/pk-identity";

export type PkEmailNotifyResult = {
  sent: boolean;
  skipped?: boolean;
  reason?: string;
  send_count?: number;
  last_to?: string;
};

function customerEmailFromSo(so: SalesOrder): string {
  const expanded = so.expand?.customer as { email?: string; name?: string } | undefined;
  return (expanded?.email ?? "").trim();
}

function customerNameFromSo(so: SalesOrder): string {
  const expanded = so.expand?.customer as { name?: string } | undefined;
  return (expanded?.name ?? "").trim();
}

/**
 * Kirim email nomor PK ke pelanggan (hanya mode ambil sendiri).
 * Auto: sekali saat PK pertama dibuat. Resend: forceResend=true dari bisnis.
 */
export async function notifyPkReadyForSalesOrder(
  pb: PocketBase,
  soId: string,
  opts?: { forceResend?: boolean; req?: Request },
): Promise<PkEmailNotifyResult> {
  let so: SalesOrder;
  try {
    so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
      expand: "customer,store",
    });
  } catch {
    so = await pb.collection(BISNIS_COLLECTIONS.salesOrders).getOne<SalesOrder>(soId, {
      expand: "customer",
    });
  }

  if (!isWmsPickupFulfillment(so)) {
    return { sent: false, skipped: true, reason: "Mode dikirim — email PK tidak dikirim." };
  }

  const pkRaw = getPkFromSo(so);
  if (!pkRaw) {
    return { sent: false, reason: "Nomor PK belum tersedia." };
  }
  const pkNo = pkCodeBody(pkRaw);
  const wf = parseOutboundWorkflow(so.outbound_workflow_json);
  const prevCount = wf.pk_email?.send_count ?? 0;

  if (!opts?.forceResend && prevCount > 0) {
    return {
      sent: false,
      skipped: true,
      reason: "Email PK sudah pernah dikirim.",
      send_count: prevCount,
      last_to: wf.pk_email?.last_to,
    };
  }

  const to = customerEmailFromSo(so);
  if (!to) {
    const nextWf = {
      ...wf,
      pk_email: {
        ...wf.pk_email,
        last_error: "Email pelanggan kosong",
        send_count: prevCount,
      },
    };
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
      outbound_workflow_json: serializeOutboundWorkflow(nextWf),
    });
    return { sent: false, reason: "Email pelanggan kosong pada master customer." };
  }

  if (!isResendConfigured()) {
    return {
      sent: false,
      reason: "Resend belum dikonfigurasi (RESEND_API_KEY / RESEND_FROM_EMAIL).",
    };
  }

  const storeRaw = so.expand?.store as
    | { name?: string; email?: string; email_from_name?: string; email_from_address?: string }
    | undefined;
  const storeOverride: StoreEmailOverrides | null = storeRaw
    ? {
        name: storeRaw.name ?? "",
        email: storeRaw.email,
        email_from_name: storeRaw.email_from_name,
        email_from_address: storeRaw.email_from_address,
      }
    : null;
  try {
    const result = await sendPkReadyEmail({
      to,
      customerName: customerNameFromSo(so),
      orderNo: so.order_no,
      pkNo,
      storeName: storeRaw?.name,
      store: storeOverride,
      req: opts?.req,
    });
    const now = new Date().toISOString();
    const nextCount = prevCount + 1;
    const nextWf = {
      ...wf,
      pk_email: {
        last_sent_at: now,
        send_count: nextCount,
        last_to: result.to,
        last_error: undefined,
      },
    };
    await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
      outbound_workflow_json: serializeOutboundWorkflow(nextWf),
    });
    return { sent: true, send_count: nextCount, last_to: result.to };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const nextWf = {
      ...wf,
      pk_email: {
        ...wf.pk_email,
        send_count: prevCount,
        last_error: msg,
      },
    };
    try {
      await pb.collection(BISNIS_COLLECTIONS.salesOrders).update(soId, {
        outbound_workflow_json: serializeOutboundWorkflow(nextWf),
      });
    } catch {
      /* ignore */
    }
    return { sent: false, reason: msg, send_count: prevCount };
  }
}
