# 📦 POCKETBASE — Modul Inventory SERBA (Lengkap)

**Last Updated:** 16 Mei 2026  
**Version:** 1.0.0  
**Stack:** PocketBase + Next.js (web) + Expo (mobile native)

Dokumen ini adalah **checklist admin PocketBase** untuk modul gudang: master data, stock engine, zona QR, aktivitas staff, packing, opname, audit, dan sync offline.

---

## 🎯 Prinsip

1. **Stok hanya berubah lewat `inv_stock_movements` status `posted`** — client **tidak boleh** create/update/delete `inv_stock_balances`.
2. **Movement `posted` tidak boleh di-edit** — koreksi pakai movement `void` / reversal (fase 2) atau supervisor.
3. **Foto & CCTV tidak disimpan sebagai file/video di PB** — hanya `relative_path` + metadata, dan JSON referensi kamera.
4. **Semua transaksi** simpan: `created_by` / `posted_by`, `device_id`, `device_platform`, waktu, zona (jika ada).

---

## 📋 Daftar collection (23 + update `users`)

| # | Collection | Auth | Keterangan |
|---|------------|------|------------|
| U | **users** (update) | Auth | Tambah field inventory |
| 1 | `inv_warehouses` | Base | Gudang |
| 2 | `inv_categories` | Base | Kategori produk |
| 3 | `inv_brands` | Base | Brand |
| 4 | `inv_cctv_cameras` | Base | Referensi kamera |
| 5 | `inv_locations` | Base | Rak / bin |
| 6 | `inv_zones` | Base | Zona kerja + QR |
| 7 | `inv_packing_stations` | Base | Meja packing |
| 8 | `inv_products` | Base | Master produk |
| 9 | `inv_product_barcodes` | Base | Multi-barcode |
| 10 | `inv_user_warehouse_access` | Base | User ↔ gudang |
| 11 | `inv_stock_balances` | Base | Stok realtime (server only write) |
| 12 | `inv_stock_movements` | Base | Header ledger |
| 13 | `inv_stock_movement_lines` | Base | Detail baris movement |
| 14 | `inv_zone_sessions` | Base | Scan QR zona |
| 15 | `inv_staff_activities` | Base | Log aktivitas |
| 16 | `inv_packing_sessions` | Base | Sesi packing |
| 17 | `inv_packing_checklist_lines` | Base | Checklist packing |
| 18 | `inv_media_files` | Base | Metadata foto (path NAS) |
| 19 | `inv_stock_opname_sessions` | Base | Sesi opname |
| 20 | `inv_stock_opname_lines` | Base | Baris hitung |
| 21 | `inv_stock_opname_adjustments` | Base | Approval supervisor |
| 22 | `inv_audit_log` | Base | Audit trail |
| 23 | `inv_sync_outbox` | Base | Antrean sync offline (opsional server-side) |

---

## 🔤 Semua field SELECT — nilai lengkap

Salin persis ke PocketBase Admin → field Select → **Options** (satu nilai per baris).

### `users.inventory_role` (field baru di collection Auth)

| Nilai | Arti |
|-------|------|
| `none` | Tidak akses modul inventory (default) |
| `staff` | Scan, packing, opname hitung, movement draft |
| `supervisor` | + approve opname, void draft, lihat semua di gudang assign |
| `admin` | + master data, semua gudang, laporan penuh |

> **Owner ERP** (`users.role = "owner"` atau `account_type = "owner"`) dianggap **full access** di semua rule di bawah.

---

### `inv_locations.zone_type`

```
rack
staging
quarantine
bulk
pick_face
```

| Nilai | Pemakaian |
|-------|-----------|
| `rack` | Rak penyimpanan utama |
| `staging` | Area tunggu / staging |
| `quarantine` | Barang hold / QC gagal |
| `bulk` | Palet / bulk storage |
| `pick_face` | Picking e-commerce |

---

### `inv_zones.zone_type`

```
receiving
packing
qc
return
rack
shipping
counting
```

| Nilai | Pemakaian |
|-------|-----------|
| `receiving` | Penerimaan barang |
| `packing` | Packing order |
| `qc` | Quality control |
| `return` | Retur customer |
| `rack` | Aktivitas di area rak |
| `shipping` | Serah ke kurir |
| `counting` | Stock opname |

---

### `inv_stock_movements.movement_type`

```
IN
OUT
TRANSFER
RETURN
DAMAGE
ADJUSTMENT
```

| Nilai | Arah stok |
|-------|-----------|
| `IN` | Masuk (+) ke `to_location` / gudang |
| `OUT` | Keluar (−) dari `from_location` |
| `TRANSFER` | −from +to (bisa beda gudang) |
| `RETURN` | Retur masuk (+) |
| `DAMAGE` | Rusak/hilang (−) |
| `ADJUSTMENT` | Koreksi opname (±) |

