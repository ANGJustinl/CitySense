import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { recommend } from "@/server/recommendation/recommend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await recommend(body);

    return NextResponse.json(result);
  } catch (error) {
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
