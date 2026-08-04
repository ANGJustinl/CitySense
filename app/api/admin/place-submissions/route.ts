import { NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/prisma";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const status = new URL(request.url).searchParams.get("status");
    const submissions = await prisma.venueSubmission.findMany({
      where: status ? { status: status as never } : undefined,
      include: { images: true, submitter: true, resultingVenue: true, matchedVenue: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return NextResponse.json({ submissions });
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "Admin submission list failed" }, { status: 500 });
  }
}
