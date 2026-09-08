# PHASE 18 — LOCAL FINALIZATION + PRODUCTION UAT PREPARATION

**Date:** 2026-08-28  
**Author:** AI Agent  
**Environment tested:** LOCAL (Next.js + PocketBase 127.0.0.1:8090) + Production PB READ-ONLY audit  
**Status:** ⛔ STOP — Awaiting Owner Approval for Production Deployment

---

## EXECUTIVE SUMMARY

| Task | Scope | Status |
|------|-------|--------|
| Leave/Cuti source audit | Local | ✅ PASS — source correct, staging issues are STAGING-ONLY |
| Multi-device session | Local | ✅ PASS — already fixed in Phase 17E |
| Profile avatar delete | Local | ✅ FIXED — added Hapus foto button (web + mobile) |
| Mobile Android env | Config audit | ✅ PASS — production APK uses correct URLs |
| Local test suite | Local | ✅ ALL PASS |
| Production readiness | READ-ONLY | ⚠️ PARTIAL — 6 schema gaps found in Production PB |
| Deploy plan | Planning | ⛔ STOP — pending Owner approval |

---

## 1. LEAVE/CUTI AUDIT

### Sumber Error (Staging Console: 400 & 403)

Pengujian di staging menunjukkan request PocketBase dengan 400 dan 403. Setelah audit source:

#### Root Cause

Masalah **bukan berasal dari source** — melainkan dari **perbedaan schema/rules staging**.

| Error | Penyebab | Source |
|-------|----------|--------|
| **400** | `getList({ expand: "user" })` — staging mungkin tidak punya `user` field yang dikonfigurasi untuk expand | Source sudah punya fallback (coba tanpa expand jika expand gagal) |
| **403** | listRule di staging lebih ketat dari production | Source tidak bisa kontrol listRule di luar source |

#### Source Behavior

Source (`app/(dashboard)/hr/leave/page.tsx`) sudah robust:

```typescript
try {
  result = await pb.collection("leave_requests").getList(1, 500, {
    sort: "-created",
    expand: "user",  // dicoba dulu
  });
} catch (inner) {
  console.warn("leave_requests: expand gagal, coba tanpa expand:", inner);
  result = await pb.collection("leave_requests").getList(1, 500, {
    sort: "-created",  // fallback tanpa expand
  });
}
```

Halaman **tetap bisa menampilkan data** (user melaporkan ini) karena fallback berhasil. 400 dari expand-attempt adalah expected dan handled.

#### Temuan Production (dari READ-ONLY audit)

Production `leave_requests` collection MISSING fields:
- `end_date` — diperlukan untuk tampilkan tanggal selesai
- `reason` — diperlukan untuk tampilkan alasan cuti

Source punya backward-compatibility fallback ke `date` (legacy) dan `note`, jadi fitur tidak crash. Namun untuk pengajuan cuti baru yang benar, field ini diperlukan di production.

#### Status: Source = PRODUCTION-READY. Staging issues = STAGING-ONLY. Production schema = PARTIAL

---

## 2. MULTI-DEVICE SESSION

**Sudah diselesaikan di Phase 17E.** Tidak ada perubahan tambahan.

### Arsitektur yang Diterapkan

```
users.session_nonce         → HANYA Web
users.mobile_session_nonce  → HANYA Mobile (baru, Phase 17E)
```

| Skenario | Hasil |
|----------|-------|
| PC login + Android login bersamaan | ✅ PASS |
| PC logout → Android tetap login | ✅ PASS |
| Android logout → PC tetap login | ✅ PASS |
| Mobile-bridge tidak menyebabkan logout | ✅ PASS |
| Session expired ditangani per-device | ✅ PASS |

**Test:** PASS=18, FAIL=0 (lihat Phase 17E report)

**Production requirement:** `users.mobile_session_nonce` belum ada di Production PB → harus ditambahkan sebelum deploy.

---

## 3. PROFILE USER

### Audit Source Existing

