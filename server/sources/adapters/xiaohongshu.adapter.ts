import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import { callMcpTool, type McpToolCall, type McpToolResult } from "@/server/sources/mcp/mcp-client";

type XiaohongshuAdapterOptions = {
  client?: {
    callTool(call: McpToolCall): Promise<McpToolResult>;
  };
};

type XiaohongshuFeed = {
  id?: unknown;
  xsecToken?: unknown;
  noteCard?: {
    displayTitle?: unknown;
    type?: unknown;
    user?: {
      nickname?: unknown;
      nickName?: unknown;
    };
    interactInfo?: {
      likedCount?: unknown;
      collectedCount?: unknown;
      commentCount?: unknown;
    };
  };
};

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return Boolean(value);
}

function parseCompactCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return 0;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return 0;
  }

  if (normalized.endsWith("w")) {
    return Number(normalized.slice(0, -1)) * 10_000 || 0;
  }

  if (normalized.endsWith("万")) {
    return Number(normalized.slice(0, -1)) * 10_000 || 0;
  }

  return Number(normalized.replace(/,/g, "")) || 0;
}

function scoreFromFeed(feed: XiaohongshuFeed) {
  const interactInfo = feed.noteCard?.interactInfo;
  const likes = parseCompactCount(interactInfo?.likedCount);
  const collects = parseCompactCount(interactInfo?.collectedCount);
  const comments = parseCompactCount(interactInfo?.commentCount);
  const weighted = likes + collects * 1.5 + comments * 2;

  return Math.max(45, Math.min(95, Math.round(45 + Math.log10(weighted + 1) * 7.5)));
}

function sourceUrl(id: string, xsecToken?: string) {
  const url = new URL(`https://www.xiaohongshu.com/explore/${id}`);

  if (xsecToken) {
    url.searchParams.set("xsec_token", xsecToken);
  }

  return url.toString();
}

function searchKeyword(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  return [input.area, input.city, ...input.keywords].filter(Boolean).join(" ");
}

function searchToolInput(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  return {
    keyword: searchKeyword(input)
  };
}

function toFeedItems(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const items = (payload as { items?: unknown; feeds?: unknown }).items;
    const feeds = (payload as { items?: unknown; feeds?: unknown }).feeds;

    if (Array.isArray(items)) {
      return items;
    }

    if (Array.isArray(feeds)) {
      return feeds;
    }
  }

  return [];
}

function toRawItem(input: {
  feed: XiaohongshuFeed;
  city: string;
  area?: string;
  tags: string[];
  itemType: RawSourceItemDetail["itemType"];
}): RawSourceItemDetail | null {
  const id = stringOrUndefined(input.feed.id);
  const title = stringOrUndefined(input.feed.noteCard?.displayTitle);

  if (!id || !title) {
    return null;
  }

  const xsecToken = stringOrUndefined(input.feed.xsecToken);
  const score = scoreFromFeed(input.feed);

  return {
    id: `xiaohongshu-${id}`,
    source: "xiaohongshu",
    sourceId: id,
    sourceUrl: sourceUrl(id, xsecToken),
    title,
    content: title,
    author:
      stringOrUndefined(input.feed.noteCard?.user?.nickname) ??
      stringOrUndefined(input.feed.noteCard?.user?.nickName),
    rawPayload: input.feed,
    city: input.city,
    area: input.area,
    status: "new",
    itemType: input.itemType,
    tags: input.tags,
    trendScore: score,
    confidence: 72,
    popularity: score,
    quietness: input.itemType === "event" ? 55 : 60,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "xiaohongshu",
        label: "小红书同城搜索热度",
        score,
        evidence: title
      }
    ]
  };
}

class XiaohongshuMcpAdapter extends BaseCitySourceAdapter {
  private client: NonNullable<XiaohongshuAdapterOptions["client"]>;
  private searchRequests = new Map<string, Promise<unknown[]>>();

  constructor(options: XiaohongshuAdapterOptions = {}) {
    super({
      source: "xiaohongshu",
      kind: "mcp",
      enabledByDefault: true,
      cooldownSeconds: 300,
      requiredEnvVars: ["XIAOHONGSHU_MCP_URL"]
    });
    this.client = options.client ?? {
      callTool: callMcpTool
    };
  }

  private searchRequestKey(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    return JSON.stringify(searchToolInput(input));
  }

  private async fetchFeeds(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    const result = await this.client.callTool({
      connector: "xiaohongshu",
      tool: "search_feeds",
      input: searchToolInput(input),
      config: {
        url: process.env.XIAOHONGSHU_MCP_URL,
        token: process.env.XIAOHONGSHU_MCP_TOKEN,
        timeoutMs: 120_000
      }
    });

    if (result.status !== "ok") {
      throw new Error(result.error ?? `Xiaohongshu MCP search_feeds failed: ${result.status}`);
    }

    return toFeedItems(result.data);
  }

  private searchFeeds(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    const key = this.searchRequestKey(input);
    const existing = this.searchRequests.get(key);

    if (existing) {
      return existing;
    }

    const request = this.fetchFeeds(input).finally(() => {
      this.searchRequests.delete(key);
    });

    this.searchRequests.set(key, request);
    return request;
  }

  private async searchItems(
    input: Parameters<CitySourceAdapter["searchEvents"]>[0],
    itemType: RawSourceItemDetail["itemType"]
  ) {
    const tags = [...new Set([input.area, ...input.keywords, "同城"].filter(isNonEmptyString))];
    const feeds = await this.searchFeeds(input);

    return feeds
      .map((feed) =>
        toRawItem({
          feed: feed as XiaohongshuFeed,
          city: input.city,
          area: input.area,
          tags,
          itemType
        })
      )
      .filter((item): item is RawSourceItemDetail => Boolean(item));
  }

  protected async searchEventsImpl(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    return this.searchItems(input, "event");
  }

  protected async searchVenuesImpl(input: Parameters<CitySourceAdapter["searchVenues"]>[0]) {
    return this.searchItems(input, "venue");
  }
}

export function createXiaohongshuMcpAdapter(options?: XiaohongshuAdapterOptions): CitySourceAdapter {
  return new XiaohongshuMcpAdapter(options);
}

export const xiaohongshuAdapter = createXiaohongshuMcpAdapter();
