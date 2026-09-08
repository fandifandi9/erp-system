# PHASE 17B — MOBILE APK ENVIRONMENT DIAGNOSIS

Date: 2026-08-28  
Status: DIAGNOSIS COMPLETE — No code changed, no data modified, no deployment

---

## 1. APK Profile & Baked-in URLs

### eas.json — Profile Chain

```
preview-apk
  └── extends: preview
        └── extends: staging
              └── extends: base
```

| Field | Value (baked into preview-apk APK) |
|---|---|
| `EXPO_PUBLIC_POCKETBASE_URL` | `https://pb-staging.serba.space` |
| `EXPO_PUBLIC_ERP_WEB_URL` | `https://staging.serba.space` |
| `android.buildType` | `apk` |
| `distribution` | `internal` |
| `EXPO_PUBLIC_PB_DISABLE_REALTIME` | `true` |

**Conclusion:** If the APK was built with profile `preview-apk`, it connects to **staging**, not production.

> ⚠️ If the installed APK was built with a different profile (e.g., `production`) by the user/owner
> directly on EAS, it would connect to `https://pb.serba.space` (production PocketBase).
> The Phase 17B diagnosis covers both cases below.

---

## 2. Login Flow — Complete Call Sequence

```
[User taps Masuk]
   │
   ▼
pb.collection("users").authWithPassword(email, password)
   │  ← PocketBase REST: POST https://pb-staging.serba.space/api/collections/users/auth-with-password
   │
   ├── SUCCESS → token + record in pb.authStore
   │
   ▼
registerMobileSessionAfterAuth(pb)
   │  ← pb.collection("users").update(id, { session_nonce: nonce })
   │  ← PocketBase REST: PATCH https://pb-staging.serba.space/api/collections/users/records/{id}
   │
   ├── FAIL (403 / field error) → pb.authStore.clear() → throw "Gagal memperbarui sesi…"
   │     ↑ User sees this on login screen. NOT "Profil tidak ditemukan".
   │
   └── SUCCESS / silent (ignored unknown field) → login done
         │
         ▼
      router.replace("/(tabs)/attendance")
```

**Source:** `mobile/context/auth.tsx:149-185`, `mobile/lib/auth-session.ts:30-43`

### Critical dependency: `session_nonce` field on PocketBase `users`

`registerMobileSessionAfterAuth` tries to PATCH `users` with `{ session_nonce: <uuid> }`.

| Condition | What PocketBase does | What mobile does |
|---|---|---|
| `session_nonce` field exists + `updateRule = "@request.auth.id = id"` | ✅ PATCH succeeds | Login succeeds |
| `session_nonce` field missing, PB version silently ignores unknown fields | ✅ PATCH "succeeds" (field dropped) | Login succeeds |
| `session_nonce` field missing, PB version rejects unknown fields | ❌ 400 error | "Gagal memperbarui sesi…" shown on login — NOT "Profil tidak ditemukan" |
| `updateRule` is null (superuser-only) | ❌ 403 error | "Gagal memperbarui sesi…" shown on login — NOT "Profil tidak ditemukan" |

**Key finding:** The `session_nonce` field is defined only in `scripts/bootstrap-local-pb.mjs` (local dev setup). It is **NOT added** by any staging-targeted script (`pb-apply-hr-rating-schema-staging.mjs`, `seed-hr-leave-staging.mjs`, `seed-hr-attendance-office-staging.mjs`).

**Key finding:** `users.updateRule = "@request.auth.id = id"` is set only in `bootstrap-local-pb.mjs`. It was **not confirmed to exist on staging PB**.

**Conclusion on login:** If the user sees "Profil tidak ditemukan" (not "Gagal memperbarui sesi"), then login DID succeed — meaning either `session_nonce` update worked or was silently ignored. The diagnosis therefore focuses on the profile lookup step.

---

## 3. Profile Lookup — Complete Call Sequence After Login

After login the user navigates to the Profile tab (or any tab that triggers profile load). The error "Profil tidak ditemukan" comes from:

```
mobile/app/(tabs)/profile.tsx  line 292-303
```

```tsx
if (!profile) {
  return (
    <View>
      <Text>Profil tidak ditemukan</Text>
      <Text>Silakan hubungi HR atau coba muat ulang.</Text>
      <Pressable onPress={() => void load()}>Coba lagi</Pressable>
    </View>
  );
}
```

This renders when `profile === null`. The `profile` state is set to null in two cases:

```typescript
// Case 1: ensureAndSyncProfileMobile returns { profile: null }
const { profile: p } = await ensureAndSyncProfileMobile(uid);
setProfile(p);   // p is null → shows error

// Case 2: ensureAndSyncProfileMobile throws any exception
} catch {
  setProfile(null);  // exception caught → null → shows error
}
```

