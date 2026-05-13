import { pb } from "./pocketbase";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export const FIELD_ACTIVITY_COLLECTION = "field_activity_requests";

export type FieldActivityType = "meeting" | "visit" | "out_of_town" | "other";
export type FieldActivityStatus =
  | "pending_hr"
  | "approved"
  | "rejected"
  | "cancelled";

export type FieldActivityRow = {
  id: string;
  start_date: string;
  end_date: string;
  activity_type: FieldActivityType;
  destination: string;
  reason: string;
  status: FieldActivityStatus;
  created: string;
};

export async function listMyFieldActivity(
  userId: string
): Promise<FieldActivityRow[]> {
  try {
    const list = await pb.collection(FIELD_ACTIVITY_COLLECTION).getFullList({
      filter: `user="${pbEsc(userId)}"`,
      sort: "-created",
      requestKey: null,
    });
    return list as unknown as FieldActivityRow[];
  } catch {
    return [];
  }
}

export async function createFieldActivityRequest(payload: {
  userId: string;
  start_date: string;
  end_date: string;
  activity_type: FieldActivityType;
  destination: string;
  reason: string;
}): Promise<void> {
  await pb.collection(FIELD_ACTIVITY_COLLECTION).create({
    user: payload.userId,
    start_date: payload.start_date,
    end_date: payload.end_date,
    activity_type: payload.activity_type,
    destination: payload.destination.trim(),
    reason: payload.reason.trim(),
    status: "pending_hr",
  });
}
