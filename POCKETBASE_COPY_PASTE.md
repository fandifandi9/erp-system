# PocketBase Penjualan Online — copy-paste

**API Rules** (semua collection baru, tab List / View / Create / Update / Delete):

```
@request.auth.id != ""
```

**Urutan buat:** 1 → 2 → 3 → 4 → 5 → (6 opsional) → 7 → 8 → 9 → lalu **EDIT** di bawah.

---

## 1. Collection `biz_sales_channels`

| Field name | Type | Setting |
|------------|------|---------|
| `code` | Text | Required, Unique |
| `name` | Text | Required |
| `is_active` | Bool | default true |
| `notes` | Text | — |

---

## 2. Collection `biz_mp_seller_tiers`

| Field name | Type | Setting |
|------------|------|---------|
| `channel` | Relation → `biz_sales_channels` | Max 1, Required |
| `code` | Text | Required |
| `label` | Text | Required |
| `sort_order` | Number | Min 0 |
| `is_active` | Bool | default true |

---

## 3. Collection `biz_store_channel_accounts`

| Field name | Type | Setting |
|------------|------|---------|
| `store` | Relation → `biz_stores` | Max 1, Required |
| `channel` | Relation → `biz_sales_channels` | Max 1, Required |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1, Required |
| `account_name` | Text | Required |
| `mp_shop_id` | Text | — |
| `default_customer` | Relation → `biz_customers` | Max 1, Required |
| `is_active` | Bool | default true |
| `notes` | Text | — |

> Field `default_fee_template` — tambah di **bagian EDIT A** (setelah collection no. 4 ada).

---

## 4. Collection `biz_mp_fee_templates`

| Field name | Type | Setting |
|------------|------|---------|
| `code` | Text | Required, Unique |
| `name` | Text | Required |
| `channel` | Relation → `biz_sales_channels` | Max 1 |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1 |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `notes` | Text | — |
| `sort_order` | Number | — |
| `is_active` | Bool | default true |

---

## 5. Collection `biz_mp_fee_template_lines`

| Field name | Type | Setting |
|------------|------|---------|
| `template` | Relation → `biz_mp_fee_templates` | Max 1, Required |
| `label` | Text | Required |
| `code` | Text | Required |
| `line_group` | Select | Required — **satu value per baris** (jangan digabung!): |
| | | `mp_fee` |
| | | `operational` |
| | | `category` |
| `calc_type` | Select | Required — **satu value per baris**: |
| | | `percent` |
| | | `percent_cap` |
| | | `fixed` |
| | | `fixed_per_qty` |
| `rate` | Number | — |
| `max_amount` | Number | plafon Rp |
| `fixed_amount` | Number | — |
| `applies_to` | Select | Required — **satu value per baris**: |
| | | `line` |
| | | `order` |
| `internal_category` | Relation → `inv_categories` | Max 1 |
| `sort_order` | Number | — |
| `is_active` | Bool | default true |
| `notes` | Text | — |

> **PENTING — field Select:** setiap pilihan harus **baris terpisah** di kolom Values PocketBase.
> Salah: `mp_fee · operational · category` (satu baris) → simpan biaya gagal (400).
> Benar: tiga baris `mp_fee`, `operational`, `category`.
> Perbaiki otomatis: `node scripts/fix-pb-fee-lines-schema.mjs`

---

## 6. Collection `biz_mp_fee_rules` *(opsional — jika tanpa template)*

| Field name | Type | Setting |
|------------|------|---------|
| `fee_type` | Select | Required — `category_fee` · `free_shipping` · `cashback` · `mall_fee` · `processing` · `affiliate` |
| `channel` | Relation → `biz_sales_channels` | Max 1 |
| `store` | Relation → `biz_stores` | Max 1 |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `seller_tier` | Relation → `biz_mp_seller_tiers` | Max 1 |
| `mp_category` | Text | — |
| `internal_category` | Relation → `inv_categories` | Max 1 |
| `scope_product` | Relation → `inv_products` | Max 1 |
| `calc_type` | Select | Required — `percent` · `percent_cap` · `fixed` · `fixed_per_qty` |
| `rate` | Number | — |
| `max_amount` | Number | — |
| `fixed_amount` | Number | — |
| `applies_to` | Select | `line` · `order` |
| `valid_from` | Date | — |
| `valid_to` | Date | — |
| `priority` | Number | default 0 |
| `is_active` | Bool | default true |
| `notes` | Text | — |

---

## 7. Collection `biz_mp_product_mappings`

| Field name | Type | Setting |
|------------|------|---------|
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `channel` | Relation → `biz_sales_channels` | Max 1 |
| `mp_sku` | Text | Required |
| `mp_product_name` | Text | — |
| `product` | Relation → `inv_products` | Max 1, Required |
| `is_active` | Bool | default true |

