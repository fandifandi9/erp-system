import { reportingGet, reportingPatch } from "@/lib/hr/reporting-http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, context: Ctx) {
  const { id } = await context.params;
  return reportingGet(req, "report", id);
}

export async function PATCH(req: Request, context: Ctx) {
  const { id } = await context.params;
  return reportingPatch(req, "report", id);
}
