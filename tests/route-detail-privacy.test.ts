import test from "node:test";
import assert from "node:assert/strict";
import { toPublicRouteDetail } from "../server/routes/route-detail";

const record = {
  route: { id: "log__route-1" } as never,
  recommendation: { id: "log", userId: "private-profile", ownerUserId: "00000000-0000-0000-0000-000000000000", input: { city: "上海", originAddress: "私人地址" } as never, generatedAt: "2026-08-05T00:00:00.000Z" },
  map: { provider: "amap-jsapi" as const, polyline: [], markers: [] }
};

test("public route detail excludes recommendation identity and input", () => {
  const publicValue = toPublicRouteDetail(record);
  assert.deepEqual(publicValue.recommendation, { id: "log", generatedAt: "2026-08-05T00:00:00.000Z" });
  assert.equal("userId" in publicValue.recommendation, false);
  assert.equal("input" in publicValue.recommendation, false);
});
