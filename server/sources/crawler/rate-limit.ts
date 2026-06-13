const buckets = new Map<string, number>();

export function canRunSource(source: string, intervalMs = 60_000) {
  const now = Date.now();
  const lastRun = buckets.get(source) ?? 0;

  if (now - lastRun < intervalMs) {
    return false;
  }

  buckets.set(source, now);
  return true;
}
