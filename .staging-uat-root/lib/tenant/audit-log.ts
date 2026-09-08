import { pb } from "@/lib/pocketbase";
import { fetchCompanyProfile } from "@/lib/bisnis/company-client";
import { TENANT_COLLECTIONS } from "./collections";
import type { AuditLogEntry, WriteAuditInput } from "./types";

export async function writeAuditLog(input: WriteAuditInput): Promise<void> {
  try {
    const actorId = input.actor_id || (pb.authStore.model as { id?: string } | null)?.id;
    const company = await fetchCompanyProfile().catch(() => null);
    await pb.collection(TENANT_COLLECTIONS.auditLog).create({
      occurred_at: new Date().toISOString(),
      actor: actorId,
      actor_ip: input.actor_ip,
      actor_device: input.actor_device || "web",
      module: input.module,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      entity_label: input.entity_label,
      summary: input.summary,
      changes_json: input.changes?.length ? JSON.stringify(input.changes) : undefined,
      company: company?.id,
      store: input.store_id,
      warehouse: input.warehouse_id,
    });
  } catch (err) {
    console.warn("writeAuditLog:", err);
  }
}

export async function fetchSysAuditLogs(opts?: {
  page?: number;
  perPage?: number;
  module?: string;
}): Promise<AuditLogEntry[]> {
  const res = await pb.collection(TENANT_COLLECTIONS.auditLog).getList(1, opts?.perPage ?? 40, {
    page: opts?.page ?? 1,
    sort: "-occurred_at",
    filter: opts?.module ? `module = "${opts.module}"` : undefined,
    expand: "actor,store,warehouse",
    requestKey: null,
  });
  return res.items as unknown as AuditLogEntry[];
}
