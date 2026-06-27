"use client";

import { SalesModuleTabs } from "@/components/bisnis/SalesModuleTabs";
import { StoreScopeFilter } from "@/components/bisnis/StoreScopeFilter";
import { useSalesStoreScopeOptional } from "@/components/bisnis/SalesStoreScopeContext";

export function SalesModuleTopBar() {
  const scope = useSalesStoreScopeOptional();
  const showStoreFilter = scope && !scope.loading && scope.stores.length > 1;

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <SalesModuleTabs />
      {showStoreFilter ? (
        <StoreScopeFilter
          part="select"
          stores={scope.stores}
          value={scope.scopeStoreId}
          onChange={scope.setScopeStoreId}
          shownCount={scope.shownCount}
          totalCount={scope.totalAllStores}
          noun={scope.noun}
        />
      ) : null}
    </div>
  );
}
