# PHASE 17D — MULTI-DEVICE SESSION AUDIT

Date: 2026-08-28  
Status: AUDIT COMPLETE — No code changed, no schema changed, no deployment

---

## Ringkasan Eksekutif

Sistem saat ini menerapkan **single-session enforcement** via field `session_nonce` di koleksi
`users` PocketBase. Setiap login baru (web atau mobile) menulis nonce baru ke field yang sama,
yang secara otomatis mencabut semua sesi perangkat lain dalam ~30 detik.

Ini adalah perilaku yang **dirancang secara eksplisit** — komentar dalam kode menyebutnya:

> "rotasi nonce di server → perangkat lain dengan token lama tidak punya nonce yang cocok"

Owner memutuskan bahwa Web dan Android boleh login bersamaan.
Perubahan minimal dibutuhkan untuk mengaktifkan multi-device session.

---

## 1. Arsitektur Session Saat Ini

### 1a. Token PocketBase

PocketBase mengeluarkan **JWT token** per user per auth event. Token:
- Berlaku selama durasi yang dikonfigurasi di PocketBase admin (default: 5 hari atau sesuai setting)
- **Tidak langsung dicabut** saat token lain dikeluarkan — PocketBase tidak menyimpan daftar token aktif
- Divalidasi oleh PocketBase saat `authRefresh` atau request API menggunakan Bearer token
- Token lama **tetap valid** di PocketBase level sampai expired — PocketBase tidak single-session secara native

**Artinya: PocketBase secara native mendukung multi-device login.** Invalidasi dilakukan di **application layer**, bukan di PocketBase.

### 1b. `session_nonce` — Mekanisme Single-Session di Application Layer

```
users table (PocketBase):
  ┌─────────────────────────────────────────────┐
  │ id  │ email │ ... │ session_nonce           │
  │     │       │     │ TEXT — satu nilai global │
  └─────────────────────────────────────────────┘
```

`session_nonce` adalah **satu field teks** per user. Setiap login baru menggantinya dengan UUID baru.

---

## 2. Login Flow — Web vs Mobile

### Web Login (`app/login/page.tsx` + `lib/auth-session.ts`)

```
1. pb.collection("users").authWithPassword(email, password)
   → PocketBase mengeluarkan token JWT

2. finalizeSuccessfulLogin(userId)
   ├── ensureAndSyncProfile(userId)
   └── registerWebSessionAfterAuth(pb)           ← CRITICAL
         ├── nonce = crypto.randomUUID()
         ├── pb.collection("users").update(id, { session_nonce: nonce })
         │    ← PATCH pb.serba.space/api/collections/users/records/{id}
         │    ← MENULIS NONCE BARU KE DATABASE
         └── localStorage.setItem("erp_pb_session_nonce", nonce)

3. syncPbAuthCookie(pb)
   └── POST /api/auth/session → Set HttpOnly cookie "pb_auth"
```

### Mobile Login (`mobile/context/auth.tsx` + `mobile/lib/auth-session.ts`)

```
1. pb.collection("users").authWithPassword(email, password)
   → PocketBase mengeluarkan token JWT

2. registerMobileSessionAfterAuth(pb)             ← CRITICAL
   ├── nonce = crypto.randomUUID()
   ├── pb.collection("users").update(id, { session_nonce: nonce })
   │    ← PATCH pb-staging.serba.space/api/collections/users/records/{id}
   │    ← MENULIS NONCE BARU KE DATABASE (field yang SAMA)
   └── SecureStore.setItemAsync("erp_pb_session_nonce", nonce)

3. Token tersimpan di pb.authStore (AsyncAuthStore → SecureStore)
```

---

## 3. Mekanisme Deteksi & Invalidasi Session

### Web: `WebSessionGuard.tsx` (realtime/polling)

```typescript
// Cek setiap kali menerima update user via realtime/polling:
const server = String(e.record.session_nonce).trim();
const local  = getWebSessionNonce();  // dari localStorage

if (server && local && server !== local) {
  clearWebSessionNonce();
  pb.authStore.clear();
  window.location.href = "/login?reason=session";
  // User melihat: "Sesi Anda berakhir karena akun masuk di perangkat lain."
}
```

### Web: `(dashboard)/layout.tsx` (saat mount)

```typescript
// Saat komponen layout mount:
const freshUser = await pb.collection("users").authRefresh();
if (shouldLogoutForSessionMismatch(freshUser)) {
  await clearClientAuthSession(pb);
  router.replace("/login?reason=session");
}
```

