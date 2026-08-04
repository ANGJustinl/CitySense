import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = process.env.CITYSENSE_RELEASE || "development";

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      release,
      database: "ok",
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        release,
        database: "unavailable",
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
