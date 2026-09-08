# Workflow Audit Results — SERBA ERP

**Run:** 2026-07-07T09:28:47.264Z
**App:** http://localhost:3000
**PocketBase:** https://pb.serba.space

## Summary

| Outcome | Count |
| --- | --- |
| Pass | 52 |
| Fail | 0 |
| Warn | 8 |
| Skip | 2 |

**Verdict workflow otomatis: PASS** (dengan catatan warn = perlu verifikasi manual)

## HR Module

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| H1 | Login redirect /hr | ✅ |  |
| H4 | Employees page | ✅ |  |
| H7 | Attendance page | ✅ |  |
| H8 | Offices GPS page | ✅ |  |
| H9 | Leave page | ✅ |  |
| H10 | Overtime page | ✅ |  |
| H11 | Profile page | ✅ |  |
| H12 | Locale API GET | ✅ |  |
| H12b | Locale switch EN | ✅ | status 200 |
| H13 | Activity feed API | ✅ |  |
| H14 | Role settings page | ✅ |  |
| H5 | Department data | ⏭️ | Tidak ada koleksi departments terpisah |
| H6 | Position data | ⏭️ | Field di profiles, bukan koleksi terpisah |
| H9b | Pending leave exists | ✅ | pending=9 |
| H7b | Attendance records | ✅ | total=5 |
| H3 | Forgot password API | ✅ | status 200 |
| H15 | Employee dashboard | ✅ |  |
| H16 | Leave request page | ✅ |  |
| H17 | Attendance history | ✅ |  |
| H18 | Employee denied /hr | ⚠️ |  |
| H2 | Logout clears session | ✅ |  |

## ERP Module

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| E1 | Customer page | ✅ |  |
| E2 | Supplier page | ✅ |  |
| E3 | Product page | ✅ |  |
| E4 | Category page | ✅ |  |
| E5 | PO list page | ✅ |  |
| E9 | SO list page | ✅ |  |
| E12 | Stock page | ✅ |  |
| E3b | Catalog API | ✅ |  |
| E1b | Couriers API (penjualan) | ✅ |  |
| E5b | PO data available | ✅ | PO=11 |
| E6 | PO sent to warehouse | ✅ | count=7 |
| E9b | SO data available | ✅ | SO=53 |
| E10 | SO sent to warehouse | ✅ | count=27 |
| E11 | Invoices exist | ✅ | count=31 |
| E7 | Finalize receiving API reachable | ⚠️ | Perlu PO awaiting_business — tidak di-trigger otomatis |
| E8 | AP bill from PO | ⚠️ | Verifikasi manual pada PO received |
| E13 | WH denied penjualan page | ⚠️ |  |
| E14 | WH couriers API | ⚠️ | Staff WH dapat API couriers jika path inventory |

## WMS Module

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| W1 | Receiving page | ✅ |  |
| W3 | Putaway page | ✅ |  |
| W4 | Picking page | ✅ |  |
| W5 | Validasi page | ✅ |  |
| W7 | Pickup page | ✅ |  |
| W8 | Barcode label page | ✅ |  |
| W11 | Audit page | ✅ |  |
| W2 | receiving_workflow_json field | ✅ | Schema audit OK |
| W6 | Packing sessions | ⚠️ | 0 active packing session di PB |
| W9 | Photo upload | ⚠️ | Perlu upload manual multipart |
| W10 | Stock movements | ✅ |  |
| W1b | PO receiving detail | ✅ | PO-20260530-0001 |
| W10b | WMS workstation API | ✅ |  |
| W12 | Opname page (supervisor) | ✅ |  |
| W13 | ERP core products | ✅ |  |
| W12b | Opname API list | ⚠️ |  |

## Security & System

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| LOGIN-hr | Login HR Admin | ✅ | smoke-hr@serba.test |
| LOGIN-employee | Login Employee | ✅ | smoke-employee@serba.test |
| LOGIN-warehouse | Login Warehouse Staff | ✅ | smoke-warehouse@serba.test |
| LOGIN-supervisor | Login Supervisor | ✅ | smoke-supervisor@serba.test |
| LOGIN-admin | Login Admin Bisnis | ✅ | smoke-admin-bisnis@serba.test |
| SEC1 | Share without token denied | ✅ | status 403 |
| SYS1 | Health check | ✅ |  |

## Sign-off (otomatis)

| Role | Pass | Fail | Warn |
| --- | --- | --- | --- |
| HR Admin | 1 | 0 | 0 |
| Employee | 1 | 0 | 0 |
| Warehouse Staff | 1 | 0 | 0 |
| Supervisor | 1 | 0 | 0 |
| Admin Bisnis | 1 | 0 | 0 |