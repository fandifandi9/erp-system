import { pb } from "./pocketbase";

function pbEsc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveRow = {
  id: string;
  user: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  booking_date?: string;
  created: string;
};

export async function listMyLeaveRequests(
  userId: string,
  page = 1
): Promise<{ items: LeaveRow[]; totalPages: number }> {
  try {
    const res = await pb.collection("leave_requests").getList(page, 30, {
      filter: `user="${pbEsc(userId)}"`,
      sort: "-created",
      requestKey: null,
    });
    return {
      items: res.items as unknown as LeaveRow[],
      totalPages: res.totalPages,
    };
  } catch {
    return { items: [], totalPages: 0 };
  }
}

/** Satu hari — selaras dengan booking web (`start_date` = `end_date`). */
export async function createLeaveBookingDay(
  userId: string,
  ymd: string,
  reason: string,
  division: string,
  position: string
): Promise<void> {
  await pb.collection("leave_requests").create({
    user: userId,
    start_date: ymd,
    end_date: ymd,
    booking_date: ymd,
    reason: reason.trim(),
    status: "pending",
    division: division.trim() || "—",
    position: position.trim() || "—",
  });
}
