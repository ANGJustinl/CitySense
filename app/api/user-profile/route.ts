import { NextResponse } from "next/server";
import {
  buildProfileMeta,
  clearProfile,
  loadProfile
} from "@/server/recommendation/user-profile";

export const runtime = "nodejs";

function resolveProfileKey(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("profileKey") || url.searchParams.get("userId");

  return key && key.trim().length > 0 ? key.trim().slice(0, 128) : undefined;
}

export async function GET(request: Request) {
  const profileKey = resolveProfileKey(request);

  if (!profileKey) {
    return NextResponse.json(
      {
        error: "profileKey (or userId) query parameter is required"
      },
      { status: 400 }
    );
  }

  // GET 只读画像,不触发重算(重算只在 recommend 路径)。画像过期时返回 stale=true。
  const { snapshot, stale } = await loadProfile(profileKey);
  const meta = buildProfileMeta(snapshot, snapshot ? (stale ? "fallback" : "profile") : "empty");

  return NextResponse.json({
    profileKey,
    stale,
    profile: meta
  });
}

export async function DELETE(request: Request) {
  const profileKey = resolveProfileKey(request);

  if (!profileKey) {
    return NextResponse.json(
      {
        error: "profileKey (or userId) query parameter is required"
      },
      { status: 400 }
    );
  }

  const cleared = await clearProfile(profileKey);

  if (!cleared) {
    return NextResponse.json(
      {
        error: "Failed to clear profile"
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, cleared: true });
}
