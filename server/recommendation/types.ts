export type Mood = "quiet" | "lively" | "date" | "solo" | "random";
export type Budget = "low" | "medium" | "high";
export type TimeWindow = "now" | "tonight" | "weekend";
export type TravelMode = "walking" | "transit" | "driving";
export type CandidateType = "venue" | "event";

export type RecommendInput = {
  userId?: string;
  city: string;
  area?: string;
  origin?: {
    lat: number;
    lng: number;
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
  startsAt?: string;
  endsAt?: string;
  trendScore: number;
  confidence: number;
  freshnessScore: number;
  popularity: number;
  quietness: number;
  priceLevel: number;
  sourceSignals: SourceSignal[];
};

export type ScoreBreakdown = {
  taste: number;
  socialTrend: number;
  freshness: number;
  distance: number;
  traffic: number;
  timeFit: number;
  novelty: number;
};

export type ScoredCandidate = Candidate & {
  baseScore: number;
  scoreBreakdown: ScoreBreakdown;
};

export type TrafficInfo = {
  estimatedDurationMinutes: number;
  mode: TravelMode;
  distanceMeters?: number;
  congestion?: string;
  provider: "amap" | "estimated";
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
  }[];
  reason: string;
  tips: string[];
};

export type RecommendResponse = {
  routes: RecommendedRoute[];
  meta: {
    candidateCount: number;
    trafficProvider: "amap" | "estimated";
    generatedAt: string;
  };
};
