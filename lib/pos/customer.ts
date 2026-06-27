import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { BISNIS_COLLECTIONS, type Customer } from "@/lib/bisnis/types";

const DEFAULT_NAME = "Pelanggan Umum";
const DEFAULT_PHONE = "0800000000";

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Cari pelanggan by telepon, atau buat baru (POS — server admin PB). */
export async function findOrCreatePosCustomer(opts: {
  name?: string;
  phone?: string;
  email?: string;
}): Promise<Customer> {
  const name = (opts.name?.trim() || DEFAULT_NAME).slice(0, 200);
  const phoneRaw = opts.phone?.trim() ?? "";
  const digits = phoneRaw.replace(/\D/g, "");

  const pb = await getInventoryAdminPb();

  if (digits.length >= 8) {
    try {
      const hits = await pb.collection(BISNIS_COLLECTIONS.customers).getList<Customer>(1, 1, {
        filter: `phone ~ "${esc(digits.slice(-10))}"`,
        sort: "-updated",
      });
      if (hits.items[0]) {
        const c = hits.items[0];
        if (!c.name?.trim() || c.name === c.phone) {
          await pb.collection(BISNIS_COLLECTIONS.customers).update(c.id, { name });
        }
        return c;
      }
    } catch {
      /* lanjut buat baru */
    }
  }

  const phoneForRecord = phoneRaw || DEFAULT_PHONE;

  const slug =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 6) || "POS";
  const code = `POS-${slug}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

  return pb.collection(BISNIS_COLLECTIONS.customers).create<Customer>({
    code,
    name,
    phone: phoneForRecord,
    email: opts.email?.trim() || undefined,
    customer_type: "regular",
    is_active: true,
  });
}
