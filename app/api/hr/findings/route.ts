import { reportingCreate, reportingList } from "@/lib/hr/reporting-http";

export async function GET(req: Request) {
  return reportingList(req, "finding");
}

export async function POST(req: Request) {
  return reportingCreate(req, "finding");
}
