import type { CityConditionDraft } from "@/server/city-state/types";

const CROWD_TTL_MS = 60 * 60 * 1000;

export type CrowdVenueSample = {
  popularity?: number | null;
  quietness?: number | null;
};

export type CrowdEventSample = {
  trendScore?: number | null;
};

export type CrowdSignalSample = {
  heatScore?: number | null;
};

export type CrowdTrafficSample = {
  congestion?: string | null;
};

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 50;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function congestionScore(value?: string | null) {
  if (value === "busy") return 82;
  if (value === "moderate") return 62;
  if (value === "smooth") return 34;
  return 48;
}

function labelForScore(score: number) {
  if (score >= 75) return "人流偏高";
  if (score >= 55) return "热度适中";
  if (score >= 35) return "相对宽松";
  return "低密度";
}

export function estimateCrowdCondition(input: {
  city: string;
  area?: string;
  venues: CrowdVenueSample[];
  events: CrowdEventSample[];
  citySignals: CrowdSignalSample[];
  trafficSnapshots: CrowdTrafficSample[];
  now?: Date;
}): CityConditionDraft {
  const now = input.now ?? new Date();
  const popularity = average(
    input.venues
      .map((venue) => venue.popularity)
      .filter((value): value is number => typeof value === "number")
  );
  const quietness = average(
    input.venues
      .map((venue) => venue.quietness)
      .filter((value): value is number => typeof value === "number")
  );
  const eventHeat = average(
    input.events
      .map((event) => event.trendScore)
      .filter((value): value is number => typeof value === "number")
  );
  const signalHeat = average(
    input.citySignals
      .map((signal) => signal.heatScore)
      .filter((value): value is number => typeof value === "number")
  );
  const trafficHeat = average(input.trafficSnapshots.map((snapshot) => congestionScore(snapshot.congestion)));
  const sampleCount =
    input.venues.length + input.events.length + input.citySignals.length + input.trafficSnapshots.length;
  const score = clamp(
    popularity * 0.3 +
      (100 - quietness) * 0.22 +
      eventHeat * 0.18 +
      signalHeat * 0.2 +
      trafficHeat * 0.1
  );
  const confidence = Math.min(0.86, 0.32 + Math.log10(Math.max(1, sampleCount)) * 0.24);

  return {
    city: input.city,
    area: input.area,
    condition: "crowd",
    score,
    label: labelForScore(score),
    source: "citysense-crowd-estimator",
    confidence,
    metadata: {
      estimated: true,
      sampleCount,
      popularity: Math.round(popularity),
      quietness: Math.round(quietness),
      eventHeat: Math.round(eventHeat),
      signalHeat: Math.round(signalHeat),
      trafficHeat: Math.round(trafficHeat)
    },
    capturedAt: now,
    expiresAt: new Date(now.getTime() + CROWD_TTL_MS)
  };
}

export const __testing = {
  estimateCrowdCondition
};
