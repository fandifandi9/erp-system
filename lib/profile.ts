// ========================================
// 👤 PROFILE MANAGEMENT - AUTO SYNC
// ========================================

import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";
import { fetchHrCompensationSettings } from "./hr-compensation";

export const PROFILE_LEAVE_DAILY_RATE_FIELD = "leave_daily_rate";
export const PROFILE_EXTRA_BONUS_AMOUNT_FIELD = "extra_bonus_amount";
export const PROFILE_EXTRA_BONUS_ENABLED_FIELD = "extra_bonus_enabled";
/** >0 = override tarif potongan telat per menit (selain itu dari gaji pokok ÷ 30 ÷ 8 ÷ 60) */
export const PROFILE_LATE_DEDUCTION_PER_MINUTE_FIELD = "late_deduction_rupiah_per_minute";
/** >0 = override tarif per hari alpha / tidak masuk (selain itu gaji pokok ÷ 30) */
export const PROFILE_ABSENCE_DEDUCTION_PER_DAY_FIELD = "absence_deduction_rupiah_per_day";
/** Jam Sabtu / Minggu terpisah (HR) — tiap hari harus berpasangan masuk–pulang jika dipakai */
export const PROFILE_SHIFT_START_SATURDAY_FIELD = "shift_start_saturday";
export const PROFILE_SHIFT_END_SATURDAY_FIELD = "shift_end_saturday";
export const PROFILE_SHIFT_START_SUNDAY_FIELD = "shift_start_sunday";
export const PROFILE_SHIFT_END_SUNDAY_FIELD = "shift_end_sunday";

// ========================================
// 🔐 TYPES
// ========================================

export interface Profile {
  id: string;
  user: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  position?: string;
  department?: string;
  salary?: number;
  address?: string;
  kode?: string;
  division?: string;
  office_id?: string;
  date_of_birth?: string;
  bio?: string;
  join_date?: string;
  nik?: string;
  npwp?: string;
  employee_code?: string;
  late_tolerance?: number;
  /** Preferensi HR; absensi memakai lebih dulu dari late_tolerance jika keduanya ada */
  grace_minutes?: number;
  /** Alias shift selesai dari beberapa skema PB */
  work_end?: string;
  shift_start: string;
  shift_end: string;
  /** Sabtu — dipakai jika `shift_start_saturday` & `shift_end_saturday` keduanya ada */
  shift_start_saturday?: string;
  shift_end_saturday?: string;
  /** Minggu — dipakai jika `shift_start_sunday` & `shift_end_sunday` keduanya ada */
  shift_start_sunday?: string;
  shift_end_sunday?: string;
  /** @deprecated Dipakai fallback absensi jika Sabtu/Minggu baru belum diisi */
  shift_start_weekend?: string;
  shift_end_weekend?: string;
  /** HR: wajibkan foto selfie saat check-in (audit) */
  require_checkin_selfie?: boolean;
  /** Kuota pengajuan cuti per bulan (HR); opsional di PocketBase — lihat `lib/leave.ts`. */
  leave_bookings_quota?: number;
  /** Kompensasi per hari cuti + kredit kuota tidak terpakai (Rp). */
  leave_daily_rate?: number;
  /** Bonus extra bulanan jika syarat kehadiran terpenuhi (Rp). */
  extra_bonus_amount?: number;
  extra_bonus_enabled?: boolean;
  /** Override potongan telat (Rp/menit). 0/kosong = dari gaji pokok. */
  late_deduction_rupiah_per_minute?: number;
  /** Override potongan alpha (Rp/hari). 0/kosong = gaji ÷ 30. */
  absence_deduction_rupiah_per_day?: number;
  profile_status: "incomplete" | "complete";
  created: string;
  updated: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
}

// ========================================
// 🔄 AUTO PROFILE MANAGEMENT
// ========================================

/**
 * Buat satu record `profiles` baru untuk user (shift default + kantor aktif pertama).
 * Dipakai `ensureProfile` dan halaman HR buat karyawan — payload harus sama agar produksi tidak gagal hanya di salah satu alur.
 *
 * `seed` — isi dari form HR saat buat karyawan. PocketBase sering tidak mengembalikan
 * field `email` user lain ke client, jadi harus disimpan eksplisit ke `profiles.email`.
 */
