/**
 * Regenerasi aset logo dari gambar sumber (ikon + horizontal).
 *
 * Ikon persegi 1024×1024 transparan: logo di-center dan diskalakan agar
 * SELURUH bounding box-nya muat di lingkaran safe-zone adaptive icon Android
 * (diameter ±61% kanvas) — aman dari mask bundar/squircle launcher mana pun.
 *
 * Output tambahan:
 * - systemLogoIos.png  : versi latar putih opaque (iOS tidak dukung alpha).
 * - preview-circle.png / preview-squircle.png : simulasi launcher Android.
 *
 * Jalankan: node scripts/update-logo-assets.mjs <iconSrc> <wideSrc>
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [iconSrc, wideSrc] = process.argv.slice(2);
if (!iconSrc || !wideSrc) {
  console.error("Usage: node scripts/update-logo-assets.mjs <iconSrc> <wideSrc>");
  process.exit(1);
}

const CANVAS = 1024;
// Safe zone adaptive icon: lingkaran 66/108 ≈ 61% — pakai 60% untuk margin.
const SAFE_CIRCLE = CANVAS * 0.6;

async function fitToSafeCircle() {
  const meta = await sharp(iconSrc).metadata();
  const ratio = meta.height / meta.width;
  // Diagonal bounding box logo harus ≤ diameter lingkaran safe zone.
  const w = Math.floor(SAFE_CIRCLE / Math.sqrt(1 + ratio * ratio));
  const h = Math.round(w * ratio);
  return sharp(iconSrc).resize(w, h, { fit: "inside" }).png().toBuffer();
}

async function buildSquareIcons() {
  const logo = await fitToSafeCircle();

  const transparent = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();

  for (const [out, size] of [
    ["public/systemLogo.png", CANVAS],
    ["mobile/assets/systemLogo.png", CANVAS],
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-192.png", 192],
  ]) {
    await mkdir(path.dirname(out), { recursive: true });
    await sharp(transparent).resize(size, size).png().toFile(out);
    console.log("wrote", out, `${size}x${size}`);
  }

  // iOS: wajib opaque — latar putih, logo sedikit lebih besar (70% lebar).
  const logoIos = await sharp(iconSrc)
    .resize(Math.round(CANVAS * 0.7), Math.round(CANVAS * 0.7), { fit: "inside" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 3, background: "#ffffff" },
  })
    .composite([{ input: logoIos, gravity: "center" }])
    .png()
    .toFile("mobile/assets/systemLogoIos.png");
  console.log("wrote mobile/assets/systemLogoIos.png 1024x1024 (opaque)");

  await buildLauncherPreviews(transparent);
}

/** Simulasi launcher Android: bg putih + foreground, dipotong mask. */
async function buildLauncherPreviews(foreground) {
  const full = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: foreground }])
    .png()
    .toBuffer();

  const circle = Buffer.from(
    `<svg width="${CANVAS}" height="${CANVAS}"><circle cx="512" cy="512" r="512" fill="#fff"/></svg>`
  );
  const squircle = Buffer.from(
    `<svg width="${CANVAS}" height="${CANVAS}"><rect width="1024" height="1024" rx="280" fill="#fff"/></svg>`
  );

  for (const [name, mask] of [
    ["preview-circle.png", circle],
    ["preview-squircle.png", squircle],
  ]) {
    const masked = await sharp(full)
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    await sharp(masked).resize(320, 320).png().toFile(path.join("scripts", name));
    console.log("wrote scripts/" + name);
  }
}

/**
 * Latar putih → transparan tanpa mengubah warna asli.
 * Mask alpha dihitung manual di JS (kontrol penuh — urutan operasi sharp
 * tidak bisa diandalkan: `linear` selalu dieksekusi sebelum `negate`).
 * Crop bbox juga dihitung manual dari mask, tanpa sharp.trim().
 */
async function buildWideLogo() {
  const rgb = await sharp(wideSrc).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = rgb.info;

  // Sumber upload ber-latar HITAM (transparansi PNG asli di-flatten ke hitam saat
  // dikonversi JPEG). Mask: jarak-ke-hitam d ≤ 12 (noise JPEG) → transparan;
  // d ≥ 36 → opaque (teks gelap #262626 punya d≈38); ramp halus di antaranya.
  // Warna brand persis seperti di ikon sumber (di-sample dari PNG transparan asli).
  const BRAND_YELLOW = [255, 193, 7];
  const BRAND_BLACK = [26, 26, 26];

  const mask = Buffer.alloc(W * H);
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let p = 0; p < W * H; p++) {
    const i = p * 3;
    const r = rgb.data[i], g = rgb.data[i + 1], b = rgb.data[i + 2];
    const d = Math.max(r, g, b);
    // Konten solid mulai d ≥ 26 (teks #1A1A1A); noise JPEG di latar ≤ 10.
    const a = d <= 10 ? 0 : d >= 26 ? 255 : Math.round(((d - 10) / 16) * 255);
    mask[p] = a;
    if (a > 0) {
      // Dua-tone: klasifikasikan kuning vs hitam, tulis warna brand persis
      // agar identik dengan ikon (sumber JPEG-on-black merusak warna asli).
      const tone = r - b > 40 ? BRAND_YELLOW : BRAND_BLACK;
      rgb.data[i] = tone[0];
      rgb.data[i + 1] = tone[1];
      rgb.data[i + 2] = tone[2];
      const x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  // PENTING: jangan pakai removeAlpha() di chain ini — sharp mengeksekusinya
  // SETELAH joinChannel (urutan pipeline internal), sehingga mask alpha ikut terhapus.
  const trimmed = await sharp(rgb.data, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(mask, { raw: { width: W, height: H, channels: 1 } })
    .extract({ left: minX, top: minY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  for (const out of ["public/systemLogoWide.png", "mobile/assets/systemLogoWide.png"]) {
    await sharp(trimmed).toFile(out);
    console.log("wrote", out, `${cropW}x${cropH}`);
  }
  console.log("WIDE_ASPECT", cropW, "/", cropH, "=", (cropW / cropH).toFixed(4));
}

await buildSquareIcons();
await buildWideLogo();
console.log("done");
