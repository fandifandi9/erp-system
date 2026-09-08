# PocketBase — Import Pelunasan (lengkap)

Fitur ini **hanya menambah 2 collection staging**. Collection yang sudah dipakai saat posting (harus sudah ada + rule-nya mengizinkan create/update):

- `biz_invoices` — **update** (paid_amount, remaining, status)
- `biz_payments` — **create** (catatan pembayaran)
- `biz_payment_methods` — **read** (validasi metode dari Excel)
- `users` — relation `created_by`

---

## API Rules (copy ke 5 kotak rule)

Sama seperti `biz_sales_import_batches` / `biz_sales_import_lines`. Tempel di **List/Search**, **View**, **Create**, **Update**, dan **Delete** untuk **kedua** collection baru:

```
@request.auth.id != ""
```

Artinya: user harus login. Tidak ada rule role khusus di kode import pelunasan.

> Jika `biz_invoices` atau `biz_payments` di PB Anda pakai rule lebih ketat (mis. hanya `owner`), pastikan user yang import punya hak **update invoice** dan **create payment** — kalau tidak, upload/review bisa jalan tapi **Posting** gagal 403.

---

## Urutan buat di Admin

```
1. biz_payment_import_batches   ← buat dulu
2. biz_payment_import_lines     ← relation ke (1)
```

Tidak perlu edit collection lain untuk fitur ini.

---

## 1. Collection `biz_payment_import_batches`

**Name:** `biz_payment_import_batches`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `batch_no` | Plain text | ✅ Required · ✅ Unique |
| 2 | `status` | Select | ✅ Required · Values (satu per baris): |
| | | | `draft` |
| | | | `validated` |
| | | | `posted` |
| | | | `cancelled` |
| 3 | `total_rows` | Number | Default: **0** |
| 4 | `valid_rows` | Number | Default: **0** |
| 5 | `error_rows` | Number | Default: **0** |
| 6 | `posted_rows` | Number | Default: **0** |
| 7 | `source_filename` | Plain text | — |
| 8 | `notes` | Plain text | — |
| 9 | `created_by` | Relation | **users** · Max: **1** |
| 10 | `posted_at` | Date | — |

Nomor batch otomatis dari app: prefix **PEL** (contoh `PEL-062026-00001`).

---

## 2. Collection `biz_payment_import_lines`

**Name:** `biz_payment_import_lines`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `batch` | Relation | **biz_payment_import_batches** · Max: **1** · ✅ Required |
| 2 | `row_no` | Number | — |
| 3 | `invoice_no` | Plain text | ✅ Required |
| 4 | `invoice` | Relation | **biz_invoices** · Max: **1** |
| 5 | `payment_date` | Date | — |
| 6 | `amount` | Number | — |
| 7 | `payment_method_label` | Plain text | teks dari Excel |
| 8 | `payment_method` | Relation | **biz_payment_methods** · Max: **1** |
| 9 | `reference_no` | Plain text | — |
| 10 | `notes` | Plain text | — |
| 11 | `lunas_penuh` | Bool | opsional |
| 12 | `validation_status` | Select | Values: |
| | | | `pending` |
| | | | `valid` |
| | | | `error` |
| | | | `posted` |
| | | | `skipped` |
| 13 | `error_message` | Plain text | — |
| 14 | `payment` | Relation | **biz_payments** · Max: **1** |

---

## Checklist

- [ ] `biz_payment_import_batches` — 10 field + API rules (5 rule = `@request.auth.id != ""`)
- [ ] `biz_payment_import_lines` — 14 field + API rules (sama)
- [ ] `biz_invoices` — bisa di-**update** oleh user login
- [ ] `biz_payments` — bisa di-**create** oleh user login
- [ ] `biz_payment_methods` — bisa di-**list/view** (master metode bayar)

---

## Alur aplikasi

1. Upload Excel → staging batch + lines + validasi
2. Review: `/bisnis/penjualan/pelunasan-import/[id]`
3. Posting → `biz_payments` + update `biz_invoices`

## Template Excel

`no_invoice`, `tgl_pembayaran`, `jumlah`, `metode_bayar`, `no_referensi`, `catatan`, `lunas_penuh (Y/T)`
