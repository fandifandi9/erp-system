# PocketBase — Penjualan Online (lengkap)

Panduan **satu file** untuk setup PocketBase modul **Penjualan Online / Marketplace** di SERBA.

**File terkait di proyek:**

| File | Isi |
|------|-----|
| `POCKETBASE_COPY_PASTE.md` | **Format tabel copy-paste** (seperti contoh Field / Type / Setting) |
| `POCKETBASE_PENJUALAN_ONLINE_LENGKAP.md` | **Dokumen ini** — semua collection & field |
| `POCKETBASE_MP_SALES_SETUP.md` | Panduan lama + contoh isi rule biaya |
| `lib/bisnis/types.ts` | TypeScript types + nama collection |
| `lib/bisnis/mp-client.ts` | Import, batch, akun MP |
| `lib/bisnis/mp-template-client.ts` | Template kalkulasi profit |
| `lib/bisnis/mp-template-engine.ts` | Rumus hitung dari template |
| `lib/bisnis/mp-fee-engine.ts` | Rumus rule biaya (legacy) |
| `lib/bisnis/mp-product-resolve.ts` | SKU → produk SERBA |
| `app/(dashboard)/bisnis/penjualan-online/template/page.tsx` | UI template (sheet) |
| `app/(dashboard)/bisnis/penjualan-online/import/page.tsx` | UI import + pilih template |
| `app/(dashboard)/bisnis/penjualan-online/pengaturan/page.tsx` | UI channel, akun, mapping |

---

## 0. Prasyarat (harus sudah ada di PB)

Collection ini **tidak** dibuat di panduan ini — dipakai sebagai relation:

| Collection | Dipakai untuk |
|------------|----------------|
| `biz_stores` | Toko + gudang default |
| `biz_customers` | Customer default per akun MP (bukan pembeli asli) |
| `inv_products` | Master produk + **SKU** + kategori |
| `inv_categories` | Kategori produk (fee kategori template) |
| `biz_invoices` | Invoice hasil posting import |
| `users` | `created_by` di batch import |

---

## 1. API Rules (semua collection baru)

Tab **API Rules** → List / View / Create / Update / Delete — isi sama:

```
@request.auth.id != ""
```

> Collection `biz_invoices` ikuti rule yang sudah dipakai di ERP Anda.

---

## 2. Urutan buat (wajib berurutan)

```
[BARU]
 1. biz_sales_channels
 2. biz_mp_seller_tiers
 3. biz_store_channel_accounts
 4. biz_mp_fee_templates          ← template kalkulasi (Shopee Mall, …)
 5. biz_mp_fee_template_lines
 6. biz_mp_fee_rules              ← opsional (legacy, jika tanpa template)
 7. biz_mp_product_mappings
 8. biz_sales_import_batches
 9. biz_sales_import_lines

[EDIT — tambah field saja]
10. biz_store_channel_accounts     → default_fee_template
11. biz_sales_import_batches       → fee_template
12. biz_invoices                   → 7 field MP
```

---

## 3. Collection baru — detail field

### 3.1 `biz_sales_channels`

**Type:** Base

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `code` | Plain text | Required, Unique |
| `name` | Plain text | Required |
| `is_active` | Bool | Default: `true` |
| `notes` | Plain text | — |

**Contoh data:**

| code | name |
|------|------|
| shopee | Shopee |
| tokopedia | Tokopedia |
| blibli | Blibli |
| tiktok | TikTok Shop |
| lazada | Lazada |

---

### 3.2 `biz_mp_seller_tiers`

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `channel` | Relation → `biz_sales_channels` | Max 1, Required |
| `code` | Plain text | Required |
| `label` | Plain text | Required |
| `sort_order` | Number | Min 0 |
| `is_active` | Bool | Default: `true` |

**Contoh Shopee:**

| channel | code | label | sort_order |
|---------|------|-------|------------|
| Shopee | regular | Regular | 1 |
| Shopee | mall | Shopee Mall | 2 |
| Shopee | star_plus | Star+ | 3 |

**Contoh Tokopedia:**

| channel | code | label |
|---------|------|-------|
| Tokopedia | regular | Seller Biasa |
| Tokopedia | premium | Power Merchant |
| Tokopedia | official | Official Store |

