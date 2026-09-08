/**
 * Next standalone does not include public/ or .next/static.
 * After `next build`, copy both into the standalone tree or JS/CSS/logo 404.
 *
 * Local packaging only. Does not SSH, deploy, or touch production.
 *
 * Usage: node scripts/copy-standalone-assets.mjs [projectRoot]
 */
import { cp, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const standalone = path.join(root, ".next", "standalone");
const srcStatic = path.join(root, ".next", "static");
const destStatic = path.join(standalone, ".next", "static");
const srcPublic = path.join(root, "public");
const destPublic = path.join(standalone, "public");

async function mustExist(p, label) {
  try {
    await access(p);
  } catch {
    console.error(`Missing ${label}: ${p}`);
    console.error("Run `npm run build` first, or pass the built project root.");
    process.exit(1);
  }
}

await mustExist(standalone, "standalone output");
await mustExist(srcStatic, ".next/static");
await mustExist(srcPublic, "public");

await mkdir(path.join(standalone, ".next"), { recursive: true });
await cp(srcStatic, destStatic, { recursive: true, force: true });
await cp(srcPublic, destPublic, { recursive: true, force: true });

console.log("Copied .next/static -> .next/standalone/.next/static");
console.log("Copied public -> .next/standalone/public");
console.log("Required after every production/staging standalone build.");
console.log("Includes systemLogo.png and systemLogoWide.png.");
