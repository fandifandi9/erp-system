# PocketBase — Marketplace Fee Engine per SKU (channel + tier + SKU)

Desain final yang disepakati:

- Fee produk **hanya** di level `(channel + tier + SKU)` — **tanpa kategori MP**.
- Fallback: jika SKU belum punya fee → pakai **default tier** → jika tidak ada → `0` + warning.
- **Tag produk** hanya alat bantu pencarian & bulk update — **tidak ikut hitung fee**.
- Fee marketplace & affiliate **terpisah** per baris (affiliate bisa seragam via default tier, atau beda per SKU).
- Transaksi lama aman karena hasil hitung **di-snapshot** ke `mp_fees_json` di sales order (sudah ada) — perubahan master tidak mengubah transaksi lama.
- Biaya per-order (gratis ongkir, cashback, proses, mall fee) tetap memakai `biz_mp_fee_rules` / template yang **sudah ada** — tidak diubah.

---

## Ringkasan: apa yang harus dibuat di PB

| Status | Collection |
|--------|------------|
| **BARU — wajib** | `biz_mp_tier_defaults` (fallback fee per channel+tier) |
| **BARU — wajib** | `biz_mp_product_fees` (fee per channel+tier+SKU) |
| **BARU — wajib** | `biz_product_tags` (tag bantu untuk filter & bulk update) |
| **Sudah ada — dipakai** | `biz_sales_channels`, `biz_mp_seller_tiers`, `inv_products` |
| **Sudah ada — tidak diubah** | `biz_mp_fee_rules`, `biz_mp_fee_templates` (biaya per-order) |

Semua operasi tulis dilakukan lewat API server (admin PB), jadi API rules cukup ketat.

---

## 1. Collection BARU: `biz_mp_tier_defaults`

Fallback fee untuk SKU yang **belum** punya baris fee sendiri.

- **Name:** `biz_mp_tier_defaults`
- **Type:** Base

### Field

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `channel` | Relation → `biz_sales_channels` | Required · Single · Cascade delete OFF |
| 2 | `seller_tier` | Relation → `biz_mp_seller_tiers` | Required · Single · Cascade delete OFF |
| 3 | `mp_calc_type` | Select (single) | Required · Values: `percent`, `percent_cap`, `fixed` |
| 4 | `mp_rate` | Number | Opsional · persen, contoh `5` = 5% |
| 5 | `mp_max_amount` | Number | Opsional · Rp maksimum (untuk `percent_cap`) |
| 6 | `mp_fixed_amount` | Number | Opsional · Rp tetap (untuk `fixed`) |
| 7 | `aff_calc_type` | Select (single) | Required · Values: `none`, `percent`, `percent_cap`, `fixed` · default isi `none` |
| 8 | `aff_rate` | Number | Opsional |
| 9 | `aff_max_amount` | Number | Opsional |
| 10 | `aff_fixed_amount` | Number | Opsional |
| 11 | `is_active` | Bool | Default `true` |
| 12 | `notes` | Plain text | Opsional |

### Index (tab Indexes)

```
CREATE UNIQUE INDEX idx_mp_tier_default_unique ON biz_mp_tier_defaults (channel, seller_tier)
```

> Satu kombinasi channel + tier hanya boleh punya **satu** baris default.

---

## 2. Collection BARU: `biz_mp_product_fees`

Fee spesifik per SKU. Ini **single source of truth** untuk fee produk marketplace.

- **Name:** `biz_mp_product_fees`
- **Type:** Base

### Field

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `channel` | Relation → `biz_sales_channels` | Required · Single |
| 2 | `seller_tier` | Relation → `biz_mp_seller_tiers` | Required · Single |
| 3 | `product` | Relation → `inv_products` | Required · Single |
| 4 | `mp_calc_type` | Select (single) | Required · Values: `percent`, `percent_cap`, `fixed` |
| 5 | `mp_rate` | Number | Opsional |
| 6 | `mp_max_amount` | Number | Opsional |
| 7 | `mp_fixed_amount` | Number | Opsional |
| 8 | `aff_calc_type` | Select (single) | R· Values: `inherit`, `none`, `percent`, `percent_cap`, `fixed` · default `inherit` |
| 9 | `aff_rate` | Number | Opsional |
| 10 | `aff_max_amount` | Number | Opsional |
| 11 | `aff_fixed_amount` | Number | Opsional |
| 12 | `is_active` | Bool | Default `true` |
| 13 | `notes` | Plain text | Opsional |
equired 
> `aff_calc_type = inherit` artinya affiliate SKU ini **ikut default tier** (kasus "affiliate disamakan").
> Isi `none`/`percent`/dst. hanya jika affiliate SKU ini **beda** dari default.

### Index

```
CREATE UNIQUE INDEX idx_mp_product_fee_unique ON biz_mp_product_fees (seller_tier, product)
```

