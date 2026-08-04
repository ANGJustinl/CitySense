import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  enqueueCityStateRefresh,
  isCityStateRefreshQueueConfigured
} from "@/server/city-state/queue";

export const runtime = "nodejs";

const refreshRequestSchema = z.object({
  city: z.string().min(1).default("上海"),
  area: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  force: z.boolean().default(false),
  requestedBy: z.string().max(60).optional()
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const input = refreshRequestSchema.parse(body);

    if (!isCityStateRefreshQueueConfigured()) {
      return NextResponse.json(
        {
          error: "REDIS_URL is not configured"
        },
        { status: 503 }
      );
    }

    const result = await enqueueCityStateRefresh(input);

    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid city-state refresh request",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue city-state refresh"
      },
      { status: 503 }
    );
  }
}
