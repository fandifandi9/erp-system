import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { resolveCapabilityHolders } from "@/lib/notifications/recipients";

/** Owner or user with payroll.bank.approve capability. */
export async function assertPayrollBankApprover(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
): Promise<void> {
  if (ctx.isOwner) return;
  const holders = await resolveCapabilityHolders(adminPb, "payroll.bank.approve");
  if (!holders.includes(ctx.userId)) {
    throw new HrApiError("Anda tidak berwenang menyetujui rekening payroll.", 403);
  }
}
