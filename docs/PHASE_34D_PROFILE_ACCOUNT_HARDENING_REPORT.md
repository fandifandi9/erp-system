# Phase 34D — Profile & Account UX Hardening Report

**Date:** 31 Aug 2026  
**Scope:** LOCAL ONLY — no staging, production, or APK  
**Gate:** **READY FOR LOCAL UAT**

---

## 1. Root cause — avatar upload failure

End-to-end audit identified **two root causes**:

| # | Cause | Impact |
|---|--------|--------|
| **RC-1** | Local `profiles` schema **missing `avatar` file field** (bootstrap did not include it) | `POST /api/profile/self/avatar` → PocketBase update failed silently or with schema error; UI reloaded via direct PB read and showed no change |
| **RC-2** | Profile page **loaded data via direct PocketBase client** (`ensureAndSyncProfile`) while avatar **uploaded via server API** | Stale/cached avatar URL after upload; no server-built cache-bust URL; inconsistent auth paths |

Secondary gaps (fixed in 34D):

- No **server-side MIME / magic-byte validation** on avatar (client-only `image/*` check)
- No **`avatar_url` with cache-bust** in API response
- **Browser image cache** showed old thumb after successful upload

**Fix:** Local migration adds `avatar`, `bio`, `date_of_birth`; server validates bytes; API returns `avatar_url?v=<updated>`; UI uses `GET /api/profile/self` exclusively.

---

## 2. Solution summary

### Profile data flow (authoritative)

```
/profile UI
    → GET /api/profile/self
    → serverGetSelfProfile()
        → profiles (by user)
        → users (role/email)
        → biz_user_companies.is_primary → biz_company_profile (expand)
    → SelfProfileDto (employment + primary_entity + avatar_url)
```

### Primary administrative entity

Resolution in `lib/hr/profile-primary-entity.ts`:

| Case | Display |
|------|---------|
| Single active membership | Entity name + type |
| Multiple memberships, one `is_primary` | Primary entity |
| No membership | **Belum ditentukan** |
| Multiple memberships, no primary | **Belum ditentukan** (fail closed) |
| Multiple `is_primary = true` | **Data entitas tidak valid — hubungi HR** |

Does **not** use `users.default_company`, `users.active_company`, or `profiles.company`.

### Avatar security

- Client: `uploadSelfAvatarApi()` → `POST /api/profile/self/avatar` only
- Server: auth via `requireAuthenticatedHrUser`; profile resolved by **session userId** only
- Validation: JPEG/PNG/WebP magic bytes, max 5 MB (`lib/hr/avatar-validate.ts`, reuses reporting sniff)
- No client `pb.collection("profiles").update()` for avatar

---

## 3. Files changed

| File | Change |
|------|--------|
| `lib/hr/profile-primary-entity.ts` | **NEW** — canonical primary entity resolution |
| `lib/hr/profile-avatar-url.ts` | **NEW** — PB file URL + cache-bust |
| `lib/hr/avatar-validate.ts` | **NEW** — server avatar validation |
| `lib/hr/profile-self-service.ts` | Extended DTO (`employment`, `primary_entity`, `avatar_url`) |
| `lib/hr/profile-mutation-server.ts` | Full GET compose, avatar validation, entity resolution |
| `lib/profile-self-api.ts` | Types + `resolveSelfAvatarPreviewUrl()` |
| `components/EmployeeSelfProfile.tsx` | UI restructure; API-only load; entity display |
| `lib/i18n/messages/hr-id.ts`, `hr-en.ts` | New profile strings |
| `scripts/migrate-local-hr-phase34d-profile-avatar.mjs` | **NEW** — local schema migration |
| `scripts/bootstrap-local-pb.mjs` | `avatar`, `bio`, `date_of_birth` on fresh bootstrap |
| `scripts/test-phase34d-profile.mjs` | **NEW** — Phase 34D tests |
| `package.json` | `migrate:local-hr-phase34d`, `test:phase34d-profile` |

**Unchanged:** attendance engine, work schedule, payroll stamping, master-data collections.

---

## 4. API changes

### `GET /api/profile/self`

Response `data` now includes:

```typescript
{
  id, phone, address, date_of_birth, bio,
  avatar?, avatar_url, name, email, updated?,
  employment: {
    division, department, position, salary, join_date,
    role_code, account_type,
    primary_entity: { status, label, company_name?, entity_type?, code?, membership_count },
    membership_summary?: "1 entitas utama" | "Beberapa entitas"
  }
}
```

Still **excludes:** `nik`, `npwp`, `manager`, shift config, privilege fields.

### `POST /api/profile/self/avatar`

- Validates file bytes server-side
- Returns updated profile with fresh `avatar_url`
- Clear error if local schema missing (points to migration script)

---

## 5. UI changes

Structured sections on `/profile`:

1. **Profil saya** — avatar, name, email  
2. **Data kepegawaian** — Entitas Administratif (read-only) + divisi/dept/jabatan/gaji/peran/tgl bergabung  
3. **Informasi pribadi** — phone, address, DOB, bio (self-service)  
4. **Akun & keamanan** — email read-only + change password  

Labels use **Entitas Administratif** (not "Perusahaan saya").

---

## 6. Migration (local only)

```bash
npm run migrate:local-hr-phase34d
```

Adds to `profiles`: `avatar` (file, 5MB, jpeg/png/webp), `bio`, `date_of_birth`.

**Schema changed:** LOCAL PocketBase only. Production/staging **untouched**.

---

## 7. Test results

| Suite | Result |
|-------|--------|
| **Phase 34D** | **34/34 PASS** |
| Phase 34C | 21/21 PASS |
| Phase 34B | 18/18 PASS |
| Phase 33A | 42/42 PASS |
| Phase 33B | 31/31 PASS |
| Phase 32 | 35/35 PASS |
| Phase 31 | 32/32 PASS |
| TypeScript | PASS |

---

## 8. Manual verification checklist (LOCAL UAT)

- [ ] Login as staff → `/profile` loads via API (no console PB profile errors)
- [ ] **Entitas Administratif** shows primary entity from membership (not active_company)
- [ ] User with no primary → "Belum ditentukan"
- [ ] Upload JPEG/PNG/WebP avatar → preview updates immediately (no logout)
- [ ] Refresh page → avatar persists
- [ ] Upload >5 MB → clear error; old avatar remains
- [ ] Upload non-image → rejected
- [ ] Edit phone/address/bio → saves via PATCH
- [ ] Salary/jabatan/entity **not editable** on profile page
- [ ] Attendance check-in still works (no PT selector added)

---

## 9. Known limitations

- **Navbar** still loads avatar via direct PB read (minor; profile page is canonical)
- **Mobile** `profile-self-api.ts` uses subset of DTO; avatar upload path unchanged, benefits from server validation
- **Owner accounts** without `biz_user_companies` row show "Belum ditentukan" (by design — fail closed)
- Salary visible on own profile employment section (HR-managed read-only display; not in unrestricted API fields for third parties)

---

## 10. Deployment status

| Environment | Status |
|-------------|--------|
| Production | **UNTOUCHED** |
| Staging | **UNTOUCHED** |
| APK | **NOT BUILT** |
| Local | **READY FOR UAT** |

---

## 11. Attendance guarantee

Phase 34D does **not** modify:

- `lib/hr/attendance-engine.ts`
- `resolveAttendanceCompanyId()` → `biz_user_companies.is_primary`
- Desktop/mobile attendance UI (no PT selector)

Verified by static regression in Phase 34D + 34B tests.
