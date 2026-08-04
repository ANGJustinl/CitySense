import assert from "node:assert/strict";
import test from "node:test";
import { getCityPulse, summarizeTrafficCache } from "@/server/recommendation/city-pulse";

test("city pulse summarizes traffic provider mix and cache freshness", () => {
  const latestCapturedAt = new Date(Date.now() - 4 * 60_000);
  const olderCapturedAt = new Date(Date.now() - 18 * 60_000);

  const trafficCache = summarizeTrafficCache([
    {
      rawPayload: {
        provider: "amap"
      },
      capturedAt: latestCapturedAt
    },
    {
      rawPayload: {
        provider: "amap"
      },
      capturedAt: olderCapturedAt
    },
    {
      rawPayload: {
        provider: "estimated"
      },
      capturedAt: olderCapturedAt
    }
  ]);

  assert.deepEqual(trafficCache.providerMix, [
    {
      label: "amap",
      value: 2
    },
    {
      label: "estimated",
      value: 1
    }
  ]);
  assert.equal(trafficCache.snapshotCount, 3);
  assert.equal(trafficCache.latestCapturedAt, latestCapturedAt.toISOString());
  const latestAgeMinutes = trafficCache.latestAgeMinutes;

  if (typeof latestAgeMinutes !== "number") {
    assert.fail("expected latestAgeMinutes to be present");
  }

  assert.ok(latestAgeMinutes >= 3 && latestAgeMinutes <= 5);
});

test("city pulse includes latest city condition summaries", async () => {
  const { prisma } = await import("@/server/db/prisma");
  const original = {
    eventFindMany: prisma.event.findMany,
    venueFindMany: prisma.venue.findMany,
    citySignalFindMany: prisma.citySignal.findMany,
    feedbackGroupBy: prisma.recommendationFeedback.groupBy,
    featureGroupBy: prisma.recommendationFeatureSnapshot.groupBy,
    trafficFindMany: prisma.trafficSnapshot.findMany,
    conditionFindMany: prisma.cityConditionSnapshot.findMany
  };
  const capturedAt = new Date(Date.now() - 6 * 60_000);
  const expiresAt = new Date(Date.now() + 30 * 60_000);

  prisma.event.findMany = (async () => []) as never;
  prisma.venue.findMany = (async () => []) as never;
  prisma.citySignal.findMany = (async () => []) as never;
  prisma.recommendationFeedback.groupBy = (async () => []) as never;
  prisma.recommendationFeatureSnapshot.groupBy = (async () => []) as never;
  prisma.trafficSnapshot.findMany = (async () => []) as never;
  prisma.cityConditionSnapshot.findMany = (async () => [
    {
      id: "condition-weather",
      city: "上海",
      area: "静安",
      venueId: null,
      condition: "weather",
      score: 82,
      label: "适合出行",
      source: "amap-weather",
      confidence: 0.86,
      metadata: {
        phenomenon: "晴"
      },
      capturedAt,
      expiresAt,
      createdAt: capturedAt,
      updatedAt: capturedAt
    }
  ]) as never;

  try {
    const pulse = await getCityPulse({
      city: "上海",
      area: "静安"
    });

    assert.equal(pulse.conditions.length, 1);
    assert.equal(pulse.conditions[0].condition, "weather");
    assert.equal(pulse.conditions[0].label, "适合出行");
    assert.equal(pulse.conditions[0].expired, false);
  } finally {
    prisma.event.findMany = original.eventFindMany;
    prisma.venue.findMany = original.venueFindMany;
    prisma.citySignal.findMany = original.citySignalFindMany;
    prisma.recommendationFeedback.groupBy = original.feedbackGroupBy;
    prisma.recommendationFeatureSnapshot.groupBy = original.featureGroupBy;
    prisma.trafficSnapshot.findMany = original.trafficFindMany;
    prisma.cityConditionSnapshot.findMany = original.conditionFindMany;
  }
});
