import { NextResponse } from "next/server";
import { getPocketBaseUrl } from "@/lib/inventory/pb-server";

/** Health check untuk Docker / load balancer (tanpa auth). */
export async function GET() {
  const pbUrl = getPocketBaseUrl();
  let pocketbase: "ok" | "error" | "unconfigured" = "unconfigured";

  if (pbUrl) {
    try {
      const res = await fetch(`${pbUrl.replace(/\/$/, "")}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      pocketbase = res.ok ? "ok" : "error";
    } catch {
      pocketbase = "error";
    }
  }

  const ok = pocketbase === "ok" || pocketbase === "unconfigured";
  return NextResponse.json(
    {
      ok,
      service: "serba-erp",
      pocketbase,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
