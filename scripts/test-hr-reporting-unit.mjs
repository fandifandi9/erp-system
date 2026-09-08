/**
 * Phase 13 — attachment validation unit tests (no PB).
 * Keep in sync with lib/hr/reporting-validate.ts
 * Run: npm run test:hr-reporting-unit
 */

const MAX = 10 * 1024 * 1024;

function sniff(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function validate(bytes, declaredMime) {
  if (!bytes.length) return { ok: false, error: "File kosong." };
  if (bytes.length > MAX) return { ok: false, error: "Ukuran file melebihi 10 MB." };
  const sniffed = sniff(bytes);
  if (!sniffed) return { ok: false, error: "Tipe file tidak diizinkan. Gunakan JPEG, PNG, atau WebP." };
  const declared = String(declaredMime || "").toLowerCase().split(";")[0].trim();
  if (declared && declared !== "application/octet-stream" && declared !== sniffed) {
    if (!(declared === "image/jpg" && sniffed === "image/jpeg")) {
      return { ok: false, error: "Tipe file tidak sesuai isi file." };
    }
  }
  return { ok: true, mime: sniffed };
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

const results = [];
function record(test, expected, actual, pass) {
  results.push({ test, result: pass ? "PASS" : "FAIL" });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${test}`);
  if (!pass) {
    console.log("  Expected:", expected);
    console.log("  Actual:", actual);
  }
}

{
  const r = validate(PNG, "image/png");
  record("PNG accepted", true, r.ok, r.ok === true && r.mime === "image/png");
}
{
  const r = validate(PNG, "image/jpeg");
  record("MIME mismatch rejected", false, r.ok, r.ok === false);
}
{
  const r = validate(EXE, "application/octet-stream");
  record("Executable rejected", false, r.ok, r.ok === false);
}
{
  const r = validate(Buffer.alloc(0), "image/png");
  record("Empty rejected", false, r.ok, r.ok === false);
}
{
  const r = validate(Buffer.alloc(MAX + 1, 0xff), "image/jpeg");
  record("Oversize rejected", false, r.ok, r.ok === false);
}

const fail = results.filter((r) => r.result === "FAIL").length;
console.log(`\nPASS=${results.filter((r) => r.result === "PASS").length} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
