# PocketBase Source of Truth (Wave 1 scaffold)

Status: **NOT VERIFIED** against live PocketBase.

## Purpose

Hold reproducible exports of:

| Folder | Contents |
|--------|----------|
| `rules/` | Collection API rules (list/view/create/update/delete) |
| `schema/` | Collection field definitions |
| `indexes/` | Unique indexes / constraints notes |

## Migration readiness (staging / production)

| Fact | Status |
|------|--------|
| Full production migration set in this repository | **No** — not present |
| Production VPS migration count | **369** files under production `pb_migrations` (server-local) |
| Auto-commit migrations from VPS into Git | **Do not** — never commit automatically |
| Bootstrap staging schema from Git alone | **Not possible** today |
| Migration copy prod → staging | **Server-local** on VPS only (explicit approval) |
| Git as migration source-of-truth | **Pending review** — decision not made |

See `deploy/staging/README-STAGING.md` for staging isolation rules.

## Rules

1. Do **not** copy suggested/migration markdown into these folders as if they were live.
2. Every file that is not an export from a known environment must be marked **UNVERIFIED**.
3. Live Admin rules remain the runtime truth until an export is committed and reviewed.
4. Wave 1 does **not** change PocketBase rules.
5. Staging must never modify production rules; production leave write-lock requires separate explicit approval.

## How to export (when Admin access is available)

1. PocketBase Admin UI → Collections → export / copy API rules per collection, **or**
2. Use PocketBase collections API with admin credentials (document command in a later wave).
3. Place JSON under `rules/<collection>.json` with header comment/meta: `source`, `exported_at`, `environment`.
4. PR review before applying to staging/production.

## Current state

Live HR collection rules: partial snapshot for `leave_requests` under `pb/rules/` (see `leave_requests.snapshot-*.json`). Full schema/migrations SoT: **not** in Git.