---

### `inv_stock_movements.status`

```
draft
posted
void
cancelled
```

| Nilai | Keterangan |
|-------|------------|
| `draft` | Belum mempengaruhi stok |
| `posted` | Sudah update balance (final) |
| `void` | Dibatalkan oleh supervisor (reversal terpisah fase 2) |
| `cancelled` | Dibatalkan sebelum post (masih draft) |

---

### `inv_stock_movements.reference_type`

```
PO
GRN
SO
SHIPMENT
OPNAME
PACKING
RECEIVING
RETURN
MANUAL
TRANSFER
SYSTEM
```

---

### `inv_stock_movements.device_platform`  
### `inv_zone_sessions.device_platform`  
### `inv_staff_activities.device_platform`  
### `inv_packing_sessions.device_platform`

```
web
ios
android
api
```

---

### `inv_zone_sessions.status`

```
active
closed
expired
forced_closed
```

| Nilai | Keterangan |
|-------|------------|
| `active` | Staff sedang di zona |
| `closed` | Check-out normal |
| `expired` | Auto-close sistem (lupa checkout) |
| `forced_closed` | Supervisor tutup paksa |

---

### `inv_staff_activities.activity_type`

```
zone_checkin
zone_checkout
scan_product
scan_location
scan_zone_qr
scan_station_qr
movement_create_draft
movement_add_line
movement_post_request
packing_session_open
packing_scan_order
packing_scan_item
packing_photo_upload
packing_complete
opname_session_join
opname_scan_product
opname_submit_qty
opname_finalize
receiving_scan_po
receiving_scan_item
qc_pass
qc_fail
note
```

---

### `inv_packing_sessions.status`

```
open
in_progress
completed
cancelled
on_hold
```

---

### `inv_stock_opname_sessions.status`

```
draft
counting
review
approved
posted
cancelled
```

| Nilai | Siapa ubah |
|-------|------------|
| `draft` | Supervisor buat di web |
| `counting` | Staff mobile mulai hitung |
| `review` | Selesai hitung, tunggu approval |
| `approved` | Supervisor approve |
| `posted` | Adjustment movement sudah posted |
| `cancelled` | Batal |

---

### `inv_stock_opname_sessions.count_method`

```
full
cycle
spot
```

| Nilai | Arti |
|-------|------|
| `full` | Opname seluruh gudang |
| `cycle` | Cycle count per rak |
| `spot` | Spot check acak |

---

### `inv_stock_opname_lines.line_status`

```
pending
counted
skipped
recount
```

---

### `inv_sync_outbox.status`

```
pending
processing
synced
failed
conflict
```

---

### `inv_sync_outbox.operation`

```
zone.checkin
zone.checkout
movement.create
movement.add_line
movement.post
opname.line
packing.open
packing.scan
packing.complete
media.register
activity.log
```

---

### `inv_media_files.entity_type`

```
packing_session
stock_movement
stock_opname_session
zone_session
receiving
qc
product
other
```

---

### `inv_audit_log.action` (disarankan konsisten)

```
product.create
product.update
product.deactivate
warehouse.create
warehouse.update
movement.create
movement.update_draft
movement.post
movement.cancel
movement.void
opname.create
opname.approve
opname.post
zone_session.open
zone_session.close
balance.manual_block
settings.update
```

---

## 👤 UPDATE collection `users` (Auth)

Tambahkan field di **Collections → users → Fields**:

| Field | Type | Required | Default | Max select | Catatan |
|-------|------|----------|---------|------------|---------|
| `inventory_role` | Select | ✅ | `none` | — | Lihat tabel select di atas |
| `inventory_employee_code` | Text | ❌ | — | — | Kode petugas gudang (opsional) |

**API rules users:** tidak diubah (tetap auth default). Aplikasi baca `inventory_role` setelah login.

**Alternatif:** simpan `inventory_role` di `profiles` jika Anda tidak ingin mengubah auth collection — sesuaikan rule `@request.auth` → load via expand profile (lebih rumit). **Disarankan:** field langsung di `users`.

---

## 📐 Helper rule (konsep — salin potongan ini)

Di PocketBase, gunakan di awal rule (mental model):

```javascript
// Owner ERP full access inventory
@request.auth.role = "owner" ||
@request.auth.account_type = "owner"

// Inventory admin
@request.auth.inventory_role = "admin"

// Inventory supervisor
@request.auth.inventory_role = "supervisor"

// Inventory staff
@request.auth.inventory_role = "staff"

// Punya akses inventory (bukan none)
@request.auth.inventory_role != "none" && @request.auth.inventory_role != ""
```

