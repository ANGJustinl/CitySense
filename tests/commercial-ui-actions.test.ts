import assert from "node:assert/strict";
import test from "node:test";
import { cityPulseAgeLabel, cityPulseMetricWidth } from "@/lib/city-pulse-display";
import { buildBuddyIntentPayload, validateBuddySchedule } from "@/lib/route-buddy";
import { buildSaveFeedbackPayload, routeShareUrl } from "@/lib/route-actions";

test("route save keeps the existing feedback API payload", () => {
  assert.deepEqual(buildSaveFeedbackPayload({ recommendationId: "rec-1", routeId: "rec-1__route-1", userId: "user-1" }), {
    recommendationLogId: "rec-1",
    routeId: "rec-1__route-1",
    userId: "user-1",
    sessionId: undefined,
    value: "save"
  });
});

test("route share URL is absolute and safely encodes the snapshot id", () => {
  assert.equal(routeShareUrl("rec 1__route/1", "https://citysense.example/app"), "https://citysense.example/routes/rec%201__route/1");
});

test("buddy sheet maps pace and interests to the existing preference schema", () => {
  const payload = buildBuddyIntentPayload({ mode: "AUTO", routeId: "rec__route", start: "2030-08-07T18:00", end: "2030-08-07T21:00", meetingLabel: " 静安寺 2 号口 ", meetingArea: " 静安 ", interests: "咖啡， 展览, 拍照", note: " 慢慢走 ", pace: "relaxed" });
  assert.equal(payload.routeSnapshotId, "rec__route");
  assert.equal(payload.meetingLabel, "静安寺 2 号口");
  assert.deepEqual(payload.preferences.hard, { pace: "relaxed", meetingAreas: ["静安"] });
  assert.deepEqual(payload.preferences.soft.interests, ["咖啡", "展览", "拍照"]);
  assert.deepEqual(payload.preferences.publicLabels, ["自动匹配", "慢慢走"]);
});

test("buddy schedule rejects past starts and reversed ranges", () => {
  const now = new Date("2030-08-07T12:00:00Z").getTime();
  assert.equal(validateBuddySchedule("2030-08-07T11:00:00Z", "2030-08-07T14:00:00Z", now), "开始时间必须晚于现在");
  assert.equal(validateBuddySchedule("2030-08-07T13:00:00Z", "2030-08-07T12:30:00Z", now), "结束时间必须晚于开始时间");
  assert.equal(validateBuddySchedule("2030-08-07T13:00:00Z", "2030-08-07T14:00:00Z", now), undefined);
});

test("city pulse display handles missing freshness and tiny metrics", () => {
  assert.equal(cityPulseAgeLabel(undefined), "时间未知");
  assert.equal(cityPulseAgeLabel(0), "刚刚");
  assert.equal(cityPulseAgeLabel(12), "12 分钟前");
  assert.equal(cityPulseMetricWidth(0, 0), 8);
  assert.equal(cityPulseMetricWidth(3, 12), 25);
});
