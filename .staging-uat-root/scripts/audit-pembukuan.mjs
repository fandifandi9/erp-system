// Audit konsistensi pembukuan pembelian & penjualan di PocketBase.
// Jalankan: node scripts/audit-pembukuan.mjs
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

const N = (v) => Number(v) || 0;
const money = (v) => Math.round(N(v));
const TOL = 2; // toleransi pembulatan Rp2

async function all(col, opts = {}) {
  try {
    return await pb.collection(col).getFullList({ requestKey: null, ...opts });
  } catch (e) {
    console.log(`!! gagal baca ${col}: ${e.message}`);
    return [];
  }
}

const [pos, poLines, bills, billPays, sos, soLines, invoices, payments, movements, expenses, returs, cashAccounts, creditNotes, stores, warehouses] =
  await Promise.all([
    all("biz_purchase_orders"),
    all("biz_purchase_order_lines"),
    all("biz_purchase_bills"),
    all("biz_bill_payments"),
    all("biz_sales_orders"),
    all("biz_sales_order_lines"),
    all("biz_invoices"),
    all("biz_payments"),
    all("inv_stock_movements"),
    all("biz_expenses"),
    all("biz_returs"),
    all("biz_cash_accounts"),
    all("biz_credit_notes"),
    all("biz_stores"),
    all("inv_warehouses"),
  ]);

console.log("=== VOLUME DATA ===");
console.log(
  JSON.stringify(
    {
      purchase_orders: pos.length,
      purchase_order_lines: poLines.length,
      purchase_bills: bills.length,
      bill_payments: billPays.length,
      sales_orders: sos.length,
      sales_order_lines: soLines.length,
      invoices: invoices.length,
      payments: payments.length,
      stock_movements: movements.length,
      expenses: expenses.length,
      returs: returs.length,
      credit_notes: creditNotes.length,
    },
    null,
    2,
  ),
);

const findings = [];
function flag(code, desc, items) {
  findings.push({ code, desc, count: items.length, sample: items.slice(0, 8) });
}

// ───────────────────────── PEMBELIAN ─────────────────────────

// A1: subtotal PO vs jumlah line_total
{
  const linesByPo = new Map();
  for (const l of poLines) {
    const k = l.purchase_order;
    linesByPo.set(k, N(linesByPo.get(k)) + N(l.line_total));
  }
  const bad = [];
  for (const po of pos) {
    if (po.status === "cancelled") continue;
    const sum = N(linesByPo.get(po.id));
    if (Math.abs(sum - N(po.subtotal)) > TOL) {
      bad.push(`${po.po_no ?? po.id}: subtotal=${money(po.subtotal)} vs Σline=${money(sum)}`);
    }
  }
  flag("A1", "PO: subtotal ≠ jumlah line_total", bad);
}

// A2: line_total vs qty × unit_cost (tanpa diskon baris → harus ≤)
{
  const bad = [];
  for (const l of poLines) {
    const expect = N(l.qty) * N(l.unit_cost);
    if (N(l.line_total) - expect > TOL) {
      bad.push(`line ${l.id}: line_total=${money(l.line_total)} > qty×cost=${money(expect)}`);
    }
  }
  flag("A2", "PO line: line_total melebihi qty×unit_cost", bad);
}

// A3: bill: paid_amount + remaining ≠ total
{
  const bad = [];
  for (const b of bills) {
    if (b.status === "cancelled") continue;
    if (Math.abs(N(b.paid_amount) + N(b.remaining) - N(b.total)) > TOL) {
      bad.push(
        `${b.bill_no ?? b.id}: total=${money(b.total)} paid=${money(b.paid_amount)} remaining=${money(b.remaining)}`,
      );
    }
  }
  flag("A3", "Bill: paid + remaining ≠ total", bad);
}

// A4: status bill vs remaining tidak sinkron
{
  const bad = [];
  for (const b of bills) {
    if (b.status === "paid" && N(b.remaining) > TOL) {
      bad.push(`${b.bill_no ?? b.id}: status=paid tapi remaining=${money(b.remaining)}`);
    }
    if ((b.status === "unpaid" || b.status === "overdue") && N(b.remaining) <= 0 && N(b.total) > 0) {
      bad.push(`${b.bill_no ?? b.id}: status=${b.status} tapi remaining=0`);
    }
  }
  flag("A4", "Bill: status tidak sinkron dengan remaining", bad);
}

