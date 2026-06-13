import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recordFeedback } from "@/server/recommendation/feedback";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const feedback = await request.json();
    const result = await recordFeedback(feedback);

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