### ensureAndSyncProfileMobile — call trace

```
ensureAndSyncProfileMobile(userId)          [mobile/lib/profileEnsure.ts]
  │
  ▼
ensureProfile(userId)
  │
  ├── [1] pb.collection("profiles").getFirstListItem('user="<id>"')
  │        PocketBase REST: GET https://pb-staging.serba.space/api/collections/profiles/records?...
  │
  │   ├── FOUND → return existing profile ✅
  │   │
  │   └── NOT FOUND (throws 404) → enter catch → try to CREATE
  │             │
  │             ▼
  │         [2] pb.collection("offices").getFirstListItem("is_active=true")
  │              PocketBase REST: GET https://pb-staging.serba.space/api/collections/offices/records?...
  │
  │             ├── FOUND active office → proceed to create profile
  │             │
  │             └── NOT FOUND (no active office) → throw → outer catch → { profile: null }
  │                   ↑ This is the most likely cause of "Profil tidak ditemukan"
  │
  └── if profile found → syncUserDataToProfile (can fail silently)
        → second getFirstListItem (reads refreshed profile)
        → if this throws → profile.tsx catches → setProfile(null)
```

### Attendance check-in source (different path, same symptom)

```
mobile/lib/attendance.ts  line 499-504
```

```typescript
const { profile: profileRaw, office } = await getUserProfile(userId);
if (!profileRaw) {
  return { success: false, message: "Profil tidak ditemukan. Hubungi HR." };
}
```

This appears during **check-in attempt** on the Attendance tab, not on app open. If the user sees this, it means they attempted check-in.

The Profile tab error (line 296) is more likely to appear immediately after login when the user taps the Profile tab.

---

## 4. Environment: Staging vs Production

### If APK = `preview-apk` (staging environment)

**PocketBase:** `https://pb-staging.serba.space`  
**Next.js API:** `https://staging.serba.space`

| Question | Finding |
|---|---|
| Users exist on staging? | YES — `seed-hr-leave-staging.mjs` creates `staging-leave-*@staging.serba.test` |
| Profiles exist for seeded users? | YES — `ensureProfile()` in seed creates profiles |
| Profiles have `office_id`? | NO — seed profiles have no `office_id` set |
| Active offices exist on staging? | UNKNOWN — no script confirmed to create offices on staging PB |
| `session_nonce` field in users? | NOT CONFIRMED — not added by any staging script |
| `users.updateRule` allows self-update? | NOT CONFIRMED — not applied by any staging script |

**The seeded profiles exist but have `profile_status: "incomplete"` and no `office_id`.** The profile screen queries and finds these profiles — so they WOULD be returned by `getFirstListItem`.

**HOWEVER:** After `ensureProfile` returns the existing profile, `ensureAndSyncProfileMobile` calls:
```typescript
const refreshed = await pb.collection("profiles").getFirstListItem(`user="..."`, { requestKey: null });
```
This second read should also succeed if the first succeeded.

### The real login question: which credentials?

The staging seed creates users with email pattern `staging-leave-{slug}@staging.serba.test`. If the APK user is logging in with **production credentials** (their real work email), that user may NOT exist on staging, or may exist but without a profile.

**Scenario A: User logs in with seeded staging account**
- User + profile exist on staging → `getFirstListItem` finds profile → profile returned
- "Profil tidak ditemukan" should NOT appear

**Scenario B: User logs in with a non-seeded account**  
- Profile does not exist on staging
- `createDefaultProfileForUser` attempts to find active office
- If no active office on staging → throws → `{ profile: null }` → "Profil tidak ditemukan" ✅

### If APK = `production` profile

**PocketBase:** `https://pb.serba.space`  
**Next.js API:** `https://serba.space`

Production has real users + real profiles. Login should succeed and profiles should load — unless:
- `session_nonce` PATCH fails on production PB (field/rule missing) → "Gagal memperbarui sesi" on login
- OR `session_nonce` silently accepted → login succeeds → profile found → NO "Profil tidak ditemukan"

---

## 5. Root Cause Summary

### Primary root cause (staging APK, non-seeded user)

```
APK profile: preview-apk
PocketBase:  https://pb-staging.serba.space

1. User logs in with credentials that are NOT in staging seed users
   (e.g., their real production email/password)

2. authWithPassword → may succeed if production creds also exist on staging,
   OR fail with credential error

3. session_nonce PATCH → staging may not have this field / rule
   → if rejected: login shows "Gagal memperbarui sesi" (not the reported error)
   → if silently accepted: login proceeds

4. Profile tab opens → ensureProfile(uid) → getFirstListItem
   → no profile found for this user on staging

5. createDefaultProfileForUser → offices.getFirstListItem("is_active=true")
   → no active office on staging (not seeded by any confirmed script)
   → throws "Tidak ada kantor aktif."

6. Outer catch in ensureProfile → return { profile: null, created: false }

7. profile.tsx → setProfile(null) → renders "Profil tidak ditemukan"
```

