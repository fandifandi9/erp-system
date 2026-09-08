import { reportingCreate, reportingList } from "@/lib/hr/reporting-http";

export async function GET(req: Request) {
  return reportingList(req, "report");
}

export async function POST(req: Request) {
  return reportingCreate(req, "report");
}
