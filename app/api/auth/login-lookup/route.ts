import { NextResponse } from "next/server";
import { getInventoryAdminPb } from "@/lib/inventory/pb-server";

type Body = { email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Cek apakah email ada di users — untuk pesan login yang jelas (ERP internal). */
export async function POST(req: Request) {
  try {
    const { email } = (await req.json()) as Body;
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !EMAIL_RE.test(normalized)) {
      return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
    }

    const pb = await getInventoryAdminPb();
    const esc = normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const users = await pb.collection("users").getList(1, 1, {
      filter: `email = "${esc}"`,
      fields: "id,status",
      requestKey: null,
    });

    const record = users.items[0];
    return NextResponse.json({
      ok: true,
      registered: Boolean(record?.id),
      status: record?.status === "active" || record?.status === "inactive" ? record.status : undefined,
    });
  } catch (e: unknown) {
    console.error("login-lookup:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal memeriksa email" },
      { status: 500 },
    );
  }
}