### Secondary root cause (any APK, session_nonce schema missing)

```
users.session_nonce field does NOT exist on staging/production PB
+ users.updateRule does NOT allow self-update

→ registerMobileSessionAfterAuth throws
→ pb.authStore.clear()
→ User cannot log in at all
→ Sees "Gagal memperbarui sesi…" on login screen
→ (This is NOT "Profil tidak ditemukan" — different symptom)
```

---

## 6. Answers to Diagnosis Questions

| Question | Answer |
|---|---|
| APK terhubung ke environment mana? | Staging (`pb-staging.serba.space`) jika dibangun dengan `preview-apk`. Production (`pb.serba.space`) jika dibangun dengan `production`. |
| Login sebenarnya berhasil atau gagal? | Berhasil (karena "Profil tidak ditemukan" muncul, bukan error login). Jika login gagal, muncul "Gagal memperbarui sesi…" di layar login. |
| Mengapa "Profil tidak ditemukan"? | `ensureAndSyncProfileMobile` return null. Penyebab paling mungkin: (a) user yang login bukan staging seed user — tidak ada record di `profiles` collection staging, DAN (b) pembuatan profil otomatis gagal karena tidak ada `offices` aktif di staging PB. |
| Apakah masalah dari staging data atau mobile code? | **Staging data.** Mobile code sudah benar — `ensureAndSyncProfileMobile` adalah fallback yang tepat. Masalah ada di staging PocketBase yang tidak memiliki profil + kantor aktif untuk akun yang dipakai login. |
| Apakah APK Production aman dibuat? | **Belum dapat dikonfirmasi.** Production PB perlu diverifikasi memiliki `session_nonce` field dan `users.updateRule = "@request.auth.id = id"`. Tanpa itu, login APK production akan gagal dengan "Gagal memperbarui sesi" — bukan crash, tapi login tidak bisa dilanjutkan. |

---

## 7. What Is NOT the Problem

- Bukan masalah URL localhost — APK tidak mengandung localhost sama sekali
- Bukan masalah network (APK bisa menghubungi server jika dapat login)
- Bukan bug di UI atau business logic
- Bukan masalah Production deployment

---

## 8. Data / Schema Gaps on Staging (Found, Not Fixed)

| Gap | Location | Impact |
|---|---|---|
| `session_nonce` field kemungkinan tidak ada di staging `users` schema | PocketBase staging | Login gagal jika PB menolak unknown field |
| `users.updateRule` kemungkinan tidak `"@request.auth.id = id"` di staging | PocketBase staging | Login gagal (403 saat PATCH users) |
| Tidak ada `offices` aktif di staging | PocketBase staging | Profile auto-create gagal → "Profil tidak ditemukan" |
| Profile staging users tidak punya `office_id` | staging `profiles` collection | GPS check-in akan gagal (no office radius to validate) |
| `reporting` dan `findings` collections tidak ada di staging | PocketBase staging | Sudah diketahui dari Phase 16 |

---

## 9. Next Step (Menunggu Approval Owner)

Tidak ada perubahan dilakukan pada phase ini.

Untuk melanjutkan UAT, Owner perlu memilih salah satu:

**Opsi A — Gunakan Production APK (build dengan profile `production`)**
- Verify dulu bahwa production PB memiliki `session_nonce` di users + `updateRule` yang tepat
- Jika tidak ada: field harus ditambahkan ke production PB (perlu approval terpisah)
- UAT menggunakan production data — tidak boleh ada data mutation

**Opsi B — Perbaiki staging data (tanpa deploy production)**
- Tambah `session_nonce` + `updateRule` ke staging PB users schema
- Buat/seed office aktif di staging PB
- Pastikan test users memiliki profile dengan `office_id`
- Build APK dengan `preview-apk` → test di staging

**Opsi C — Diagnosis langsung di staging PB via admin panel**
- Cek apakah `session_nonce` ada di users schema
- Cek apakah ada office aktif
- Cek apakah test user memiliki profile

---

## 10. Production Safety

```
Production: UNTOUCHED
Build:      NONE (source code audit only)
Deploy:     NONE
Schema:     NONE
Data:       NONE
```

---

*STOP. Menunggu approval Owner sebelum langkah berikutnya.*