---

### 3.3 `biz_store_channel_accounts`

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `store` | Relation → `biz_stores` | Max 1, Required |
| `channel` | Relation → `biz_sales_channels` | Max 1, Required |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1, Required |
| `account_name` | Plain text | Required |
| `mp_shop_id` | Plain text | — |
| `default_customer` | Relation → `biz_customers` | Max 1, Required |
| `is_active` | Bool | Default: `true` |
| `notes` | Plain text | — |

> Field `default_fee_template` ditambah di **bagian 4.1** (edit).

**Contoh:**

| account_name | channel | seller_tier | default_customer |
|--------------|---------|-------------|------------------|
| costa shopee mall | shopee | mall | Pelanggan Shopee |

---

### 3.4 `biz_mp_fee_templates` ⭐ (utama import)

Tampilan UI: **Penjualan Online → Template Kalkulasi**

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `code` | Plain text | Required, Unique (mis. `shopee_mall`) |
| `name` | Plain text | Required (mis. `Shopee Mall`) |
| `channel` | Relation → `biz_sales_channels` | Max 1, opsional |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1, opsional |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1, opsional |
| `notes` | Plain text | — |
| `sort_order` | Number | — |
| `is_active` | Bool | Default: `true` |

**Cara isi cepat:** di UI klik **Contoh Shopee Mall** (otomatis buat template + baris biaya).

---

### 3.5 `biz_mp_fee_template_lines` ⭐

Satu record = satu baris di sheet **Kalkulasi Profit**.

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `template` | Relation → `biz_mp_fee_templates` | Max 1, Required |
| `label` | Plain text | Required (mis. `Gratis Ongkir Extra`) |
| `code` | Plain text | Required (mis. `free_shipping`) |
| `line_group` | Select | Required — values: |
| | | `mp_fee` |
| | | `operational` |
| | | `category` |
| `calc_type` | Select | Required — values: |
| | | `percent` |
| | | `percent_cap` |
| | | `fixed` |
| | | `fixed_per_qty` |
| `rate` | Number | Untuk % (4 = 4%) |
| `max_amount` | Number | Plafon Rp (`percent_cap`) |
| `fixed_amount` | Number | Nominal fix |
| `applies_to` | Select | Required — values: `line` · `order` |
| `internal_category` | Relation → `inv_categories` | Max 1 — untuk fee kategori (Tripod, …) |
| `sort_order` | Number | Urutan tampilan |
| `is_active` | Bool | Default: `true` |
| `notes` | Plain text | — |

**Contoh baris Shopee Mall (bisa diisi lewat UI seed):**

| label | code | line_group | calc_type | rate | max_amount | applies_to |
|-------|------|------------|-----------|------|------------|------------|
| Fee Kategori | category_fee | category | percent | 10.2 | — | line |
| Gratis Ongkir Extra | free_shipping | mp_fee | percent_cap | 4 | 40000 | order |
| Promo Extra | promo_extra | mp_fee | percent_cap | 4.5 | 60000 | order |
| Fee Mall | mall_fee | mp_fee | percent_cap | 1.8 | 50000 | order |
| Biaya Packing | packing | operational | fixed | — | — | order (+ fixed_amount 5000) |

**Fee kategori per produk SERBA:** duplikasi baris `line_group = category`, pilih `internal_category` = Tripod / Aksesoris, atur `rate` masing-masing.

---

### 3.6 `biz_mp_fee_rules` (opsional / legacy)

Hanya dipakai jika import **tanpa** memilih template. Bisa dilewati jika sudah pakai template.

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `fee_type` | Select | Required — `category_fee` · `free_shipping` · `cashback` · `mall_fee` · `processing` · `affiliate` |
| `channel` | Relation → `biz_sales_channels` | Max 1 |
| `store` | Relation → `biz_stores` | Max 1 |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1 |
| `mp_category` | Plain text | Legacy label MP |
| `internal_category` | Relation → `inv_categories` | Max 1 — **disarankan** untuk kategori |
| `scope_product` | Relation → `inv_products` | Max 1 |
| `calc_type` | Select | Required — `percent` · `percent_cap` · `fixed` · `fixed_per_qty` |
| `rate` | Number | |
| `max_amount` | Number | |
| `fixed_amount` | Number | |
| `applies_to` | Select | `line` · `order` |
| `valid_from` | Date | |
| `valid_to` | Date | |
| `priority` | Number | Default 0 |
| `is_active` | Bool | Default true |
| `notes` | Plain text | |