### Mobile: `mobile/context/auth.tsx` (realtime/polling)

```typescript
// Cek setiap kali menerima update user:
const server = String(e.record.session_nonce).trim();
const local  = await getMobileSessionNonce();  // dari SecureStore

if (server && local && server !== local) {
  await logoutSessionNonceMismatch();
  router.replace("/(auth)/login");
}
```

### Polling interval (saat realtime dinonaktifkan)

| Platform | Env var | Default |
|---|---|---|
| Mobile APK (eas.json) | `EXPO_PUBLIC_PB_DISABLE_REALTIME=true` | polling 30 detik |
| Web | `NEXT_PUBLIC_PB_DISABLE_REALTIME` | tergantung env |

**APK yang dibangun dengan `preview-apk` atau `production` profile selalu dalam mode POLLING.**
Artinya mismatch terdeteksi dalam ~30 detik, bukan secara instan.

---

## 4. Simulasi Skenario Multi-Device

### Skenario A: Login PC → Login Android

```
T=0   PC login        → session_nonce di DB = "nonce-PC"
                         localStorage PC      = "nonce-PC"

T=5s  Android login  → session_nonce di DB = "nonce-AND"  ← DITIMPA
                         SecureStore Android  = "nonce-AND"

T=30s WebSessionGuard/polling PC
      getOne(users.id) → session_nonce = "nonce-AND"
      localStorage      = "nonce-PC"
      "nonce-AND" ≠ "nonce-PC" → PC LOGOUT ✗
      Pesan: "Sesi Anda berakhir karena akun masuk di perangkat lain."
```

### Skenario B: Login Android → Login PC

```
T=0   Android login  → session_nonce di DB = "nonce-AND"
                         SecureStore Android  = "nonce-AND"

T=5s  PC login       → session_nonce di DB = "nonce-PC"   ← DITIMPA
                         localStorage PC      = "nonce-PC"

T=30s Android polling
      getOne(users.id) → session_nonce = "nonce-PC"
      SecureStore       = "nonce-AND"
      "nonce-PC" ≠ "nonce-AND" → Android LOGOUT ✗
```

### Skenario C: Logout PC (TIDAK mempengaruhi Android)

```
PC logout:
  clearWebSessionNonce()  → hanya hapus localStorage PC
  pb.authStore.clear()    → hanya hapus memory PC
  DELETE /api/auth/session → hanya hapus cookie PC
  (TIDAK menulis nonce baru ke database)

Android:
  session_nonce di DB = "nonce-AND"  ← tidak berubah
  Android polling cek: server = "nonce-AND" = local "nonce-AND" → TETAP LOGIN ✓
```

**Logout satu perangkat TIDAK mengganggu perangkat lain** — logout hanya menghapus state lokal,
tidak merotasi nonce di database.

### Skenario D: Mobile Bridge (Mobile → Web)

```
Mobile membuka link ke web app:
  /mobile-bridge → app/mobile-bridge/page.tsx
  registerWebSessionAfterAuth(pb) DIPANGGIL
  → session_nonce di DB = "nonce-BRIDGE" (baru)
  → localStorage web  = "nonce-BRIDGE"

Android polling (30s):
  server = "nonce-BRIDGE" ≠ SecureStore "nonce-AND" → Android LOGOUT ✗

```
⚠️ **Mobile bridge juga menyebabkan mobile logout** saat user membuka web dari dalam app.

---

## 5. Pemetaan Semua Penggunaan session_nonce