// A5: bill vs total PO
{
  const poById = new Map(pos.map((p) => [p.id, p]));
  const bad = [];
  for (const b of bills) {
    if (b.status === "cancelled") continue;
    const po = poById.get(b.purchase_order);
    if (po && Math.abs(N(po.total) - N(b.total)) > TOL) {
      bad.push(`${b.bill_no ?? b.id}: bill total=${money(b.total)} vs PO total=${money(po.total)}`);
    }
  }
  flag("A5", "Bill total ≠ PO total (cek retur/diskon)", bad);
}

// A6: bill aktif tanpa stok IN posted
{
  const postedIn = new Set(
    movements
      .filter((m) => m.reference_type === "PURCHASE_ORDER" && m.status === "posted" && m.movement_type === "IN")
      .map((m) => m.reference_id),
  );
  const bad = [];
  for (const b of bills) {
    if (b.status === "cancelled" || b.status === "draft") continue;
    if (b.purchase_order && !postedIn.has(b.purchase_order)) {
      bad.push(`${b.bill_no ?? b.id} (PO ${b.purchase_order})`);
    }
  }
  flag("A6", "Bill aktif tanpa stock movement IN posted", bad);
}

// A7: bill cancelled tapi stok IN masih posted (tidak di-void / tanpa OUT pembalik)
{
  const cancelOut = new Set(
    movements
      .filter((m) => m.reference_type === "PURCHASE_CANCEL" && m.status === "posted")
      .map((m) => m.reference_id),
  );
  const postedInByPo = new Map();
  for (const m of movements) {
    if (m.reference_type === "PURCHASE_ORDER" && m.status === "posted" && m.movement_type === "IN") {
      postedInByPo.set(m.reference_id, m.id);
    }
  }
  const bad = [];
  for (const b of bills) {
    if (b.status !== "cancelled" || !b.purchase_order) continue;
    if (postedInByPo.has(b.purchase_order) && !cancelOut.has(b.purchase_order)) {
      bad.push(`${b.bill_no ?? b.id}: IN masih posted tanpa pembalik`);
    }
  }
  flag("A7", "Bill cancelled tapi stok IN tidak dibalik", bad);
}

// A8: Σ bill_payments vs paid_amount bill
{
  const payByBill = new Map();
  for (const p of billPays) {
    payByBill.set(p.purchase_bill, N(payByBill.get(p.purchase_bill)) + N(p.amount));
  }
  const bad = [];
  for (const b of bills) {
    const sum = N(payByBill.get(b.id));
    // is_cash dibayar tanpa record payment — hanya cek bila ada record payment
    if (payByBill.has(b.id) && Math.abs(sum - N(b.paid_amount)) > TOL) {
      bad.push(`${b.bill_no ?? b.id}: Σpayment=${money(sum)} vs paid_amount=${money(b.paid_amount)}`);
    }
  }
  flag("A8", "Bill: Σ bill_payments ≠ paid_amount", bad);
}

// A9: bill belum lunas lewat jatuh tempo tapi status bukan overdue
{
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCashBill = (b) =>
    b.is_cash || (b.bill_date && b.due_date && String(b.bill_date).slice(0, 10) === String(b.due_date).slice(0, 10));
  const bad = [];
  for (const b of bills) {
    if (["paid", "cancelled", "overdue"].includes(b.status)) continue;
    if (isCashBill(b) || !b.due_date) continue;
    const due = new Date(b.due_date);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      bad.push(`${b.bill_no ?? b.id}: due=${String(b.due_date).slice(0, 10)} status=${b.status}`);
    }
  }
  flag("A9", "Bill lewat jatuh tempo tapi status bukan overdue", bad);
}

// A10: diskon header & materai PO tidak tersalin ke bill
{
  const poById = new Map(pos.map((p) => [p.id, p]));
  const bad = [];
  for (const b of bills) {
    if (b.status === "cancelled") continue;
    const po = poById.get(b.purchase_order);
    if (!po) continue;
    if (N(po.discount_amount) > 0 && Math.abs(N(po.discount_amount) - N(b.discount_amount)) > TOL) {
      bad.push(`${b.bill_no ?? b.id}: PO diskon=${money(po.discount_amount)} vs bill=${money(b.discount_amount)}`);
    }
    if (N(po.materai_amount) > 0 && Math.abs(N(po.materai_amount) - N(b.materai_amount)) > TOL) {
      bad.push(`${b.bill_no ?? b.id}: PO materai=${money(po.materai_amount)} vs bill=${money(b.materai_amount)}`);
    }
  }
  flag("A10", "Bill: diskon/materai tidak sama dengan PO", bad);
}

