import type { RecordModel } from "pocketbase";
import { pb } from "./pocketbase";

/** Flat PocketBase body values used by staff collection creates. */
export type StaffCreatePayload = Record<
  string,
  string | number | boolean | null | undefined
>;

export const createStaff = async (
  data: StaffCreatePayload
): Promise<RecordModel> => {
  return pb.collection("staff").create(data);
};