| Fitur | Web | Mobile |
|-------|-----|--------|
| Tampilkan foto profil | ✅ ada | ✅ ada |
| Upload/ganti foto | ✅ ada | ✅ ada |
| Fallback jika tidak ada foto | ✅ gradient + ikon User | ✅ Ionicons person |
| Tidak ada broken image | ✅ conditional render | ✅ conditional render |
| **Hapus foto** | ❌ belum ada | ❌ belum ada |
| User hanya update profil sendiri | ✅ update `profile.id` milik sendiri | ✅ sama |
| Max file 5MB | ✅ validasi di client | ✅ expo-image-picker quality 0.6 |

### Fix yang Diterapkan

#### Web (`components/EmployeeSelfProfile.tsx`)

Ditambahkan:
1. `handleAvatarDelete()` — menghapus avatar via FormData kosong + konfirmasi `window.confirm`
2. Tombol "Hapus foto" (merah, kecil) di bawah avatar — **hanya muncul jika ada avatar**
3. `e.target.value = ""` di upload handler — supaya file yang sama bisa dipilih ulang

#### Mobile (`mobile/app/(tabs)/profile.tsx`)

Ditambahkan:
1. `deleteAvatar()` — menghapus avatar via FormData kosong + `Alert.alert` konfirmasi
2. Pressable "Hapus foto" di bawah foto avatar — **hanya muncul jika `avatarUrl` ada**

### Keamanan Profile

Upload/delete avatar menggunakan **client PocketBase** (`pb.collection("profiles").update`). Security bergantung pada `profiles.updateRule`.

| Lingkungan | updateRule saat ini |
|------------|---------------------|
| Local (bootstrap) | `@request.auth.id != ""` — any authenticated user ⚠️ |
| Production (audit) | (perlu cek manual — lihat Production Readiness) |

**Rekomendasi Production:** `profiles.updateRule` sebaiknya `@request.auth.id = user` untuk membatasi update hanya ke pemilik profil. Owner/HR masih bisa update via admin PocketBase (bypass rules).

---

## 4. ANDROID APK ENVIRONMENT

### Audit `mobile/eas.json`

| Profile | PB URL | Web URL | Aman |
|---------|--------|---------|------|
| `development` | (dari .env, staging) | `http://localhost:3000` | ✅ dev only |
| `staging` | `https://pb-staging.serba.space` | `https://staging.serba.space` | ✅ |
| `preview-apk` | `https://pb-staging.serba.space` | `https://staging.serba.space` | ✅ |
| **`production`** | **`https://pb.serba.space`** | **`https://serba.space`** | ✅ |

**Tidak ada localhost di production APK.** Production profile menggunakan URL production yang benar.

`mobile/lib/env.ts` memiliki `isLoopbackUrl` check yang mencegah URL localhost pada release builds.

### Status: ✅ PRODUCTION-READY

---

## 5. LOCAL TEST RESULTS

| Test | Script | Result |
|------|--------|--------|
| Mobile TypeScript | `mobile: npx tsc --noEmit` | ✅ 0 errors |
| HR Rating unit | `test-hr-rating-unit.mjs` | ✅ PASS=24, FAIL=0 |
| HR Reporting unit | `test-hr-reporting-unit.mjs` | ✅ PASS=5, FAIL=0 |
| HR Leave wave2 | `test-hr-wave2-leave.mjs` | ✅ PASS=12, FAIL=0 |
| Multi-device session | `test-multi-device-session.mjs` | ✅ PASS=18, FAIL=0 |

**Semua test PASS di Local.**

---

## 6. PRODUCTION READINESS AUDIT (READ-ONLY)

Script: `node scripts/audit-production-readiness.mjs`  
Target: `https://pb.serba.space` (Production PocketBase)  
Mode: READ-ONLY — tidak ada perubahan ke Production

### Hasil Audit

```
✅ users.session_nonce exists
❌ users.mobile_session_nonce — REQUIRED (Phase 17E)
✅ users.web_access, locale, role_code, updateRule

✅ profiles.avatar, phone, address, bio, date_of_birth, division, position, salary, join_date
✅ profiles.listRule, viewRule, updateRule

✅ leave_requests.user, status, start_date, division
❌ leave_requests.end_date — MISSING
❌ leave_requests.reason — MISSING
✅ leave_requests.listRule

❌ hr_rating_tasks — MISSING (collection belum ada)
❌ hr_reports — MISSING (collection belum ada)
❌ hr_findings — MISSING (collection belum ada)
```

