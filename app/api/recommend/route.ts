import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ProfileAccessError,
  sanitizeProfileScopedInput
} from "@/server/auth/profile-access";
import { recommend } from "@/server/recommendation/recommend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input =
      body && typeof body === "object" && !Array.isArray(body)
        ? sanitizeProfileScopedInput(body as Record<string, unknown>)
        : body;
    const result = await recommend(input);

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
          error: "Invalid recommendation request",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: "Recommendation failed"
      },
      { status: 500 }
    );
  }
}