---

## 8. Collection `biz_sales_import_batches`

| Field name | Type | Setting |
|------------|------|---------|
| `batch_no` | Text | Required, Unique |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1, Required |
| `period_from` | Date | — |
| `period_to` | Date | — |
| `status` | Select | Required — `draft` · `validated` · `posted` · `cancelled` |
| `total_rows` | Number | default 0 |
| `valid_rows` | Number | default 0 |
| `error_rows` | Number | default 0 |
| `posted_rows` | Number | default 0 |
| `source_filename` | Text | — |
| `notes` | Text | — |
| `created_by` | Relation → `users` | Max 1 |
| `posted_at` | Date | — |

> Field `fee_template` — tambah di **bagian EDIT B** (setelah collection no. 4 ada).

---

## 9. Collection `biz_sales_import_lines`

| Field name | Type | Setting |
|------------|------|---------|
| `batch` | Relation → `biz_sales_import_batches` | Max 1, Required |
| `row_no` | Number | — |
| `mp_order_no` | Text | Required |
| `order_date` | Date | — |
| `mp_buyer_name` | Text | — |
| `mp_sku` | Text | — |
| `product_name` | Text | — |
| `mp_category` | Text | — |
| `qty` | Number | — |
| `unit_price` | Number | — |
| `gross_amount` | Number | — |
| `product` | Relation → `inv_products` | Max 1 |
| `fee_category` | Number | default 0 |
| `fee_free_shipping` | Number | default 0 |
| `fee_cashback` | Number | default 0 |
| `fee_mall` | Number | default 0 |
| `fee_processing` | Number | default 0 |
| `fee_affiliate` | Number | default 0 |
| `total_fees` | Number | default 0 |
| `expected_net` | Number | default 0 |
| `fee_override_json` | Text | — |
| `validation_status` | Select | `pending` · `valid` · `error` · `posted` · `skipped` |
| `error_message` | Text | — |
| `invoice` | Relation → `biz_invoices` | Max 1 |

---

# EDIT — tambah field di collection yang sudah ada

## EDIT A — buka `biz_store_channel_accounts` → + New field

| Field name | Type | Setting |
|------------|------|---------|
| `default_fee_template` | Relation → `biz_mp_fee_templates` | Max 1 |

---

## EDIT B — buka `biz_sales_import_batches` → + New field

| Field name | Type | Setting |
|------------|------|---------|
| `fee_template` | Relation → `biz_mp_fee_templates` | Max 1 |

---

## EDIT C — buka `biz_invoices` → + New field (7 field)

| Field name | Type | Setting |
|------------|------|---------|
| `source` | Select | `manual` · `marketplace_import` |
| `mp_order_no` | Text | — |
| `mp_buyer_name` | Text | — |
| `sales_channel` | Relation → `biz_sales_channels` | Max 1 |
| `store_channel_account` | Relation → `biz_store_channel_accounts` | Max 1 |
| `expected_net` | Number | — |
| `mp_fees_json` | Text | — |

---

## Cara baca kolom Type di PocketBase Admin

| Tulisan di dokumen | Pilih di PB |
|--------------------|-------------|
| Text | **Plain text** |
| Number | **Number** |
| Bool | **Bool** |
| Date | **Date** |
| Select | **Select** (lalu paste values) |
| Relation → `nama_collection` | **Relation** → pilih collection → Max **1** |

**Bukan Email, URL, atau Editor** — kecuali memang field teks biasa (pakai Text / Plain text).

---

## 10. Collection `biz_couriers` (master ekspedisi / courier)

| Field name | Type | Setting |
|------------|------|---------|
| `code` | Text | Opsional · Unique |
| `name` | Text | Required · contoh: `JNE` |
| `logo` | File | Opsional · max 1 gambar |
| `is_active` | Bool | default true |
| `notes` | Text | — |

---

## 11. Collection `biz_courier_services` (layanan per ekspedisi)

| Field name | Type | Setting |
|------------|------|---------|
| `courier` | Relation → `biz_couriers` | Max 1 · Required |
| `code` | Text | — |
| `name` | Text | Required · `Reguler`, `YES`, `Cargo` |
| `sort_order` | Number | default 0 |
| `is_active` | Bool | default true |

Setelah collection dibuat + API rules, buka **Bisnis → Ekspedisi** (`/bisnis/ekspedisi`) → tombol **Isi data contoh**.

---

## Checklist singkat

- [ ] 1–5 wajib (template = import)
- [ ] 7–9 wajib (mapping opsional bisa kosong)
- [ ] EDIT A + B (2 field Relation template)
- [ ] EDIT C (invoice MP)
- [ ] API rules semua collection baru
- [ ] UI: Template Kalkulasi → **Contoh Shopee Mall**
