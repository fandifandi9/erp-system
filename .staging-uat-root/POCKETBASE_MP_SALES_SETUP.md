# PocketBase — Penjualan Online (copy-paste)

> **Panduan lengkap (disarankan):** lihat [`POCKETBASE_PENJUALAN_ONLINE_LENGKAP.md`](./POCKETBASE_PENJUALAN_ONLINE_LENGKAP.md) — semua collection, field, checklist, dan mapping file proyek.

Buka PocketBase Admin → **Collections** → buat **berurutan** seperti di bawah (relation butuh collection tujuan sudah ada).

**API Rules** (sama untuk semua collection baru — copy ke List / View / Create / Update / Delete):

```
@request.auth.id != ""
```

> Jika `biz_invoices` pakai rule khusus role, samakan rule-nya.

---

## Urutan buat collection

```
1. biz_sales_channels
2. biz_mp_seller_tiers
3. biz_store_channel_accounts   ← butuh biz_stores + biz_customers sudah ada
4. biz_mp_fee_templates         ← template kalkulasi profit (Shopee Mall, …)
5. biz_mp_fee_template_lines    ← baris biaya per template
6. biz_mp_fee_rules             ← opsional (legacy, jika tanpa template)
7. biz_mp_product_mappings
8. biz_sales_import_batches
9. biz_sales_import_lines
10. EDIT biz_invoices + EDIT biz_store_channel_accounts  ← field baru
```

---

## 1. Collection `biz_sales_channels`

**New collection → Name:** `biz_sales_channels` → Type: **Base**

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `code` | Plain text | ✅ Required · ✅ Unique · Min length 1 |
| 2 | `name` | Plain text | ✅ Required |
| 3 | `is_active` | Bool | Default: **true** |
| 4 | `notes` | Plain text | — |

**Contoh record (New record):**

| code | name | is_active |
|------|------|-----------|
| tokopedia | Tokopedia | true |
| shopee | Shopee | true |

---

## 2. Collection `biz_mp_seller_tiers`

**Name:** `biz_mp_seller_tiers`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `channel` | Relation | Collection: **biz_sales_channels** · Max select: **1** · ✅ Required |
| 2 | `code` | Plain text | ✅ Required |
| 3 | `label` | Plain text | ✅ Required |
| 4 | `sort_order` | Number | Min: 0 |
| 5 | `is_active` | Bool | Default: **true** |

**Contoh record (Tokopedia):**

| channel | code | label | sort_order |
|---------|------|-------|------------|
| Tokopedia | regular | Seller Biasa | 1 |
| Tokopedia | premium | Power Merchant / Premium | 2 |
| Tokopedia | official | Official Store | 3 |

**Contoh record (Shopee):**

| channel | code | label | sort_order |
|---------|------|-------|------------|
| Shopee | regular | Regular | 1 |
| Shopee | mall | Shopee Mall | 2 |

---

## 3. Collection `biz_store_channel_accounts`

**Name:** `biz_store_channel_accounts`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `store` | Relation | **biz_stores** · Max: **1** · ✅ Required |
| 2 | `channel` | Relation | **biz_sales_channels** · Max: **1** · ✅ Required |
| 3 | `seller_tier` | Relation | **biz_mp_seller_tiers** · Max: **1** · ✅ Required |
| 4 | `account_name` | Plain text | ✅ Required |
| 5 | `mp_shop_id` | Plain text | — |
| 6 | `default_customer` | Relation | **biz_customers** · Max: **1** · ✅ Required |
| 7 | `is_active` | Bool | Default: **true** |
| 8 | `notes` | Plain text | — |

**Sebelum isi akun:** buat dulu customer generik di `biz_customers`, misalnya:

| name | code | is_active |
|------|------|-----------|
| Pelanggan Tokopedia | CUST-TKP | true |
| Pelanggan Shopee | CUST-SHP | true |

**Contoh akun:**

| account_name | store | channel | seller_tier | default_customer |
|--------------|-------|---------|-------------|------------------|
| CUBUS Tokopedia Regular | CUBUS | tokopedia | regular | Pelanggan Tokopedia |
| CUBUS Tokopedia Premium | CUBUS | tokopedia | premium | Pelanggan Tokopedia |

---

## 4. Collection `biz_mp_fee_rules` — panduan detail PB

