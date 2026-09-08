/** Kode validasi form tambah pelanggan cepat. */
export type QuickCustomerValidationError = "name" | "phone" | "emailFormat";

/** Validasi form tambah pelanggan cepat (penjualan, dll.). Nama wajib; telepon & email opsional. */
export function validateQuickCustomerInput(input: {
  name: string;
  phone: string;
  email: string;
}): QuickCustomerValidationError | null {
  const name = input.name.trim();
  if (name.length < 2) return "name";

  const phoneDigits = input.phone.replace(/\D/g, "");
  if (phoneDigits.length > 0 && phoneDigits.length < 8) return "phone";

  const email = input.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "emailFormat";

  return null;
}

export function buildQuickCustomerCode(name: string): string {
  const slug =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 8) || "BARU";
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  return `CUS-${slug}-${suffix}`;
}
