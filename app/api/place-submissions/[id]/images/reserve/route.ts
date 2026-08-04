import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { authErrorResponse } from "@/server/auth/http";
import { reserveSubmissionImage } from "@/server/submissions/images";

const schema = z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]) }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    return NextResponse.json(await reserveSubmissionImage({ submissionId: id, submitterId: user.appUser.id, mimeType: body.mimeType }), { status: 201 });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    if (error instanceof ZodError) return NextResponse.json({ error: "Invalid image request", issues: error.issues }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Image reserve failed" }, { status: 400 });
  }
}
