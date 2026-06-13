import { NextResponse } from "next/server";
import { getRouteDetail, parseRouteSnapshotId } from "@/server/routes/route-detail";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  {
    params
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const { id } = await params;

  if (!parseRouteSnapshotId(id)) {
    return NextResponse.json(
      {
        error: "Invalid route id"
      },
      { status: 400 }
    );
  }

  const detail = await getRouteDetail(id);

  if (!detail) {
    return NextResponse.json(
      {
        error: "Route not found"
      },
      { status: 404 }
    );
  }

  return NextResponse.json(detail);
}