export async function createDefaultProfileForUser(
  userId: string,
  seed?: { email?: string; name?: string },
): Promise<Profile> {
  let displayName = seed?.name?.trim() || "";
  let displayEmail = seed?.email?.trim() || "";

  if (!displayName || !displayEmail) {
    const user = await pb.collection("users").getOne(userId);
    displayName = displayName || (user.name as string) || "";
    displayEmail = displayEmail || (user.email as string) || "";
  }

  let defaultOfficeId: string | null = null;
  try {
    const firstOffice = await pb.collection("offices").getFirstListItem(
      `is_active=true`,
      { requestKey: null }
    );
    defaultOfficeId = firstOffice.id;
  } catch {
    console.warn("⚠️ No active office found for new profile");
  }

  const newProfile = await pb.collection("profiles").create({
    user: userId,
    name: displayName,
    email: displayEmail,
    office_id: defaultOfficeId,
    shift_start: "",
    shift_end: "",
    profile_status: "incomplete",
  });

  return newProfile as unknown as Profile;
}

/**
 * Ensure profile exists for user - AUTO CREATE if needed
 * Called on login or any profile access
 */
export async function ensureProfile(userId: string): Promise<{
  profile: Profile | null;
  created: boolean;
}> {
  try {
    // Check if profile already exists
    const existing = await pb.collection("profiles").getFirstListItem(
      `user="${userId}"`,
      { requestKey: null }
    );

    console.log("✅ Profile found for user:", userId);
    return {
      profile: existing as unknown as Profile,
      created: false,
    };
  } catch {
    // Profile doesn't exist - AUTO CREATE
    console.warn("⚠️ Profile not found for user", userId, "- Creating...");

    try {
      const newProfile = await createDefaultProfileForUser(userId);
      console.log("✅ Auto-created profile:", newProfile.id);
      return {
        profile: newProfile,
        created: true,
      };
    } catch (error: unknown) {
      console.error("❌ Failed to create profile:", error);
      return { profile: null, created: false };
    }
  }
}

/**
 * Sync name/email from users to profiles
 */