**Catatan sintaks PB:**  
- `?=` kadang dipakai untuk field opsional; jika error, pastikan field `inventory_role` selalu terisi default `none`.  
- Relasi: `warehouse` di record dibandingkan dengan daftar gudang user via collection `inv_user_warehouse_access` — rule kompleks; untuk fase 1 cukup cek role, fase 2 filter per `warehouse` di API Next.js.

---

## 1️⃣ `inv_warehouses`

**Type:** Base  

| Field | Type | Required | Unique | Default | Min/Max |
|-------|------|----------|--------|---------|---------|
| `code` | Text | ✅ | ✅ | — | max 32 |
| `name` | Text | ✅ | ❌ | — | max 120 |
| `address` | Text | ❌ | ❌ | — | max 500 |
| `timezone` | Text | ❌ | ❌ | `Asia/Jakarta` | |
| `is_active` | Bool | ✅ | ❌ | `true` | |

**Indexes:** unique `code`; index `is_active`

**API Rules:**

```javascript
// List / Search / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  @request.auth.inventory_role = "staff"
)

// Create
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin"
)

// Update
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin"
)

// Delete
@request.auth.role = "owner" ||
(@request.auth.inventory_role = "admin" && @request.data.is_active = false)
```

---

## 2️⃣ `inv_categories`

| Field | Type | Required | Unique | Default |
|-------|------|----------|--------|---------|
| `code` | Text | ✅ | ✅ | — |
| `name` | Text | ✅ | ❌ | — |
| `parent` | Relation → `inv_categories` | ❌ | ❌ | max 1 |
| `sort_order` | Number | ❌ | ❌ | `0` |
| `is_active` | Bool | ✅ | ❌ | `true` |

**API Rules:** sama pola master seperti `inv_warehouses` (admin CRUD, staff+ supervisor read).

---

## 3️⃣ `inv_brands`

| Field | Type | Required | Unique | Default |
|-------|------|----------|--------|---------|
| `code` | Text | ✅ | ✅ | — |
| `name` | Text | ✅ | ❌ | — |
| `is_active` | Bool | ✅ | ❌ | `true` |

**API Rules:** sama `inv_categories`.

---

## 4️⃣ `inv_cctv_cameras`

| Field | Type | Required | Unique | Relation |
|-------|------|----------|--------|----------|
| `code` | Text | ✅ | ✅ | — |
| `name` | Text | ✅ | ❌ | — |
| `warehouse` | Relation | ✅ | ❌ | → `inv_warehouses` max **1** |
| `nvr_id` | Text | ❌ | ❌ | — |
| `channel` | Text | ❌ | ❌ | — |
| `location_label` | Text | ❌ | ❌ | contoh: "Pintu receiving kiri" |
| `playback_hint_url` | Text | ❌ | ❌ | URL/deep-link NVR saja |
| `is_active` | Bool | ✅ | ❌ | default `true` |

**API Rules:**

```javascript
// List / View — semua role inventory
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create / Update / Delete — admin + owner
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## 5️⃣ `inv_locations`

| Field | Type | Required | Relation | Select |
|-------|------|----------|----------|--------|
| `warehouse` | Relation | ✅ | → `inv_warehouses` max 1 | — |
| `code` | Text | ✅ | — | — |
| `name` | Text | ❌ | — | — |
| `zone_type` | Select | ✅ | — | lihat **inv_locations.zone_type** |
| `aisle` | Text | ❌ | — | — |
| `level` | Text | ❌ | — | — |
| `bin` | Text | ❌ | — | — |
| `is_active` | Bool | ✅ | — | default `true` |

**Indexes:** unique composite (`warehouse` + `code`)

**API Rules:** read semua inventory role; CUD admin/owner.

---

## 6️⃣ `inv_zones`

| Field | Type | Required | Catatan |
|-------|------|----------|---------|
| `warehouse` | Relation → `inv_warehouses` | ✅ | max 1 |
| `code` | Text | ✅ | unique per warehouse, mis. `RECEIVING` |
| `name` | Text | ✅ | "Receiving" |
| `zone_type` | Select | ✅ | lihat **inv_zones.zone_type** |
| `qr_payload` | Text | ✅ | `serba:zone:WH-MAIN:RECEIVING` |
| `qr_version` | Number | ❌ | default `1` (rotate QR) |
| `cctv_cameras` | JSON | ❌ | array mapping (lihat contoh bawah) |
| `requires_station` | Bool | ✅ | default `false`; `true` untuk packing |
| `sort_order` | Number | ❌ | default `0` |
| `is_active` | Bool | ✅ | default `true` |

**Contoh `cctv_cameras` JSON:**

```json
[
  {
    "camera": "RECORD_ID_inv_cctv_cameras",
    "label": "Kamera receiving 1",
    "offset_sec_before": 30,
    "offset_sec_after": 120
  }
]
```

**Indexes:** unique (`warehouse` + `code`); index `qr_payload`

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create / Update / Delete
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## 7️⃣ `inv_packing_stations`

| Field | Type | Required |
|-------|------|----------|
| `zone` | Relation → `inv_zones` | ✅ max 1 |
| `warehouse` | Relation → `inv_warehouses` | ✅ max 1 (denormalize) |
| `code` | Text | ✅ |
| `name` | Text | ❌ |
| `qr_payload` | Text | ✅ |
| `is_active` | Bool | ✅ default `true` |

**Indexes:** unique (`zone` + `code`)

**API Rules:** sama `inv_zones`.

---

## 8️⃣ `inv_products`

| Field | Type | Required | Unique | Default |
|-------|------|----------|--------|---------|
| `sku` | Text | ✅ | ✅ | — |
| `barcode` | Text | ❌ | ✅ | barcode utama |
| `name` | Text | ✅ | ❌ | — |
| `category` | Relation → `inv_categories` | ❌ | ❌ | max 1 |
| `brand` | Relation → `inv_brands` | ❌ | ❌ | max 1 |
| `uom` | Text | ✅ | ❌ | `pcs` |
| `uom_per_carton` | Number | ❌ | ❌ | — |
| `default_warehouse` | Relation → `inv_warehouses` | ❌ | ❌ | max 1 |
| `default_location` | Relation → `inv_locations` | ❌ | ❌ | max 1 |
| `min_stock` | Number | ✅ | ❌ | `0` |
| `max_stock` | Number | ❌ | ❌ | — |
| `weight_gram` | Number | ❌ | ❌ | — |
| `is_active` | Bool | ✅ | ❌ | `true` |
| `notes` | Text | ❌ | ❌ | — |

**Indexes:** `sku`, `barcode`, `name` (optional full-text if PB version supports)

**API Rules:**

```javascript
// List / View — semua inventory (butuh baca untuk scan)
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create / Update
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"

