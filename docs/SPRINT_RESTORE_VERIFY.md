# Sprint Restore Verify — SERBA ERP

## Latest drill (Phase 10) — PASS

**Run:** 2026-08-12T08:28:21Z (UTC)  
**Mode:** STAGING ONLY restore from production backup  
**Checkpoint:** Leave Security Hardening `fad420b7ceab949e1778d487c659636f67428dee` (unchanged; production leave rules not modified)

| Item | Value |
| --- | --- |
| Backup file | `pb_backup_acme_20260812071839.zip` |
| Location (prod, read-only source) | `/var/www/pocketbase-erp/pb_data/backups/pb_backup_acme_20260812071839.zip` |
| Size | 202 323 686 bytes (~193 MB) |
| SHA256 | `bfda55b546e28e877bd640e7f36dd6b621b3811452bbcca1236cdc05ff089104` |
| Restore target | `/var/www/pocketbase-erp-staging/pb_data` |
| Staging bind | `127.0.0.1:8092` · PM2 `pb-erp-staging` · PB **0.22.0** |
| Production | `/var/www/pocketbase-erp` · `0.0.0.0:8091` · PM2 `pb-erp` — **not restarted** |

### Procedure used (PB 0.22)

PocketBase **0.22.0 has no `pocketbase restore` CLI**. Per `docs/BACKUP_RESTORE.md` + manual extract:

1. Verify backup SHA256  
2. `pm2 stop pb-erp-staging` only  
3. Safety rename: `pb_data` → `pb_data.pre-restore-20260812082821` (leave-fixture staging, ~2.3 MB)  
4. Copy zip to `/tmp` (do **not** modify prod `backups/`)  
5. `unzip` into **new** `/var/www/pocketbase-erp-staging/pb_data`  
6. `pm2 start pb-erp-staging`  
7. Validate health + admin read + collection spot counts  

### Drill results

| Check | Result |
| --- | --- |
| Backup integrity (size + SHA256) | **PASS** |
| Restore to staging only | **PASS** |
| Staging `/api/health` | **PASS** (200) |
| Schema/collections (93) | **PASS** |
| ERP data spot-check | **PASS** |
| WMS/inventory spot-check | **PASS** |
| Finance spot-check | **PASS** |
| Leave data | **PASS** |
| Production untouched | **PASS** (health 200, PM2 restarts **0**, leave create/update/delete still **null**) |
| Rollback readiness | **PASS** (`pb_data.pre-restore-20260812082821` retained) |

### Spot counts (staging after restore, admin read-only)

| Collection | totalItems |
| --- | ---: |
| users | 23 |
| profiles | 23 |
| leave_requests | 28 |
| biz_company_profile | 3 |
| biz_sales_orders | 65 |
| biz_sales_order_lines | 71 |
| biz_invoices | 69 |
| biz_payments | 6 |
| biz_purchase_orders | 11 |
| biz_purchase_order_lines | 14 |
| biz_purchase_bills | 6 |
| inv_products | 7 |
| inv_stock_balances | 23 |
| inv_stock_movements | 95 |
| inv_warehouses | 10 |

### Rollback (staging only)

```bash
pm2 stop pb-erp-staging
rm -rf /var/www/pocketbase-erp-staging/pb_data
mv /var/www/pocketbase-erp-staging/pb_data.pre-restore-20260812082821 /var/www/pocketbase-erp-staging/pb_data
pm2 start pb-erp-staging
```

### Known limitations

- Restored staging contains **production-derived data** (treat as sensitive; do not commit/export PII into Git).  
- Staging admin credentials match the **restored backup** (production admin at backup time).  
- Staging is loopback-only (`127.0.0.1:8092`); use SSH tunnel for workstation access.  
- Backup zip includes a large `logs.db` (~1 GB uncompressed); restored `pb_data` ≈ **1.1 GB**.  
- Pre-restore leave **fixture** staging was replaced; safety copy kept for rollback.  
- This drill does **not** restore app `public/uploads/` (WMS local files) — see `BACKUP_RESTORE.md` uploads section.  
- Do **not** point staging and production at a shared `pb_data` directory.

---

## Earlier run (2026-07-07) — historical

**Run:** 2026-07-07T09:39:14.743Z  
**PocketBase:** https://pb.serba.space

| PASS | FAIL | WARN |
| --- | --- | --- |
| 11 | 1 | 1 |

| ID | Test | Result | Detail |
| --- | --- | --- | --- |
| R1 | Admin PB login | ✅ PASS |  |
| R2 | User login (smoke-hr) | ✅ PASS | smoke-hr@serba.test |
| R3 | Backup PB dibuat di server | ✅ PASS | pb_backup_acme_20260522111950.zip |
| R4 | Unduh backup zip | ⚠️ WARN | HTTP 403 — unduh manual via PB Admin |
| R5–R12 | Data counts | ✅ PASS | users/profiles/PO/SO/invoice/movements/leave/attendance |
| R13 | Restore ke staging PB | ❌ FAIL *(superseded by Phase 10 PASS above)* | Staging instance did not exist yet on 7 Jul |
