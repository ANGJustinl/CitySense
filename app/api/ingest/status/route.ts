import { NextResponse } from "next/server";
import { getConnectorStatuses } from "@/server/sources/source-registry";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    connectors: getConnectorStatuses(),
    checkedAt: new Date().toISOString()
  });
}
