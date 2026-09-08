# PHASE 34F — READY FOR LOCAL UAT

**Scope:** LOCAL ONLY — no staging, production, APK, or production database changes.

---

## 1. Audit Summary (Pre-Implementation)

| Area | Finding |
|------|---------|
| **Payslip** | `/api/payroll/self/slips*` was already server-authoritative with ownership checks; **no additional privacy layer** existed |
| **HR Policy** | Staff late example read `profiles.late_deduction_*`; prose `hr_policies` did **not** drive payroll |
| **Holidays** | Staff page used API; **`/hr/work-calendar` used direct PocketBase** for holidays |
| **Documents/Profile** | Canonical `/profile` existed; dashboard had **duplicate Dokumen card**; profile page too long / poor scan hierarchy |

---

## 2. Final Security Architecture (Phase 34F Refinement)

**PIN Slip Gaji has been removed.** There is no 6-digit PIN, set/change PIN, or payslip PIN unlock.

```
LOGIN PASSWORD
      ↓
ACCOUNT VERIFICATION (server-side password check)
      ↓
30-MINUTE SESSION-BOUND VERIFICATION GRANT
      ↓
Sensitive data the user is authorized to access
      ↓
  • Payslip preview / download
  • Personal document preview / download
  • Other self sensitive data (same gate)
```

**Session binding:**

```
PocketBase auth token (pb_auth)
        ↓
SHA-256 hash → sessionKey (JWT claim `sk`)
        ↓
HttpOnly cookie `account_verified` (JWT grant)
        ↓
assertAccountVerified() on each sensitive request
```

**Rules:**

- Password verified **server-side** via PocketBase `auth-with-password` — never stored, never logged, never returned to client
- Grant tied to **current login session** — new login invalidates old grant
- **Fixed 30-minute expiry** — no sliding window
- Logout (`DELETE /api/auth/session`) clears `pb_auth` + `account_verified` (+ legacy `payslip_unlock` if present)
- Account verification is **not** a substitute for ownership — `assertPayslipAccess()` and document ownership checks remain

---

## 3. Files Changed (Final Refinement)

### Account verification (new / replaces PIN unlock)
- `lib/hr/account-verification.ts` — JWT grant, session key hash, 30m TTL
- `lib/hr/account-verification-server.ts` — `assertAccountVerified`, `verifyAccountWithPassword`, rate limit
- `lib/hr/account-verification-cookie-server.ts` — apply/clear `account_verified` cookie
- `lib/account-verification-client.ts` — client helpers
- `app/api/account/verify/route.ts` — POST password verification
- `app/api/account/verify/status/route.ts` — GET verification status
- `components/account/AccountVerificationModal.tsx` — reusable modal

### Updated gates
- `lib/hr/payroll-server.ts` — `assertPayslipAccess` → `assertAccountVerified`
- `lib/hr/employee-document-server.ts` — preview/download require `assertAccountVerified`
- `app/api/auth/session/route.ts` — logout clears account verification

### Profile UI/UX redesign
- `components/EmployeeSelfProfile.tsx` — compact header, tab nav (`#ringkasan`, `#pribadi`, `#dokumen`, `#keamanan`), legacy hash aliases
- `components/profile/EmployeePrivateDocumentsSection.tsx` — document grid + verification modal
- `components/profile/ProfileFeedbackToast.tsx` — fixed viewport toast (success/error on save)

### Payroll UI
- `app/(dashboard)/dashboard-staff/payroll/page.tsx` — `AccountVerificationModal` (replaces PIN unlock modal)

### Removed (PIN / payslip unlock — no longer used)
- `lib/hr/payslip-pin.ts`
- `lib/hr/payslip-unlock-server.ts`
- `lib/hr/payslip-unlock-cookie-server.ts`
- `app/api/profile/self/payslip-pin/route.ts`
- `app/api/payroll/self/unlock/route.ts`
- `app/api/payroll/self/unlock/status/route.ts`
- `components/profile/PayslipPinSection.tsx`
- `components/payroll/PayslipUnlockModal.tsx`

### Entity policy SSOT (unchanged from initial 34F)
- `lib/hr/entity-attendance-policy*.ts`, `lib/payroll.ts`, HR/staff policy pages, holiday API migration

---

