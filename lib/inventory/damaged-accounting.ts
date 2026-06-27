import type PocketBase from "pocketbase";
import { nextDocNoFor } from "@/lib/bisnis/doc-number";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { isDamagedWarehouse } from "@/lib/bisnis/warehouse-categories";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { DispositionLine } from "./damaged-disposition";

export type DamagedAccountingDraft = {
  expenseId: string;
  expenseNo: string;
  total: number;
  kind: "write_down" | "reversal" | "write_off";
};

function escId(id: string): string {
  return id.replace(/"/g, '\\"');
}

export async function unitCostForProductCompany(
  pb: PocketBase,
  productId: string,
  companyId: string,
): Promise<number> {
  try {
    const lines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getList(1, 1, {
      filter: `product = "${escId(productId)}"`,
      sort: "-created",
      expand: "purchase_order",
      fields: "unit_cost,expand.purchase_order.company,expand.purchase_order.status",
    });
    for (const row of lines.items) {
      const po = (row as { expand?: { purchase_order?: { company?: string; status?: string } } })
        .expand?.purchase_order;
      if (po?.status === "cancelled") continue;
      if (po?.company && po.company !== companyId) continue;
      return Number((row as { unit_cost?: number }).unit_cost) || 0;
    }
  } catch {
    /* abaikan */
  }
  return 0;
}

export async function estimateDamagedLineAmount(
  pb: PocketBase,
  companyId: string,
  lines: DispositionLine[],
): Promise<number> {
  let total = 0;
  for (const line of lines) {
    const unit = await unitCostForProductCompany(pb, line.product, companyId);
    total += unit * (Number(line.qty) || 0);
  }
  return Math.round(total);
}

async function createExpenseDraft(input: {
  pb: PocketBase;
  companyId: string;
  category: "penyusutan" | "lainnya";
  description: string;
  amount: number;
  referenceNo: string;
  notes: string;
  userId: string;
}): Promise<DamagedAccountingDraft | null> {
  const amount = Math.round(input.amount);
  if (amount === 0) return null;

  const expenseNo = await nextDocNoFor("exp");
  const today = new Date().toISOString().slice(0, 10);

  const row = await input.pb.collection(BISNIS_COLLECTIONS.expenses).create({
    expense_no: expenseNo,
    company: input.companyId,
    category: input.category,
    description: input.description,
    amount: Math.abs(amount),
    tax_amount: 0,
    total: Math.abs(amount),
    expense_date: today,
    status: "draft",
    reference_no: input.referenceNo,
    notes: input.notes,
    created_by: input.userId,
  });

  return {
    expenseId: row.id,
    expenseNo,
    total: amount,
    kind: amount < 0 ? "reversal" : "write_down",
  };
}
export async function createDamagedWriteDownDraft(input: {
  pb: PocketBase;
  companyId: string;
  refNo: string;
  lines: DispositionLine[];
  userId: string;
  sourceLabel: string;
}): Promise<DamagedAccountingDraft | null> {
  const total = await estimateDamagedLineAmount(input.pb, input.companyId, input.lines);
  if (total <= 0) return null;

  const qtySummary = input.lines.reduce((s, l) => s + l.qty, 0);
  const draft = await createExpenseDraft({
    pb: input.pb,
    companyId: input.companyId,
    category: "penyusutan",
    description: `Penurunan nilai persediaan — masuk gudang rusak (${input.refNo})`,
    amount: total,
    referenceNo: `WD-${input.refNo}`,
    notes: `${input.sourceLabel} · ${qtySummary} pcs · estimasi harga modal PO · approve di Pengeluaran`,
    userId: input.userId,
  });
  if (draft) draft.kind = "write_down";
  return draft;
}

/** Pemulihan nilai setelah servis berhasil (offset write-down). */
export async function createDamagedRepairReversalDraft(input: {
  pb: PocketBase;
  companyId: string;
  refNo: string;
  lines: DispositionLine[];
  userId: string;
  destLabel: string;
  note?: string;
}): Promise<DamagedAccountingDraft | null> {
  const total = await estimateDamagedLineAmount(input.pb, input.companyId, input.lines);
  if (total <= 0) return null;

  const qtySummary = input.lines.reduce((s, l) => s + l.qty, 0);
  const noteParts = [
    `Servis berhasil → ${input.destLabel}`,
    input.note?.trim(),
    `${qtySummary} pcs`,
    "Offset draft write-down (WD-*) — neto di Pengeluaran",
  ].filter(Boolean);

  const draft = await createExpenseDraft({
    pb: input.pb,
    companyId: input.companyId,
    category: "lainnya",
    description: `Pemulihan nilai persediaan — servis berhasil (${input.refNo})`,
    amount: -total,
    referenceNo: `REV-${input.refNo}`,
    notes: noteParts.join(" · "),
    userId: input.userId,
  });
  if (draft) {
    draft.kind = "reversal";
    draft.total = -Math.abs(draft.total);
  }
  return draft;
}

/**
 * Penghapusan akhir — hanya jika belum ada write-down terkait (stok legacy / tanpa harga modal saat masuk).
 */
export async function createDamagedWriteOffExpenseDraft(input: {
  pb: PocketBase;
  companyId: string;
  refNo: string;
  lines: DispositionLine[];
  userId: string;
  note: string;
}): Promise<DamagedAccountingDraft | null> {
  const total = await estimateDamagedLineAmount(input.pb, input.companyId, input.lines);
  if (total <= 0) return null;

  const qtySummary = input.lines.reduce((s, l) => s + l.qty, 0);

  const draft = await createExpenseDraft({
    pb: input.pb,
    companyId: input.companyId,
    category: "lainnya",
    description: `Kerugian persediaan gudang rusak (${input.refNo})`,
    amount: total,
    referenceNo: input.refNo,
    notes: `${input.note.trim()} · ${qtySummary} pcs · estimasi harga modal PO · cek draft write-down (WD-*) agar tidak dobel`,
    userId: input.userId,
  });
  if (draft) draft.kind = "write_off";
  return draft;
}

const INTAKE_REF_TYPES = new Set([
  "PURCHASE_QC_DAMAGED",
  "SALES_RETURN_DAMAGED",
  "TRANSFER",
  "MANUAL",
]);

const REPAIR_REF_TYPES = new Set(["DAMAGED_REPAIR", "DAMAGED_REPAIR_RETAIL"]);

function aggregateLines(lines: DispositionLine[]): DispositionLine[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    const qty = Number(l.qty) || 0;
    if (!l.product || qty <= 0) continue;
    map.set(l.product, (map.get(l.product) ?? 0) + qty);
  }
  return [...map.entries()].map(([product, qty]) => ({ product, qty }));
}

