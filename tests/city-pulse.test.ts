import assert from "node:assert/strict";
import test from "node:test";
import { summarizeTrafficCache } from "@/server/recommendation/city-pulse";

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
