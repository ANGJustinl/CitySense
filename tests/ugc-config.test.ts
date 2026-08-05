import assert from "node:assert/strict";
import test from "node:test";
import {
  FeatureDisabledError,
  assertCommunityReadEnabled,
  assertCommunityWriteEnabled,
  assertUgcWriteEnabled,
  isCommunityEnabled,
  isCommunityWriteEnabled,
  isUgcEnabled
} from "@/server/config/ugc";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("community switches require the parent UGC switch", () => {
  withEnv({ CITYSENSE_UGC_ENABLED: "false", CITYSENSE_COMMUNITY_ENABLED: "true", CITYSENSE_COMMUNITY_WRITE_ENABLED: "true" }, () => {
    assert.equal(isUgcEnabled(), false);
    assert.equal(isCommunityEnabled(), false);
    assert.equal(isCommunityWriteEnabled(), false);
    assert.throws(() => assertUgcWriteEnabled(), FeatureDisabledError);
    assert.throws(() => assertCommunityReadEnabled(), FeatureDisabledError);
    assert.throws(() => assertCommunityWriteEnabled(), FeatureDisabledError);
  });
});

test("community read and write switches can be staged independently", () => {
  withEnv({ CITYSENSE_UGC_ENABLED: "true", CITYSENSE_COMMUNITY_ENABLED: "true", CITYSENSE_COMMUNITY_WRITE_ENABLED: "false" }, () => {
    assert.equal(isUgcEnabled(), true);
    assert.equal(isCommunityEnabled(), true);
    assert.equal(isCommunityWriteEnabled(), false);
    assert.doesNotThrow(() => assertCommunityReadEnabled());
    assert.throws(() => assertCommunityWriteEnabled(), FeatureDisabledError);
  });
});
