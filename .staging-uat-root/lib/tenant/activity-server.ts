import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { TENANT_COLLECTIONS } from "./collections";
import type { EmitActivityInput } from "./types";

export async function emitBusinessEventServer(
  pocket: PocketBase,
  input: EmitActivityInput,
): Promise<void> {
  try {
    let companyId: string | undefined;
    try {
      const cp = await pocket.collection(BISNIS_COLLECTIONS.companyProfile).getList(1, 1, {
        sort: "-updated",
      });
      companyId = cp.items[0]?.id;
    } catch {
      /* optional */
    }
    await pocket.collection(TENANT_COLLECTIONS.activityEvents).create({
      event_code: input.event_code,
      severity: input.severity || "info",
      module: input.module,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      entity_label: input.entity_label,
      actor: input.actor_id,
      company: companyId,
      store: input.store_id,
      warehouse: input.warehouse_id,
      payload_json: input.payload ? JSON.stringify(input.payload) : undefined,
      occurred_at: new Date().toISOString(),
      dedupe_key: input.dedupe_key,
    });
  } catch (err) {
    console.warn("emitBusinessEventServer:", err);
  }
}