// Delete — soft: set is_active false via update; hard delete owner only
@request.auth.role = "owner"
```

---

## 9️⃣ `inv_product_barcodes`

| Field | Type | Required | Unique |
|-------|------|----------|--------|
| `product` | Relation → `inv_products` | ✅ | max 1 |
| `barcode` | Text | ✅ | ✅ global |
| `barcode_type` | Select | ✅ | lihat bawah |
| `is_primary` | Bool | ✅ | default `false` |

**Select `barcode_type`:**

```
ean13
ean8
upc
code128
qr
internal
```

**API Rules:** read semua inventory; CUD admin/owner.

---

## 🔟 `inv_user_warehouse_access`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `user` | Relation → `users` | ✅ | max 1 |
| `warehouse` | Relation → `inv_warehouses` | ✅ | max 1 |
| `is_default` | Bool | ✅ | `false` |
| `can_count` | Bool | ✅ | `true` |
| `can_pack` | Bool | ✅ | `true` |
| `can_receive` | Bool | ✅ | `true` |
| `can_adjust` | Bool | ✅ | `false` |

**Indexes:** unique (`user` + `warehouse`)

**API Rules:**

```javascript
// List / View — user lihat milik sendiri; admin lihat semua
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  user = @request.auth.id
)

// Create / Update / Delete
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## 1️⃣1️⃣ `inv_stock_balances` ⚠️ server-only write

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `warehouse` | Relation → `inv_warehouses` | ✅ | max 1 |
| `location` | Relation → `inv_locations` | ❌ | max 1 (kosong = level gudang) |
| `product` | Relation → `inv_products` | ✅ | max 1 |
| `qty_on_hand` | Number | ✅ | `0` |
| `qty_reserved` | Number | ✅ | `0` |
| `qty_available` | Number | ✅ | `0` |
| `qty_incoming` | Number | ❌ | `0` |
| `version` | Number | ✅ | `0` |
| `last_movement` | Relation → `inv_stock_movements` | ❌ | max 1 |
| `last_posted_at` | DateTime | ❌ | — |

**Indexes:** unique (`warehouse` + `location` + `product`); index `product`, `warehouse`

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create — DILARANG client
false

// Update — DILARANG client (hanya hook/API server)
false

