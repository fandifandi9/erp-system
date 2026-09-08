import { ClientResponseError } from "pocketbase";

/** Body error API PocketBase: { message, data } di root. */
type PocketApiErrorBody = {
  message?: string;
  data?: Record<string, unknown>;
};

/** Terjemahkan pesan umum PocketBase (Inggris) ke Indonesia untuk UI. */
function translatePocketBaseUserMessage(msg: string, fieldKey?: string): string {
  const m = msg.trim();
  const map: [RegExp | string, string][] = [
    [
      /^Something went wrong while processing your request\.?$/i,
      "Terjadi kesalahan saat memproses permintaan. Periksa data yang dikirim atau aturan API di PocketBase.",
    ],
    [/^Something went wrong\.?$/i, "Terjadi kesalahan. Coba lagi atau hubungi admin."],
    [/^Failed to update record\.?$/i, "Gagal memperbarui data."],
    [/^Failed to create record\.?$/i, "Gagal membuat data."],
    [/^Failed to delete record\.?$/i, "Gagal menghapus data."],
    [/^The request was invalid or cannot be otherwise served\.?$/i, "Permintaan tidak valid."],
    [/^Invalid login credentials\.?$/i, "Email atau kata sandi salah."],
    [/invalid old password/i, "Kata sandi lama salah."],
    [/passwords?\s*don'?t\s*match/i, "Kata sandi baru dan konfirmasi tidak sama."],
    [/wasn't found\.?$/i, "Data tidak ditemukan."],
    [/^Missing required record id\.?$/i, "ID data wajib diisi."],
    [
      /invalid value/i,
      fieldKey === "status"
        ? "Nilai status tidak valid — tambahkan opsi unpaid, paid, overdue, cancelled di biz_invoices (Admin) atau jalankan: npm run pb:bisnis-status"
        : fieldKey === "line_group" || fieldKey === "calc_type"
          ? "Nilai select tidak valid — line_group: mp_fee, operational, category, product · calc_type: percent, percent_cap, fixed, fixed_per_qty (atau npm run pb:fee-lines)"
          : "Nilai field tidak valid — cek opsi Select di PocketBase.",
    ],
    [/must be unique/i, "Kode sudah dipakai — coba ubah nama biaya."],
  ];
  for (const [pattern, id] of map) {
    if (typeof pattern === "string") {
      if (m === pattern) return id;
    } else if (pattern.test(m)) return id;
  }
  return m;
}

const FIELD_LABEL_ID: Record<string, string> = {
  oldPassword: "Kata sandi lama",
  password: "Kata sandi baru",
  passwordConfirm: "Konfirmasi kata sandi",
  email: "Email",
  name: "Nama",
  rate: "Rate (%)",
  max_amount: "Max (Rp)",
  fixed_amount: "Nominal (Rp)",
  line_group: "Grup biaya",
  calc_type: "Cara hitung",
  applies_to: "Berlaku untuk",
  template: "Template",
  internal_category: "Kategori produk",
  status: "Status",
};

/** Detail validasi per-field dari body error PocketBase (400). */
function formatPocketBaseFieldErrors(block: Record<string, unknown> | undefined): string {
  if (!block || typeof block !== "object") return "";
  const lines: string[] = [];
  for (const [key, val] of Object.entries(block)) {
    const label = FIELD_LABEL_ID[key] || key;
    if (typeof val === "string" && val.trim()) {
      lines.push(`• ${label}: ${translatePocketBaseUserMessage(val, key)}`);
      continue;
    }
    if (val && typeof val === "object" && "message" in val) {
      const inner = (val as { message?: unknown }).message;
      if (typeof inner === "string" && inner.trim()) {
        lines.push(`• ${label}: ${translatePocketBaseUserMessage(inner.trim(), key)}`);
      }
    }
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}

/** Koneksi ke PocketBase putus / server tidak bisa dijangkau (bukan salah password). */
export function isPocketBaseUnreachable(error: unknown): boolean {
  if (error instanceof ClientResponseError && error.status === 0) return true;
  if (error instanceof TypeError && String(error.message).includes("fetch")) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network error|connection closed|load failed|err_connection/i.test(msg);
}

/** Sesi auth tidak valid — logout wajar. */
export function isPocketBaseAuthError(error: unknown): boolean {
  if (error instanceof ClientResponseError) {
    return error.status === 401 || error.status === 403;
  }
  return false;
}

/** Safe message for logging / UI from caught unknown errors. */
export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan"): string {
  if (error instanceof ClientResponseError) {
    // Di JS SDK, `error.data` / `error.response` = body JSON API { message, data }.
    const api = (error.data ?? error.response) as PocketApiErrorBody | undefined;
    const fieldDetail = formatPocketBaseFieldErrors(api?.data);

    if (error.status === 403 || error.status === 401) {
      return (
        `Akses ditolak (${error.status}). Periksa rule PocketBase untuk koleksi ini atau login ulang.` + fieldDetail
      );
    }
    if (error.status === 404) {
      return "Data tidak ditemukan di PocketBase (404)." + fieldDetail;
    }
    if (error.message?.includes("Failed to fetch") || error.status === 0) {
      return "Tidak terhubung ke PocketBase. Periksa URL jaringan dan pastikan server PocketBase berjalan.";
    }

    const rawHead =
      api?.message && typeof api.message === "string" && api.message.trim()
        ? api.message.trim()
        : (error.message && !error.message.startsWith("ClientResponseError")
            ? error.message.trim()
            : "") || fallback;

    const head = translatePocketBaseUserMessage(rawHead === fallback ? "" : rawHead) || rawHead;

    return head + fieldDetail;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}
