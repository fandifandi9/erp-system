# Smoke Test Checklist — Manual E2E per Role

Gunakan bersama `npm run smoke:test` (otomatis RBAC + data).  
Untuk uji login/API/page live, set `SMOKE_PASSWORD` di `.env.local` (password shared akun uji).

**Lingkungan:** dev server `npm run dev` + PB `https://pb.serba.space`

---

## Personas yang wajib ada di PocketBase

| Persona | `account_type` | `role_code` | `inventory_role` | `web_access` |
| --- | --- | --- | --- | --- |
| Super Admin | owner | — | admin (opsional) | true |
| HR Admin | user | hr | none | true |
| Employee | user | staff | none | true |
| Warehouse Staff | user | staff | staff | true |
| Warehouse Supervisor | user | staff | supervisor | true |
| Purchasing / Sales | user | staff | admin atau supervisor | true |

---

## HR Module

Login sebagai **HR Admin** (`/hr`):

| # | Flow | Langkah | Expected |
| --- | --- | --- | --- |
| H1 | Login | `/login` → credentials HR | Redirect `/hr`, no console error |
| H2 | Logout | Navbar logout | `/login`, cookie cleared |
| H3 | Forgot password | `/login` → lupa password | Email terkirim / token valid |
| H4 | Employees | `/hr/employees` → buka detail | Data tampil, tidak blank |
| H5 | Department | CRUD departemen (jika UI ada) | Simpan tanpa 500 |
| H6 | Position | CRUD jabatan | Simpan tanpa 500 |
| H7 | Attendance | `/hr/attendance` | Record absensi tampil |
| H8 | GPS / Offices | `/hr/offices` | Koordinat kantor tampil |
| H9 | Leave | `/hr/leave` → approve/reject 1 | Status berubah |
| H10 | Overtime | `/hr/overtime` | List + approve |
| H11 | Profile | `/profile` | Avatar, bahasa ID/EN |
| H12 | Language | Profile → ganti EN → refresh | UI berubah, `/api/user/locale` 200 |
| H13 | Notification | Bell icon | Feed tampil |
| H14 | Settings | `/pengaturan/role` | Ringkasan role tampil |

Login sebagai **Employee** (`/dashboard-staff`):

| # | Flow | Expected |
| --- | --- | --- |
| H15 | Dashboard staff | `/dashboard-staff` load |
| H16 | Leave request | Ajukan cuti → pending |
| H17 | Attendance self | Riwayat absensi sendiri |
| H18 | Denied HR admin | `/hr/employees` → redirect |

---

## ERP Module

Login sebagai **Purchasing** (`inventory_role` supervisor/admin + akses pembelian):

| # | Flow | Langkah | Expected |
| --- | --- | --- | --- |
| E1 | Customer | `/bisnis/customer` | List load |
| E2 | Supplier | `/bisnis/supplier` | List load |
| E3 | Product | `/bisnis/produk` atau `/katalog/produk` | List load |
| E4 | Category | `/bisnis/kategori` | List load |
| E5 | Purchase Order | Buat PO draft → confirm | PO tersimpan |
| E6 | PO → WMS | Kirim ke gudang | `send_to_warehouse_at` terisi |
| E7 | Receiving finalize | Setelah WMS QC (jika exception) | Status resolved |
| E8 | Invoice AP | Tagihan dari PO | Bill tercipta |

Login sebagai **Sales**:

| # | Flow | Expected |
| --- | --- | --- |
| E9 | Sales Order | Buat SO → confirm |
| E10 | SO → WMS | Kirim ke gudang |
| E11 | Invoice | Generate invoice dari SO |
| E12 | Stock view | `/bisnis/stok` atau `/inventory/stock` |

Login sebagai **Warehouse staff** (tanpa ERP core):

| # | Flow | Expected |
| --- | --- | --- |
| E13 | Denied penjualan | `/bisnis/penjualan` blocked |
| E14 | Denied pembelian | `/bisnis/pembelian` blocked |

---

## WMS Module

Login sebagai **Warehouse Staff**:

| # | Flow | Langkah | Expected |
| --- | --- | --- | --- |
| W1 | Receiving | `/gudang/penerimaan` → buka PO | QC panel load |
| W2 | QC | Isi qty actual + workflow | `receiving_workflow_json` tersimpan |
| W3 | Putaway | `/gudang/putaway` | Stok transit |
| W4 | Picking | `/wms/permintaan-barang/picking` | Queue SO |
| W5 | Validasi | Scan + foto | Session update |
| W6 | Packing | Complete packing | Status SO update |
| W7 | Pickup | `/wms/pickup` | AWB / pickup gate |
| W8 | Barcode label | `/gudang/label` | PDF generate (no hang) |
| W9 | Photo upload | Upload foto WMS | File tersimpan |
| W10 | Stock posting | Movement posted | Balance update |
| W11 | Audit trail | `/gudang/audit` atau aktivitas | Log tampil |

Login sebagai **Supervisor**:

| # | Flow | Expected |
| --- | --- | --- |
| W12 | Opname approve | `/gudang/opname` approve |
| W13 | ERP core | `/inventory/products` allowed |

---

## Role access matrix (quick)

| Route | HR | Employee | WH Staff | Supervisor | Owner |
| --- | --- | --- | --- | --- | --- |
| `/hr/employees` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `/dashboard-staff` | ❌* | ✅ | ✅ | ✅ | ✅ |
| `/bisnis/penjualan` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/bisnis/pembelian` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `/wms/receiving` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `/inventory/products` | ❌ | ❌ | ❌ | ✅ | ✅ |

\* HR default landing `/hr`, bukan dashboard staff.

---

## Cara menjalankan otomatis

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run smoke:test
```

Hasil: `docs/SMOKE_TEST_RESULTS.md`

---

## Sign-off

| Role | Tester | Date | Pass/Fail | Notes |
| --- | --- | --- | --- | --- |
| Super Admin | Audit otomatis | 7 Jul 2026 | N/A | Pakai akun owner produksi |
| HR Admin | Audit otomatis | 7 Jul 2026 | **PASS** | smoke-hr@serba.test — lihat WORKFLOW_AUDIT |
| Employee | Audit otomatis | 7 Jul 2026 | **PASS** | smoke-employee@serba.test |
| Warehouse | Audit otomatis | 7 Jul 2026 | **PASS** | smoke-warehouse@serba.test |
| Purchasing | Audit otomatis | 7 Jul 2026 | **PASS** | smoke-admin-bisnis@serba.test |
| Sales | Audit otomatis | 7 Jul 2026 | **PASS** | smoke-supervisor@serba.test (supervisor+) |