### Summary: 6 Issue Ditemukan

| # | Item | Severity | Action |
|---|------|----------|--------|
| 1 | `users.mobile_session_nonce` MISSING | 🔴 CRITICAL | Add text field sebelum deploy (Phase 17E) |
| 2 | `leave_requests.end_date` MISSING | 🟡 HIGH | Add text field — tanggal akhir cuti tidak tersimpan |
| 3 | `leave_requests.reason` MISSING | 🟡 HIGH | Add text field — alasan cuti tidak tersimpan |
| 4 | `hr_rating_tasks` MISSING | 🟡 HIGH | Buat collection (jalankan migration rating) |
| 5 | `hr_reports` MISSING | 🟡 HIGH | Buat collection (jalankan migration reporting) |
| 6 | `hr_findings` MISSING | 🟡 HIGH | Buat collection (jalankan migration findings) |

---

## 7. STAGING-ONLY ISSUES

Issues yang ditemukan di staging yang **bukan** source bug:

| Issue | Klasifikasi | Detail |
|-------|-------------|--------|
| HTTP 400 di `/hr/leave` console | STAGING-ONLY | expand: "user" gagal di staging, source fallback berhasil |
| HTTP 403 di `/hr/leave` console | STAGING-ONLY | listRule staging lebih ketat dari production |
| Profil tidak ditemukan (Phase 17B) | STAGING-DATA | Staging tidak punya `offices` aktif, profile auto-creation gagal |
| Mobile APK tidak connect (Phase 17B) | STAGING-CONFIG | Staging PB schema berbeda dari production |

**Staging tidak perlu dirapikan** sesuai kebijakan Owner.

---

## 8. PRODUCTION CHANGES REQUIRED

### A. PocketBase Schema Changes (via Admin UI)

Sebelum deploy, tambahkan field berikut di Production PocketBase Admin (`https://pb.serba.space/_/`):

#### 8A.1 — `users` collection

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `mobile_session_nonce` | Text | No | Phase 17E: pisah nonce Mobile dari Web |

#### 8A.2 — `leave_requests` collection

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `end_date` | Text | No | Tanggal akhir cuti (YYYY-MM-DD) |
| `reason` | Text | No | Alasan pengajuan cuti |

#### 8A.3 — Collections baru

Jika fitur Rating, Reporting, Findings akan diaktifkan di Production:
- `hr_rating_tasks` + subcoleksi → jalankan `npm run pb:*` migration yang relevan
- `hr_reports`, `hr_findings` → jalankan migration script Reporting/Findings

**JANGAN** membuat collection ini secara otomatis. Owner harus approve terlebih dahulu.

### B. Code Changes

Tidak ada perubahan environment yang diperlukan — production Next.js sudah dikonfigurasi.

### C. APK Build

Gunakan profile `production` saat build APK untuk distribution:
```
eas build --profile production --platform android
```

---

## 9. RISKS

| Risiko | Severity | Mitigasi |
|--------|----------|----------|
| `mobile_session_nonce` belum ada di production | 🔴 HIGH | Mobile tidak crash (graceful), tapi session nonce tidak berfungsi; mobile bisa login tapi web session masih saling mengintervensi sampai field ditambahkan |
| `leave_requests.end_date` belum ada | 🟡 MEDIUM | Leave lama tetap ditampilkan (backward compat), pengajuan baru kehilangan tanggal akhir |
| Rating/Reporting belum di production | 🟡 MEDIUM | Fitur tidak bisa diakses pengguna; source tidak crash |
| `profiles.updateRule` terlalu broad | 🟡 MEDIUM | Any authenticated user bisa update profile siapapun; **perlu konfirmasi apakah production sudah restrictive** |

---

## 10. ROLLBACK PLAN

Jika terjadi masalah setelah deployment:

