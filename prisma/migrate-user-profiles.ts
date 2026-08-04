import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { recomputeUserProfile } from "@/server/recommendation/user-profile-v2";

type LegacyTagMetadata = {
  approvedTags?: Record<string, number>;
  disapprovedTags?: Record<string, number>;
  tagHistory?: Array<{ tag: string; action: "approve" | "disapprove" | "skip"; at: string }>;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readTags(metadata: unknown): LegacyTagMetadata {
  if (!metadata || typeof metadata !== "object") return {};
  const root = metadata as Record<string, unknown>;
  return (root.tags && typeof root.tags === "object" ? root.tags : root) as LegacyTagMetadata;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const preferences = await prisma.userPreference.findMany({
    select: { userId: true, metadata: true, updatedAt: true }
  });
  let explicitSignals = 0;
  let usersRecomputed = 0;

  for (const preference of preferences) {
    const tags = readTags(preference.metadata);
    const history = Array.isArray(tags.tagHistory) ? tags.tagHistory : [];
    const events = history.length > 0
      ? history
      : [
          ...Object.keys(tags.approvedTags ?? {}).map((tag) => ({ tag, action: "approve" as const, at: preference.updatedAt.toISOString() })),
          ...Object.keys(tags.disapprovedTags ?? {}).map((tag) => ({ tag, action: "disapprove" as const, at: preference.updatedAt.toISOString() }))
        ];

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const createdAt = new Date(event.at);
      const action = event.action === "approve" ? "tag_approve" : event.action === "disapprove" ? "tag_disapprove" : "tag_skip";
      const signalKey = `legacy-explicit:${preference.userId}:${index}:${createdAt.getTime()}:${event.tag}`;
      explicitSignals += 1;
      if (!dryRun) {
        await prisma.userInteraction.upsert({
          where: { signalKey },
          create: {
            userId: preference.userId,
            action,
            weight: event.action === "approve" ? 2 : event.action === "disapprove" ? -2 : 0,
            signalKey,
            signalKind: "legacy_explicit_tag",
            createdAt,
            context: toJson({ tags: [event.tag], migrationSource: "metadata.tags" })
          },
          update: {}
        });
      }
    }
    if (!dryRun) {
      await recomputeUserProfile(preference.userId);
      usersRecomputed += 1;
    }
  }

  console.log(JSON.stringify({ dryRun, scannedUsers: preferences.length, explicitSignals, usersRecomputed }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