// Delete
@request.auth.role = "owner"
```

---

## 1️⃣2️⃣ `inv_stock_movements`

| Field | Type | Required | Select / Relation |
|-------|------|----------|-------------------|
| `movement_no` | Text | ✅ unique | auto hook |
| `movement_type` | Select | ✅ | IN, OUT, … |
| `status` | Select | ✅ | draft, posted, … |
| `warehouse` | Relation | ✅ | `inv_warehouses` |
| `from_warehouse` | Relation | ❌ | transfer |
| `to_warehouse` | Relation | ❌ | transfer |
| `from_location` | Relation | ❌ | `inv_locations` |
| `to_location` | Relation | ❌ | `inv_locations` |
| `reference_type` | Select | ❌ | PO, SO, … |
| `reference_id` | Text | ❌ | ID dokumen |
| `reference_no` | Text | ❌ | nomor PO/SO tampilan |
| `notes` | Text | ❌ | |
| `posted_at` | DateTime | ❌ | |
| `posted_by` | Relation → `users` | ❌ | max 1 |
| `created_by` | Relation → `users` | ✅ | max 1 |
| `cancelled_at` | DateTime | ❌ | |
| `cancelled_by` | Relation → `users` | ❌ | |
| `device_id` | Text | ❌ | |
| `device_platform` | Select | ❌ | web, ios, … |
| `ip_address` | Text | ❌ | |
| `zone` | Relation → `inv_zones` | ❌ | |
| `zone_session` | Relation → `inv_zone_sessions` | ❌ | |
| `packing_session` | Relation → `inv_packing_sessions` | ❌ | |
| `opname_session` | Relation → `inv_stock_opname_sessions` | ❌ | |
| `cctv_snapshot` | JSON | ❌ | |
| `idempotency_key` | Text | ❌ | unique jika diisi |
| `parent_movement` | Relation → `inv_stock_movements` | ❌ | void/reversal |
| `total_qty` | Number | ❌ | sum lines (hook) |
| `line_count` | Number | ❌ | hook |

**Contoh `cctv_snapshot`:**

```json
{
  "camera": "RECORD_ID_inv_cctv_cameras",
  "camera_code": "CAM-RCV-01",
  "channel": "3",
  "event_at": "2026-05-16T10:32:05.000Z",
  "playback_hint_url": "http://192.168.1.50/playback?ch=3&t=1715848325",
  "offset_sec_before": 30,
  "offset_sec_after": 120
}
```

**Indexes:** unique `movement_no`; unique `idempotency_key` (where not empty); index `status`, `warehouse`, `created`

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  (
    @request.auth.inventory_role = "staff" &&
    (
      created_by = @request.auth.id ||
      posted_by = @request.auth.id
    )
  )
)

// Create — hanya draft, created_by = self
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.status = "draft" &&
@request.data.created_by = @request.auth.id

// Update — hanya draft; staff hanya milik sendiri; supervisor+ semua draft di gudang
@request.auth.id != "" &&
@request.data.status = "draft" &&
(
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  (@request.auth.inventory_role = "staff" && created_by = @request.auth.id)
)

// Delete — hanya draft; admin/owner
@request.auth.id != "" &&
status = "draft" &&
(
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin"
)
```

> **Posting (`status: posted`):** set rule **Update** agar client **tidak bisa** set `posted` — lakukan via **Next.js API** atau PB hook dengan superuser. Jika tetap di PB hook, rule Update untuk field status:

```javascript
// BLOK client post — gunakan hanya jika hook internal
false
```

---

## 1️⃣3️⃣ `inv_stock_movement_lines`

| Field | Type | Required |
|-------|------|----------|
| `movement` | Relation → `inv_stock_movements` | ✅ max 1 |
| `product` | Relation → `inv_products` | ✅ max 1 |
| `qty` | Number | ✅ min 0.0001 |
| `unit_cost` | Number | ❌ |
| `batch_no` | Text | ❌ |
| `serial_no` | Text | ❌ |
| `from_location` | Relation → `inv_locations` | ❌ |
| `to_location` | Relation → `inv_locations` | ❌ |
| `notes` | Text | ❌ |

**Indexes:** index `movement`; unique (`movement` + `product` + `batch_no`) optional

**API Rules:**

```javascript
// List / View — ikut akses movement parent (sederhana: semua inventory)
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create — movement masih draft & user punya akses
@request.auth.id != "" &&
@request.auth.inventory_role != "none"

// Update / Delete — sama; validasi draft di hook
@request.auth.id != "" &&
@request.auth.inventory_role != "none"
```

Tambah **hook** `before create/update`: tolak jika parent movement `status != "draft"`.

---

## 1️⃣4️⃣ `inv_zone_sessions`

| Field | Type | Required | Select |
|-------|------|----------|--------|
| `user` | Relation → `users` | ✅ | |
| `warehouse` | Relation → `inv_warehouses` | ✅ | |
| `zone` | Relation → `inv_zones` | ✅ | |
| `packing_station` | Relation → `inv_packing_stations` | ❌ | |
| `status` | Select | ✅ | active, closed, … |
| `check_in_at` | DateTime | ✅ | |
| `check_out_at` | DateTime | ❌ | |
| `device_id` | Text | ❌ | |
| `device_platform` | Select | ❌ | |
| `ip_address` | Text | ❌ | |
| `cctv_snapshot` | JSON | ❌ | |
| `activity_summary` | Text | ❌ | |
| `closed_reason` | Text | ❌ | |

