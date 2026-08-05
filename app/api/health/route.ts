import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getSharedRedis } from "@/server/redis/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = process.env.CITYSENSE_RELEASE || "development";

  try {
    await prisma.$queryRaw`SELECT 1`;
    const redis = getSharedRedis();
    const redisStatus = redis ? await redis.ping().then(() => "ok").catch(() => "unavailable") : "not_configured";
    const community = process.env.CITYSENSE_COMMUNITY_ENABLED === "true";
    const requiredConfig = community
      ? Boolean(process.env.REDIS_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      : true;

    return NextResponse.json({
      status: requiredConfig && redisStatus !== "unavailable" ? "ok" : "degraded",
      release,
      database: "ok",
      redis: redisStatus,
      community: community ? "enabled" : "disabled",
      configuration: requiredConfig ? "ok" : "incomplete",
      timestamp: new Date().toISOString()
    }, { status: requiredConfig && redisStatus !== "unavailable" ? 200 : 503 });
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
