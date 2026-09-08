import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireOwnerOrHrApiUser } from "@/lib/hr/api-auth";
import {
  ensureDefaultFunctionalModels,
  getFunctionalOperatingModelMap,
  listFunctionalOperatingModels,
  upsertFunctionalOperatingModel,
} from "@/lib/org/functional-operating-model-server";
import {
  isConfigurableFunctionDomain,
  isHybridOperatingState,
  parseFunctionalOperatingMode,
} from "@/lib/org/functional-operating-model";

/** GET /api/org/functional-operating-models?managementGroupId= */
export async function GET(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    if (!ctx.isOwner) {
      return NextResponse.json({ ok: false, error: "Hanya Owner/Super Admin." }, { status: 403 });
    }
    const url = new URL(req.url);
    const managementGroupId = String(url.searchParams.get("managementGroupId") ?? "").trim();
    if (!managementGroupId) {
      return NextResponse.json({ ok: false, error: "managementGroupId wajib." }, { status: 400 });
    }
    const adminPb = await getInventoryAdminPb();
    const items = await listFunctionalOperatingModels(adminPb, managementGroupId);
    const map = await getFunctionalOperatingModelMap(adminPb, managementGroupId);
    return NextResponse.json({
      ok: true,
      items,
      map,
      hybrid: isHybridOperatingState(map),
    });
  } catch (err) {
    return hrJsonError(err);
  }
}

/** POST /api/org/functional-operating-models */
export async function POST(req: Request) {
  try {
    const ctx = await requireOwnerOrHrApiUser(req);
    if (!ctx.isOwner) {
      return NextResponse.json({ ok: false, error: "Hanya Owner/Super Admin." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const adminPb = await getInventoryAdminPb();
    const managementGroupId = String(body.managementGroupId ?? "").trim();

    if (body.action === "ensureDefaults") {
      const effectiveFrom = String(body.effectiveFrom ?? new Date().toISOString().slice(0, 10));
      const items = await ensureDefaultFunctionalModels(
        adminPb,
        ctx,
        managementGroupId,
        effectiveFrom,
      );
      return NextResponse.json({ ok: true, items });
    }

    const functionDomain = String(body.functionDomain ?? body.function_domain ?? "").trim();
    if (!isConfigurableFunctionDomain(functionDomain)) {
      return NextResponse.json({ ok: false, error: "functionDomain tidak valid." }, { status: 400 });
    }

    const record = await upsertFunctionalOperatingModel(adminPb, ctx, {
      managementGroupId,
      functionDomain,
      mode: parseFunctionalOperatingMode(body.mode),
      sharedScopeKind:
        String(body.sharedScopeKind ?? "").toUpperCase() === "SELECTED"
          ? "SELECTED"
          : "ALL_IN_MANAGEMENT",
      selectedEntityIds: Array.isArray(body.selectedEntityIds)
        ? body.selectedEntityIds.map((x) => String(x))
        : [],
      effectiveFrom: String(body.effectiveFrom ?? ""),
      notes: body.notes != null ? String(body.notes) : undefined,
    });
    return NextResponse.json({ ok: true, data: record });
  } catch (err) {
    return hrJsonError(err);
  }
}