Poin 4 ada **2 langkah berbeda**:

| Langkah | Apa yang dilakukan | Di mana di PB |
|--------|---------------------|---------------|
| **A** | Buat **collection + field** (struktur tabel) | Collections → New collection |
| **B** | Isi **record** (aturan biaya nyata) | Collection `biz_mp_fee_rules` → New record |

Banyak orang bingung karena Langkah A (18 field) dan Langkah B (1 record = 1 jenis biaya) dicampur.

---

### Langkah A — Buat collection `biz_mp_fee_rules`

1. Login PocketBase Admin (`http://...:8090/_/` atau server Anda).
2. Menu kiri → **Collections** → tombol **+ New collection**.
3. **Name:** ketik persis: `biz_mp_fee_rules`
4. **Type:** pilih **Base collection** → **Create**.
5. Klik collection `biz_mp_fee_rules` → tab **Fields** → tambah field satu per satu:

#### Field Select `fee_type` (contoh lengkap)

1. Klik **+ New field** → pilih **Select**.
2. **Field name:** `fee_type`
3. Centang **Required**.
4. Di bagian **Options** / values, tambahkan **satu per satu** (tombol +):

```
category_fee
free_shipping
cashback
mall_fee
processing
affiliate
```

5. **Save**.

#### Field Select `calc_type`

- Type: **Select**, name: `calc_type`, Required.
- Values:

```
percent
percent_cap
fixed
fixed_per_qty
```

#### Field Select `applies_to`

- Type: **Select**, name: `applies_to`
- Values:

```
line
order
```

#### Field Relation (sama pola semua)

Contoh field `channel`:

1. **+ New field** → **Relation**
2. Name: `channel`
3. **Collection:** pilih `biz_sales_channels`
4. **Max select:** `1` (single)
5. **Required:** OFF (kosong = berlaku semua channel)
6. Save

Ulangi untuk:

| Field name | Collection |
|------------|------------|
| store | biz_stores |
| store_channel_account | biz_store_channel_accounts |
| seller_tier | biz_mp_seller_tiers |
| internal_category | inv_categories |
| scope_product | inv_products |

#### Field angka & teks (sisanya)

| Field name | Type PB | Catatan |
|------------|---------|---------|
| mp_category | Plain text | |
| rate | Number | |
| max_amount | Number | |
| fixed_amount | Number | |
| valid_from | Date | |
| valid_to | Date | |
| priority | Number | default 0 |
| is_active | Bool | default true |
| notes | Plain text | |

7. Tab **API Rules** → List/View/Create/Update/Delete isi:

```
@request.auth.id != ""
```

8. **Save** collection.

---

### Langkah B — Isi record (aturan biaya)

Satu **record** = satu aturan. Untuk Tokopedia Regular butuh minimal **4 record order** + **1 record per kategori** (Elektronik, Fashion, …).

Cara buat record:

1. Collections → `biz_mp_fee_rules` → **New record**
2. Isi field → **Save**
3. Ulangi untuk setiap biaya

#### Record 1 — Gratis ongkir 4% max 40rb

| Field | Isi |
|-------|-----|
| fee_type | `free_shipping` |
| channel | pilih **Tokopedia** |
| seller_tier | pilih **Seller Biasa** (regular) |
| store | **kosong** |
| store_channel_account | **kosong** |
| calc_type | `percent_cap` |
| rate | `4` |
| max_amount | `40000` |
| fixed_amount | kosong |
| applies_to | `order` |
| priority | `10` |
| is_active | true |

#### Record 2 — Cashback 4,5% max 60rb

| Field | Isi |
|-------|-----|
| fee_type | `cashback` |
| channel | Tokopedia |
| seller_tier | regular |
| calc_type | `percent_cap` |
| rate | `4.5` |
| max_amount | `60000` |
| applies_to | `order` |
| priority | `10` |

#### Record 3 — Biaya mall 1,8% max 50rb

| Field | Isi |
|-------|-----|
| fee_type | `mall_fee` |
| channel | Tokopedia |
| seller_tier | regular |
| calc_type | `percent_cap` |
| rate | `1.8` |
| max_amount | `50000` |
| applies_to | `order` |
| priority | `10` |

#### Record 4 — Biaya pemrosesan fix 1.250

