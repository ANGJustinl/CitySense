import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdmin } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { prisma } from "@/server/db/prisma";

const schema = z.object({
  status: z.enum(["PUBLISHED", "UNLISTED", "REMOVED"]),
  reason: z.string().trim().min(2).max(300)
}).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    if (input.status === "PUBLISHED" && admin.appUser.role !== "ADMIN") return NextResponse.json({ error: "Only an admin can republish a removed venue" }, { status: 403 });
    const venue = await prisma.venue.update({
      where: { id },
      data: {
        publicationStatus: input.status,
        publicationReason: input.reason,
        publicationVersion: { increment: 1 },
        publishedAt: input.status === "PUBLISHED" ? new Date() : undefined,
        unpublishedAt: input.status === "PUBLISHED" ? null : new Date()
      }
    });
    return NextResponse.json(venue);
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid publication change", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: "Venue publication update failed" }, { status: 500 });
  }
}
