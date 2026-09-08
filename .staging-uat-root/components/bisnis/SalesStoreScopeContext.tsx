"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { Store } from "@/lib/bisnis/types";

type SalesStoreScopeValue = {
  scopeStoreId: string;
  setScopeStoreId: (id: string) => void;
  stores: Store[];
  setStores: (stores: Store[]) => void;
  shownCount: number;
  setShownCount: (n: number) => void;
  totalAllStores: number;
  setTotalAllStores: (n: number) => void;
  noun: string;
  setNoun: (noun: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
};

const SalesStoreScopeContext = createContext<SalesStoreScopeValue | null>(null);

export function SalesStoreScopeProvider({ children }: { children: ReactNode }) {
  const [scopeStoreId, setScopeStoreId] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [shownCount, setShownCount] = useState(0);
  const [totalAllStores, setTotalAllStores] = useState(0);
  const [noun, setNoun] = useState("penagihan");
  const [loading, setLoading] = useState(true);

  const value = useMemo(
    () => ({
      scopeStoreId,
      setScopeStoreId,
      stores,
      setStores,
      shownCount,
      setShownCount,
      totalAllStores,
      setTotalAllStores,
      noun,
      setNoun,
      loading,
      setLoading,
    }),
    [scopeStoreId, stores, shownCount, totalAllStores, noun, loading],
  );

  return <SalesStoreScopeContext.Provider value={value}>{children}</SalesStoreScopeContext.Provider>;
}

export function useSalesStoreScope(): SalesStoreScopeValue {
  const ctx = useContext(SalesStoreScopeContext);
  if (!ctx) {
    throw new Error("useSalesStoreScope must be used within SalesStoreScopeProvider");
  }
  return ctx;
}

/** Aman di luar provider — untuk layout opsional. */
export function useSalesStoreScopeOptional(): SalesStoreScopeValue | null {
  return useContext(SalesStoreScopeContext);
}
