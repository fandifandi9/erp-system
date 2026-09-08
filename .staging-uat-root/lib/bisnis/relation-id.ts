/** Ambil ID dari field relation PocketBase (string atau objek expand). */
export function relationId(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "id" in value) {
    return String((value as { id: string }).id);
  }
  return "";
}
