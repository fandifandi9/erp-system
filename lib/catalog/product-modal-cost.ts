import { pb } from "@/lib/pocketbase";
import { fetchCompanyProfiles } from "@/lib/bisnis/company-client";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import type { CompanyProfile } from "@/lib/bisnis/types";

export type EntityModalCostRow = {
  companyId: string;
  companyName: string;
  companyCode?: string;
  unitCost: number;
  poNo?: string;
  orderDate?: string;
  hasPurchase: boolean;
};

export async function fetchProductModalCostByEntity(productId: string): Promise<EntityModalCostRow[]> {
  const companies = await fetchCompanyProfiles(true);

  const lines = await pb.collection(BISNIS_COLLECTIONS.purchaseOrderLines).getFullList({
    filter: `product = "${productId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    sort: "-created",
    expand: "purchase_order",
    requestKey: null,
  });

  const latestByCompany = new Map<
    string,
    { unitCost: number; poNo?: string; orderDate?: string }
  >();

  for (const row of lines) {
    const line = row as unknown as {
      product: string;
      unit_cost: number;
      expand?: {
        purchase_order?: {
          status?: string;
          company?: string;
          po_no?: string;
          order_date?: string;
        };
      };
    };
    const po = line.expand?.purchase_order;
    const companyId = po?.company;
    if (!companyId || latestByCompany.has(companyId)) continue;
    if (po?.status === "cancelled") continue;
    latestByCompany.set(companyId, {
      unitCost: Number(line.unit_cost) || 0,
      poNo: po.po_no,
      orderDate: po.order_date,
    });
  }

  return companies.map((company: CompanyProfile) => {
    const hit = latestByCompany.get(company.id);
    return {
      companyId: company.id,
      companyName: company.company_name,
      companyCode: company.code,
      unitCost: hit?.unitCost ?? 0,
      poNo: hit?.poNo,
      orderDate: hit?.orderDate,
      hasPurchase: !!hit,
    };
  });
}
