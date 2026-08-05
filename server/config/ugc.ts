export class FeatureDisabledError extends Error {
  readonly code = "feature_disabled";
  readonly status = 503;

  constructor(message: string) {
    super(message);
  }
}

function enabled(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

export function isUgcEnabled() {
  return enabled("CITYSENSE_UGC_ENABLED");
}

export function isCommunityEnabled() {
  return isUgcEnabled() && enabled("CITYSENSE_COMMUNITY_ENABLED");
}

export function isCommunityWriteEnabled() {
  return isCommunityEnabled() && enabled("CITYSENSE_COMMUNITY_WRITE_ENABLED");
}

export function assertUgcWriteEnabled() {
  if (!isUgcEnabled()) {
    throw new FeatureDisabledError("用户内容功能暂未开放");
  }
}

export function assertCommunityReadEnabled() {
  if (!isCommunityEnabled()) {
    throw new FeatureDisabledError("社区暂未开放");
  }
}

export function assertCommunityWriteEnabled() {
  if (!isCommunityWriteEnabled()) {
    throw new FeatureDisabledError("社区发布与互动暂未开放");
  }
}

export function featureErrorResponse(error: unknown) {
  if (!(error instanceof FeatureDisabledError)) return null;
  return Response.json({ error: error.message, code: error.code }, { status: error.status });
}
