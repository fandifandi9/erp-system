import type { NextRequest } from "next/server";
import { POST as sendDocumentPost } from "@/app/api/email/send/route";

/** @deprecated Gunakan POST /api/email/send */
export async function POST(req: NextRequest) {
  return sendDocumentPost(req);
}
