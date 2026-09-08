import { reportingClose } from "@/lib/hr/reporting-http";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, context: Ctx) {
  const { id } = await context.params;
  return reportingClose(req, "report", id);
}