## 4. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/account/verify` | Verify account password → set 30m grant cookie |
| GET | `/api/account/verify/status` | Check if current session is verified |
| DELETE | `/api/auth/session` | Logout + clear verification grant |

**Removed:**

- `POST/DELETE /api/profile/self/payslip-pin`
- `POST /api/payroll/self/unlock`
- `GET /api/payroll/self/unlock/status`

Sensitive data endpoints unchanged path; they now return `403 ACCOUNT_VERIFICATION_REQUIRED` when grant missing/expired.

---

## 5. Database / Migrations

Run locally (initial 34F only — **not required for account verification refinement**):

```bash
npm run migrate:local-hr-phase34f
npm run seed:local-phase34f-attendance-policy
```

**New collection:** `hr_entity_attendance_policies`

**Extended (initial 34F):**
- `profiles`: `payslip_pin_failed_attempts`, `payslip_pin_locked_until` — **reused** for account verification rate limit (no new migration)
- `payroll_items`: `attendance_policy_id`, `attendance_policy_snapshot`

`payslip_pin_hash` field may exist from prior migration but is **no longer used**.

---

## 6. Profile UI Structure

```
/profile
├── Header (avatar, name, email, role, entity)
├── Navigation: [Ringkasan] [Pribadi] [Dokumen] [Keamanan]
└── Content (single page, hash tabs)
    ├── #ringkasan — employment overview grid
    ├── #pribadi — editable personal info (one save button)
    ├── #dokumen — document grid (preview/download → account verification)
    └── #keamanan — email readonly + change password only (no PIN)
```

Legacy hashes `#dokumen-pribadi` and `#keamanan-slip-gaji` redirect to new tabs.

---

## 7. Tests — PASS Counts

| Suite | Result |
|-------|--------|
| Phase 34F (`test:phase34f-hr-policy-privacy`) | **53/53 PASS** |
| Phase 34E regression | **38/38 PASS** |
| Phase 34D regression | **34/34 PASS** |
| TypeScript (`tsc --noEmit`) | **PASS** |

### Automated acceptance (CASE 1–14)

| Case | Description |
|------|-------------|
| 1 | Login → `/profile` opens without verification |
| 2 | Payslip preview without verification → password required |
| 3 | Correct password → grant issued |
| 4 | Another payslip within 30 min → no re-verify |
| 5 | Leave/re-enter payroll within 30 min → no re-verify |
| 6 | Personal document after payslip verify → no re-verify |
| 7 | Logout → grant cleared |
| 8 | Re-login → payslip requires verification |
| 9 | Re-login → documents require verification |
| 10 | Grant >30 min → verification required again |
| 11 | Wrong password → denied |
| 12 | User A verified → User B payslip → 403 |
| 13 | Old grant on new session → rejected |
| 14 | Rate limiting after failed attempts |

---

## 8. Known Limitations

- Per-employee `profiles.late_deduction_*` overrides still supported atop entity policy
- Work calendar weekday mask still uses PocketBase directly (holidays only migrated to API)
- Verification rate limit reuses legacy profile field names (`payslip_pin_*`) — cosmetic only, no functional PIN
- No permanent “verification active until …” banner on profile (internal mechanism)
- Future-dated policy visible on staff page; payroll uses `period.end_date` for resolution

---

## 9. Manual UAT Checklist (Owner)

### A. PROFILE
- [ ] Dashboard → **Profil** (single card)
- [ ] Page feels compact — tabs: Ringkasan, Pribadi, Dokumen, Keamanan
- [ ] No PIN Slip Gaji section
- [ ] Edit personal info → **Simpan perubahan** → toast visible at top-right (any scroll position)
- [ ] Legacy `#dokumen-pribadi` still opens Dokumen tab

### B. ACCOUNT VERIFICATION
- [ ] Preview KTP → Verifikasi Akun modal (password)
- [ ] Correct password → document opens
- [ ] Preview payslip → no second password within 30 min
- [ ] Logout → login → payslip and documents ask password again

### C. PAYSLIP (fn2@gmail.com)
- [ ] Jun/Jul/Aug 2026 slips — ownership + verification
- [ ] Another user's slip ID in URL → **403**

### D. POLICY / HOLIDAY / NOTIFICATION
- [ ] (Same as initial 34F checklist — entity policy SSOT, holidays API, notifications)

---

**Status: READY FOR LOCAL UAT** (not staging/production)