| Field | Isi |
|-------|-----|
| fee_type | `processing` |
| channel | Tokopedia |
| seller_tier | regular |
| calc_type | `fixed` |
| rate | kosong |
| max_amount | kosong |
| fixed_amount | `1250` |
| applies_to | `order` |
| priority | `10` |

#### Record 5 — Biaya kategori Elektronik 8%

| Field | Isi |
|-------|-----|
| fee_type | `category_fee` |
| channel | Tokopedia |
| seller_tier | regular |
| mp_category | ketik: `Elektronik` (harus sama dengan kolom Excel) |
| calc_type | `percent` |
| rate | `8` |
| applies_to | `line` |
| priority | `10` |

**Kategori lain?** New record lagi, ganti `mp_category` + `rate` saja.

#### Premium beda biaya?

Duplikasi record 1–5: ganti **seller_tier** → Premium, ubah angka `rate` / `max_amount` sesuai rate premium.

---

### Ringkas konsep

```
Collection biz_mp_fee_rules = "buku aturan"
Setiap New record           = "1 aturan di buku"

Contoh: "Tokopedia + Regular + gratis ongkir = 4% max 40rb"
```

Field kosong (store, akun) = **berlaku umum** untuk semua toko/akun di channel+tier itu.

---

## 4. Collection `biz_mp_fee_templates` + `biz_mp_fee_template_lines`

**Utama untuk import** — tampilan seperti sheet **Kalkulasi Profit** di UI: **Penjualan Online → Template Kalkulasi**.

### `biz_mp_fee_templates`

| Field | Type | Catatan |
|-------|------|---------|
| `code` | text | Required, unique — `shopee_mall` |
| `name` | text | Required — Shopee Mall |
| `channel` | relation → biz_sales_channels | opsional |
| `seller_tier` | relation → biz_mp_seller_tiers | opsional |
| `is_active` | bool | default true |
| `sort_order` | number | |

### `biz_mp_fee_template_lines`

| Field | Type | Catatan |
|-------|------|---------|
| `template` | relation → biz_mp_fee_templates | Required |
| `label` | text | Gratis Ongkir Extra |
| `code` | text | free_shipping |
| `line_group` | select | `mp_fee` · `operational` · `category` |
| `calc_type` | select | percent · percent_cap · fixed · fixed_per_qty |
| `rate` | number | |
| `max_amount` | number | plafon Rp |
| `fixed_amount` | number | |
| `applies_to` | select | line · order |
| `internal_category` | relation → inv_categories | untuk fee kategori (Tripod, …) |
| `sort_order` | number | |
| `is_active` | bool | |

Tombol **Contoh Shopee Mall** di UI mengisi ~10 baris biaya awal.

---

## 5. Collection `biz_mp_fee_rules` (legacy — jika import tanpa template)

**Name:** `biz_mp_fee_rules`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `fee_type` | Select | ✅ Required · Values (copy per baris): |
| | | | `category_fee` |
| | | | `free_shipping` |
| | | | `cashback` |
| | | | `mall_fee` |
| | | | `processing` |
| | | | `affiliate` |
| 2 | `channel` | Relation | **biz_sales_channels** · Max: **1** |
| 3 | `store` | Relation | **biz_stores** · Max: **1** |
| 4 | `store_channel_account` | Relation | **biz_store_channel_accounts** · Max: **1** |
| 5 | `seller_tier` | Relation | **biz_mp_seller_tiers** · Max: **1** |
| 6 | `mp_category` | Plain text | untuk biaya kategori (mis. `Elektronik`) |
| 7 | `internal_category` | Relation | **inv_categories** · Max: **1** |
| 8 | `scope_product` | Relation | **inv_products** · Max: **1** |
| 9 | `calc_type` | Select | ✅ Required · Values: |
| | | | `percent` |
| | | | `percent_cap` |
| | | | `fixed` |
| | | | `fixed_per_qty` |
| 10 | `rate` | Number | persen (4 = 4%) |
| 11 | `max_amount` | Number | plafon Rp |
| 12 | `fixed_amount` | Number | nominal fix |
| 13 | `applies_to` | Select | Values: `line` · `order` |
| 14 | `valid_from` | Date | — |
| 15 | `valid_to` | Date | — |
| 16 | `priority` | Number | Default: **0** (lebih besar = menang) |
| 17 | `is_active` | Bool | Default: **true** |
| 18 | `notes` | Plain text | — |

