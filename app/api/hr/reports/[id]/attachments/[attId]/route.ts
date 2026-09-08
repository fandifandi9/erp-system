import { reportingDeleteAttachment, reportingGetAttachmentFile } from "@/lib/hr/reporting-http";

type Ctx = { params: Promise<{ id: string; attId: string }> };

export async function GET(req: Request, context: Ctx) {
  const { id, attId } = await context.params;
  return reportingGetAttachmentFile(req, "report", id, attId);
}

export async function DELETE(req: Request, context: Ctx) {
  const { id, attId } = await context.params;
  return reportingDeleteAttachment(req, "report", id, attId);
}
