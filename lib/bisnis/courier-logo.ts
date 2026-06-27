import { pb } from "@/lib/pocketbase";
import type { Courier } from "./types";

type CourierLogoRecord = Pick<Courier, "id" | "logo" | "collectionId" | "collectionName">;

export function getCourierLogoUrl(
  courier: CourierLogoRecord | null | undefined,
): string | null {
  if (!courier?.logo || !courier.collectionId) return null;
  return pb.files.getURL(
    courier as CourierLogoRecord & { collectionId: string; collectionName: string },
    courier.logo,
  );
}