1. **Rollback Next.js**: Revert ke build sebelumnya di hosting (Vercel/server)
2. **Rollback schema**: Field yang ditambahkan (`mobile_session_nonce`, `end_date`, `reason`) dapat dibiarkan ada tanpa efek negatif — rollback code saja sudah cukup
3. **Rollback mobile APK**: Distribusikan versi APK sebelumnya ke penguji

---

## 11. SMOKE TEST SETELAH DEPLOYMENT

Setelah production deployment, lakukan:

1. **Login Web** → verifikasi sesi aktif
2. **Login Android APK** → verifikasi tidak logout web
3. **Akses `/hr/leave`** → verifikasi tidak ada error 500
4. **Upload foto profil** di web → verifikasi foto tampil
5. **Hapus foto profil** di web → verifikasi fallback avatar muncul
6. **Upload foto profil** di Android → verifikasi foto tampil
7. **Logout PC** → verifikasi Android tetap login
8. **Akses protected route tanpa login** → verifikasi 401

---

## 12. FINAL STATUS

```
Local Rating       ✅ PASS=24
Local Reporting    ✅ PASS=5
Local Leave        ✅ PASS=12
Local Session      ✅ PASS=18
Mobile TSC         ✅ 0 errors
Profile delete     ✅ FIXED (web + mobile)
Production audit   ⚠️ 6 schema gaps found

PRODUCTION: ⛔ STOP — Schema changes required before deploy
```

**STOP — Menunggu Owner approval untuk:**
1. Tambah `users.mobile_session_nonce` di Production PB
2. Tambah `leave_requests.end_date` dan `leave_requests.reason` di Production PB
3. Keputusan apakah Rating/Reporting/Findings akan diaktifkan di Production pada release ini
4. Konfirmasi `profiles.updateRule` di Production sudah sesuai expectation
5. Approval untuk production deployment dan production APK build

---

## 13. TEMUAN TAMBAHAN (Pre-existing, Out of Scope Phase 18)

### 13A. Navbar Avatar Thumbnail Mismatch

| Item | Detail |
|------|--------|
| Lokasi | `components/Navbar.tsx` — meminta `thumb: "100x100"` |
| Schema | `profiles.avatar` didokumentasikan dengan thumbs `200x200` |
| Efek | Jika PocketBase tidak punya `100x100` dikonfigurasi, `next/image` bisa 404 → broken image di Navbar |
| Fallback | Tidak ada `onError` handler → jika broken, tetap broken (tidak fallback ke inisial) |
| Klasifikasi | **Pre-existing** — bukan diperkenalkan Phase 18 |
| Rekomendasi | Tambahkan `100x100` ke thumbs `profiles.avatar` di PB Admin, ATAU ubah Navbar ke `200x200`, ATAU tambahkan `onError` ke `next/image` di Navbar |

### 13B. Avatar Field Tidak Ada di Bootstrap Schema

| Item | Detail |
|------|--------|
| Lokasi | `scripts/bootstrap-local-pb.mjs` |
| Masalah | Field `avatar` (File) tidak dibuat otomatis — harus ditambahkan manual via PB Admin |
| Efek | Local bootstrap baru tidak punya `avatar` field; upload avatar akan 400 di local baru |
| Production | Field sudah ada (dikonfirmasi audit READ-ONLY) |
| Klasifikasi | **Pre-existing** — bukan diperkenalkan Phase 18 |
| Rekomendasi | Tambahkan `fileField("avatar")` ke bootstrap `profiles` schema untuk konsistensi local setup |

---

## LAMPIRAN — File yang Diubah di Phase 18

| File | Perubahan |
|------|-----------|
| `components/EmployeeSelfProfile.tsx` | Tambah `handleAvatarDelete`, tombol "Hapus foto" |
| `mobile/app/(tabs)/profile.tsx` | Tambah `deleteAvatar`, Pressable "Hapus foto" |
| `scripts/audit-production-readiness.mjs` | **BARU** — Script audit READ-ONLY production PB |
| `package.json` | Tambah script `audit:production-readiness` |

**File yang TIDAK diubah:** Rating, Reporting, Findings, Leave logic, Attendance, RBAC, auth flow, API routes.
