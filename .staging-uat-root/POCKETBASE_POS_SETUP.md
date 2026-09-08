# PocketBase — setup lengkap untuk Kasir POS

POS **hanya menambah 1 collection baru**: `biz_pos_registers`.  
Transaksi POS memakai collection bisnis/inventory yang **sudah ada** (SO, invoice, customer, import MP, dll.).

Posting transaksi di server memakai **admin PocketBase** (`POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` di `.env.local`).  
Baca/tulis master POS di browser memakai **user login** → butuh API rules di `biz_pos_registers`.

---

## Ringkasan: apa yang harus dibuat di PB

| Status | Collection / hal |
|--------|------------------|
| **BARU — wajib buat** | `biz_pos_registers` (field + API rules di bawah) |
| **BARU — master ekspedisi** | `biz_couriers`, `biz_courier_services` (lihat §11) |
| **Sudah ada — cek rules** | `biz_stores`, `inv_warehouses`, `inv_products`, `biz_product_prices` |
| **Sudah ada — cek rules** | `biz_customers`, `biz_sales_orders`, `biz_sales_order_lines` |
| **Sudah ada — cek rules** | `biz_invoices`, `biz_payments`, `biz_payment_methods` |
| **Mode B — sudah ada** | `biz_store_channel_accounts`, `biz_sales_import_batches`, `biz_sales_import_lines` |
| **Tidak diubah** | `users` (auth default) |

---

## 1. Collection BARU: `biz_pos_registers`

### Buat collection

- **Name:** `biz_pos_registers`
- **Type:** Base
- **Pilih:** Single (bukan View)

### Field (urutan disarankan)

| # | Field name | Type | Pengaturan di PocketBase |
|---|------------|------|---------------------------|
| 1 | `code` | Plain text | Required · **Unique** · min length 2 |
| 2 | `name` | Plain text | Required · contoh: `POS 1` |
| 3 | `address` | Plain text | Opsional · alamat/lokasi fisik terminal |
| 4 | `is_active` | Bool | Required · **Default: `true`** |
| 5 | `notes` | Plain text | Opsional |

**Field lama (opsional / hapus jika belum dipakai):** `store`, `warehouse`, `responsible_name`, `responsible_phone` — **tidak dipakai aplikasi lagi**. Toko, gudang, kasir, dan marketplace dipilih **per sesi** di layar `/pos/setup` setelah login.

Field sistem PB (`id`, `created`, `updated`) otomatis.

### Contoh data

| code | name | address | is_active |
|------|------|---------|-----------|
| POS-01 | Kasir Depan | Jl. Contoh No. 1 | true |

---

## 2. API Rules `biz_pos_registers` (copy-paste)

Buka collection → tab **API Rules** → isi **kelima** kotak dengan rule yang sama (cukup user login):

### List / Search rule

```
@request.auth.id != ""
```

### View rule

```
@request.auth.id != ""
```

### Create rule

```
@request.auth.id != ""
```

### Update rule

```
@request.auth.id != ""
```

### Delete rule

```
@request.auth.id != ""
```

> Artinya: semua user yang sudah login ERP boleh kelola master POS.  
> Jika ingin lebih ketat (mis. hanya owner), ganti dengan rule custom PB Anda — aplikasi POS belum memfilter per role di PB.

---

## 3. Collection LAMA — tidak perlu field baru, tapi rules harus mengizinkan transaksi

### A. Mode langsung (A) — invoice + stok

Server (admin) akan **create/update**:

| Collection | Operasi | Minimal rule untuk admin superuser |
|------------|---------|-------------------------------------|
| `biz_customers` | create, list | Admin full access (default superuser) |
| `biz_sales_orders` | create, update | Admin full access |
| `biz_sales_order_lines` | create | Admin full access |
| `biz_invoices` | create, update | Admin full access |
| `biz_payments` | create (jika bayar) | Admin full access |
| `inv_stock_movements` / API stok | posting keluar | Sudah lewat `POCKETBASE_ADMIN_*` + inventory |

**User login** (browser) perlu **read**:

| Collection | Operasi | Rule disarankan |
|------------|---------|-----------------|
| `biz_payment_methods` | list | `@request.auth.id != ""` |
| `inv_products` | search (via API server) | — |
| `biz_product_prices` | read harga | `@request.auth.id != ""` |

### B. Mode WMS / marketplace (B)

Tambahan dari mode A:

| Collection | Operasi |
|------------|---------|
| `biz_store_channel_accounts` | list (pilih MP di setup POS) |
| `biz_sales_import_batches` | create |
| `biz_sales_import_lines` | create (per baris produk) |
| SO | update + kirim gudang (`send_to_warehouse_at`, workflow JSON) |

**API rules** untuk import (jika belum):

`biz_sales_import_batches` dan `biz_sales_import_lines` — kelima rule:

```
@request.auth.id != ""
```

(sama seperti `POCKETBASE_PAYMENT_IMPORT_SETUP.md`)

### C. Master POS & setup

| Collection | Operasi | Rule |
|------------|---------|------|
| `biz_pos_registers` | list, view, create, update | lihat §2 |
| `biz_stores` | list (expand) | `@request.auth.id != ""` |
| `inv_warehouses` | list (form master) | `@request.auth.id != ""` |

