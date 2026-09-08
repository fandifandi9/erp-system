/**
 * Phase 34F refinement — entity logo SSOT (biz_company_profile.logo).
 */

import type PocketBase from "pocketbase";
import { HrApiError, type HrApiAuthContext } from "@/lib/hr/api-auth";
import { assertMasterDataCapability } from "@/lib/master-data/master-data-auth";
import { BISNIS_COLLECTIONS } from "@/lib/bisnis/types";
import { validateEntityLogoBytes } from "@/lib/hr/entity-logo-validate";

const LOGO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export function buildEntityLogoUrl(
  entityId: string,
  logoFilename: string | undefined | null,
  updated?: string | null,
  thumb = "200x200",
): string | null {
  if (!entityId || !logoFilename) return null;
  const base = process.env.NEXT_PUBLIC_POCKETBASE_URL || process.env.POCKETBASE_URL || "";
  if (!base) return null;
  const file = encodeURIComponent(String(logoFilename));
  const params = new URLSearchParams({ thumb });
  if (updated) params.set("v", String(updated));
  return `${base.replace(/\/$/, "")}/api/files/${BISNIS_COLLECTIONS.companyProfile}/${entityId}/${file}?${params.toString()}`;
}

export async function uploadEntityLogo(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
  bytes: Uint8Array,
  declaredMime: string,
  originalName: string,
): Promise<{ logo: string; logo_url: string | null }> {
  assertMasterDataCapability(ctx, "master_data.entity.manage");

  const checked = validateEntityLogoBytes(bytes, declaredMime, originalName);
  if (!checked.ok) throw new HrApiError(checked.error, 400);

  const blob = new Blob([bytes as BlobPart], { type: checked.mime });
  const ext = checked.mime === "image/png" ? "png" : checked.mime === "image/webp" ? "webp" : "jpg";
  const safeName = (originalName || `logo.${ext}`).replace(/[^\w.\-]+/g, "_").slice(0, 80);

  const rec = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).update(
    entityId,
    {
      logo: new File([blob], safeName || `logo.${ext}`, { type: checked.mime }),
    },
    { requestKey: null },
  )) as Record<string, unknown>;

  const logo = String(rec.logo ?? "");
  return {
    logo,
    logo_url: buildEntityLogoUrl(entityId, logo, String(rec.updated ?? "")),
  };
}

export async function removeEntityLogo(
  adminPb: PocketBase,
  ctx: HrApiAuthContext,
  entityId: string,
): Promise<void> {
  assertMasterDataCapability(ctx, "master_data.entity.manage");
  await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).update(
    entityId,
    { logo: null },
    { requestKey: null },
  );
}

/** Fetch logo bytes (admin PB). */
export async function fetchEntityLogoBytes(
  adminPb: PocketBase,
  entityId: string,
  preferredFilename?: string,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  if (!entityId) return null;
  try {
    const record = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(entityId, {
      fields: "id,logo,updated,collectionId,collectionName",
      requestKey: null,
    })) as Record<string, unknown>;
    const file = String(preferredFilename ?? record.logo ?? "").trim();
    if (!file) return null;
    const url = adminPb.files.getURL(record as never, file);
    const token = adminPb.authStore.token?.trim();
    const authAttempts: Record<string, string>[] = [];
    if (token) {
      authAttempts.push(
        { Authorization: token },
        { Authorization: `Bearer ${token}` },
      );
    }
    authAttempts.push({});

    let res: Response | null = null;
    for (const headers of authAttempts) {
      const attempt = await fetch(url, Object.keys(headers).length ? { headers } : undefined);
      if (attempt.ok) {
        res = attempt;
        break;
      }
    }
    if (!res?.ok) return null;

    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    if (!LOGO_MIME.includes(mime as (typeof LOGO_MIME)[number])) return null;
    return { bytes: buf, mime };
  } catch {
    return null;
  }
}

/** Fetch logo bytes for PDF embedding (admin PB). */
export async function fetchEntityLogoDataUrl(
  adminPb: PocketBase,
  entityId: string,
  logoFilename: string,
): Promise<string | null> {
  const fetched = await fetchEntityLogoBytes(adminPb, entityId, logoFilename);
  if (!fetched) return null;
  const b64 = Buffer.from(fetched.bytes).toString("base64");
  return `data:${fetched.mime};base64,${b64}`;
}

/** Resolve logo filename from payslip item snapshot or live entity record. */
export async function resolveEntityLogoFilenameForPayslip(
  adminPb: PocketBase,
  companyId: string,
  logoSnapshot?: string | null,
): Promise<string | null> {
  const snap = String(logoSnapshot ?? "").trim();
  if (snap) return snap;
  if (!companyId) return null;
  try {
    const record = (await adminPb.collection(BISNIS_COLLECTIONS.companyProfile).getOne(companyId, {
      fields: "logo",
      requestKey: null,
    })) as Record<string, unknown>;
    const live = String(record.logo ?? "").trim();
    return live || null;
  } catch {
    return null;
  }
}
