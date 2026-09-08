import { pb } from "./pocketbase";
import { getErrorMessage } from "./errors";

type ProfileShape = {
  position?: unknown;
  department?: unknown;
  salary?: unknown;
};

export function validateProfileCompletion(profile: Partial<ProfileShape>): {
  isComplete: boolean;
  missingFields: string[];
} {
  const requiredFields: (keyof ProfileShape)[] = ["position", "department", "salary"];
  const missingFields: string[] = [];
  for (const field of requiredFields) {
    const v = profile[field];
    if (v === undefined || v === null || v === "") {
      missingFields.push(String(field));
    }
  }
  return { isComplete: missingFields.length === 0, missingFields };
}

export async function checkProfileComplete(userId: string): Promise<{
  isComplete: boolean;
  message: string;
  missingFields: string[];
  serverUnreachable?: boolean;
}> {
  try {
    const result = await pb.collection("profiles").getList(1, 1, {
      filter: `user="${userId}"`,
      sort: "-created",
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
    const { isComplete, missingFields } = validateProfileCompletion(
      profile as unknown as ProfileShape
    );
    if (!isComplete) {
      return {
        isComplete: false,
        message:
          "Data HR Anda belum lengkap. Hubungi HR untuk melengkapi data (position, department, salary).",
        missingFields,
      };
    }
    return { isComplete: true, message: "Profil lengkap", missingFields: [] };
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
