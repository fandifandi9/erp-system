import { pb } from "@/lib/pocketbase";
import { BISNIS_COLLECTIONS, type Customer } from "./types";

export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Normalisasi nama untuk cek unik: trim + lowercase + rapikan spasi. */
export function normalizeCustomerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True jika nama sama persis (case/spasi diabaikan). "dudung" ≠ "dudung2" / "dudung gendut". */
export function isExactCustomerName(a: string, b: string): boolean {
  const na = normalizeCustomerName(a);
  const nb = normalizeCustomerName(b);
  return na.length > 0 && na === nb;
}

export function findLocalCustomerByExactName(
  customers: Customer[],
  name: string,
): Customer | null {
  const needle = normalizeCustomerName(name);
  if (!needle) return null;
  return customers.find((c) => normalizeCustomerName(c.name ?? "") === needle) ?? null;
}

export function customerDisplayLabel(c: Customer): string {
  return `${c.name}${c.phone ? ` · ${c.phone}` : ""}`;
}

/** Cari pelanggan di daftar lokal (nama / telepon). */
export function filterCustomersLocal(customers: Customer[], query: string): Customer[] {
  const q = query.trim().toLowerCase();
  if (!q) return customers.slice(0, 40);
  const digits = normalizePhoneDigits(q);
  return customers
    .filter((c) => {
      if (c.name.toLowerCase().includes(q)) return true;
      if (c.phone?.toLowerCase().includes(q)) return true;
      if (digits.length >= 4 && normalizePhoneDigits(c.phone ?? "").includes(digits)) return true;
      return false;
    })
    .slice(0, 30);
}

/** Cari pelanggan by nama exact (hindari duplikat nama). */
export async function findCustomerByExactName(name: string): Promise<Customer | null> {
  const needle = normalizeCustomerName(name);
  if (needle.length < 2) return null;
  const esc = name.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    const hits = await pb.collection(BISNIS_COLLECTIONS.customers).getList<Customer>(1, 50, {
      filter: `name ~ "${esc}"`,
      sort: "name",
      requestKey: null,
    });
    return hits.items.find((c) => isExactCustomerName(c.name ?? "", name)) ?? null;
  } catch {
    return null;
  }
}

/** Cari pelanggan existing by nomor telepon (hindari duplikat). */
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return null;
  const tail = digits.slice(-10);
  const esc = tail.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    const hits = await pb.collection(BISNIS_COLLECTIONS.customers).getList<Customer>(1, 10, {
      filter: `phone ~ "${esc}"`,
      sort: "-updated",
      requestKey: null,
    });
    const exact = hits.items.find((c) => normalizePhoneDigits(c.phone ?? "") === digits);
    if (exact) return exact;
    const suffix = hits.items.find((c) => normalizePhoneDigits(c.phone ?? "").endsWith(digits.slice(-8)));
    return suffix ?? hits.items[0] ?? null;
  } catch {
    return null;
  }
}
