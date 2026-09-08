import type PocketBase from "pocketbase";

/** Resolve nama tampilan user untuk audit retur. */
export async function resolveProcessActorName(
  pb: PocketBase,
  userId: string,
  fallbackUser?: { name?: unknown; email?: unknown },
): Promise<string> {
  const fromFallback =
    (typeof fallbackUser?.name === "string" && fallbackUser.name.trim()) ||
    (typeof fallbackUser?.email === "string" && fallbackUser.email.trim()) ||
    "";
  if (!userId) return fromFallback || "—";
  try {
    const u = await pb.collection("users").getOne<{ name?: string; email?: string }>(userId, {
      requestKey: null,
    });
    return u.name?.trim() || u.email?.trim() || fromFallback || userId;
  } catch {
    return fromFallback || userId;
  }
}
