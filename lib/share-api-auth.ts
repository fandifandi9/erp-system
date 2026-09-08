import { getApiAuthUser } from "@/lib/inventory/api-auth";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

/**
 * Share by record ID — wajib login ATAU token share valid yang cocok dengan record.
 */
export async function assertShareAccess(
  req: Request,
  opts: {
    collection: string;
    recordId: string;
    /** Jika set, query ?token= harus cocok dengan field share_token record. */
    shareTokenField?: "share_token";
  },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();

  if (token && opts.shareTokenField === "share_token") {
    try {
      const adminPb = await getInventoryAdminPb();
      const esc = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const rec = await adminPb.collection(opts.collection).getFirstListItem(
        `share_token = "${esc}"`,
        { fields: "id", requestKey: null },
      );
      if (rec.id !== opts.recordId) {
        return { ok: false, status: 403, error: "Token share tidak cocok dengan dokumen" };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 403, error: "Token share tidak valid" };
    }
  }

  const auth = await getApiAuthUser(req);
  if (!auth) {
    return {
      ok: false,
      status: 403,
      error: "Akses ditolak. Gunakan link share dengan token atau login sebagai staff.",
    };
  }

  try {
    const adminPb = await getInventoryAdminPb();
    await adminPb.collection(opts.collection).getOne(opts.recordId);
    return { ok: true };
  } catch {
    return { ok: false, status: 404, error: "Dokumen tidak ditemukan" };
  }
}