// A11: bill_payment yatim (bill tidak ada / cancelled) atau cash_account tidak valid
{
  const billById = new Map(bills.map((b) => [b.id, b]));
  const cashIds = new Set(cashAccounts.map((c) => c.id));
  const bad = [];
  for (const p of billPays) {
    const b = billById.get(p.purchase_bill);
    if (!b) bad.push(`bill_payment ${p.id}: bill ${p.purchase_bill} tidak ditemukan`);
    else if (b.status === "cancelled") bad.push(`bill_payment ${p.id}: bill ${b.bill_no ?? b.id} cancelled`);
    if (p.cash_account && !cashIds.has(p.cash_account)) {
      bad.push(`bill_payment ${p.id}: cash_account ${p.cash_account} tidak ditemukan`);
    }
  }
  flag("A11", "Bill payment yatim / akun kas tidak valid", bad);
}

// ───────────────────────── PENJUALAN ─────────────────────────

// B1: subtotal SO vs Σ line_total
{
  const linesBySo = new Map();
  for (const l of soLines) {
    linesBySo.set(l.sales_order, N(linesBySo.get(l.sales_order)) + N(l.line_total));
  }
  const bad = [];
  for (const so of sos) {
    if (so.status === "cancelled" || so.status === "draft") continue;
    const sum = N(linesBySo.get(so.id));
    if (Math.abs(sum - N(so.subtotal)) > TOL) {
      bad.push(`${so.so_no ?? so.order_no ?? so.id}: subtotal=${money(so.subtotal)} vs Σline=${money(sum)}`);
    }
  }
  flag("B1", "SO: subtotal ≠ jumlah line_total", bad);
}

// B2: invoice paid + remaining + nota kredit ≠ total (model akrual:
// total asli tidak diubah saat retur; nota kredit menutup selisihnya)
{
  const cnByInvoice = new Map();
  for (const cn of creditNotes) {
    if (cn.status !== "issued" || !cn.invoice) continue;
    cnByInvoice.set(
      cn.invoice,
      N(cnByInvoice.get(cn.invoice)) + N(cn.applied_to_receivable) + N(cn.refunded),
    );
  }
  const bad = [];
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    const credited = N(cnByInvoice.get(inv.id));
    if (Math.abs(N(inv.paid_amount) + N(inv.remaining) + credited - N(inv.total)) > TOL) {
      bad.push(
        `${inv.invoice_no ?? inv.id}: total=${money(inv.total)} paid=${money(inv.paid_amount)} remaining=${money(inv.remaining)} kredit=${money(credited)}`,
      );
    }
  }
  flag("B2", "Invoice: paid + remaining + nota kredit ≠ total", bad);
}

// B3: status invoice vs remaining
{
  const bad = [];
  for (const inv of invoices) {
    if (inv.status === "paid" && N(inv.remaining) > TOL) {
      bad.push(`${inv.invoice_no ?? inv.id}: status=paid tapi remaining=${money(inv.remaining)}`);
    }
    if ((inv.status === "unpaid" || inv.status === "overdue") && N(inv.remaining) <= 0 && N(inv.total) > 0) {
      bad.push(`${inv.invoice_no ?? inv.id}: status=${inv.status} tapi remaining=0`);
    }
  }
  flag("B3", "Invoice: status tidak sinkron dengan remaining", bad);
}

// B4: Σ payments (payment − refund) vs paid_amount
{
  const payByInv = new Map();
  for (const p of payments) {
    const sign = p.payment_kind === "refund" ? -1 : 1;
    payByInv.set(p.invoice, N(payByInv.get(p.invoice)) + sign * N(p.amount));
  }
  const bad = [];
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    if (payByInv.has(inv.id)) {
      const sum = N(payByInv.get(inv.id));
      if (Math.abs(sum - N(inv.paid_amount)) > TOL) {
        bad.push(`${inv.invoice_no ?? inv.id}: Σpayment=${money(sum)} vs paid_amount=${money(inv.paid_amount)}`);
      }
    } else if (N(inv.paid_amount) > TOL && !inv.is_cash) {
      bad.push(`${inv.invoice_no ?? inv.id}: paid_amount=${money(inv.paid_amount)} tanpa record payment`);
    }
  }
  flag("B4", "Invoice: Σ biz_payments ≠ paid_amount", bad);
}

