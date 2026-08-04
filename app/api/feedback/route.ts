import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ProfileAccessError,
  sanitizeProfileScopedInput
} from "@/server/auth/profile-access";
import { recordFeedback } from "@/server/recommendation/feedback";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const feedback = await request.json();
    const input =
      feedback && typeof feedback === "object" && !Array.isArray(feedback)
        ? sanitizeProfileScopedInput(feedback as Record<string, unknown>)
        : feedback;
    const result = await recordFeedback(input);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error
        },
        { status: result.status }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProfileAccessError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code
        },
        { status: error.status }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid feedback request",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Feedback write failed"
      },
      { status: 500 }
    );
  }
}