**Kosongkan** channel/store/akun/tier = berlaku untuk semua (wildcard).

### Copy-paste: 5 biaya wajib Tokopedia Regular (channel + tier = regular)

Buat **5 record** terpisah. Relation `channel` = Tokopedia, `seller_tier` = Seller Biasa (regular).

| fee_type | calc_type | rate | max_amount | fixed_amount | applies_to | priority |
|----------|-----------|------|------------|--------------|------------|----------|
| free_shipping | percent_cap | 4 | 40000 | | order | 10 |
| cashback | percent_cap | 4.5 | 60000 | | order | 10 |
| mall_fee | percent_cap | 1.8 | 50000 | | order | 10 |
| processing | fixed | | | 1250 | order | 10 |

**Biaya kategori** — 1 record **per kategori produk SERBA** (`internal_category` → `inv_categories`), **bukan** label kategori di marketplace:

| fee_type | calc_type | rate | internal_category | applies_to | priority |
|----------|-----------|------|-------------------|------------|----------|
| category_fee | percent | 8 | Tripod (pilih relation) | line | 10 |
| category_fee | percent | 6 | Aksesoris Kamera | line | 10 |

Kategori untuk hitung biaya & pelunasan **dikunci dari SKU** di master `inv_products` (lihat bagian SKU di bawah).

**Premium beda rate?** Duplikasi record yang sama, ganti `seller_tier` → Premium dan ubah `rate`/`max_amount`.

---

## Kebijakan SKU seragam (wajib)

**Kode produk / SKU** di master `inv_products` (mis. `22344FGG56666`) harus **sama persis** di semua marketplace dan di kolom **`mp_sku`** file import Excel.

Alur sistem:

1. Baris import → cari produk di SERBA lewat `mp_sku` (= SKU master).
2. Ambil **kategori produk** dari master (`inv_products.category`).
3. Rule `category_fee` yang punya `internal_category` dipakai untuk hitung biaya & `expected_net` (pelunasan).

Kolom `mp_category` di Excel **opsional** dan **diabaikan** jika SKU sudah dikenali di SERBA (hindari beda label MP vs kategori internal).

**Mapping SKU** (`biz_mp_product_mappings`) hanya untuk pengecualian jika SKU di MP **memang berbeda** dari SKU SERBA — idealnya tidak dipakai.

---

### EDIT `biz_store_channel_accounts` — tambah field

| Field name | Type | Pengaturan |
|------------|------|------------|
| `default_fee_template` | Relation | **biz_mp_fee_templates** · Max: **1** |

### EDIT `biz_sales_import_batches` — tambah field

| Field name | Type | Pengaturan |
|------------|------|------------|
| `fee_template` | Relation | **biz_mp_fee_templates** · Max: **1** |

### EDIT `biz_sales_import_lines` — tambah field (opsional)

| Field name | Type | Pengaturan |
|------------|------|------------|
| `fee_override_json` | Plain text | JSON breakdown per baris |

---

## 7. Collection `biz_mp_product_mappings`

**Name:** `biz_mp_product_mappings`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `store_channel_account` | Relation | **biz_store_channel_accounts** · Max: **1** |
| 2 | `channel` | Relation | **biz_sales_channels** · Max: **1** |
| 3 | `mp_sku` | Plain text | ✅ Required |
| 4 | `mp_product_name` | Plain text | — |
| 5 | `product` | Relation | **inv_products** · Max: **1** · ✅ Required |
| 6 | `is_active` | Bool | Default: **true** |

---

## 8. Collection `biz_sales_import_batches`

**Name:** `biz_sales_import_batches`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `batch_no` | Plain text | ✅ Required · ✅ Unique |
| 2 | `store_channel_account` | Relation | **biz_store_channel_accounts** · Max: **1** · ✅ Required |
| 3 | `period_from` | Date | — |
| 4 | `period_to` | Date | — |
| 5 | `status` | Select | ✅ Required · Values: |
| | | | `draft` |
| | | | `validated` |
| | | | `posted` |
| | | | `cancelled` |
| 6 | `total_rows` | Number | Default: 0 |
| 7 | `valid_rows` | Number | Default: 0 |
| 8 | `error_rows` | Number | Default: 0 |
| 9 | `posted_rows` | Number | Default: 0 |
| 10 | `source_filename` | Plain text | — |
| 11 | `notes` | Plain text | — |
| 12 | `created_by` | Relation | **users** · Max: **1** |
| 13 | `posted_at` | Date | — |

