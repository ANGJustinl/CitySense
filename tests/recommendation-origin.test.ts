import assert from "node:assert/strict";
import test from "node:test";
import {
  recommendRequestSchema,
  resolveRecommendationOrigin
} from "@/server/recommendation/recommend";

test("manual origin address is geocoded before recommendation scoring", async () => {
  const input = recommendRequestSchema.parse({
    city: "上海",
    originAddress: " 静安寺 "
  });
  const resolved = await resolveRecommendationOrigin(input, async (address, city) => {
    assert.equal(address, "静安寺");
    assert.equal(city, "上海");

    return {
      address: "上海市静安区静安寺",
      lat: 31.223,
      lng: 121.446,
      provider: "amap"
    };
  });

  assert.deepEqual(resolved.origin, {
    lat: 31.223,
    lng: 121.446,
    label: "静安寺",
    address: "上海市静安区静安寺",
    source: "manual",
    provider: "amap"
  });
});

test("browser origin keeps its label and provider metadata", async () => {
  const input = recommendRequestSchema.parse({
    city: "上海",
    origin: {
      lat: 31.224,
      lng: 121.459,
      label: "当前位置",
      source: "browser",
      provider: "browser"
    }
  });
  const resolved = await resolveRecommendationOrigin(input);

  assert.equal(resolved.origin?.label, "当前位置");
  assert.equal(resolved.origin?.source, "browser");
  assert.equal(resolved.origin?.provider, "browser");
});

test("unresolved manual origin does not fail the recommendation request", async () => {
  const input = recommendRequestSchema.parse({
    city: "上海",
    originAddress: "不存在的起点"
  });
  const resolved = await resolveRecommendationOrigin(input, async () => null);

  assert.equal(resolved.origin, undefined);
  assert.equal(resolved.originAddress, "不存在的起点");
});
