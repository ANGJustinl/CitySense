const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const MOCK_SOURCE_NAMES = [
  "mock-city-signal",
  "douban-mock",
  "xiaohongshu-mock",
  "bilibili-mock"
] as const;

const MOCK_SOURCE_NAME_SET = new Set<string>(MOCK_SOURCE_NAMES);

export function isDemoModeEnabled() {
  return TRUE_VALUES.has((process.env.CITYSENSE_DEMO_MODE ?? "").trim().toLowerCase());
}

export function isMockSourceName(source?: string | null) {
  return Boolean(source && (MOCK_SOURCE_NAME_SET.has(source) || source.endsWith("-mock")));
}

export function isDemoSourceKey(sourceKey?: string | null) {
  return Boolean(sourceKey?.startsWith("demo:"));
}

export function isDemoContent(input: { source?: string | null; sourceKey?: string | null }) {
  return isMockSourceName(input.source) || isDemoSourceKey(input.sourceKey);
}
