import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@/server/db/prisma";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const queueName = "citysense-community-maintenance";
const queue = new Queue(queueName, { connection });

const worker = new Worker(queueName, async (job) => {
  if (job.name === "reconcile-counts") {
    const posts = await prisma.communityPost.findMany({ select: { id: true } });
    for (const post of posts) {
      const [likeCount, commentCount, bookmarkCount] = await Promise.all([
        prisma.communityPostLike.count({ where: { postId: post.id } }),
        prisma.communityComment.count({ where: { postId: post.id, status: "PUBLISHED" } }),
        prisma.communityBookmark.count({ where: { postId: post.id } })
      ]);
      await prisma.communityPost.update({ where: { id: post.id }, data: { likeCount, commentCount, bookmarkCount } });
    }
  }
  if (job.name === "expire-media-reservations") {
    await prisma.communityPostImage.updateMany({
      where: { status: "RESERVED", createdAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
      data: { status: "FAILED", validationError: "upload reservation expired" }
    });
  }
  if (job.name === "reconcile-venue-vote-counts") {
    const venues = await prisma.venue.findMany({ select: { id: true } });
    for (const venue of venues) {
      const grouped = await prisma.venueVote.groupBy({ by: ["type"], where: { venueId: venue.id }, _count: { type: true } });
      const niche = grouped.find((row) => row.type === "NICHE")?._count.type ?? 0;
      const hot = grouped.find((row) => row.type === "HOT")?._count.type ?? 0;
      await prisma.venue.update({ where: { id: venue.id }, data: { nicheVoteCount: niche, hotVoteCount: hot } });
    }
  }
}, { connection, concurrency: 1 });

worker.on("failed", (job, error) => console.error("community maintenance failed", job?.id, error.message));

async function scheduleMaintenance() {
  await queue.add("reconcile-counts", {}, { jobId: "community-reconcile-counts", repeat: { every: 60 * 60_000 } });
  await queue.add("expire-media-reservations", {}, { jobId: "community-expire-media", repeat: { every: 6 * 60 * 60_000 } });
  await queue.add("reconcile-venue-vote-counts", {}, { jobId: "community-reconcile-venue-votes", repeat: { every: 60 * 60_000 } });
  console.log("CitySense community worker started");
}

void scheduleMaintenance().catch((error) => {
  console.error("community maintenance scheduler failed", error);
  process.exitCode = 1;
});
