import { NextResponse } from "next/server";
import { requirePembelianApiUser, requirePenjualanApiUser } from "@/lib/bisnis/api-auth";
import { isEmailDocKind, type EmailDocKind } from "@/lib/email/document-kind";
import { getAppBaseUrl, isResendConfigured } from "@/lib/email/resend";
import { sendDocumentEmail } from "@/lib/email/send-document-email";

type Body = {
  kind?: string;
  id?: string;
  to?: string;
};

const PENJUALAN_KINDS: EmailDocKind[] = ["invoice", "sales_order", "quotation"];
const PEMBELIAN_KINDS: EmailDocKind[] = ["purchase_order"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const kind = body.kind?.trim() ?? "";
    const id = body.id?.trim();
    const to = body.to?.trim();

    if (!isEmailDocKind(kind)) {
      return NextResponse.json(
        {
          error:
            "kind harus invoice, sales_order, quotation, atau purchase_order",
        },
        { status: 400 },
      );
    }
    if (!id) {
      return NextResponse.json({ error: "id dokumen wajib" }, { status: 400 });
    }
    if (!to) {
      return NextResponse.json({ error: "Email penerima (to) wajib" }, { status: 400 });
    }

    if (PENJUALAN_KINDS.includes(kind)) {
      await requirePenjualanApiUser(req);
    } else if (PEMBELIAN_KINDS.includes(kind)) {
      await requirePembelianApiUser(req);
    }

    if (!isResendConfigured()) {
      return NextResponse.json(
        {
          error: "Resend belum dikonfigurasi",
          hint: "Set RESEND_API_KEY dan RESEND_FROM_EMAIL di .env.local lalu restart server.",
        },
        { status: 503 },
      );
    }

    const result = await sendDocumentEmail({
      kind,
      id,
      to,
      baseUrl: getAppBaseUrl(req),
    });

    return NextResponse.json({
      ok: true,
      to: result.to,
      resendId: result.id,
      message: `Email terkirim ke ${result.to}`,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = typeof err.status === "number" ? err.status : 500;
    const message =
      e instanceof Error ? e.message : err.message ?? "Gagal mengirim email";
    return NextResponse.json({ error: message }, { status });
  }
}
