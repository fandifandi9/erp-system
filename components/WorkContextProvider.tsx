"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { pb } from "@/lib/pocketbase";
import { fetchStores } from "@/lib/bisnis/client";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import type { WorkContext } from "@/lib/tenant/types";
import {
  loadWorkContextFromStorage,
  saveWorkContextToStorage,
} from "@/lib/tenant/work-context-storage";
import { warehousesForStore } from "@/lib/tenant/warehouses-for-store";

type CompanyRow = { id: string; name: string; code?: string };
type StoreRow = { id: string; name: string; code: string; company?: string; default_warehouse?: string };
type WarehouseRow = {
  id: string;
  name: string;
  code: string;
  store?: string;
  company?: string;
  warehouse_role?: string;
  is_active?: boolean;
  is_primary?: boolean;
};

type WorkContextValue = {
  context: WorkContext | null;
  loading: boolean;
  companies: CompanyRow[];
  stores: StoreRow[];
  warehouses: WarehouseRow[];
  storeWarehouses: WarehouseRow[];
  setContext: (
    partial: Partial<WorkContext> & {
      companyId?: string;
      storeId?: string;
      warehouseId?: string;
    },
  ) => Promise<void>;
};

const Ctx = createContext<WorkContextValue | null>(null);

export function useWorkContext(): WorkContextValue {
  const v = useContext(Ctx);
  if (!v) {
    return {
      context: loadWorkContextFromStorage(),
      loading: false,
      companies: [],
      stores: [],
      warehouses: [],
      storeWarehouses: [],
      setContext: async () => {},
    };
  }
  return v;
}

/** ID entitas aktif — aman saat konteks masih null (belum selesai load). */
export function useWorkCompanyId(): string | undefined {
  const { context } = useWorkContext();
  return context?.companyId;
}

function filterWarehousesForCompany(companyId: string, stores: StoreRow[], warehouses: WarehouseRow[]) {
  const storeIds = new Set(stores.filter((s) => s.company === companyId).map((s) => s.id));
  return warehouses.filter(
    (w) => w.company === companyId || (w.store && storeIds.has(w.store)),
  );
}

function buildWorkContext(
  nextCompanyId: string,
  storeId: string,
  warehouseId: string,
  companyList: CompanyRow[],
  storeList: StoreRow[],
  whList: WarehouseRow[],
): WorkContext | null {
  const company = companyList.find((c) => c.id === nextCompanyId);
  const scopedStores = storeList.filter((s) => s.company === nextCompanyId);
  const store = scopedStores.find((s) => s.id === storeId) ?? scopedStores[0];
  if (!company || !store) return null;
  const scopedWh = warehousesForStore(
    store.id,
    scopedStores,
    filterWarehousesForCompany(nextCompanyId, storeList, whList),
  );
  const wh = scopedWh.find((w) => w.id === warehouseId) ?? scopedWh[0];
  if (!wh) return null;
  return {
    companyId: company.id,
    companyName: company.name,
    companyCode: company.code,
    storeId: store.id,
    storeName: store.name,
    storeCode: store.code,
    warehouseId: wh.id,
    warehouseName: wh.name,
    warehouseCode: wh.code,
  };
}