| File | Fungsi | Perilaku |
|---|---|---|
| `lib/auth-session.ts` | `registerWebSessionAfterAuth()` | **TULIS** nonce baru ke DB + localStorage |
| `lib/auth-session.ts` | `shouldLogoutForSessionMismatch()` | **BACA** — bandingkan server vs localStorage |
| `lib/auth-session.ts` | `syncWebSessionNonceFromUser()` | **SYNC** — salin dari server ke localStorage jika lokal kosong |
| `lib/auth-session.ts` | `clearWebSessionNonce()` | **HAPUS** dari localStorage saja |
| `mobile/lib/auth-session.ts` | `registerMobileSessionAfterAuth()` | **TULIS** nonce baru ke DB + SecureStore |
| `mobile/lib/auth-session.ts` | `shouldLogoutMobileSessionMismatch()` | **BACA** — bandingkan server vs SecureStore |
| `mobile/lib/auth-session.ts` | `ensureMobileSessionNonceSynced()` | **SYNC** — salin dari server ke SecureStore jika lokal kosong |
| `mobile/lib/auth-session.ts` | `clearMobileSessionNonce()` | **HAPUS** dari SecureStore saja |
| `app/login/page.tsx` | `finalizeSuccessfulLogin()` | memanggil `registerWebSessionAfterAuth` |
| `app/mobile-bridge/page.tsx` | `run()` | memanggil `registerWebSessionAfterAuth` ⚠️ |
| `mobile/context/auth.tsx` | `signInWithPassword()` | memanggil `registerMobileSessionAfterAuth` |
| `mobile/context/auth.tsx` | `signInWithOtp()` | memanggil `registerMobileSessionAfterAuth` |
| `components/WebSessionGuard.tsx` | subscribe/poll | mendeteksi mismatch → logout web |
| `mobile/context/auth.tsx` | subscribe/poll | mendeteksi mismatch → logout mobile |
| `app/(dashboard)/layout.tsx` | `verifySession()` | mendeteksi mismatch saat mount → logout web |
| `app/api/auth/session/route.ts` | GET | membaca `session_nonce` dari PB model untuk cookie |

---

## 6. Jawaban atas Pertanyaan Diagnosis

### A. Apakah sistem saat ini single-session atau multi-session?

**Single-session.** Hanya satu perangkat yang dapat login aktif pada satu waktu.
`session_nonce` yang dibagi satu field global per user memaksa hal ini.

### B. Mengapa login PC dapat membuat HP logout?

Saat PC login, `registerWebSessionAfterAuth` menulis UUID baru ke `users.session_nonce`.  
HP melakukan polling setiap 30 detik, membaca `users` record, menemukan nonce baru ≠ nonce di
SecureStore → HP langsung logout.

**Kode yang bertanggung jawab:** `lib/auth-session.ts:44-50` + `mobile/context/auth.tsx:218-228`

### C. Apakah sebaliknya juga terjadi? (Android login → PC logout)

**Ya.** `registerMobileSessionAfterAuth` menulis UUID baru ke field yang sama.  
PC web melakukan poll/subscribe ke PocketBase, mendeteksi mismatch → PC logout dengan pesan:
"Sesi Anda berakhir karena akun masuk di perangkat lain."

**Kode yang bertanggung jawab:** `mobile/lib/auth-session.ts:30-43` + `components/WebSessionGuard.tsx:89-106`

### D. Apakah `session_nonce` menyebabkan invalidasi session perangkat lain?

**Ya, secara eksplisit dan by design.** Komentar dalam kode:

```typescript
// lib/auth-session.ts baris 41-43:
/**
 * Setelah auth sukses: rotasi nonce di server → perangkat lain dengan token lama
 * tidak punya nonce yang cocok (cek di guard + realtime).
 */
```

### E. Apa perubahan minimal agar Web + Android dapat login bersamaan?

Ada dua opsi yang masing-masing punya trade-off:

---

**Opsi 1 — Pisah nonce per platform (RECOMMENDED)**

Ganti satu field `session_nonce` (global) menjadi dua field terpisah:

```
users table:
  web_session_nonce    TEXT  ← hanya web yang baca/tulis
  mobile_session_nonce TEXT  ← hanya mobile yang baca/tulis
```

Web login hanya merotasi `web_session_nonce`.  
Mobile login hanya merotasi `mobile_session_nonce`.  
Keduanya hanya mengecek field miliknya sendiri.

- **Schema change:** Ya — tambah field `mobile_session_nonce`, rename usage web ke `web_session_nonce`
- **Code change:** Web: tulis + baca `web_session_nonce` saja. Mobile: tulis + baca `mobile_session_nonce` saja
- **Security:** Masih ada proteksi single-session per platform. Login web ke-2 akan logout web ke-1. Login Android ke-2 akan logout Android ke-1.
- **"Logout all devices":** Bisa dilakukan dengan menghapus/merotasi KEDUA field sekaligus

---

**Opsi 2 — Hapus nonce check untuk mobile (SIMPLER)**

Tetap gunakan `session_nonce` untuk single-session web.  
Mobile tidak menulis nonce saat login, dan tidak mengecek nonce.

