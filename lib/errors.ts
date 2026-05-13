import { ClientResponseError } from "pocketbase";

/** Body error API PocketBase: { message, data } di root. */
type PocketApiErrorBody = {
  message?: string;
  data?: Record<string, unknown>;
};

/** Terjemahkan pesan umum PocketBase (Inggris) ke Indonesia untuk UI. */
function translatePocketBaseUserMessage(msg: string): string {
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
};

/** Detail validasi per-field dari body error PocketBase (400). */
function formatPocketBaseFieldErrors(block: Record<string, unknown> | undefined): string {
  if (!block || typeof block !== "object") return "";
  const lines: string[] = [];
  for (const [key, val] of Object.entries(block)) {
    const label = FIELD_LABEL_ID[key] || key;
    if (typeof val === "string" && val.trim()) {
      lines.push(`• ${label}: ${translatePocketBaseUserMessage(val)}`);
      continue;
    }
    if (val && typeof val === "object" && "message" in val) {
      const inner = (val as { message?: unknown }).message;
      if (typeof inner === "string" && inner.trim()) {
        lines.push(`• ${label}: ${translatePocketBaseUserMessage(inner.trim())}`);
      }
    }
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
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
