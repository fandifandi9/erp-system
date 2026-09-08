/**
 * Cek referensi ke gudang sebelum delete.
 * Run: node scripts/check-warehouse-refs.mjs [warehouseId]
 */
import fs from "fs";
import path from "path";

const WH = process.argv[2] || "rsw6o23jmqfkbp";
const LIST = process.argv.includes("--list");

function loadEnv() {
  const out = {};
  for (const name of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), name);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[m[1]] = v;
    }
    break;
  }
  return out;
}

const env = loadEnv();
const PB = env.NEXT_PUBLIC_POCKETBASE_URL.replace(/\/$/, "");

const auth = await fetch(`${PB}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
}).then((r) => r.json());

const token = auth.token;
if (!token) {
  console.error("Admin auth gagal");
  process.exit(1);
}

if (LIST) {
  const list = await fetch(`${PB}/api/collections/inv_warehouses/records?perPage=100&sort=code`, {
    headers: { Authorization: token },
  }).then((r) => r.json());
  for (const w of list.items || []) {
    console.log(`${w.id}\t${w.code}\t${w.name}\taktif=${w.is_active}`);
  }
  process.exit(0);
}

const whRes = await fetch(`${PB}/api/collections/inv_warehouses/records/${WH}`, {
  headers: { Authorization: token },
});
const wh = await whRes.json();
if (!whRes.ok) {
  console.error("Gudang tidak ditemukan:", WH, wh);
  process.exit(1);
}

console.log(`Gudang: ${wh.name} (${wh.code}) | aktif=${wh.is_active} | role=${wh.warehouse_role}`);

const checks = [
  ["inv_stock_balances", "warehouse", "Saldo stok"],
  ["inv_stock_movements", "warehouse", "Mutasi stok"],
  ["inv_stock_movements", "from_warehouse", "Mutasi (dari gudang)"],
  ["inv_stock_movements", "to_warehouse", "Mutasi (ke gudang)"],
  ["inv_zones", "warehouse", "Zona gudang"],
  ["biz_stores", "default_warehouse", "Toko (default gudang)"],
  ["biz_sales_orders", "warehouse", "Sales Order"],
  ["biz_purchase_orders", "warehouse", "Purchase Order"],
  ["inv_packing_stations", "warehouse", "Meja packing"],
  ["inv_packing_sessions", "warehouse", "Sesi packing"],
  ["inv_zone_sessions", "warehouse", "Sesi zona"],
  ["inv_user_warehouse_access", "warehouse", "Akses user gudang"],
  ["inv_product_placements", "warehouse", "Penempatan produk"],
  ["inv_opname_sessions", "warehouse", "Opname"],
  ["inv_staff_activities", "warehouse", "Aktivitas staff"],
];

console.log("\nReferensi yang menghalangi hapus:");
let total = 0;
for (const [col, field, label] of checks) {
  const filter = `${field} = "${WH.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  const r = await fetch(
    `${PB}/api/collections/${col}/records?perPage=1&filter=${encodeURIComponent(filter)}`,
    { headers: { Authorization: token } },
  );
  const j = await r.json();
  const n = j.totalItems ?? 0;
  if (n > 0) {
    console.log(`  - ${label}: ${n} record (${col}.${field})`);
    total += n;
  }
}
if (total === 0) console.log("  (tidak ada referensi umum — cek rule delete PB atau field lain)");
