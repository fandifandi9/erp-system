// Migrasi retur lama (model mutasi total) ke model nota kredit (akrual):
// - RET-062026-00002: pulihkan total/subtotal invoice & SO asli, terbitkan nota kredit.
// - SO-062026-00016: backfill payment_status dari status invoice.
// Jalankan: node scripts/migrate-legacy-retur-to-cn.mjs
import PocketBase from "pocketbase";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
}
const url = env.NEXT_PUBLIC_POCKETBASE_URL.replace(/\/$/, "");
const pb = new PocketBase(url);
pb.autoCancellation(false);
const res = await fetch(`${url}/api/admins/auth-with-password`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
});
const auth = await res.json();
pb.authStore.save(auth.token, auth.admin ?? {});

// ── 1. Migrasi RET-062026-00002 ──
const retur = await pb.collection("biz_returs").getOne("qqozxr61cle1wz7");
const refundTotal = Number(retur.total) || 0; // 250000
const mpClaim = Number(retur.mp_claim_amount) || 0; // 50000
const net = refundTotal - mpClaim; // 200000

const existingCn = await pb.collection("biz_credit_notes").getFullList({
  filter: `retur = "${retur.id}"`,
  requestKey: null,
});
if (existingCn.length > 0) {
  console.log("Skip: nota kredit untuk retur ini sudah ada");
} else {
  const so = await pb.collection("biz_sales_orders").getOne(retur.sales_order);
  const inv = await pb.collection("biz_invoices").getOne(retur.invoice);

  // Pulihkan nilai asli dokumen (model lama: total dikurangi refund, ditambah klaim MP).
  const origSoTotal = Math.round((so.total ?? 0) + refundTotal - mpClaim);
  const origSoSubtotal = Math.round((so.subtotal ?? 0) + refundTotal);
  const origInvTotal = Math.round((inv.total ?? 0) + refundTotal - mpClaim);
  const origInvSubtotal = Math.round((inv.subtotal ?? 0) + refundTotal);

  // Model akrual: kurangi piutang dulu, sisanya refund tunai.
  const paid = Number(inv.paid_amount) || 0;
  const origRemaining = Math.max(0, origInvTotal - paid);
  const newRemaining = Math.max(0, origRemaining - net);
  const applied = origRemaining - newRemaining;
  const refunded = Math.max(0, Math.min(net - applied, paid));
  const newPaid = paid - refunded;

  await pb.collection("biz_sales_orders").update(so.id, {
    total: origSoTotal,
    subtotal: origSoSubtotal,
  });
  await pb.collection("biz_invoices").update(inv.id, {
    total: origInvTotal,
    subtotal: origInvSubtotal,
    paid_amount: newPaid,
    remaining: newRemaining,
    status: newRemaining <= 0 ? "paid" : inv.status,
  });

  const cnDate = (retur.completed_at || new Date().toISOString()).slice(0, 10);
  const cn = await pb.collection("biz_credit_notes").create({
    cn_no: "CN-062026-00001",
    retur: retur.id,
    invoice: inv.id,
    sales_order: so.id,
    cn_date: cnDate,
    amount: net,
    applied_to_receivable: applied,
    refunded,
    status: "issued",
    reason: `Migrasi retur ${retur.retur_no} ke model nota kredit`,
    created_by: retur.created_by || undefined,
  });
  console.log(`OK: ${cn.cn_no} dibuat (amount=${net}, applied=${applied}, refunded=${refunded})`);
  console.log(`OK: SO dipulihkan subtotal=${origSoSubtotal} total=${origSoTotal}`);
  console.log(`OK: Invoice dipulihkan subtotal=${origInvSubtotal} total=${origInvTotal} remaining=${newRemaining}`);
}

// ── 2. Backfill payment_status SO-062026-00016 ──
const so16 = await pb.collection("biz_sales_orders").getOne("57ed34y5hwss38k");
if (!so16.payment_status) {
  const invs = await pb.collection("biz_invoices").getFullList({
    filter: `sales_order = "${so16.id}" && status != "cancelled"`,
    requestKey: null,
  });
  const inv = invs[0];
  if (inv) {
    const paidFull = inv.status === "paid" || Number(inv.remaining) <= 0;
    const ps = paidFull ? "paid" : Number(inv.paid_amount) > 0 ? "partial" : "unpaid";
    await pb.collection("biz_sales_orders").update(so16.id, { payment_status: ps });
    console.log(`OK: ${so16.order_no} payment_status -> ${ps}`);
  } else {
    console.log(`Skip: ${so16.order_no} tidak punya invoice`);
  }
} else {
  console.log(`Skip: ${so16.order_no} payment_status sudah ${so16.payment_status}`);
}

console.log("Selesai.");