async function resolveCompanyId(
  pb: PocketBase,
  warehouseId: string,
): Promise<string | undefined> {
  const wh = await pb.collection(INV_COLLECTIONS.warehouses).getOne<{ company?: string }>(
    warehouseId,
    { fields: "company" },
  );
  return wh.company;
}

/** Posting akuntansi otomatis setelah transfer terkait gudang rusak. */
export async function applyDamagedTransferAccounting(input: {
  pb: PocketBase;
  fromWarehouseId: string;
  toWarehouseId: string;
  referenceType: string;
  referenceNo: string;
  lines: DispositionLine[];
  userId: string;
  noteSuffix?: string;
}): Promise<DamagedAccountingDraft | null> {
  const refType = input.referenceType.trim();
  const lines = aggregateLines(input.lines);
  if (lines.length === 0) return null;

  const [fromWh, toWh] = await Promise.all([
    input.pb.collection(INV_COLLECTIONS.warehouses).getOne<{ warehouse_role?: string; company?: string }>(
      input.fromWarehouseId,
      { fields: "warehouse_role,company" },
    ),
    input.pb.collection(INV_COLLECTIONS.warehouses).getOne<{ warehouse_role?: string; company?: string }>(
      input.toWarehouseId,
      { fields: "warehouse_role,company" },
    ),
  ]);

  const fromDamaged = isDamagedWarehouse(fromWh);
  const toDamaged = isDamagedWarehouse(toWh);

  if (toDamaged && !fromDamaged && refType !== "DAMAGED_REASSIGN") {
    const companyId = toWh.company ?? (await resolveCompanyId(input.pb, input.fromWarehouseId));
    if (!companyId) return null;
    const label = input.noteSuffix?.replace(/^\s*\|\s*/, "") ?? refType.replace(/_/g, " ").toLowerCase();
    return createDamagedWriteDownDraft({
      pb: input.pb,
      companyId,
      refNo: input.referenceNo,
      lines,
      userId: input.userId,
      sourceLabel: INTAKE_REF_TYPES.has(refType) ? label : `Transfer ${refType}`,
    });
  }

  if (fromDamaged && !toDamaged && REPAIR_REF_TYPES.has(refType)) {
    const companyId = fromWh.company ?? (await resolveCompanyId(input.pb, input.toWarehouseId));
    if (!companyId) return null;
    const destLabel =
      refType === "DAMAGED_REPAIR_RETAIL" ? "gudang penjualan retail" : "gudang entitas";
    return createDamagedRepairReversalDraft({
      pb: input.pb,
      companyId,
      refNo: input.referenceNo,
      lines,
      userId: input.userId,
      destLabel,
      note: input.noteSuffix?.replace(/^\s*\|\s*/, ""),
    });
  }

  return null;
}
