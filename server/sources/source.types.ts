import type { CandidateType } from "@/server/recommendation/types";

export type SourceKind = "mcp" | "crawler" | "api" | "mock";
export type ConnectorStatus =
  | "active"
  | "paused"
  | "error"
  | "not_configured"
  | "disabled"
  | "cooldown";
export type RawSourceItemStatus = "new" | "normalized" | "ignored" | "error";

export type RawSourceItem = {
  id: string;
  source: string;
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  content?: string;
  author?: string;
  rawPayload?: unknown;
  city?: string;
  area?: string;
  publishedAt?: string;
  status: RawSourceItemStatus;
  itemType: CandidateType;
};

export type RawSourceItemDetail = RawSourceItem & {
  address?: string;
  lat?: number;
  lng?: number;
  startsAt?: string;
  endsAt?: string;
  imageUrl?: string;
  tags: string[];
  trendScore?: number;
  confidence?: number;
  popularity?: number;
  quietness?: number;
  priceLevel?: number;
  qualityFlags?: string[];
  sourceSignals?: {
    source: string;
    label: string;
    score: number;
    evidence?: string;
  }[];
};

export type SourceSearchInput = {
  city: string;
  area?: string;
  keywords: string[];
  timeWindow?: string;
};

export interface CitySourceAdapter {
  source: string;
  kind: SourceKind;
  status: ConnectorStatus;
  cooldownSeconds: number;
  enabledByDefault: boolean;
  isConfigured(): boolean;
  searchEvents(input: SourceSearchInput): Promise<RawSourceItemDetail[]>;
  searchVenues(input: SourceSearchInput): Promise<RawSourceItemDetail[]>;
  getItemDetail(sourceItemId: string): Promise<RawSourceItemDetail | null>;
}