export function WorkContextProvider({ children }: { children: ReactNode }) {
  const [context, setContextState] = useState<WorkContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [allStores, setAllStores] = useState<StoreRow[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<WarehouseRow[]>([]);

  const companyId = context?.companyId ?? "";
  const stores = useMemo(
    () => (companyId ? allStores.filter((s) => s.company === companyId) : allStores),
    [allStores, companyId],
  );
  const warehouses = useMemo(
    () => (companyId ? filterWarehousesForCompany(companyId, allStores, allWarehouses) : allWarehouses),
    [allStores, allWarehouses, companyId],
  );

  const storeWarehouses = useMemo(() => {
    if (!context?.storeId) return warehouses;
    return warehousesForStore(context.storeId, stores, warehouses);
  }, [context?.storeId, stores, warehouses]);

  const applyContext = useCallback(
    (
      nextCompanyId: string,
      storeId: string,
      warehouseId: string,
      companyList: CompanyRow[],
      storeList: StoreRow[],
      whList: WarehouseRow[],
    ) => {
      const ctx = buildWorkContext(
        nextCompanyId,
        storeId,
        warehouseId,
        companyList,
        storeList,
        whList,
      );
      if (!ctx) return null;
      setContextState(ctx);
      saveWorkContextToStorage(ctx);
      return ctx;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accessRes, s, w, serverCtxRes] = await Promise.all([
          fetch("/api/tenant/company-access", { credentials: "include" }).then((r) =>
            r.ok ? r.json() : { companies: [] },
          ),
          fetchStores(true),
          pb.collection(INV_COLLECTIONS.warehouses).getFullList<WarehouseRow>({
            sort: "name",
            filter: "is_active = true",
            fields: "id,name,code,store,company,warehouse_role,is_active,is_primary",
            requestKey: null,
          }),
          fetch("/api/tenant/work-context", { credentials: "include" }).then((r) =>
            r.ok ? r.json() : null,
          ),
        ]);
        if (cancelled) return;

        const accessPayload = accessRes as {
          companies?: { id: string; name: string; code?: string }[];
        };
        const companyList: CompanyRow[] = (accessPayload.companies ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
        }));
        const storeList: StoreRow[] = s.map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code,
          company: x.company,
          default_warehouse: x.default_warehouse,
        }));
        const whList: WarehouseRow[] = w.map((x) => ({
          id: x.id,
          name: x.name,
          code: x.code,
          store: x.store,
          company: x.company,
          warehouse_role: x.warehouse_role,
          is_active: x.is_active,
          is_primary: x.is_primary,
        }));

        setCompanies(companyList);
        setAllStores(storeList);
        setAllWarehouses(whList);

        const server = serverCtxRes as {
          companyId?: string;
          storeId?: string;
          warehouseId?: string;
        } | null;

        const allowedCompanyIds = new Set(companyList.map((c) => c.id));
        let companyIdInit =
          (server?.companyId && allowedCompanyIds.has(server.companyId) ? server.companyId : undefined) ||
          companyList[0]?.id ||
          (storeList.find((st) => st.id === server?.storeId && allowedCompanyIds.has(st.company ?? ""))
            ?.company) ||
          storeList.find((st) => allowedCompanyIds.has(st.company ?? ""))?.company ||
          "";

        const scopedStores = companyIdInit
          ? storeList.filter((st) => st.company === companyIdInit)
          : storeList;

        let storeId =
          (server?.storeId && scopedStores.some((st) => st.id === server.storeId)
            ? server.storeId
            : undefined) ||
          scopedStores[0]?.id;

        const scopedWh = storeId
          ? warehousesForStore(
              storeId,
              scopedStores,
              filterWarehousesForCompany(companyIdInit, storeList, whList),
            )
          : filterWarehousesForCompany(companyIdInit, storeList, whList);

        let warehouseId =
          (server?.warehouseId && scopedWh.some((wh) => wh.id === server.warehouseId)
            ? server.warehouseId
            : undefined) ||
          scopedStores.find((st) => st.id === storeId)?.default_warehouse ||
          scopedWh[0]?.id;

        if (companyIdInit && storeId && warehouseId) {
          const ctx = buildWorkContext(
            companyIdInit,
            storeId,
            warehouseId,
            companyList,
            storeList,
            whList,
          );
          if (ctx) {
            setContextState(ctx);
            saveWorkContextToStorage(ctx);
          }
        } else {
          const local = loadWorkContextFromStorage();
          const localCompanyOk =
            local && (allowedCompanyIds.size === 0 || allowedCompanyIds.has(local.companyId));
          if (local && localCompanyOk && storeList.some((st) => st.id === local.storeId)) {
            const ctx = buildWorkContext(
              local.companyId,
              local.storeId,
              local.warehouseId,
              companyList,
              storeList,
              whList,
            );
            if (ctx) {
              setContextState(ctx);
              saveWorkContextToStorage(ctx);
            }
          } else if (companyList.length === 0 && storeList[0] && whList[0]) {
            const fbCompany = storeList[0].company ?? "";
            if (fbCompany) {
              const ctx = buildWorkContext(
                fbCompany,
                storeList[0].id,
                whList[0].id,
                companyList,
                storeList,
                whList,
              );
              if (ctx) {
                setContextState(ctx);
                saveWorkContextToStorage(ctx);
              }
            }
          }
        }
      } catch (err) {
        console.error("WorkContext init:", err);
        const local = loadWorkContextFromStorage();
        if (local) setContextState(local);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Hanya sekali saat mount — jangan pakai applyContext di deps (memicu loop API).
  }, []);

  const setContext = useCallback(
    async (
      partial: Partial<WorkContext> & {
        companyId?: string;
        storeId?: string;
        warehouseId?: string;
      },
    ) => {
      const prev = context;
      const nextCompanyId = partial.companyId ?? context?.companyId ?? companies[0]?.id;
      if (!nextCompanyId || !companies.some((c) => c.id === nextCompanyId)) return;

      const scopedStores = allStores.filter((s) => s.company === nextCompanyId);
      let storeId = partial.storeId ?? context?.storeId;
      if (partial.companyId || !storeId || !scopedStores.some((s) => s.id === storeId)) {
        storeId = scopedStores[0]?.id;
      }
      if (!storeId) return;

      let warehouseId = partial.warehouseId ?? context?.warehouseId;
      if (partial.storeId && !partial.warehouseId) {
        const store = scopedStores.find((s) => s.id === partial.storeId);
        const scopedWh = warehousesForStore(
          partial.storeId,
          scopedStores,
          filterWarehousesForCompany(nextCompanyId, allStores, allWarehouses),
        );
        warehouseId = store?.default_warehouse || scopedWh[0]?.id || warehouseId;
      }
      if (!warehouseId) return;

      const next = applyContext(
        nextCompanyId,
        storeId,
        warehouseId,
        companies,
        scopedStores,
        filterWarehousesForCompany(nextCompanyId, allStores, allWarehouses),
      );
      if (!next) return;
      try {
        await fetch("/api/tenant/work-context", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: next.companyId,
            companyName: next.companyName,
            storeId: next.storeId,
            storeName: next.storeName,
            warehouseId: next.warehouseId,
            warehouseName: next.warehouseName,
            prevCompanyId: prev?.companyId,
            prevStoreId: prev?.storeId,
            prevWarehouseId: prev?.warehouseId,
          }),
        });
      } catch (err) {
        console.warn("Persist work context:", err);
      }
    },
    [applyContext, context, companies, allStores, allWarehouses, warehouses],
  );

  const value = useMemo(
    () => ({ context, loading, companies, stores, warehouses, storeWarehouses, setContext }),
    [context, loading, companies, stores, warehouses, storeWarehouses, setContext],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