// B5: invoice aktif (ada SO) tanpa stok OUT posted
{
  const postedOut = new Set(
    movements
      .filter((m) => m.reference_type === "SALES_ORDER" && m.status === "posted" && m.movement_type === "OUT")
      .map((m) => m.reference_id),
  );
  const bad = [];
  for (const inv of invoices) {
    if (inv.status === "cancelled" || !inv.sales_order) continue;
    if (!postedOut.has(inv.sales_order)) {
      bad.push(`${inv.invoice_no ?? inv.id} (SO ${inv.sales_order})`);
    }
  }
  flag("B5", "Invoice aktif tanpa stock movement OUT posted", bad);
}

// B6: invoice MP — total_fees snapshot vs expense marketplace
{
  const mpExp = new Map();
  for (const e of expenses) {
    if (e.category === "marketplace" && e.status !== "cancelled") {
      const ref = (e.reference_no ?? "").trim();
      if (ref) mpExp.set(ref, N(mpExp.get(ref)) + N(e.total ?? e.amount));
    }
  }
  const bad = [];
  let mpCount = 0;
  for (const inv of invoices) {
    if (inv.source !== "marketplace_import" || inv.status === "cancelled") continue;
    mpCount++;
    let fees = 0;
    try {
      const j = typeof inv.mp_fees_json === "string" ? JSON.parse(inv.mp_fees_json) : inv.mp_fees_json;
      fees = N(j?.total_fees);
    } catch {
      /* abaikan */
    }
    if (fees <= 0) continue;
    const exp = N(mpExp.get((inv.invoice_no ?? "").trim()));
    if (Math.abs(exp - fees) > TOL) {
      bad.push(`${inv.invoice_no ?? inv.id}: fee snapshot=${money(fees)} vs expense=${money(exp)}`);
    }
  }
  console.log(`(info) invoice marketplace aktif: ${mpCount}`);
  flag("B6", "Invoice MP: fee snapshot ≠ expense marketplace", bad);
}

// B7: invoice is_cash tapi remaining > 0 (tampil lunas, piutang masih tercatat)
{
  const bad = [];
  for (const inv of invoices) {
    if (inv.status === "cancelled") continue;
    if (inv.is_cash && N(inv.remaining) > TOL) {
      bad.push(`${inv.invoice_no ?? inv.id}: is_cash tapi remaining=${money(inv.remaining)}`);
    }
  }
  flag("B7", "Invoice is_cash tapi remaining > 0", bad);
}

// B8: payment yatim (invoice tidak ada / cancelled)
{
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const bad = [];
  for (const p of payments) {
    const inv = invById.get(p.invoice);
    if (!inv) bad.push(`payment ${p.id}: invoice ${p.invoice} tidak ditemukan`);
    else if (inv.status === "cancelled" && p.payment_kind !== "refund")
      bad.push(`payment ${p.id}: invoice ${inv.invoice_no ?? inv.id} cancelled`);
  }
  flag("B8", "Payment yatim / ke invoice cancelled", bad);
}

// B9: payment_status SO vs status invoice
{
  const invBySo = new Map();
  for (const inv of invoices) {
    if (inv.sales_order && inv.status !== "cancelled") invBySo.set(inv.sales_order, inv);
  }
  const bad = [];
  for (const so of sos) {
    if (so.status === "cancelled" || so.status === "draft") continue;
    const inv = invBySo.get(so.id);
    if (!inv) continue;
    const invPaid = inv.status === "paid" || N(inv.remaining) <= 0;
    if (invPaid && so.payment_status !== "paid" && so.payment_status !== "refunded") {
      bad.push(`${so.so_no ?? so.id}: invoice lunas tapi SO payment_status=${so.payment_status}`);
    }
  }
  flag("B9", "SO payment_status tidak ikut update saat invoice lunas", bad);
}

// B10: invoice belum lunas lewat jatuh tempo tapi status bukan overdue
{
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCashInv = (i) =>
    i.is_cash || (i.issue_date && i.due_date && String(i.issue_date).slice(0, 10) === String(i.due_date).slice(0, 10));
  const bad = [];
  for (const inv of invoices) {
    if (["paid", "cancelled", "overdue"].includes(inv.status)) continue;
    if (isCashInv(inv) || !inv.due_date) continue;
    const due = new Date(inv.due_date);
    due.setHours(0, 0, 0, 0);
    if (due < today) {
      bad.push(`${inv.invoice_no ?? inv.id}: due=${String(inv.due_date).slice(0, 10)} status=${inv.status}`);
    }
  }
  flag("B10", "Invoice lewat jatuh tempo tapi status bukan overdue", bad);
}

