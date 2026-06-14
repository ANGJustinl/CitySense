import { areasMatch } from "@/server/geo/area-normalizer";
import {
  isGenericSocialContent,
  routeEligibilityFromQuality
} from "@/server/recommendation/quality";
import type {
  Candidate,
  RecallChannel,
  RecommendInput,
  SourceSignal
} from "@/server/recommendation/types";

export type CitySignalContextRow = {
  id?: string;
  city: string;
  area?: string | null;
  tag: string;
  heatScore: number;
  source: string;
  metadata?: unknown;
  matchedVenueIds?: string[];
};

function metadataTitle(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const title = (metadata as { title?: unknown }).title;

  return typeof title === "string" && title.trim() ? title.trim() : undefined;
}

function signalMatchesCandidate(
  signal: CitySignalContextRow,
  candidate: Candidate,
  input: RecommendInput
) {
  if (signal.city !== candidate.city || signal.city !== input.city) {
    return false;
  }

  if (!areasMatch(signal.area, candidate.area) && !areasMatch(signal.area, input.area)) {
    return false;
  }

  if (MATCH_GATED_SIGNAL_SOURCES.has(signal.source)) {
    return Boolean(signal.matchedVenueIds?.includes(candidate.id));
  }

  return candidate.tags.some((tag) => tagsMatch(tag, signal.tag));
}

const TAG_SYNONYMS: Record<string, string[]> = {
  咖啡: ["咖啡厅", "咖啡馆"],
  展览: ["展览馆", "美术馆", "画廊", "艺术"],
  书店: ["阅读", "书坊", "书店"],
  夜生活: ["酒吧", "livehouse", "live house", "独立音乐", "演出", "音乐"]
};

function tagsMatch(candidateTag: string, signalTag: string) {
  const candidate = candidateTag.toLowerCase();
  const signal = signalTag.toLowerCase();

  if (candidate.includes(signal) || signal.includes(candidate)) {
    return true;
  }

  return (TAG_SYNONYMS[signalTag] ?? []).some((synonym) =>
    candidate.includes(synonym.toLowerCase())
  );
}

function sourceSignalFor(signal: CitySignalContextRow): SourceSignal {
  const title = metadataTitle(signal.metadata);

  return {
    source: signal.source,
    label: `${signal.source} 城市热度`,
    score: Math.round(signal.heatScore),
    evidence: title ? `${signal.tag} / ${title}` : `${signal.tag} 热度 ${Math.round(signal.heatScore)}`
  };
}

const SOCIAL_SIGNAL_SOURCES = new Set(["xiaohongshu", "bilibili", "trends-hub"]);
// Sources that require a confirmed venue match before their signals can attach
// to a candidate (mirrors xiaohongshu). damai signals are only meaningful once
// the event's venueName is bound to a real AMap Venue.
const MATCH_GATED_SIGNAL_SOURCES = new Set(["xiaohongshu", "damai"]);

function isUsableSignal(signal: CitySignalContextRow) {
  const title = metadataTitle(signal.metadata);

  if (MATCH_GATED_SIGNAL_SOURCES.has(signal.source) && !signal.matchedVenueIds?.length) {
    return false;
  }

  if (
    SOCIAL_SIGNAL_SOURCES.has(signal.source) &&
    (!title || !title.toLowerCase().includes(signal.tag.toLowerCase()))
  ) {
    return false;
  }

  return !isGenericSocialContent({
    source: signal.source,
    title: title ?? signal.tag,
    tags: [signal.tag]
  });
}

function mergeSourceSignals(existing: SourceSignal[], incoming: SourceSignal[]) {
  const seen = new Set<string>();

  return [...existing, ...incoming]
    .sort((a, b) => b.score - a.score)
    .filter((signal) => {
      const key = `${signal.source}:${signal.label}:${signal.evidence ?? ""}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function addRecallChannel(channels: RecallChannel[] | undefined, channel: RecallChannel) {
  return [...new Set([...(channels ?? ["base"]), channel])];
}

export function applySignalBackedContext(
  candidates: Candidate[],
  signals: CitySignalContextRow[],
  input: RecommendInput
): Candidate[] {
  const usableSignals = signals.filter(isUsableSignal);

  if (usableSignals.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      signalStrength: candidate.signalStrength ?? candidate.trendScore
    }));
  }

  return candidates.map((candidate) => {
    const routeEligible =
      candidate.routeEligible ??
      routeEligibilityFromQuality({
        qualityScore: candidate.qualityScore,
        qualityFlags: candidate.qualityFlags,
        address: candidate.address,
        lat: candidate.lat,
        lng: candidate.lng
      });
    const matchedSignals = routeEligible
      ? usableSignals.filter((signal) => signalMatchesCandidate(signal, candidate, input)).slice(0, 4)
      : [];

    if (matchedSignals.length === 0) {
      return {
        ...candidate,
        routeEligible,
        signalStrength: candidate.signalStrength ?? candidate.trendScore
      };
    }

    const signalStrength = Math.max(
      candidate.signalStrength ?? candidate.trendScore,
      ...matchedSignals.map((signal) => signal.heatScore)
    );

    return {
      ...candidate,
      routeEligible,
      trendScore: Math.max(candidate.trendScore, signalStrength),
      signalStrength,
      recallChannels: addRecallChannel(candidate.recallChannels, "city-signal"),
      sourceSignals: mergeSourceSignals(
        candidate.sourceSignals,
        matchedSignals.map(sourceSignalFor)
      )
    };
  });
}
