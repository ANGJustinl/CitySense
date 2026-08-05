import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authErrorResponse } from "@/server/auth/http";
import { BuddyError } from "@/server/buddy/errors";

export function buddyErrorResponse(error: unknown) {
  const auth = authErrorResponse(error);
  if (auth) return auth;
  if (error instanceof BuddyError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid buddy request", issues: error.issues }, { status: 400 });
  return null;
}
