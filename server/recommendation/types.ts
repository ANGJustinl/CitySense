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
};

export type CandidateFeatures = ScoreBreakdown & {
  candidateId: string;
  semanticRelevance?: number;
  qualityScore?: number;
  qualityFlags?: string[];
  signalStrength?: number;
  routeEligible?: boolean;
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
    generatedAt: string;
  };
};