**Indexes:** index (`user`, `status`); index `warehouse`

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  user = @request.auth.id
)

// Create — diri sendiri, status active
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.user = @request.auth.id &&
@request.data.status = "active"

// Update — check-out sendiri atau supervisor+
@request.auth.id != "" && (
  user = @request.auth.id ||
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor"
)

// Delete — owner only
@request.auth.role = "owner"
```

---

## 1️⃣5️⃣ `inv_staff_activities` (append-only)

| Field | Type | Required |
|-------|------|----------|
| `user` | Relation → `users` | ✅ |
| `warehouse` | Relation → `inv_warehouses` | ✅ |
| `zone` | Relation → `inv_zones` | ❌ |
| `zone_session` | Relation → `inv_zone_sessions` | ❌ |
| `activity_type` | Select | ✅ |
| `entity_type` | Text | ❌ |
| `entity_id` | Text | ❌ |
| `payload` | JSON | ❌ |
| `occurred_at` | DateTime | ✅ |
| `device_id` | Text | ❌ |
| `device_platform` | Select | ❌ |
| `ip_address` | Text | ❌ |

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  user = @request.auth.id
)

// Create — user hanya untuk diri sendiri
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.user = @request.auth.id

// Update
false

// Delete
@request.auth.role = "owner"
```

---

## 1️⃣6️⃣ `inv_packing_sessions`

| Field | Type | Required | Select |
|-------|------|----------|--------|
| `warehouse` | Relation | ✅ | |
| `zone` | Relation → `inv_zones` | ✅ | |
| `zone_session` | Relation → `inv_zone_sessions` | ✅ | |
| `packing_station` | Relation → `inv_packing_stations` | ✅ | |
| `order_ref` | Text | ✅ | nomor order |
| `order_source` | Select | ❌ | `internal`, `marketplace`, `manual` |
| `status` | Select | ✅ | open, completed, … |
| `started_at` | DateTime | ✅ | |
| `completed_at` | DateTime | ❌ | |
| `packed_by` | Relation → `users` | ✅ | |
| `movement` | Relation → `inv_stock_movements` | ❌ | OUT posted |
| `device_id` | Text | ❌ | |
| `device_platform` | Select | ❌ | |
| `notes` | Text | ❌ | |

**Select `order_source`:**

```
internal
marketplace
manual
b2b
```

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  packed_by = @request.auth.id
)

// Create
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.packed_by = @request.auth.id &&
(@request.data.status = "open" || @request.data.status = "in_progress")

// Update
@request.auth.id != "" && (
  packed_by = @request.auth.id ||
  @request.auth.inventory_role = "supervisor" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.role = "owner"
)

// Delete — admin/owner, status != completed
@request.auth.role = "owner" ||
@request.auth.inventory_role = "admin"
```

---

## 1️⃣7️⃣ `inv_packing_checklist_lines`

| Field | Type | Required |
|-------|------|----------|
| `packing_session` | Relation | ✅ → `inv_packing_sessions` max 1 |
| `product` | Relation → `inv_products` | ✅ |
| `sku_snapshot` | Text | ❌ |
| `expected_qty` | Number | ✅ |
| `scanned_qty` | Number | ✅ default `0` |
| `is_complete` | Bool | ✅ default `false` |
| `last_scanned_at` | DateTime | ❌ |
| `scanned_by` | Relation → `users` | ❌ | opsional, untuk audit per baris |

> ⚠️ Collection ini **tidak punya** field `packed_by`.  
> `packed_by` ada di parent **`inv_packing_sessions`**.  
> Jangan tulis `packed_by = @request.auth.id` langsung — PB akan error *unknown field packed_by*.

**API Rules (salin per kotak di PB):**

```javascript
// List / Search / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  @request.auth.inventory_role = "staff"
)
```

```javascript
// Create
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.packing_session != ""
```

```javascript
// Update
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  @request.auth.inventory_role = "staff"
)
```

```javascript
// Delete
@request.auth.role = "owner" ||
@request.auth.inventory_role = "admin"
```

**Opsional (lebih ketat — staff hanya baris sesi miliknya):**  
Ganti **List/View** dan **Update** dengan (butuh relasi `packing_session` → `inv_packing_sessions` sudah benar):

```javascript
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  (
    @request.auth.inventory_role = "staff" &&
    packing_session.packed_by = @request.auth.id
  )
)
```

Jika `packing_session.packed_by` ditolak PB, tetap pakai rule sederhana di atas; validasi session milik user dilakukan di **app / hook**.

---

## 1️⃣8️⃣ `inv_media_files`

| Field | Type | Required |
|-------|------|----------|
| `storage_root` | Text | ✅ |
| `relative_path` | Text | ✅ |
| `original_filename` | Text | ❌ |
| `sha256` | Text | ❌ |
| `mime_type` | Text | ✅ |
| `size_bytes` | Number | ❌ |
| `width` | Number | ❌ |
| `height` | Number | ❌ |
| `captured_at` | DateTime | ✅ |
| `uploaded_at` | DateTime | ✅ |
| `uploaded_by` | Relation → `users` | ✅ |
| `entity_type` | Select | ✅ |
| `entity_id` | Text | ✅ |
| `warehouse` | Relation → `inv_warehouses` | ❌ |
| `device_id` | Text | ❌ |
| `is_verified` | Bool | ❌ default `false` |

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  uploaded_by = @request.auth.id
)

// Create
@request.auth.id != "" &&
@request.auth.inventory_role != "none" &&
@request.data.uploaded_by = @request.auth.id

// Update — verify oleh supervisor+
@request.auth.role = "owner" ||
@request.auth.inventory_role = "admin" ||
@request.auth.inventory_role = "supervisor"

// Delete — admin/owner
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## 1️⃣9️⃣ `inv_stock_opname_sessions`

| Field | Type | Required | Select |
|-------|------|----------|--------|
| `warehouse` | Relation | ✅ | |
| `opname_no` | Text | ✅ unique | |
| `status` | Select | ✅ | draft…posted |
| `count_method` | Select | ✅ | full, cycle, spot |
| `started_by` | Relation → `users` | ✅ | |
| `approved_by` | Relation → `users` | ❌ | |
| `posted_by` | Relation → `users` | ❌ | |
| `count_started_at` | DateTime | ❌ | |
| `count_ended_at` | DateTime | ❌ | |
| `approved_at` | DateTime | ❌ | |
| `posted_at` | DateTime | ❌ | |
| `notes` | Text | ❌ | |
| `movement` | Relation → `inv_stock_movements` | ❌ | ADJUSTMENT |
| `total_lines` | Number | ❌ | hook |
| `total_variance_qty` | Number | ❌ | hook |

**API Rules:**

```javascript
// List / View
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  @request.auth.inventory_role = "staff"
)

