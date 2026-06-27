// Inspeksi data retur lama + SO bermasalah (temuan audit B1/B9).
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

const returs = await pb.collection("biz_returs").getFullList({ requestKey: null });
for (const r of returs) {
  console.log("RETUR:", JSON.stringify({
    id: r.id, no: r.retur_no, status: r.status, total: r.total,
    mp_claim: r.mp_claim_amount, shipping_reimb: r.shipping_reimb_amount,
    so: r.sales_order, invoice: r.invoice, completed_at: r.completed_at,
  }));
}

const so = await pb.collection("biz_sales_orders").getOne("57ed34y5hwss38k").catch(() => null);
if (so) {
  console.log("SO 57ed:", JSON.stringify({
    id: so.id, no: so.so_no ?? so.order_no, status: so.status, subtotal: so.subtotal,
    total: so.total, payment_status: so.payment_status ?? "(kosong)",
  }));
}

const sos = await pb.collection("biz_sales_orders").getFullList({ filter: 'order_no ~ "SO-062026-00004"', requestKey: null });
for (const s of sos) {
  console.log("SO-00004:", JSON.stringify({
    id: s.id, no: s.order_no, status: s.status, subtotal: s.subtotal, total: s.total,
    payment_status: s.payment_status ?? "(kosong)",
  }));
  const invs = await pb.collection("biz_invoices").getFullList({ filter: `sales_order = "${s.id}"`, requestKey: null });
  for (const i of invs) {
    console.log("  INV:", JSON.stringify({
      id: i.id, no: i.invoice_no, status: i.status, subtotal: i.subtotal, total: i.total,
      paid: i.paid_amount, remaining: i.remaining, is_cash: i.is_cash,
    }));
    const pays = await pb.collection("biz_payments").getFullList({ filter: `invoice = "${i.id}"`, requestKey: null });
    for (const p of pays) {
      console.log("    PAY:", JSON.stringify({ id: p.id, amount: p.amount, kind: p.payment_kind, ref: p.reference_no }));
    }
  }
}