---

### 3.7 `biz_mp_product_mappings` (opsional)

Hanya jika SKU di marketplace **beda** dari SKU di `inv_products`. Normalnya **kosong**.

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `channel` | Relation → `biz_sales_channels` | Max 1 |
| `mp_sku` | Plain text | Required |
| `mp_product_name` | Plain text | — |
| `product` | Relation → `inv_products` | Max 1, Required |
| `is_active` | Bool | Default true |

---

### 3.8 `biz_sales_import_batches`

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `batch_no` | Plain text | Required, Unique |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1, Required |
| `period_from` | Date | |
| `period_to` | Date | |
| `status` | Select | Required — `draft` · `validated` · `posted` · `cancelled` |
| `total_rows` | Number | Default 0 |
| `valid_rows` | Number | Default 0 |
| `error_rows` | Number | Default 0 |
| `posted_rows` | Number | Default 0 |
| `source_filename` | Plain text | |
| `notes` | Plain text | |
| `created_by` | Relation → `users` | Max 1 |
| `posted_at` | Date | |

> Field `fee_template` ditambah di **bagian 4.2**.

---

### 3.9 `biz_sales_import_lines`

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `batch` | Relation → `biz_sales_import_batches` | Max 1, Required |
| `row_no` | Number | |
| `mp_order_no` | Plain text | Required |
| `order_date` | Date | |
| `mp_buyer_name` | Plain text | Nama pembeli dari export MP |
| `mp_sku` | Plain text | = SKU master SERBA |
| `product_name` | Plain text | |
| `mp_category` | Plain text | Opsional (diabaikan jika SKU dikenali) |
| `qty` | Number | |
| `unit_price` | Number | |
| `gross_amount` | Number | |
| `product` | Relation → `inv_products` | Max 1 |
| `fee_category` | Number | Default 0 |
| `fee_free_shipping` | Number | Default 0 |
| `fee_cashback` | Number | Default 0 |
| `fee_mall` | Number | Default 0 |
| `fee_processing` | Number | Default 0 |
| `fee_affiliate` | Number | Default 0 |
| `total_fees` | Number | Default 0 |
| `expected_net` | Number | Default 0 |
| `fee_override_json` | Plain text | JSON breakdown dari template |
| `validation_status` | Select | `pending` · `valid` · `error` · `posted` · `skipped` |
| `error_message` | Plain text | |
| `invoice` | Relation → `biz_invoices` | Max 1 |

---

## 4. Edit collection yang sudah ada

### 4.1 `biz_store_channel_accounts` — tambah 1 field

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `default_fee_template` | Relation → `biz_mp_fee_templates` | Max 1 |

Template default saat import (bisa diganti per upload).

---

### 4.2 `biz_sales_import_batches` — tambah 1 field

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `fee_template` | Relation → `biz_mp_fee_templates` | Max 1 |

Template yang dipakai untuk batch ini.

---

### 4.3 `biz_invoices` — tambah 7 field

| Field | Type PB | Pengaturan |
|-------|---------|------------|
| `source` | Select | Values: `manual` · `marketplace_import` |
| `mp_order_no` | Plain text | No order MP |
| `mp_buyer_name` | Plain text | Pembeli asli (dari Excel) |
| `sales_channel` | Relation → `biz_sales_channels` | Max 1 |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `expected_net` | Number | Omzet − biaya MP |
| `mp_fees_json` | Plain text | JSON ringkasan biaya |

---

## 5. Kebijakan SKU (wajib)

| Aturan | Detail |
|--------|--------|
| SKU seragam | Kolom Excel `mp_sku` = **Kode produk/SKU** di `inv_products` (sama di Shopee, Tokopedia, …) |
| Kategori biaya | Dari **kategori produk** di master (`inv_products.category`), bukan label kategori di export MP |
| Mapping SKU | Hanya jika SKU MP ≠ SKU SERBA |