// Create — supervisor+
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor"
)

// Update
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor" ||
  (
    @request.auth.inventory_role = "staff" &&
    (@request.data.status = "counting" || status = "counting")
  )
)

// Delete — draft only, admin+
@request.auth.role = "owner" ||
(@request.auth.inventory_role = "admin" && status = "draft")
```

---

## 2️⃣0️⃣ `inv_stock_opname_lines`

| Field | Type | Required | Select |
|-------|------|----------|--------|
| `session` | Relation → `inv_stock_opname_sessions` | ✅ | |
| `product` | Relation → `inv_products` | ✅ | |
| `location` | Relation → `inv_locations` | ❌ | |
| `system_qty` | Number | ✅ | |
| `counted_qty` | Number | ❌ | |
| `variance_qty` | Number | ❌ | hook |
| `line_status` | Select | ✅ | pending, counted, … |
| `scanned_at` | DateTime | ❌ | |
| `scanned_by` | Relation → `users` | ❌ | |
| `recount_qty` | Number | ❌ | |
| `notes` | Text | ❌ | |

**Indexes:** unique (`session` + `product` + `location`)

**API Rules:**

```javascript
// List / View — inventory roles
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Create / Update — staff saat session counting; supervisor+ selalu
@request.auth.id != "" && @request.auth.inventory_role != "none"

// Delete — supervisor+ only
@request.auth.role = "owner" ||
@request.auth.inventory_role = "admin" ||
@request.auth.inventory_role = "supervisor"
```

---

## 2️⃣1️⃣ `inv_stock_opname_adjustments`

| Field | Type | Required |
|-------|------|----------|
| `session` | Relation | ✅ unique per session |
| `movement` | Relation → `inv_stock_movements` | ❌ |
| `approved_by` | Relation → `users` | ✅ |
| `approved_at` | DateTime | ✅ |
| `supervisor_note` | Text | ❌ |
| `total_adjustment_qty` | Number | ❌ |

**API Rules:**

```javascript
// List / View — supervisor+
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor"
)

// Create
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor"
) &&
@request.data.approved_by = @request.auth.id

// Update / Delete — owner/admin
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## 2️⃣2️⃣ `inv_audit_log` (append-only)

| Field | Type | Required |
|-------|------|----------|
| `action` | Select | ✅ |
| `entity_type` | Text | ✅ |
| `entity_id` | Text | ✅ |
| `user` | Relation → `users` | ✅ |
| `warehouse` | Relation → `inv_warehouses` | ❌ |
| `before` | JSON | ❌ |
| `after` | JSON | ❌ |
| `ip_address` | Text | ❌ |
| `device_id` | Text | ❌ |
| `user_agent` | Text | ❌ |
| `occurred_at` | DateTime | ✅ |

**API Rules:**