- **Schema change:** Tidak perlu
- **Code change:** `registerMobileSessionAfterAuth` — hapus `update session_nonce`. Mobile `AuthProvider` — hapus `shouldLogoutMobileSessionMismatch` check
- **Security:** Web masih single-session. Mobile tidak ada cross-device protection. Jika mobile device hilang/dicuri, session masih valid sampai token PB expired
- **Trade-off:** User tidak bisa "kick" mobile session dari web

---

**Opsi 3 — Nonce sebagai daftar (KOMPLEKS, tidak direkomendasikan dulu)**

Simpan `session_nonce` sebagai JSON array. Setiap login menambah entry baru.
"Logout all devices" mengosongkan array.

- **Schema change:** Ya — perlu change type atau field JSON
- **Code change:** Signifikan di web + mobile
- **Security:** Paling fleksibel tapi paling kompleks

---

### F. Apakah perubahan membutuhkan schema?

| Opsi | Schema change |
|---|---|
| Opsi 1 (pisah nonce per platform) | **Ya** — tambah `mobile_session_nonce` ke `users` schema |
| Opsi 2 (hapus mobile nonce check) | **Tidak** — hanya code change |
| Opsi 3 (nonce array) | **Ya** |

### G. Apakah ada dampak security?

**Opsi 1:** Minimal. Masih ada single-session per platform. Login web ke-2 tetap logout web ke-1.

**Opsi 2:** Moderat. Mobile session tidak punya cross-device protection. Jika credential dicuri, penyerang yang login di mobile tidak akan kick session mobile yang sah. Namun PocketBase token tetap expire secara natural. Akun nonaktif (status ≠ active) tetap di-block. Ini adalah trade-off acceptable jika mobile digunakan oleh pemilik sendiri.

**Semua opsi tidak menghilangkan:** PocketBase token expiry, account status check, credential validation.

### H. Apakah production saat ini perlu diubah?

**Opsi 2** (hapus mobile nonce check): Tidak perlu schema change — hanya code change. Deploy web terbaru ke production. Production PB tidak perlu diubah.

**Opsi 1** (pisah nonce per platform): Perlu menambah field `mobile_session_nonce` ke production PB `users` collection, kemudian deploy code yang menggunakannya.

---

## 7. Temuan Tambahan: Mobile Bridge

`app/mobile-bridge/page.tsx` memanggil `registerWebSessionAfterAuth(pb)` saat user membuka
web dari dalam app mobile. Ini **juga** menyebabkan mobile logout dalam ~30 detik.

Ini adalah **bug** — mobile bridge seharusnya tidak merotasi nonce karena itu bukan
login baru, melainkan forward sesi yang sudah ada.

Fix untuk mobile-bridge: hapus atau ganti menjadi `syncWebSessionNonceFromUser()` (yang hanya
menyalin nonce dari server ke localStorage tanpa merotasinya).

---

## 8. Tidak Ada Mekanisme "Logout Semua Perangkat" Eksplisit

Saat ini tidak ada tombol "Logout semua perangkat" di web atau mobile.  
Logout hanya menghapus state lokal, bukan menulis nonce baru ke database.

Jika Owner menginginkan "Logout semua perangkat", implementasinya adalah:
merotasi `session_nonce` (dan `mobile_session_nonce` jika Opsi 1 diterapkan) tanpa menyimpan
nilai baru di localStorage/SecureStore → semua perangkat terdeteksi mismatch → semua logout.

---

## 9. Production Safety

```
Production: UNTOUCHED
Code:       TIDAK DIUBAH
Schema:     TIDAK DIUBAH
Deploy:     TIDAK ADA
```

---

## 10. Rekomendasi untuk Owner

Pilih satu opsi sebelum langkah berikutnya:

| | Opsi 1: Pisah Nonce Per Platform | Opsi 2: Hapus Mobile Nonce Check |
|---|---|---|
| Schema change production | Ya (tambah 1 field) | Tidak |
| Code change | Sedang | Minimal |
| Web single-session | Tetap ya | Tetap ya |
| Mobile single-session | Tetap ya (per platform) | Tidak |
| Fix mobile-bridge bug | Terpisah, wajib | Terpisah, wajib |
| Security level | Lebih tinggi | Acceptable |
| Complexity | Sedang | Rendah |

**Rekomendasi:** Opsi 2 untuk jangka pendek (UAT), Opsi 1 untuk production final.  
Mobile-bridge bug harus difix di kedua opsi.

---

*STOP. Menunggu keputusan Owner sebelum implementasi.*
