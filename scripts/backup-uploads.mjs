/**
 * Backup folder upload lokal (WMS photos, dll).
 * Run: npm run backup:uploads
 * Output: backups/uploads/uploads-YYYY-MM-DDTHH-mm-ss.tar.gz (via tar jika tersedia)
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const uploadRoots = [
  path.join(process.cwd(), "public", "uploads"),
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(process.cwd(), "backups", "uploads");
fs.mkdirSync(outDir, { recursive: true });

const existing = uploadRoots.filter((p) => fs.existsSync(p));
if (!existing.length) {
  console.log("Tidak ada folder upload — lewati backup.");
  process.exit(0);
}

const outArchive = path.join(outDir, `uploads-${stamp}.tar.gz`);
const cwd = process.cwd();
const relPaths = existing.map((p) => path.relative(cwd, p).replace(/\\/g, "/"));

try {
  execSync(`tar -czf "${outArchive}" ${relPaths.map((r) => `"${r}"`).join(" ")}`, {
    cwd,
    stdio: "inherit",
  });
  console.log(`OK: ${outArchive}`);
} catch {
  const fallback = path.join(outDir, `uploads-${stamp}`);
  fs.mkdirSync(fallback, { recursive: true });
  for (const src of existing) {
    const dest = path.join(fallback, path.basename(src));
    fs.cpSync(src, dest, { recursive: true });
  }
  console.log(`OK (copy): ${fallback}`);
  console.warn("tar tidak tersedia — gunakan salinan folder.");
}