---

## 6. Checklist setup (centang satu per satu)

### PocketBase — struktur

- [ ] `biz_sales_channels` + API rules
- [ ] `biz_mp_seller_tiers` + API rules
- [ ] `biz_store_channel_accounts` + API rules
- [ ] `biz_mp_fee_templates` + API rules
- [ ] `biz_mp_fee_template_lines` + API rules
- [ ] `biz_mp_product_mappings` + API rules (boleh kosong)
- [ ] `biz_sales_import_batches` + API rules
- [ ] `biz_sales_import_lines` + API rules
- [ ] `biz_mp_fee_rules` (opsional) + API rules
- [ ] Edit: `default_fee_template` di `biz_store_channel_accounts`
- [ ] Edit: `fee_template` di `biz_sales_import_batches`
- [ ] Edit: 7 field MP di `biz_invoices`

### Data awal

- [ ] Minimal 1 channel (Shopee / Tokopedia)
- [ ] Tier per channel (mis. mall, regular)
- [ ] Customer generik di `biz_customers`
- [ ] 1 akun toko-MP (`costa shopee mall`, dll.)
- [ ] 1 template kalkulasi (**Contoh Shopee Mall** di UI)
- [ ] Baris biaya template + fee kategori per `inv_categories` yang dipakai
- [ ] (Opsional) `default_fee_template` di akun toko-MP

### Sebelum import pertama

- [ ] Produk punya SKU di `inv_products`
- [ ] Download template CSV dari UI Import
- [ ] Upload: pilih **akun** + **template kalkulasi**

---

## 7. Template file Excel / CSV import

**Header baris 1:**

```csv
mp_order_no,order_date,mp_buyer_name,mp_sku,product_name,mp_category,qty,unit_price
```

**Contoh isi:**

```csv
ORD-20260528-001,28/05/2026,Budi Santoso,22344FGG56666,COSTA CT-6218 Tripod,,2,250000
ORD-20260528-002,28/05/2026,Siti Aminah,22344FGG56666,COSTA CT-6218 Tripod,,1,250000
```

| Kolom | Wajib | Keterangan |
|-------|-------|------------|
| `mp_order_no` | Ya | No order marketplace |
| `order_date` | Ya | dd/mm/yyyy atau yyyy-mm-dd |
| `mp_buyer_name` | Tidak | Nama pembeli (tampil di nota) |
| `mp_sku` | Ya | SKU master SERBA |
| `product_name` | Tidak | Referensi |
| `mp_category` | Tidak | Boleh kosong |
| `qty` | Ya | |
| `unit_price` | Ya | Harga per pcs |

Download: **Penjualan Online → Import → Template CSV**

---

## 8. Alur aplikasi setelah PB siap

```
Pengaturan MP          Template Kalkulasi        Import Penjualan
(channel, tier,   →    (sheet biaya +      →    (pilih template +
 akun toko)             kalkulator)               upload Excel)
                              ↓
                    Review batch (valid/error)
                              ↓
                    Posting → biz_invoices + stok keluar
```

---

## 9. Ringkasan: berapa collection?

| Status | Jumlah | Nama |
|--------|--------|------|
| **Buat baru** | 9 | channels, tiers, accounts, templates, template_lines, fee_rules*, mappings, import_batches, import_lines |
| **Edit saja** | 3 | store_channel_accounts, sales_import_batches, invoices |
| **Sudah ada** | 5+ | stores, customers, inv_products, inv_categories, users |

\* `biz_mp_fee_rules` opsional jika selalu pakai template.

---

## 10. Troubleshooting

| Gejala | Penyebab umum |
|--------|----------------|
| Template / import error 404 | Collection `biz_mp_fee_templates` belum dibuat |
| Dropdown template kosong | Belum ada record template atau `is_active = false` |
| Semua baris import error SKU | `mp_sku` Excel ≠ SKU di `inv_products` |
| Biaya kategori 0 | Belum ada baris template `category` + `internal_category` yang cocok |
| Posting gagal | `default_customer` atau gudang default toko kosong |

---

*Terakhir diselaraskan dengan kode di `lib/bisnis/` dan UI `app/(dashboard)/bisnis/penjualan-online/`.*
