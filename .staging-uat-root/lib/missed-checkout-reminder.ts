import { pb } from "./pocketbase";
import { getTodayDate, resolveProfileShiftForDate, type Profile } from "./attendance";
import { normalizeAuthModel } from "./rbac";

const MINUTES_AFTER_SHIFT_BEFORE_REMINDER = 30;

export type MissedCheckoutRow = {
  userId: string;
  name: string;
  email?: string;
};

function shiftEndDateToday(shiftEndDisplay: string): Date | null {
  const t = shiftEndDisplay.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

async function hasHrApprovedOvertimeToday(userId: string, ymd: string): Promise<boolean> {
  try {
    const res = await pb.collection("overtime_requests").getList(1, 5, {
      filter: `user="${userId}" && work_date="${ymd}" && status="hr_approved"`,
      requestKey: null,
    });
    return res.totalItems > 0;
  } catch {
    return false;
  }
}

/**
 * Karyawan masih `is_checked_in` di users, sudah lewat akhir shift + buffer,
 * dan tidak punya lembur HR-approved hari itu → tampilkan pengingat ke HR/Owner.
 */
export async function fetchMissedCheckoutReminderRows(): Promise<MissedCheckoutRow[]> {
  const auth = pb.authStore.model as Record<string, unknown> | null;
  if (!auth?.id) return [];
  const me = normalizeAuthModel(auth);
  if (me.accountType !== "owner" && me.roleCode !== "hr") return [];

  const today = getTodayDate();
  const now = Date.now();

  let users: { id: string; name?: string; email?: string }[] = [];
  try {
    const list = await pb.collection("users").getFullList({
      filter: "is_checked_in=true",
      fields: "id,name,email",
      requestKey: null,
    });
    users = list as unknown as typeof users;
  } catch {
    return [];
  }

  const out: MissedCheckoutRow[] = [];

  for (const u of users) {
    if (!u.id) continue;
    let profile: Profile | null = null;
    try {
      profile = (await pb.collection("profiles").getFirstListItem(`user="${u.id}"`, {
        requestKey: null,
      })) as unknown as Profile;
    } catch {
      continue;
    }
    const { shiftEndDisplay } = resolveProfileShiftForDate(profile, today);
    const end = shiftEndDateToday(shiftEndDisplay);
    if (!end) continue;
    const threshold = end.getTime() + MINUTES_AFTER_SHIFT_BEFORE_REMINDER * 60_000;
    if (now <= threshold) continue;
    if (await hasHrApprovedOvertimeToday(u.id, today)) continue;
    out.push({
      userId: u.id,
      name: String(u.name || u.email || u.id).trim(),
      email: u.email,
    });
  }

  return out;
}