---

## 4. Rule untuk collection yang sering sudah ada (cek ulang)

Jika fitur penjualan manual Anda sudah jalan, biasanya ini **sudah OK**. Kalau POS error 403/404, cek:

### `biz_sales_orders`

List / View / Create / Update (Delete opsional):

```
@request.auth.id != ""
```

### `biz_sales_order_lines`

```
@request.auth.id != ""
```

### `biz_customers`

```
@request.auth.id != ""
```

### `biz_invoices`

```
@request.auth.id != ""
```

Update wajib untuk pelunasan & status invoice.

### `biz_payments`

```
@request.auth.id != ""
```

### `biz_payment_methods`

```
@request.auth.id != ""
```

### `biz_stores`

```
@request.auth.id != ""
```

### `inv_warehouses`

```
@request.auth.id != ""
```

### `inv_products`

```
@request.auth.id != ""
```

### `biz_product_prices` (jika dipakai)

```
@request.auth.id != ""
```

### `biz_store_channel_accounts` (mode B)

```
@request.auth.id != ""
```

---

## 5. Admin server (bukan API rule PB)

Di `.env.local` ERP (wajib untuk simpan transaksi POS):

```env
POCKETBASE_ADMIN_EMAIL=email-superuser-atau-admin@domain.com
POCKETBASE_ADMIN_PASSWORD="password-admin-pb"
NEXT_PUBLIC_POCKETBASE_URL=https://pb.serba.space
```

Akun ini harus bisa **create/update** semua collection di tabel §3 tanpa rule `@request.auth.id` (pakai auth admin / superuser).

---

## 6. User ERP & akses menu

- User kasir harus **login** ERP.
- Di PB field user: `inventory_role` = `staff` / `supervisor` / `admin`, atau `account_type` = `owner` — agar menu **Kasir POS** (`/pos`) terbuka (sama akses modul penjualan).
- Tidak perlu field baru di collection `users` khusus POS.

---

## 7. Metadata POS di Sales Order

Tidak perlu field PB baru. Aplikasi menulis JSON di field **`notes`** pada `biz_sales_orders`:

- Prefix: `[[POS_META]]`
- Berisi: mode direct/wms, register, pembeli, pengiriman, dll.

Pastikan field `notes` di `biz_sales_orders` bertipe **Plain text** (sudah ada).

---

## 8. Checklist sebelum tes `/pos`

- [ ] Collection **`biz_pos_registers`** dibuat dengan 8 field (§1)
- [ ] **5 API rules** `biz_pos_registers` = `@request.auth.id != ""` (§2)
- [ ] Minimal 1 record POS (contoh POS 1 / Dewi / toko / gudang)
- [ ] `biz_stores` punya `default_warehouse` terisi
- [ ] `POCKETBASE_ADMIN_*` di `.env.local` valid
- [ ] `biz_payment_methods` ada & aktif (mode A)
- [ ] `biz_store_channel_accounts` ada (mode B)
- [ ] Import batches/lines rules OK (mode B)
- [ ] Restart `npm run dev` setelah ubah env

---

## 9. Troubleshooting

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Master POS kosong / error collection | `biz_pos_registers` belum ada | Buat §1 |
| 403 saat tambah POS | API rules kosong / salah | Paste §2 |
| 403 saat checkout | Admin env salah atau SO/invoice rule ketat | Cek §5 + §4 |
| Tidak ada akun MP di setup | `biz_store_channel_accounts` kosong / rule | Isi data + rule |
| Stok gagal | `warehouse` POS salah atau stok 0 | Cek gudang & saldo |
| Mode B tanpa batch import | `biz_sales_import_*` rule / admin | Cek §3B |

---

## 10. Alur aplikasi (referensi)

| Fitur | URL |
|-------|-----|
| Master POS | `/bisnis/pos-registers` |
| Master ekspedisi | `/bisnis/ekspedisi` |
| Kasir | `/pos` → setup → sale (popup pengiriman + cetak pickup) |
| Riwayat POS | `/pos/history` — preview & cetak ulang (tanpa edit/hapus) |

- **Mode A:** invoice + struk langsung  
- **Mode B:** SO + WMS + batch import untuk review biaya  

---

## 11. Collection BARU: `biz_couriers` & `biz_courier_services`

**API Rules** (List / View / Create / Update / Delete):

```
@request.auth.id != ""
```

### `biz_couriers`

| Field | Type | Setting |
|-------|------|---------|
| `code` | Text | Opsional · Unique |
| `name` | Text | Required · contoh: `JNE` |
| `logo` | File | Opsional · 1 file gambar (ikon/logo ekspedisi) |
| `is_active` | Bool | Default `true` |
| `notes` | Text | Opsional |

### `biz_courier_services`

| Field | Type | Setting |
|-------|------|---------|
| `courier` | Relation → `biz_couriers` | Max 1 · Required |
| `code` | Text | Opsional |
| `name` | Text | Required · contoh: `Reguler`, `YES`, `Cargo` |
| `sort_order` | Number | Default `0` |
| `is_active` | Bool | Default `true` |

**Contoh data awal:** JNE → Reguler, YES, Cargo · J&T → Reguler, Express · SiCepat → Reguler, BEST.
