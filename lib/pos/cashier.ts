import { pb } from "@/lib/pocketbase";

export type CashierInfo = {
  userId: string;
  name: string;
  phone: string;
};

/** Data kasir dari user login (+ profil jika ada telepon). */
export async function resolveCashierFromAuth(): Promise<CashierInfo | null> {
  if (!pb.authStore.isValid) return null;
  const user = pb.authStore.model as Record<string, unknown> | null;
  if (!user?.id) return null;

  const userId = String(user.id);
  let name = String(user.name || user.username || "").trim();
  let phone = String(user.phone || "").trim();

  try {
    const profile = await pb.collection("profiles").getFirstListItem(`user="${userId}"`, {
      requestKey: null,
    });
    const p = profile as Record<string, unknown>;
    if (p.name && String(p.name).trim()) name = String(p.name).trim();
    if (p.phone && String(p.phone).trim()) phone = String(p.phone).trim();
  } catch {
    /* profil opsional */
  }

  return {
    userId,
    name: name || "Kasir",
    phone,
  };
}