export async function syncUserDataToProfile(
  userId: string,
  existingProfile?: Profile
): Promise<boolean> {
  try {
    const user = await pb.collection("users").getOne(userId);

    const profile =
      existingProfile ??
      ((await pb.collection("profiles").getFirstListItem(
        `user="${userId}"`,
        { requestKey: null }
      )) as unknown as Profile);

    if (profile.name !== user.name || profile.email !== user.email) {
      await pb.collection("profiles").update(profile.id, {
        name: user.name,
        email: user.email,
      });
      
      console.log("✅ Synced user data to profile");
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ Sync failed:", error);
    return false;
  }
}

/**
 * Ensure profile exists and always sync core user fields.
 * This keeps PB `users` and HR `profiles` aligned.
 */
export async function ensureAndSyncProfile(userId: string): Promise<{
  profile: Profile | null;
  created: boolean;
  synced: boolean;
}> {
  const { profile, created } = await ensureProfile(userId);

  if (!profile) {
    return { profile: null, created, synced: false };
  }

  const synced = await syncUserDataToProfile(userId, profile);

  if (!synced) {
    return { profile, created, synced: false };
  }

  const refreshed = await pb.collection("profiles").getFirstListItem(
    `user="${userId}"`,
    { requestKey: null }
  );

  return {
    profile: refreshed as unknown as Profile,
    created,
    synced: true,
  };
}

/**
 * Validate if profile is complete
 * Required fields: position, department, salary
 */
export function validateProfileCompletion(profile: Partial<Profile>): {
  isComplete: boolean;
  missingFields: string[];
} {
  const requiredFields: (keyof Profile)[] = ["position", "department", "salary"];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (!profile[field]) {
      missingFields.push(field);
    }
  }

  return {
    isComplete: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Update profile and set profile_status based on completion
 */
export async function updateProfile(
  profileId: string,
  data: Partial<Profile>
): Promise<{
  success: boolean;
  message: string;
  profile?: Profile;
}> {
  try {
    // Get current profile
    const currentProfile = await pb.collection("profiles").getOne(profileId);

    // Merge data
    const updatedData = { ...currentProfile, ...data };

    // Validate completion
    const { isComplete } = validateProfileCompletion(updatedData);

    // Set profile_status
    const finalData = {
      ...data,
      profile_status: isComplete ? "complete" : "incomplete",
    };

    // Update profile
    const updated = await pb.collection("profiles").update(profileId, finalData);

    console.log(
      `✅ Profile updated: ${updated.id} - Status: ${updated.profile_status}`
    );

    return {
      success: true,
      message: isComplete
        ? "Profile updated successfully"
        : "Profile updated, but some required fields are still missing",
      profile: updated as unknown as Profile,
    };
  } catch (error: unknown) {
    console.error("❌ Update profile error:", error);
    return {
      success: false,
      message: getErrorMessage(error, "Failed to update profile"),
    };
  }
}

/**
 * Get profile with completion status
 */
export async function getIncompleteProfiles(
  page = 1,
  perPage = 20
): Promise<{ items: Profile[]; totalPages: number }> {
  try {
    const result = await pb.collection("profiles").getList(page, perPage, {
      sort: "-created",
      expand: "user",
      requestKey: null,
    });

    // 🔥 FILTER MANUAL (INI YANG PENTING)
    const incomplete = result.items.filter((profile) => {
      return (
        !profile.position ||
        !profile.department ||
        !profile.salary
      );
    });

    return {
      items: incomplete as unknown as Profile[],
      totalPages: result.totalPages,
    };
  } catch (error) {
    console.error("Error getIncompleteProfiles:", error);
    return {
      items: [],
      totalPages: 0,
    };
  }
}

/**
 * Get all incomplete profiles (for HR dashboard)
 */
 

/**
 * Check if profile is complete - used for blocking features
 */
export async function checkProfileComplete(
  userId: string
): Promise<{
  isComplete: boolean;
  message: string;
  missingFields: string[];
  /** PocketBase tidak terjangkau / timeout — bukan berarti profil HR kosong */
  serverUnreachable?: boolean;
}> {
  try {
    // ambil list dari database
    const result = await pb.collection("profiles").getList(1, 1, {
        filter: `user="${userId}"`,
        sort: "-created", // ambil terbaru
        requestKey: null,
    });

    const profile = result.items[0];

    if (!profile) {
        return {
            isComplete: false,
            message:
              "Belum ada data profil untuk akun ini di PocketBase. Hubungi HR untuk membuat/menyinkronkan profil.",
            missingFields: ["all"],
        };
    }

    const { isComplete, missingFields } = validateProfileCompletion(profile);

    if (!isComplete) {
      return {
        isComplete: false,
        message:
          "Data HR Anda belum lengkap. Hubungi HR untuk melengkapi data (position, department, salary).",
        missingFields,
      };
    }

    return {
      isComplete: true,
      message: "Profile complete",
      missingFields: [],
    };
  } catch (error: unknown) {
    return {
      isComplete: false,
      message: getErrorMessage(
        error,
        "Tidak bisa menghubungi server data (PocketBase). Periksa jaringan dan URL server."
      ),
      missingFields: ["all"],
      serverUnreachable: true,
    };
  }
}

function profileToNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function pbEscape(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Tarif cuti per hari dari profil karyawan, fallback pengaturan global HR. */
export async function resolveLeaveDailyRateForUser(userId: string): Promise<number> {
  if (!userId?.trim()) return 0;
  try {
    const list = await pb.collection("profiles").getList(1, 1, {
      filter: `user="${pbEscape(userId)}"`,
      sort: "-updated",
      requestKey: null,
    });
    const prof = list.items[0] as Record<string, unknown> | undefined;
    const fromProf = Math.max(0, Math.round(profileToNumber(prof?.[PROFILE_LEAVE_DAILY_RATE_FIELD], 0)));
    if (fromProf > 0) return fromProf;
  } catch {
    /* profil tidak ada */
  }
  const global = await fetchHrCompensationSettings();
  return Math.max(0, Math.round(global?.leave_daily_compensation_rate ?? 0));
}