// B11: payment menunjuk akun kas yang tidak ada
{
  const cashIds = new Set(cashAccounts.map((c) => c.id));
  const bad = [];
  for (const p of payments) {
    if (p.cash_account && !cashIds.has(p.cash_account)) {
      bad.push(`payment ${p.id}: cash_account ${p.cash_account} tidak ditemukan`);
    }
  }
  flag("B11", "Payment ke akun kas tidak valid", bad);
}

// B12: nota kredit konsisten (amount = applied + refunded, invoice valid)
{
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const bad = [];
  for (const cn of creditNotes) {
    if (cn.status !== "issued") continue;
    if (Math.abs(N(cn.amount) - (N(cn.applied_to_receivable) + N(cn.refunded))) > TOL) {
      bad.push(
        `${cn.cn_no ?? cn.id}: amount=${money(cn.amount)} vs applied=${money(cn.applied_to_receivable)} + refunded=${money(cn.refunded)}`,
      );
    }
    if (cn.invoice && !invById.has(cn.invoice)) {
      bad.push(`${cn.cn_no ?? cn.id}: invoice ${cn.invoice} tidak ditemukan`);
    }
    if (cn.invoice && N(cn.amount) - N(invById.get(cn.invoice)?.total) > TOL) {
      bad.push(`${cn.cn_no ?? cn.id}: amount melebihi total invoice`);
    }
  }
  flag("B12", "Nota kredit (Retur Penjualan) tidak konsisten", bad);
}

// ───────────────────────── ENTITAS (Fase 1) ─────────────────────────

const storeCompany = Object.fromEntries(stores.map((s) => [s.id, s.company]));
const whCompany = Object.fromEntries(warehouses.map((w) => [w.id, w.company]));
const cashCompany = Object.fromEntries(cashAccounts.map((c) => [c.id, c.company]));
const soCompany = Object.fromEntries(sos.map((s) => [s.id, s.company]));
const invCompany = Object.fromEntries(invoices.map((i) => [i.id, i.company]));
const poCompany = Object.fromEntries(pos.map((p) => [p.id, p.company]));
const billCompany = Object.fromEntries(bills.map((b) => [b.id, b.company]));

function snapCompanyId(raw) {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw).company_id || null;
  } catch {
    return null;
  }
}

// E1: transaksi tanpa company
{
  const bad = [];
  const groups = [
    ["SO", sos],
    ["INV", invoices],
    ["PO", pos],
    ["BILL", bills],
    ["PAY", payments],
    ["BILL_PAY", billPays],
    ["EXP", expenses],
    ["CN", creditNotes],
  ];
  for (const [label, rows] of groups) {
    for (const r of rows) {
      if (!r.company) bad.push(`${label} ${r.id}`);
    }
  }
  flag("E1", "Transaksi tanpa field company (entitas)", bad);
}

// E2: SO company ≠ gudang/toko
{
  const bad = [];
  for (const so of sos) {
    if (!so.company) continue;
    const whC = so.warehouse ? whCompany[so.warehouse] : null;
    const stC = so.store ? storeCompany[so.store] : null;
    if (whC && whC !== so.company) bad.push(`${so.order_no ?? so.id}: company≠gudang`);
    if (stC && stC !== so.company) bad.push(`${so.order_no ?? so.id}: company≠toko`);
  }
  flag("E2", "Sales order company tidak selaras gudang/toko", bad);
}

// E3: PO company ≠ gudang
{
  const bad = [];
  for (const po of pos) {
    if (!po.company || !po.warehouse) continue;
    const whC = whCompany[po.warehouse];
    if (whC && whC !== po.company) bad.push(`${po.po_no ?? po.id}: company≠gudang`);
  }
  flag("E3", "Purchase order company tidak selaras gudang", bad);
}

// E4: payment/bill_payment cash_account company ≠ transaksi
{
  const bad = [];
  for (const p of payments) {
    if (!p.cash_account || !p.company) continue;
    const caC = cashCompany[p.cash_account];
    if (caC && caC !== p.company) bad.push(`payment ${p.id}: company≠akun kas`);
  }
  for (const p of billPays) {
    if (!p.cash_account || !p.company) continue;
    const caC = cashCompany[p.cash_account];
    if (caC && caC !== p.company) bad.push(`bill_payment ${p.id}: company≠akun kas`);
  }
  flag("E4", "Pembayaran: akun kas bukan milik entitas transaksi", bad);
}

