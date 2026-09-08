# Smoke Test Accounts (dummy)

Generated: 2026-08-27T06:07:02.724Z

**Password:** lihat `SMOKE_PASSWORD` di `.env.local` (default script: `SerbaSmoke2026!`)

| Label | Email | role_code | inventory_role |
| --- | --- | --- | --- |
| HR Admin | `smoke-hr@serba.test` | hr | none |
| Employee | `smoke-employee@serba.test` | staff | none |
| Warehouse Staff | `smoke-warehouse@serba.test` | staff | staff |
| Warehouse Supervisor | `smoke-supervisor@serba.test` | staff | supervisor |
| Purchasing / Sales Admin | `smoke-admin-bisnis@serba.test` | staff | admin |

## Perintah

```bash
npm run smoke:seed   # buat/update akun
npm run smoke:test   # jalankan smoke test
```

Akun prefix `smoke-*` aman dihapus setelah QA.