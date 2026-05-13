// ========================================
// 👤 PROFILE MANAGEMENT - AUTO SYNC
// ========================================

import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";

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
  /** Kuota pengajuan cuti per bulan (HR); opsional di PocketBase — lihat `lib/leave.ts`. */
  leave_bookings_quota?: number;
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
 */
export async function createDefaultProfileForUser(userId: string): Promise<Profile> {
  const user = await pb.collection("users").getOne(userId);

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
    name: (user.name as string) || "",
    email: (user.email as string) || "",
    office_id: defaultOfficeId,
    shift_start: "08:00",
    shift_end: "17:00",
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
