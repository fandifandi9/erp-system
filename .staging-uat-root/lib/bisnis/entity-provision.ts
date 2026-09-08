import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { suggestWarehouseCode } from "@/lib/inventory/location-codes";
import { createCashAccount } from "./cash-client";
import {
  clearPrimaryCashFlag,
  clearPrimaryWarehouseFlag,
  assertSingleEntityWarehouse,
  assertSingleCashAccountPerEntity,
} from "./entity-modules";
import type { CashAccount, CompanyProfile, Store } from "./types";

export type ModuleSelection = {
  /** ID modul yang sudah ada — kosong = buat baru dari newName */
  selectedId: string;
  newName: string;
};

export type EntityProvisionForm = {
  store: ModuleSelection;
  warehouse: ModuleSelection;
  cashAccount: ModuleSelection;
};

export type EntityProvisionInput = {
  companyId: string;
  companyName: string;
  companyCode?: string;
  store?: ModuleSelection;
  warehouse?: ModuleSelection;
  cashAccount?: ModuleSelection;
  /** Legacy — nama saja (buat baru) */
  storeName?: string;
  warehouseName?: string;
  cashAccountName?: string;
  withCashAccount?: boolean;
};

export type EntityProvisionResult = {
  store?: Store;
  warehouse: { id: string; code: string; name: string };
  cashAccount?: CashAccount;
};

export const EMPTY_ENTITY_PROVISION: EntityProvisionForm = {
  store: { selectedId: "", newName: "" },
  warehouse: { selectedId: "", newName: "Gudang Utama" },
  cashAccount: { selectedId: "", newName: "" },
};

function selId(sel?: ModuleSelection): string {
  return sel?.selectedId?.trim() ?? "";
}

function selName(sel: ModuleSelection | undefined, fallback: string): string {
  if (sel?.selectedId) return "";
  return sel?.newName?.trim() || fallback;
}

async function assertModuleUnassigned(
  collection: string,
  id: string,
  companyId: string,
  label: string,
): Promise<Record<string, unknown>> {
  const row = await pb.collection(collection).getOne<Record<string, unknown>>(id, { requestKey: null });
  const owner = row.company as string | undefined;
  if (owner && owner !== companyId) {
    throw new Error(`${label} sudah dipakai entitas lain dan tidak bisa dipindah`);
  }
  return row;
}

/** Cek apakah entitas sudah punya gudang + rekening operasional. */
export async function entityHasOperationalStack(companyId: string): Promise<boolean> {
  const [warehouses, cashAccounts] = await Promise.all([
    pb.collection(INV_COLLECTIONS.warehouses).getList(1, 1, {
      filter: `company = "${companyId}" && is_active = true`,
      requestKey: null,
    }),
    pb.collection("biz_cash_accounts").getList(1, 1, {
      filter: `company = "${companyId}" && is_active = true`,
      requestKey: null,
    }),
  ]);
  return warehouses.totalItems > 0 && cashAccounts.totalItems > 0;
}

/**
 * Tautkan modul yang sudah ada atau buat baru — gudang utama & rekening utama.
 */
export async function provisionEntityDefaults(
  input: EntityProvisionInput,
): Promise<EntityProvisionResult> {
  const hasStack = await entityHasOperationalStack(input.companyId);
  if (hasStack) {
    throw new Error("Entitas ini sudah memiliki gudang dan rekening aktif");
  }

  const baseCode = (input.companyCode || input.companyName)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 6)
    .toUpperCase() || "ENT";

  const warehouseSel = input.warehouse ?? {
    selectedId: "",
    newName: input.warehouseName ?? "Gudang Utama",
  };
  const cashSel = input.cashAccount ?? {
    selectedId: "",
    newName: input.cashAccountName ?? `Rekening ${input.companyName}`,
  };

  const warehouseId = selId(warehouseSel);
  const cashId = selId(cashSel);

  if (!warehouseId && !selName(warehouseSel, "Gudang Utama")) {
    throw new Error("Gudang utama wajib dipilih atau dibuat");
  }
  if (!cashId && !selName(cashSel, `Rekening ${input.companyName}`)) {
    throw new Error("Rekening utama wajib dipilih atau dibuat");
  }

  if (warehouseId) {
    await assertSingleEntityWarehouse(input.companyId, warehouseId);
  }
  if (cashId) {
    await assertSingleCashAccountPerEntity(input.companyId, cashId);
  }

  await clearPrimaryWarehouseFlag(input.companyId);

  let warehouse: { id: string; code: string; name: string };
  if (warehouseId) {
    const row = await assertModuleUnassigned(
      INV_COLLECTIONS.warehouses,
      warehouseId,
      input.companyId,
      "Gudang",
    );
    warehouse = await pb.collection(INV_COLLECTIONS.warehouses).update<typeof warehouse>(warehouseId, {
      company: input.companyId,
      warehouse_role: "main",
      is_primary: true,
      is_active: true,
    });
    if (!warehouse.code) warehouse = { ...warehouse, code: String(row.code ?? "") };
  } else {
    await assertSingleEntityWarehouse(input.companyId);
    const existingWh = await pb.collection(INV_COLLECTIONS.warehouses).getFullList<{ code: string }>({
      fields: "code",
      requestKey: null,
    });
    const whName = selName(warehouseSel, "Gudang Utama");
    const whCode = suggestWarehouseCode(whName, existingWh.map((w) => w.code));
    warehouse = await pb.collection(INV_COLLECTIONS.warehouses).create({
      code: whCode,
      name: whName,
      company: input.companyId,
      warehouse_role: "main",
      is_primary: true,
      is_active: true,
      timezone: "Asia/Jakarta",
      address: "",
    });
  }

  let cashAccount: CashAccount | undefined;
  if (input.withCashAccount !== false) {
    await assertSingleCashAccountPerEntity(input.companyId);
    await clearPrimaryCashFlag(input.companyId);
    if (cashId) {
      await assertModuleUnassigned("biz_cash_accounts", cashId, input.companyId, "Rekening");
      cashAccount = await pb.collection("biz_cash_accounts").update<CashAccount>(cashId, {
        company: input.companyId,
        is_primary: true,
        is_active: true,
      });
    } else {
      const cashName = selName(cashSel, `Rekening ${input.companyName}`);
      if (cashName) {
        cashAccount = await createCashAccount({
          code: `${baseCode}-BANK`,
          name: cashName,
          account_type: "bank",
          company: input.companyId,
          is_primary: true,
          is_active: true,
          opening_balance: 0,
        });
      }
    }
  }

  return { warehouse, cashAccount };
}

export function defaultProvisionFromProfile(p: CompanyProfile): EntityProvisionForm {
  return {
    store: { selectedId: "", newName: "" },
    warehouse: { selectedId: "", newName: "Gudang Utama" },
    cashAccount: { selectedId: "", newName: `Rekening ${p.company_name}` },
  };
}

export function provisionFormIsValid(form: EntityProvisionForm, companyName: string): boolean {
  const whOk = !!form.warehouse.selectedId || !!form.warehouse.newName.trim();
  const cashOk =
    !!form.cashAccount.selectedId ||
    !!form.cashAccount.newName.trim() ||
    !!companyName.trim();
  return whOk && cashOk;
}
