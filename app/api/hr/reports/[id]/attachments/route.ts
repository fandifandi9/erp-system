import { reportingListAttachments, reportingUploadAttachment } from "@/lib/hr/reporting-http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Ctx) {
  const { id } = await context.params;
  return reportingListAttachments(req, "report", id);
}

export async function POST(req: Request, context: Ctx) {
  const { id } = await context.params;
  return reportingUploadAttachment(req, "report", id);
}
