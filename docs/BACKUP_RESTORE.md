# Backup & Restore — SERBA ERP

## PocketBase (database + uploads di server PB)

### Otomatis (script)

```bash
npm run backup:pb
```

- Membuat backup via Admin API PocketBase.
- Menyimpan ke `backups/pb/pb-backup-<timestamp>.zip` jika unduh berhasil.
- Jika unduh gagal (403 pada beberapa host), backup tetap ada di server — unduh manual dari **PocketBase Admin → Settings → Backups**.

### Restore (uji di staging dulu)

**PENTING:** Production PB di VPS adalah **0.22.0** — binary ini **tidak** punya perintah `pocketbase restore`. Gunakan Admin UI **atau** extract manual ke **staging** saja.

1. Stop **hanya** proses staging (contoh: `pm2 stop pb-erp-staging`). Jangan stop `pb-erp` production.
2. Safety-rename `pb_data` staging (rollback), contoh: `mv pb_data pb_data.pre-restore-<timestamp>`.
3. Salin zip backup ke `/tmp` (jangan ubah folder `backups/` production).
4. Extract ke **`/var/www/pocketbase-erp-staging/pb_data`** saja — **bukan** `/var/www/pocketbase-erp/pb_data`.
5. Start staging (`pm2 start pb-erp-staging`), cek `http://127.0.0.1:8092/api/health`.
6. Alternatif UI: PocketBase Admin staging → Settings → Backups → **Restore** (backup harus ada di `pb_data/backups` instance itu).

Bukti drill sukses: [SPRINT_RESTORE_VERIFY.md](./SPRINT_RESTORE_VERIFY.md) (Phase 10, 12 Agu 2026).

## Upload lokal aplikasi (`public/uploads/`)

WMS photos dan file lokal disimpan di folder ini (tidak multi-instance).

```bash
npm run backup:uploads
```

Output: `backups/uploads/uploads-<timestamp>.tar.gz`

### Restore upload lokal

```bash
tar -xzf backups/uploads/uploads-YYYY-MM-DD.tar.gz -C .
```

## Jadwal produksi (rekomendasi)

| Item | Frekuensi | Retensi |
| --- | --- | --- |
| PocketBase | Harian 02:00 | 14 hari |
| Upload lokal | Harian 03:00 | 7 hari |

Gunakan cron/Task Scheduler di host Docker atau VM.

## Checklist restore test

- [ ] Restore PB zip ke instance staging
- [ ] Login Super Admin berhasil
- [ ] Satu PO + satu SO masih konsisten
- [ ] File foto WMS masih terbaca (jika backup upload dipulihkan)
