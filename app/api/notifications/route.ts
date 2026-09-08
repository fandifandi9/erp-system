/**
 * GET /api/notifications
 * Returns the authenticated user's notifications (paginated, newest first).
 * User can only see their own notifications — enforced both by PB rule and server logic.
 */
import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { getAuthenticatedHrUser, hrJsonError } from "@/lib/hr/api-auth";

const COLLECTION = "notifications";

export async function GET(req: Request) {
  try {
    const ctx = await getAuthenticatedHrUser(req);
    if (!ctx) {
      return NextResponse.json({ ok: false, error: "Login diperlukan." }, { status: 401 });
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get("perPage") ?? "20", 10)));
    const unreadOnly = url.searchParams.get("unread") === "1";

    const adminPb = await getInventoryAdminPb();

    // SECURITY: always scope to the authenticated user — never trust query params for identity
    const userFilter = `recipient = "${ctx.userId}"`;
    const filter = unreadOnly
      ? `${userFilter} && read_at = ""`
      : userFilter;

    const result = await adminPb.collection(COLLECTION).getList(page, perPage, {
      filter,
      sort: "-created",
      requestKey: null,
    });

    // Count unread
    const unreadCount = await adminPb.collection(COLLECTION).getList(1, 1, {
      filter: `recipient = "${ctx.userId}" && read_at = ""`,
      requestKey: null,
    });

    return NextResponse.json({
      ok: true,
      items: result.items,
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      unreadCount: unreadCount.totalItems,
    });
  } catch (err) {
    return hrJsonError(err, "Gagal mengambil notifikasi.");
  }
}
