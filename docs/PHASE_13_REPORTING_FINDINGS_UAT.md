# PHASE 13 — Reporting & Findings UAT

**Date:** 2026-08-14  
**Environment:** staging only (`staging.serba.space` / `pb-staging.serba.space`)  
**Production:** **UNTOUCHED**

Do not deploy production. Do not create production collections. Do not modify production PB.

---

## Locked rules

- Business logic lives in Next.js `/api/hr/reports` and `/api/hr/findings` (admin PocketBase).
- Collections `hr_staff_reports`, `hr_findings`, `hr_case_attachments` are API-only (`list/view/create/update/delete = null`).
- Attachments are PocketBase file fields, **not** base64 on the parent record, **not** `public/uploads`.
- Clients receive auth-gated URLs only: `/api/hr/{reports|findings}/:id/attachments/:attId`.
- Max **5** images. Allowed: JPEG / PNG / WebP. Max **10 MB** per file (server validates magic bytes + size).
- Staff reports: optional evidence. HR findings: optional evidence (camera/gallery/file picker).
- Employee sees **own reports only**. HR/Owner: company-scoped. Findings: HR/Owner only.
- Offline: no fake success (`Tidak ada koneksi. Laporan belum dikirim.`).
- Same API for web desktop, web mobile, and Expo.

---

## Schema (staging)

```
npm run pb:hr-reporting-schema:staging
```

Collections: `hr_staff_reports`, `hr_findings`, `hr_case_attachments`.

---

## Automated tests

```
npm run test:hr-reporting-unit
npm run test:hr-reporting-api-staging
```

Set `BASE_URL=https://staging.serba.space` only after Next staging serves the new routes.

---

## MOBILE VALIDATION

| Area | Evidence | Status |
| --- | --- | --- |
| Web mobile | Code: 1-col cards &lt; md, table ≥ md; vertical full-width form; 48px+ targets | **NOT TESTED** on 360/390/430 device |
| Mobile app | Expo routes `/reports`, `/findings`; tiles on Meja kerja | **NOT TESTED** on physical device |
| Camera | Web `capture=environment`; app `ImagePicker.launchCameraAsync`; permission copy | **NOT TESTED** |
| Gallery | Web file input; app library picker | **NOT TESTED** |
| Image upload | `POST .../attachments` multipart; server magic-byte validation | Unit **PASS** (invalid/oversize). Live upload **NOT TESTED** until staging Next overlay |
| Image preview | Thumbnail grid + delete before submit | **NOT TESTED** |
| Image viewer | Fullscreen overlay; mobile pinch via ScrollView zoom | **NOT TESTED** |
| Attachment authorization | Other employee 403; unauth 401; PB rules null | Scripted; live **NOT TESTED** until overlay |
| Offline behavior | Fetch catch → no fake success | Code present; **NOT TESTED** on device airplane mode |
| Responsive layout | Cards on mobile, table on desktop | Code present; **NOT TESTED** |
| Keyboard behavior | Vertical form, submit at bottom, KAV on app | **NOT TESTED** |

### Additional UAT (MB-09 … MB-19)

| ID | Case | Status |
| --- | --- | --- |
| MB-09 | Create Finding from phone, form not clipped | **NOT TESTED** |
| MB-10 | Take photo from camera → preview | **NOT TESTED** |
| MB-11 | Gallery photo → preview | **NOT TESTED** |
| MB-12 | Delete selected photo | **NOT TESTED** |
| MB-13 | Counter X / 5 | **NOT TESTED** (API rejects 6th) |
| MB-14 | Open evidence viewer | **NOT TESTED** |
| MB-15 | Submit finding with evidence, authorized user can open | **NOT TESTED** |
| MB-16 | Employee opens another user’s evidence → 403 | Scripted; live **NOT TESTED** |
| MB-17 | Direct file URL without auth | Scripted; live **NOT TESTED** |
| MB-18 | Large/invalid file → clear server error | Unit **PASS**; live **NOT TESTED** |
| MB-19 | Offline submit → no fake success | Code present; **NOT TESTED** |

---

## ID / EN

Web keys under `hr.reporting.*` in `lib/i18n/messages/hr-id.ts` and `hr-en.ts`.  
Mobile keys under `reporting.*` in `mobile/lib/i18n.tsx`.  
**Device copy PASS/FAIL: NOT TESTED.**

---

## Production gate

| Gate | Result |
| --- | --- |
| Mobile UI | **NOT TESTED** |
| Mobile API | Routes implemented locally; staging Next overlay **not applied in this pass** |
| Attachment security | Designed + unit; live **NOT TESTED** |
| Web responsive | Code; **NOT TESTED** |
| Desktop | Code; **NOT TESTED** |
| ID/EN | Keys added; **NOT TESTED** |
| RBAC | Server asserts; live **NOT TESTED** |
| UAT | Incomplete |
| Production | **UNTOUCHED** |

**NO-GO PRODUCTION** until the critical security/privacy live tests (MB-16, MB-17) PASS on staging.

---

## Files (local)

- `lib/hr/reporting-*.ts`, `lib/hr/compress-evidence-image.ts`
- `app/api/hr/reports/**`, `app/api/hr/findings/**`
- `app/(dashboard)/hr/reports/**`, `app/(dashboard)/hr/findings/**`
- `components/hr/Evidence*.tsx`, `Reporting*.tsx`
- `mobile/app/reports/**`, `mobile/app/findings/**`, `mobile/lib/hr-reporting-api.ts`
- `scripts/pb-apply-hr-reporting-schema-staging.mjs`
- `scripts/test-hr-reporting-unit.mjs`, `scripts/test-hr-reporting-api-staging.mjs`
