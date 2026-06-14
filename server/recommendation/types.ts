export type Mood = "quiet" | "lively" | "date" | "solo" | "random";
export type Budget = "low" | "medium" | "high";
export type TimeWindow = "now" | "tonight" | "weekend";
export type TravelMode = "walking" | "transit" | "driving";
export type CandidateType = "venue" | "event";
export type OriginSource = "browser" | "manual" | "default";

export type RecommendInput = {
  userId?: string;
  city: string;
  area?: string;
  originAddress?: string;
  origin?: {
    lat: number;
    lng: number;
    label?: string;
    address?: string;
    source?: OriginSource;
    provider?: "amap" | "browser" | "default";
  };
  interests: string[];
  mood: Mood;
  budget: Budget;
  timeWindow: TimeWindow;
  useRealtimeTraffic?: boolean;
  useSocialSignals?: boolean;
  /**
   * 匿名用户冷启动多样性补偿（TASK2-P0-004）：
   * 调用方传入最近已曝光的 place/route title 列表（如前端记录的上次推荐结果），
   * 对命中的候选施加轻量 exposurePenalty，避免无画像用户反复看到相同 Top 路线。
   * 有 userId 的用户走画像 exposure 通道，此字段仅对匿名/无画像用户生效。
   */
  recentExposure?: {
    itemIds?: string[];
    routeTitles?: string[];
  };
};

export type SourceSignal = {
  source: string;
  label: string;
  score: number;
  evidence?: string;
};

export type RecallChannel =
  | "base"
  | "tag"
  | "text"
  | "social"
  | "city-signal"
  | "city-fallback"
  | "feedback-suppression";

export type Candidate = {
  id: string;
  name: string;
  type: CandidateType;
  description?: string;
  city: string;
  area?: string;
  address?: string;
  lat?: number;
  lng?: number;
  tags: string[];
  source?: string;
  sourceUrl?: string;
  imageUrl?: string;
  venueId?: string;
  startsAt?: string;
  endsAt?: string;
  trendScore: number;
  confidence: number;
  freshnessScore: number;
  popularity: number;
  quietness: number;
  priceLevel: number;
  sourceSignals: SourceSignal[];
  recallChannels?: RecallChannel[];
  textRelevance?: number;
  qualityScore?: number;
  qualityFlags?: string[];
  routeEligible?: boolean;
  signalStrength?: number;
};

export type ScoreBreakdown = {
  taste: number;
  textRelevance: number;
  socialTrend: number;
  freshness: number;
  distance: number;
  traffic: number;
  timeFit: number;
  novelty: number;
  actionability: number;
  userAffinity: number;
  feedbackPenalty: number;
  exposurePenalty: number;
};

// TASK2-P0-001：画像归因，写入 CandidateFeatures.profileFactors 供追溯。
export type ProfileFactor = {
  dimension: "tag" | "source" | "area" | "budget" | "quietness" | "mood";
  key: string;
  delta: number;
};

export type CandidateFeatures = ScoreBreakdown & {
  candidateId: string;
  semanticRelevance?: number;
  qualityScore?: number;
  qualityFlags?: string[];
  signalStrength?: number;
  routeEligible?: boolean;
  profileFactors?: ProfileFactor[];
  profileHit?: boolean;
  profileVersion?: number;
};

export type ScoredCandidate = Candidate & {
  baseScore: number;
  scoreBreakdown: ScoreBreakdown;
  features: CandidateFeatures;
  ranker: string;
  rankerVersion: string;
};

export type TrafficInfo = {
  estimatedDurationMinutes: number;
  mode: TravelMode;
  distanceMeters?: number;
  congestion?: string;
  provider: "amap" | "estimated";
  cacheHit?: boolean;
  capturedAt?: string;
};

export type RouteLegStep = {
  instruction?: string;
  road?: string;
  distanceMeters?: number;
  durationMinutes?: number;
};

export type RouteLeg = {
  fromName: string;
  toName: string;
  toPlaceId?: string;
  mode: TravelMode;
  durationMinutes: number;
  distanceMeters?: number;
  congestion?: string;
  provider: "amap" | "estimated";
  polyline: [lng: number, lat: number][];
  transitLines?: string[];
  steps?: RouteLegStep[];
  cacheHit?: boolean;
};

export type TrafficCandidate = ScoredCandidate & {
  traffic: TrafficInfo;
  adjustedScore: number;
};

export type RecommendedRoute = {
  id: string;
  title: string;
  summary: string;
  totalScore: number;
  scoreBreakdown: ScoreBreakdown;
  traffic: TrafficInfo;
  legs?: RouteLeg[];
  sourceSignals: SourceSignal[];
  places: {
    id: string;
    name: string;
    type: CandidateType;
    address?: string;
    area?: string;
    lat?: number;
    lng?: number;
    tags: string[];
    source?: string;
    sourceUrl?: string;
    imageUrl?: string;
  }[];
  reason: string;
  tips: string[];
};

export type RecommendResponse = {
  routes: RecommendedRoute[];
  meta: {
    recommendationId?: string;
    candidateCount: number;
    trafficProvider: "amap" | "estimated";
    origin?: {
      lat?: number;
      lng?: number;
      label?: string;
      address?: string;
      source?: OriginSource;
      provider?: "amap" | "browser" | "default";
      status: "resolved" | "unresolved";
    };
    ranker?: string;
    rankerVersion?: string;
    recallChannels?: RecallChannel[];
    profileApplied?: {
      version: number;
      topFactors: string[];
      sampleSize: number;
      confidence: "low" | "medium" | "high";
      degraded: boolean;
    };
    generatedAt: string;
  };
};
