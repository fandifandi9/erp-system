/**
 * Memastikan record `profiles` ada dan name/email disinkronkan dari `users`
 * (setara ringkas dengan `lib/profile.ts` di app web).
 */
import { pb } from "@/lib/pocketbase";

export type MobileProfile = {
  id: string;
  user: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  position?: string;
  department?: string;
  division?: string;
  salary?: number;
  address?: string;
  date_of_birth?: string;
  bio?: string;
  join_date?: string;
  shift_start?: string;
  shift_end?: string;
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  shift_start_weekend?: string;
  shift_end_weekend?: string;
  profile_status?: string;
};

function escUserFilter(userId: string): string {
  return userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function createDefaultProfileForUser(userId: string): Promise<MobileProfile> {
  const user = await pb.collection("users").getOne(userId);
  let defaultOfficeId: string | null = null;
  try {
    const firstOffice = await pb.collection("offices").getFirstListItem(`is_active=true`, {
      requestKey: null,
    });
    defaultOfficeId = firstOffice.id;
  } catch {
    /* no office */
  }
  const row = await pb.collection("profiles").create({
    user: userId,
    name: (user.name as string) || "",
    email: (user.email as string) || "",
    office_id: defaultOfficeId,
    shift_start: "08:00",
    shift_end: "17:00",
    profile_status: "incomplete",
  });
  return row as unknown as MobileProfile;
}

async function ensureProfile(userId: string): Promise<{ profile: MobileProfile | null; created: boolean }> {
  const q = `user="${escUserFilter(userId)}"`;
  try {
    const existing = await pb.collection("profiles").getFirstListItem(q, { requestKey: null });
    return { profile: existing as unknown as MobileProfile, created: false };
  } catch {
    try {
      const created = await createDefaultProfileForUser(userId);
      return { profile: created, created: true };
    } catch {
      return { profile: null, created: false };
    }
  }
}

async function syncUserDataToProfile(userId: string, existing: MobileProfile): Promise<boolean> {
  try {
    const user = await pb.collection("users").getOne(userId);
    if (existing.name !== user.name || existing.email !== user.email) {
      await pb.collection("profiles").update(existing.id, {
        name: user.name,
        email: user.email,
      });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function ensureAndSyncProfileMobile(userId: string): Promise<{
  profile: MobileProfile | null;
  created: boolean;
}> {
  const { profile, created } = await ensureProfile(userId);
  if (!profile) return { profile: null, created };
  await syncUserDataToProfile(userId, profile);
  const refreshed = await pb.collection("profiles").getFirstListItem(`user="${escUserFilter(userId)}"`, {
    requestKey: null,
  });
  return { profile: refreshed as unknown as MobileProfile, created };
}