---

## 9. Collection `biz_sales_import_lines`

**Name:** `biz_sales_import_lines`

| # | Field name | Type | Pengaturan |
|---|------------|------|------------|
| 1 | `batch` | Relation | **biz_sales_import_batches** · Max: **1** · ✅ Required |
| 2 | `row_no` | Number | — |
| 3 | `mp_order_no` | Plain text | ✅ Required |
| 4 | `order_date` | Date | — |
| 4b | `mp_buyer_name` | Plain text | nama pembeli/penerima dari export MP (opsional) |
| 5 | `mp_sku` | Plain text | — |
| 6 | `product_name` | Plain text | — |
| 7 | `mp_category` | Plain text | — |
| 8 | `qty` | Number | — |
| 9 | `unit_price` | Number | — |
| 10 | `gross_amount` | Number | — |
| 11 | `product` | Relation | **inv_products** · Max: **1** |
| 12 | `fee_category` | Number | Default: 0 |
| 13 | `fee_free_shipping` | Number | Default: 0 |
| 14 | `fee_cashback` | Number | Default: 0 |
| 15 | `fee_mall` | Number | Default: 0 |
| 16 | `fee_processing` | Number | Default: 0 |
| 17 | `fee_affiliate` | Number | Default: 0 |
| 18 | `total_fees` | Number | Default: 0 |
| 19 | `expected_net` | Number | Default: 0 |
| 20 | `fee_override_json` | Plain text | — |
| 21 | `validation_status` | Select | Values (copy): |
| | | | `pending` |
| | | | `valid` |
| | | | `error` |
| | | | `posted` |
| | | | `skipped` |
| 22 | `error_message` | Plain text | — |
| 23 | `invoice` | Relation | **biz_invoices** · Max: **1** |

---

## 10. EDIT collection `biz_invoices` (tambah field saja)

Buka **biz_invoices** → tab **Fields** → **New field**:

| Field name | Type | Pengaturan |
|------------|------|------------|
| `source` | Select | Values: `manual` · `marketplace_import` |
| `mp_order_no` | Plain text | nomor order dari MP |
| `mp_buyer_name` | Plain text | nama pembeli dari MP (opsional, untuk nota) |
| `sales_channel` | Relation | **biz_sales_channels** · Max: **1** |
| `store_channel_account` | Relation | **biz_store_channel_accounts** · Max: **1** |
| `expected_net` | Number | omzet − biaya MP |
| `mp_fees_json` | Plain text | JSON breakdown (opsional) |

---

## Checklist sebelum import pertama

- [ ] Collection template (`biz_mp_fee_templates` + lines) sudah dibuat
- [ ] Minimal 1 template (Shopee Mall) + baris biaya
- [ ] Field `default_fee_template` di akun toko-MP (opsional)
- [ ] 6 field baru di `biz_invoices`
- [ ] API rule `@request.auth.id != ""` di semua collection baru
- [ ] Minimal 1 channel + tier + akun toko-MP + customer default
- [ ] Rule biaya (minimal 5 wajib + kategori)
- [ ] SKU di Excel (`mp_sku`) = Kode produk/SKU di `inv_products` (seragam semua MP)
- [ ] Rule `category_fee` pakai `internal_category` (kategori master produk)
- [ ] Mapping SKU hanya jika SKU MP ≠ SKU SERBA (opsional)

---

## Template Excel / CSV

Header (baris pertama):

```
mp_order_no,order_date,mp_buyer_name,mp_sku,product_name,mp_category,qty,unit_price
```

`mp_sku` = SKU master SERBA. `mp_category` boleh dikosongkan.

Contoh isi:

```
ORD-20260528-001,28/05/2026,Budi Santoso,22344FGG56666,COSTA CT-6218 Tripod,,2,250000
ORD-20260528-002,28/05/2026,Siti Aminah,22344FGG56666,COSTA CT-6218 Tripod,,1,250000
```

Download juga dari UI: **Penjualan Online → Import → Template CSV**.
