import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";
import { hrJsonError, requireAuthenticatedHrUser } from "@/lib/hr/api-auth";
import { serverChangeSelfPassword } from "@/lib/hr/user-self-mutation-server";

type Body = {
  oldPassword?: string;
  password?: string;
  passwordConfirm?: string;
};

/** POST /api/profile/self/password — verify old password server-side, then admin update. */
export async function POST(req: Request) {
  try {
    const ctx = await requireAuthenticatedHrUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const newPassword = String(body.password ?? body.passwordConfirm ?? "").trim();
    const email = String(ctx.user.email || "").trim();
    if (!email) {
      return NextResponse.json({ ok: false, error: "Email akun tidak ditemukan." }, { status: 400 });
    }

    const adminPb = await getInventoryAdminPb();
    await serverChangeSelfPassword(
      adminPb,
      ctx.userId,
      email,
      String(body.oldPassword ?? ""),
      newPassword,
    );

    return NextResponse.json({ ok: true, message: "Kata sandi berhasil diubah." });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Kata sandi")) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    return hrJsonError(err);
  }
}
