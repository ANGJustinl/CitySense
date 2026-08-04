export type CityCondition = "weather" | "crowd" | "sentiment" | "freshness";

export type CityConditionSource =
  | "amap-weather"
  | "citysense-crowd-estimator"
  | "citysense-sentiment-rules"
  | "citysense-sentiment-llm"
  | "citysense-freshness";

export type CityConditionDraft = {
  city: string;
  area?: string;
  venueId?: string;
  condition: CityCondition;
  score: number;
  label?: string;
  source: CityConditionSource | string;
  confidence: number;
  metadata?: Record<string, unknown>;
  capturedAt: Date;
  expiresAt: Date;
};

export type CityConditionSnapshotLike = {
  id?: string;
  city: string;
  area?: string | null;
  venueId?: string | null;
  condition: CityCondition | string;
  score: number;
  label?: string | null;
  source: string;
  confidence: number;
  metadata?: unknown;
  capturedAt: Date | string;
  expiresAt: Date | string;
};

export type CityConditionSummary = {
  condition: CityCondition;
  label: string;
  score: number;
  source: string;
  confidence: number;
  capturedAt?: string;
  expiresAt?: string;
  ageMinutes?: number;
  expired: boolean;
  area?: string;
  venueId?: string;
  metadata?: Record<string, unknown>;
};

export type CityConditionStatus = {
  city: string;
  area?: string;
  queue: {
    configured: boolean;
  };
  latestCapturedAt?: string;
  latestAgeMinutes?: number;
  conditions: CityConditionSummary[];
};

export type CityStateRefreshInput = {
  city: string;
  area?: string;
  force?: boolean;
  requestedBy?: string;
};

export type CityStateRefreshResult = {
  city: string;
  area?: string;
  status: "completed";
  refreshed: CityConditionSummary[];
  generatedAt: string;
};
