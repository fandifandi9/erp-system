const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

function sniffLogo(bytes: Uint8Array): string | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (bytes.length > 12 && startsWith(bytes, WEBP_RIFF) && bytes[8] === 0x57 && bytes[9] === 0x45) {
    return "image/webp";
  }
  return null;
}

export function validateEntityLogoBytes(
  bytes: Uint8Array,
  declaredMime: string,
  originalName: string,
): { ok: true; mime: string } | { ok: false; error: string } {
  if (!bytes.length) return { ok: false, error: "File logo kosong." };
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "Logo maksimal 2 MB." };
  const name = String(originalName ?? "").toLowerCase();
  if (/\.(exe|bat|cmd|sh|js|php|html)$/.test(name)) {
    return { ok: false, error: "Jenis file tidak diizinkan." };
  }
  const sniffed = sniffLogo(bytes);
  if (!sniffed) return { ok: false, error: "Logo harus PNG, JPEG, atau WebP." };
  const declared = String(declaredMime ?? "").toLowerCase();
  if (declared && !declared.startsWith("image/")) {
    return { ok: false, error: "MIME logo tidak valid." };
  }
  return { ok: true, mime: sniffed };
}