// E5: invoice company ≠ store/snapshot
{
  const bad = [];
  for (const inv of invoices) {
    if (!inv.company) continue;
    const stC = inv.store ? storeCompany[inv.store] : null;
    const snapC = snapCompanyId(inv.identity_snapshot_json);
    if (stC && stC !== inv.company) bad.push(`${inv.invoice_no ?? inv.id}: company≠toko`);
    if (snapC && snapC !== inv.company) bad.push(`${inv.invoice_no ?? inv.id}: company≠snapshot`);
  }
  flag("E5", "Invoice company tidak selaras toko/snapshot", bad);
}

// E6: bill payment tanpa akun kas (wajib sejak Fase 2)
{
  const bad = [];
  for (const p of billPays) {
    if (!p.cash_account) bad.push(`bill_payment ${p.id}`);
  }
  flag("E6", "Pembayaran hutang tanpa akun kas/bank", bad);
}

// E7: biaya paid tanpa akun kas
{
  const bad = [];
  for (const e of expenses) {
    if (e.status === "paid" && !e.cash_account) {
      bad.push(`${e.expense_no ?? e.id}: paid tanpa cash_account`);
    }
  }
  flag("E7", "Biaya status paid tanpa akun kas/bank", bad);
}

// E8: expense company ≠ store/gudang
{
  const bad = [];
  for (const e of expenses) {
    if (!e.company) continue;
    const stC = e.store ? storeCompany[e.store] : null;
    const whC = e.warehouse ? whCompany[e.warehouse] : null;
    if (stC && stC !== e.company) bad.push(`${e.expense_no ?? e.id}: company≠toko`);
    if (whC && whC !== e.company) bad.push(`${e.expense_no ?? e.id}: company≠gudang`);
    if (e.cash_account) {
      const caC = cashCompany[e.cash_account];
      if (caC && caC !== e.company) bad.push(`${e.expense_no ?? e.id}: company≠akun kas`);
    }
  }
  flag("E8", "Biaya operasional tidak selaras entitas/toko/gudang/kas", bad);
}

// E9: user non-owner active_company tidak ada di biz_user_companies
{
  const userCompanies = await all("biz_user_companies", { filter: "is_active != false" });
  const users = await all("users");
  const accessByUser = new Map();
  for (const row of userCompanies) {
    const list = accessByUser.get(row.user) ?? new Set();
    list.add(row.company);
    accessByUser.set(row.user, list);
  }
  const bad = [];
  for (const u of users) {
    const isOwner =
      String(u.account_type || "").toLowerCase() === "owner" ||
      String(u.role || "").toLowerCase() === "owner";
    if (isOwner) continue;
    const active = u.active_company || u.default_company;
    if (!active) continue;
    const allowed = accessByUser.get(u.id);
    if (!allowed || !allowed.has(active)) {
      bad.push(`${u.email ?? u.id}: active_company tidak diizinkan`);
    }
  }
  flag("E9", "User non-owner dengan konteks entitas di luar hak akses", bad);
}

// ───────────────────────── RINGKASAN ─────────────────────────

console.log("\n=== HASIL AUDIT ===");
let problems = 0;
for (const f of findings) {
  const mark = f.count === 0 ? "OK " : "!!!";
  console.log(`\n[${mark}] ${f.code} — ${f.desc}: ${f.count} temuan`);
  for (const s of f.sample) console.log(`      - ${s}`);
  if (f.count > f.sample.length) console.log(`      … +${f.count - f.sample.length} lainnya`);
  if (f.count > 0) problems += f.count;
}

// Ringkasan saldo
const piutang = invoices
  .filter((i) => i.status !== "paid" && i.status !== "cancelled")
  .reduce((s, i) => s + N(i.remaining), 0);
const hutang = bills
  .filter((b) => b.status !== "paid" && b.status !== "cancelled")
  .reduce((s, b) => s + N(b.remaining), 0);
console.log(`\n=== SALDO ===`);
console.log(`Piutang (Σ remaining invoice terbuka): Rp${piutang.toLocaleString("id-ID")}`);
console.log(`Hutang  (Σ remaining bill terbuka):    Rp${hutang.toLocaleString("id-ID")}`);
console.log(`\nTotal temuan bermasalah: ${problems}`);
