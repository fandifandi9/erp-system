"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { SalesOrder } from "@/lib/bisnis/types";

/** Buka order dari query ?so= (notifikasi aktivitas → WMS). */
export function useOutboundOrderFromQuery(
  orders: SalesOrder[],
  loading: boolean,
  selectedId: string | undefined,
  onSelect: (order: SalesOrder) => void | Promise<void>,
): void {
  const searchParams = useSearchParams();
  const soId = searchParams.get("so")?.trim() ?? "";
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!soId || loading || orders.length === 0) return;
    if (selectedId === soId) return;
    const match = orders.find((o) => o.id === soId);
    if (match) void onSelectRef.current(match);
  }, [soId, loading, orders, selectedId]);
}
