# Sprint E2E Write Tests — SERBA ERP

**Run:** 2026-07-07T09:39:38.663Z
**App:** http://localhost:3000

## Summary

| PASS | FAIL | WARN | SKIP |
| --- | --- | --- | --- |
| 16 | 0 | 3 | 0 |

## RBAC

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| RB1 | Unauthenticated /hr/employees → login | ✅ PASS | status=307 loc=/login |
| RB2 | Employee denied /hr/employees | ✅ PASS | status=307 loc=/dashboard-staff |
| RB3 | HR allowed /hr/employees | ✅ PASS | status=200 |
| RB4 | WH staff allowed WMS/ERP inventory paths | ✅ PASS | status=200 (inventory overlay by design) |
| RB5 | WH staff denied HR admin | ✅ PASS | status=307 |

## HR

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| H1 | Create leave request (pending) | ✅ PASS | x9ohz1u404w6cyz |
| H2 | HR approve leave | ✅ PASS | approved |
| H3 | Attendance native-only | ✅ PASS | Absensi web redirect — verifikasi manual di app native |

## ERP

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| E1 | PO data exists | ✅ PASS | PO-20260527-556 |
| E2 | SO data exists | ✅ PASS | SO-20260528-711 |
| E3 | Invoice exists | ✅ PASS | INV-20260526-978 |
| E4 | PO → Receiving → Stock (write) | ⚠️ WARN | Tidak di-trigger otomatis — verifikasi manual di /gudang/penerimaan |
| E5 | SO → Invoice → Stock reduction (write) | ⚠️ WARN | Tidak di-trigger otomatis — verifikasi manual di /bisnis/penjualan |

## Share

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| S1 | Ensure share URL with token | ✅ PASS | http://localhost:3000/share/invoice/c436da54ijv7g9m?token=c54b26ee77414b6b915e20 |
| S2 | Public share API with token (no login) | ✅ PASS | status=200 |
| S3 | Share without token denied | ✅ PASS | status=403 |

## WMS

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| W1 | Photo upload multipart | ✅ PASS | files=1 |
| W2 | Packing session API (expects zone check-in) | ✅ PASS | Check-in zona packing dulu sebelum mulai sesi packing. |
| W3 | Packing session E2E write | ⚠️ WARN | Perlu check-in zona packing + meja aktif — verifikasi manual |
