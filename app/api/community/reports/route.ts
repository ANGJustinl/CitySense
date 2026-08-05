import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { assertCommunityWriteEnabled, featureErrorResponse } from "@/server/config/ugc";
import { communityErrorResponse } from "@/server/community/errors";
import { createCommunityReport } from "@/server/community/reports";
import { enforceRateLimit, RATE_LIMITS, rateLimitErrorResponse } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    assertCommunityWriteEnabled();
    await enforceRateLimit("community:report", user.appUser.id, RATE_LIMITS.communityReport);
    return NextResponse.json(await createCommunityReport({ reporterId: user.appUser.id, idempotencyKey: request.headers.get("idempotency-key") ?? undefined, payload: await request.json() }), { status: 201 });
  } catch (error) {
    return authErrorResponse(error) ?? featureErrorResponse(error) ?? rateLimitErrorResponse(error) ?? communityErrorResponse(error) ?? NextResponse.json({ error: "Report creation failed" }, { status: 400 });
  }
}
