import type PocketBase from "pocketbase";
import { BISNIS_COLLECTIONS, type Courier, type CourierService } from "./types";
import { DEFAULT_COURIER_CATALOG } from "./courier-defaults";
import { relationId } from "./relation-id";

export type SeedCouriersResult = {
  couriersCreated: number;
  servicesCreated: number;
  skipped: string[];
};

export async function seedDefaultCouriers(adminPb: PocketBase): Promise<SeedCouriersResult> {
  const result: SeedCouriersResult = {
    couriersCreated: 0,
    servicesCreated: 0,
    skipped: [],
  };

  const existingCouriers = await adminPb
    .collection(BISNIS_COLLECTIONS.couriers)
    .getFullList<Courier>({ fields: "id,name,code", requestKey: null });

  const existingServices = await adminPb
    .collection(BISNIS_COLLECTIONS.courierServices)
    .getFullList<CourierService>({
      fields: "id,courier,name",
      requestKey: null,
    });

  const courierByName = new Map<string, Courier>();
  for (const c of existingCouriers) {
    courierByName.set(c.name.trim().toLowerCase(), c);
    if (c.code?.trim()) courierByName.set(c.code.trim().toLowerCase(), c);
  }

  for (const item of DEFAULT_COURIER_CATALOG) {
    let courier =
      courierByName.get(item.name.toLowerCase()) ??
      courierByName.get(item.code.toLowerCase());
    if (!courier) {
      courier = await adminPb.collection(BISNIS_COLLECTIONS.couriers).create<Courier>({
        code: item.code,
        name: item.name,
        is_active: true,
      });
      courierByName.set(item.name.toLowerCase(), courier);
      result.couriersCreated += 1;
    } else {
      result.skipped.push(`Ekspedisi ${item.name} sudah ada`);
    }

    const svcForCourier = existingServices.filter(
      (s) => relationId(s.courier) === courier!.id,
    );
    const svcNames = new Set(svcForCourier.map((s) => s.name.trim().toLowerCase()));

    for (const svc of item.services) {
      if (svcNames.has(svc.name.toLowerCase())) continue;
      const created = await adminPb.collection(BISNIS_COLLECTIONS.courierServices).create<CourierService>({
        courier: courier.id,
        name: svc.name,
        sort_order: svc.sort_order,
        is_active: true,
      });
      existingServices.push(created);
      svcNames.add(svc.name.toLowerCase());
      result.servicesCreated += 1;
    }
  }

  return result;
}