```javascript
// List / View — supervisor+
@request.auth.id != "" && (
  @request.auth.role = "owner" ||
  @request.auth.inventory_role = "admin" ||
  @request.auth.inventory_role = "supervisor"
)

// Create — hook/server only
false

// Update / Delete
false
```

---

## 2️⃣3️⃣ `inv_sync_outbox`

| Field | Type | Required | Select |
|-------|------|----------|--------|
| `idempotency_key` | Text | ✅ unique | |
| `user` | Relation → `users` | ✅ | |
| `warehouse` | Relation → `inv_warehouses` | ❌ | |
| `operation` | Select | ✅ | |
| `payload` | JSON | ✅ | |
| `client_created_at` | DateTime | ✅ | |
| `synced_at` | DateTime | ❌ | |
| `server_record_id` | Text | ❌ | |
| `status` | Select | ✅ | pending… |
| `error` | Text | ❌ | |
| `retry_count` | Number | ❌ default `0` |

**API Rules:**

```javascript
// List / View — own records
@request.auth.id != "" && user = @request.auth.id

// Create
@request.auth.id != "" &&
@request.data.user = @request.auth.id

// Update — server sync worker atau user retry
@request.auth.id != "" && user = @request.auth.id

// Delete — admin
@request.auth.role = "owner" || @request.auth.inventory_role = "admin"
```

---

## ⚙️ Hooks PocketBase (wajib)

| Hook | Collection | Event | Fungsi |
|------|------------|-------|--------|
| `inv_mov_number` | `inv_stock_movements` | onCreate | Generate `movement_no`: `MOV-YYYYMMDD-#####` |
| `inv_mov_block_posted_edit` | `inv_stock_movements` | onUpdate | Tolak jika record lama `status=posted` |
| `inv_mov_lines_draft_only` | `inv_stock_movement_lines` | onCreate/Update | Parent harus `draft` |
| `inv_balance_on_post` | `inv_stock_movements` | onUpdate | Jika `status` → `posted`: update `inv_stock_balances` |
| `inv_opname_variance` | `inv_stock_opname_lines` | onCreate/Update | `variance_qty = counted_qty - system_qty` |
| `inv_zone_one_active` | `inv_zone_sessions` | onCreate | Cegah 2 session `active` per user+warehouse |
| `inv_audit_on_post` | `inv_stock_movements` | onUpdate posted | Insert `inv_audit_log` |

> Jika hook balance terlalu kompleks di PB, jalankan posting hanya dari **Next.js API** dengan admin token.

---

## 🌱 Data seed minimal

```text
inv_warehouses:     WH-MAIN / Gudang Utama
inv_zones:          RECEIVING, PACKING, QC, RETURN, RACK (isi qr_payload)
inv_packing_stations: PACK-01, PACK-02 (zone PACKING)
inv_categories:     GENERAL
inv_brands:         NO-BRAND
inv_products:       SKU-TEST-001, barcode, min_stock 5
inv_user_warehouse_access: assign staff ke WH-MAIN
users:              inventory_role = staff | supervisor | admin
```

**Movement pembuka stok awal:**

- 1× `inv_stock_movements`: type `ADJUSTMENT`, status `posted`, reference `MANUAL`, line qty 100
- Cek `inv_stock_balances` terisi

---

## 📱 Realtime subscribe (client)

| Collection | Filter contoh |
|------------|----------------|
| `inv_stock_balances` | `warehouse = "WH_ID"` |
| `inv_stock_movements` | `warehouse = "WH_ID" && status = "posted"` |
| `inv_stock_opname_sessions` | `status = "review"` |
| `inv_zone_sessions` | `status = "active"` |

---

## ✅ Checklist admin PB

- [ ] Update `users`: `inventory_role` select + default `none`
- [ ] Buat 23 collection `inv_*` sesuai urutan relasi
- [ ] Isi **semua** opsi Select persis seperti dokumen ini
- [ ] Set relation **Max select = 1** kecuali disebut multiple
- [ ] Pasang unique index yang disebut
- [ ] Pasang API rules per collection
- [ ] Pasang hooks (atau rencana API Next.js untuk post movement)
- [ ] Seed gudang, zona, QR, produk uji
- [ ] Test: staff create draft movement ❌ tidak ubah balance
- [ ] Test: post movement ✅ balance berubah
- [ ] Test: staff ❌ create balance langsung

---

## 🔗 File terkait implementasi app

- Web: `app/(dashboard)/inventory/` (belum dibuat)
- Mobile: `mobile/app/inventory/` (belum dibuat)
- Gate operasional: `lib/operational-access-gate.ts` (bisa diperluas path `/inventory`)

---

**Selesai.** Gunakan dokumen ini sebagai satu-satunya referensi saat mengisi PocketBase Admin UI field per field.
