"use client";

import { useEffect, useState } from "react";
import { fetchStores } from "./client";
import { fetchSalesChannels } from "./mp-client";
import { fetchCashAccounts } from "./cash-client";
import { pb } from "@/lib/pocketbase";
import { INV_COLLECTIONS } from "@/lib/inventory/types";
import { useWorkContext } from "@/components/WorkContextProvider";
import type { CashAccount, SalesChannel, Store } from "./types";
import { REPORT_ALL, type ReportDimensionState } from "./report-filters";

export type WarehouseOption = { id: string; name: string; code: string; store?: string };

export function useReportDimensions(initial?: Partial<ReportDimensionState>) {
  const { context } = useWorkContext();
  const companyId = context?.companyId;

  const [storeId, setStoreId] = useState(initial?.storeId ?? REPORT_ALL);
  const [warehouseId, setWarehouseId] = useState(initial?.warehouseId ?? REPORT_ALL);
  const [channelId, setChannelId] = useState(initial?.channelId ?? REPORT_ALL);
  const [cashAccountId, setCashAccountId] = useState(initial?.cashAccountId ?? REPORT_ALL);

  const [stores, setStores] = useState<Store[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [channels, setChannels] = useState<SalesChannel[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);

  useEffect(() => {
    Promise.all([
      fetchStores(false, companyId).catch(() => [] as Store[]),
      pb
        .collection(INV_COLLECTIONS.warehouses)
        .getFullList<WarehouseOption>({
          filter: companyId ? `company = "${companyId}"` : undefined,
          sort: "name",
          requestKey: null,
        })
        .catch(() => []),
      fetchSalesChannels(true).catch(() => [] as SalesChannel[]),
      fetchCashAccounts(true, companyId).catch(() => [] as CashAccount[]),
    ]).then(([st, wh, ch, ca]) => {
      setStores(st);
      setWarehouses(wh);
      setChannels(ch);
      setCashAccounts(ca);
    });
  }, [companyId]);

  useEffect(() => {
    setStoreId(REPORT_ALL);
    setWarehouseId(REPORT_ALL);
    setChannelId(REPORT_ALL);
    setCashAccountId(REPORT_ALL);
  }, [companyId]);

  const state: ReportDimensionState = { storeId, warehouseId, channelId, cashAccountId };

  return {
    companyId,
    companyName: context?.companyName,
    stores,
    warehouses,
    channels,
    cashAccounts,
    storeId,
    setStoreId,
    warehouseId,
    setWarehouseId,
    channelId,
    setChannelId,
    cashAccountId,
    setCashAccountId,
    dimensions: state,
  };
}