> `seller_tier` sudah unik per channel, jadi `(seller_tier, product)` cukup.
> Index ini juga membuat lookup ribuan SKU tetap cepat.

---

## 3. Collection BARU: `biz_product_tags`

Tag hanya alat bantu (filter & bulk update). Bukan kategori ERP, tidak dipakai hitung fee.

- **Name:** `biz_product_tags`
- **Type:** Base

### Field

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `name` | Plain text | Required · **Unique** · contoh: `Elektronik`, `Affiliate Tinggi` |
| 2 | `products` | Relation → `inv_products` | **Multiple** (Max select kosongkan) |
| 3 | `notes` | Plain text | Opsional |
| 4 | `is_active` | Bool | Default `true` |

> Satu SKU boleh masuk banyak tag (relasi multiple di sisi tag).

---

## 4. API Rules (ketiga collection baru — sama semua)

Tulis hanya lewat server (admin), baca boleh user login:

| Rule | Isi |
|------|-----|
| List/Search | `@request.auth.id != ""` |
| View | `@request.auth.id != ""` |
| Create | *(kosongkan → hanya admin/server)* |
| Update | *(kosongkan → hanya admin/server)* |
| Delete | *(kosongkan → hanya admin/server)* |

> Catatan: di PocketBase, kotak rule **kosong** = hanya superuser/admin. Jangan diisi `""`.

---

## 5. Urutan resolve fee (logika server)

Untuk setiap baris transaksi marketplace `(channel, tier, SKU)`:

1. **Fee marketplace**: cari `biz_mp_product_fees` aktif `(seller_tier, product)` → kalau tidak ada, pakai `biz_mp_tier_defaults` `(channel, seller_tier)` → kalau tidak ada juga, fee = `0` + flag `warning: "no_rule"`.
2. **Affiliate**: dari baris SKU jika `aff_calc_type ≠ inherit`; jika `inherit` → pakai default tier; jika default tidak ada → `0`.
3. **percent_cap**: `potongan = min(gross × rate%, max_amount)`.
4. Biaya per-order (gratis ongkir, proses, dst.) tetap dari engine lama (`biz_mp_fee_rules`).
5. Hasil hitung **disimpan snapshot** ke `mp_fees_json` di sales order → transaksi lama tidak pernah berubah walau master fee diedit (ini implementasi "fee rule version").

---

## 6. Endpoint API (sudah dibuat di aplikasi)

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| GET | `/api/bisnis/mp-fees/tier-defaults?channel=&tier=` | List default fee per tier |
| POST | `/api/bisnis/mp-fees/tier-defaults` | Buat/upsert default tier |
| PATCH/DELETE | `/api/bisnis/mp-fees/tier-defaults/:id` | Edit / hapus default |
| GET | `/api/bisnis/mp-fees/product-fees?channel=&tier=&q=&tag=&page=` | List fee per SKU (filter channel/tier/cari/tag) |
| POST | `/api/bisnis/mp-fees/product-fees` | Buat fee SKU (upsert per tier+produk) |
| PATCH/DELETE | `/api/bisnis/mp-fees/product-fees/:id` | Edit / hapus fee SKU |
| POST | `/api/bisnis/mp-fees/product-fees/bulk` | Bulk update fee (per tag / per daftar produk) |
| GET | `/api/bisnis/mp-fees/tags` | List tag |
| POST | `/api/bisnis/mp-fees/tags` | Buat tag |
| PATCH/DELETE | `/api/bisnis/mp-fees/tags/:id` | Edit (nama/anggota) / hapus tag |
| POST | `/api/bisnis/mp-fees/resolve` | Hitung fee per SKU untuk daftar baris (dipakai transaksi/import) |

Semua endpoint butuh login + akses modul penjualan (`/bisnis/penjualan`).

---

## 7. Integrasi ke transaksi (sudah aktif otomatis)

Saat **upload/validasi import penjualan MP** (`processImportRows`):

1. Engine SKU aktif jika akun MP punya **tier** dan ada data fee (default tier atau baris SKU).
2. Fee produk per baris diambil dari engine (SKU → default tier), affiliate juga per baris.
3. Untuk anti dobel hitung, baris **template per-produk/kategori/affiliate** dan rules `category_fee`/`affiliate` otomatis **dikecualikan** — biaya per-order (gratis ongkir, cashback, mall, proses) tetap dari template/rules.
4. Snapshot spec fee (`sku_fee`: tipe, rate, max, sumber) disimpan ke `fee_override_json` tiap baris import.
5. Saat posting, invoice menyimpan `mp_fees_json` berisi total + breakdown — **transaksi lama tidak pernah berubah** walau master fee diedit.
6. Jika engine tidak punya data (tier tanpa default & tanpa baris SKU) → perilaku lama (template/rules) tetap dipakai.

UI kelola fee: `/bisnis/marketplace/fee-sku` (tombol **Fee per SKU** di Master Marketplace).
