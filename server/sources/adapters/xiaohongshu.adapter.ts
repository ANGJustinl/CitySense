import { createHash } from "node:crypto";
import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import { callMcpTool, type McpToolCall, type McpToolResult } from "@/server/sources/mcp/mcp-client";
import { checkTitleQuality, filterLowQualityTitles } from "@/server/sources/adapters/title-quality-filter";

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
    cover?: {
      urlDefault?: unknown;
      urlPre?: unknown;
      infoList?: {
        url?: unknown;
      }[];
    };
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

type XiaohongshuAiSourceNote = {
  idx?: unknown;
  noteId?: unknown;
  title?: unknown;
  url?: unknown;
  cover?: unknown;
  author?: unknown;
  time?: unknown;
  likedCount?: unknown;
  text?: unknown;
};

type XiaohongshuSearchResult =
  | {
      tool: "ai_search_chat";
      items: unknown[];
      answer?: string;
    }
  | {
      tool: "search_feeds";
      items: unknown[];
    };

type XiaohongshuSearchTool = XiaohongshuSearchResult["tool"];

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function httpUrlOrUndefined(value: unknown) {
  const url = stringOrUndefined(value);

  return url && /^https?:\/\//.test(url) ? url : undefined;
}

function feedCoverUrl(feed: XiaohongshuFeed) {
  const cover = feed.noteCard?.cover;

  if (!cover) {
    return undefined;
  }

  return (
    httpUrlOrUndefined(cover.urlDefault) ??
    httpUrlOrUndefined(cover.urlPre) ??
    (Array.isArray(cover.infoList)
      ? cover.infoList.map((info) => httpUrlOrUndefined(info?.url)).find(Boolean)
      : undefined)
  );
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

function scoreFromPopularity(value: unknown) {
  const popularity = parseCompactCount(value);

  return Math.max(45, Math.min(95, Math.round(45 + Math.log10(popularity + 1) * 7.5)));
}

function scoreFromFeed(feed: XiaohongshuFeed) {
  const interactInfo = feed.noteCard?.interactInfo;
  const likes = parseCompactCount(interactInfo?.likedCount);
  const collects = parseCompactCount(interactInfo?.collectedCount);
  const comments = parseCompactCount(interactInfo?.commentCount);
  const weighted = likes + collects * 1.5 + comments * 2;

  return scoreFromPopularity(weighted);
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

function aiSearchPrompt(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  const location = [input.area, input.city].filter(Boolean).join(" ");
  const keywords = input.keywords.length > 0 ? input.keywords.join("、") : "咖啡、展览、市集、独处";
  const timeWindow = input.timeWindow ? `时间窗口：${input.timeWindow}。` : "";

  return [
    `请在小红书 AI 搜索中查找 ${location || input.city} 最新且可线下前往的城市体验信息。`,
    `关注关键词：${keywords}。${timeWindow}`,
    "优先活动、展览、市集、咖啡店、书店、citywalk 和适合独处的地点。",
    "请尽量引用真实笔记来源，来源标题要能作为 CitySense 入库候选。",
    "",
    "排除以下类型内容：",
    "- 标题党：如'上海生活简直是看展天花板'、'这家店绝了'等纯夸张表达",
    "- 营销内容：如'最全攻略'、'保姆级教程'、'不看后悔'等营销关键词",
    "- 泛化推荐：如'周末好去处'、'必去清单'等无具体地点的推荐",
    "",
    "优先返回包含具体地点/活动名称的内容，如'浦东美术馆新展'、'静安寺某咖啡店'等。"
  ].join("\n");
}

function numberFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);

  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function configuredSearchTool(): XiaohongshuSearchTool {
  return process.env.XIAOHONGSHU_MCP_SEARCH_TOOL?.trim() === "search_feeds"
    ? "search_feeds"
    : "ai_search_chat";
}

function aiSearchToolInput(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  const timeoutSeconds = numberFromEnv("XIAOHONGSHU_MCP_AI_SEARCH_TIMEOUT_SECONDS", 90);

  return {
    prompt: aiSearchPrompt(input),
    include_sources: boolFromEnv("XIAOHONGSHU_MCP_AI_SEARCH_INCLUDE_SOURCES", true),
    source_limit: numberFromEnv("XIAOHONGSHU_MCP_AI_SEARCH_SOURCE_LIMIT", 20),
    timeout_seconds: timeoutSeconds
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

function payloadData(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const data = (payload as { data?: unknown }).data;

  return data && typeof data === "object" ? data : payload;
}

function aiSearchAnswer(payload: unknown) {
  return stringOrUndefined((payloadData(payload) as { answer?: unknown })?.answer);
}

function toAiSourceNotes(payload: unknown) {
  const data = payloadData(payload);
  const sources = data && typeof data === "object" ? (data as { sources?: unknown }).sources : undefined;
  const notes = sources && typeof sources === "object" ? (sources as { notes?: unknown }).notes : undefined;

  return Array.isArray(notes) ? notes : [];
}

function stableId(parts: unknown[]) {
  return createHash("sha1")
    .update(parts.map((part) => (typeof part === "string" ? part : "")).join("|"))
    .digest("hex")
    .slice(0, 18);
}

function typedSourceId(id: string, itemType: RawSourceItemDetail["itemType"]) {
  return `${id}:${itemType}`;
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
  const sourceId = typedSourceId(id, input.itemType);

  return {
    id: `xiaohongshu-${sourceId}`,
    source: "xiaohongshu",
    sourceId,
    sourceUrl: sourceUrl(id, xsecToken),
    title,
    content: title,
    imageUrl: feedCoverUrl(input.feed),
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

function toAiSearchRawItem(input: {
  note: XiaohongshuAiSourceNote;
  answer?: string;
  city: string;
  area?: string;
  tags: string[];
  itemType: RawSourceItemDetail["itemType"];
}): RawSourceItemDetail | null {
  const title = stringOrUndefined(input.note.title);
  const url = stringOrUndefined(input.note.url);
  const text = stringOrUndefined(input.note.text);
  const id =
    stringOrUndefined(input.note.noteId) ??
    stableId([url, title, text, stringOrUndefined(input.note.author)]);

  if (!id || !title) {
    return null;
  }

  const score = scoreFromPopularity(input.note.likedCount);
  const sourceId = typedSourceId(id, input.itemType);

  return {
    id: `xiaohongshu-${sourceId}`,
    source: "xiaohongshu",
    sourceId,
    sourceUrl: url,
    title,
    content: text ?? input.answer ?? title,
    imageUrl: httpUrlOrUndefined(input.note.cover),
    author: stringOrUndefined(input.note.author),
    rawPayload: {
      tool: "ai_search_chat",
      answer: input.answer,
      note: input.note
    },
    city: input.city,
    area: input.area,
    status: "new",
    itemType: input.itemType,
    tags: input.tags,
    trendScore: score,
    confidence: 76,
    popularity: score,
    quietness: input.itemType === "event" ? 55 : 60,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "xiaohongshu",
        label: "小红书 AI 搜索来源",
        score,
        evidence: title
      }
    ]
  };
}

class XiaohongshuMcpAdapter extends BaseCitySourceAdapter {
  private client: NonNullable<XiaohongshuAdapterOptions["client"]>;
  private searchRequests = new Map<string, Promise<XiaohongshuSearchResult>>();
  private lastPreFilteredCount = 0;  // 跟踪最后一次搜索的预过滤数量

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

  /**
   * 获取最后一次搜索的预过滤统计
   */
  getLastPreFilteredCount(): number {
    return this.lastPreFilteredCount;
  }

  /**
   * 重置预过滤统计
   */
  private resetPreFilteredCount() {
    this.lastPreFilteredCount = 0;
  }

  private searchRequestKey(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    return JSON.stringify({
      tool: configuredSearchTool(),
      input: searchToolInput(input),
      ai: aiSearchToolInput(input)
    });
  }

  private async fetchFeeds(input: Parameters<CitySourceAdapter["searchEvents"]>[0]): Promise<XiaohongshuSearchResult> {
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

    return {
      tool: "search_feeds",
      items: toFeedItems(result.data)
    };
  }

  private async fetchAiSearch(input: Parameters<CitySourceAdapter["searchEvents"]>[0]): Promise<XiaohongshuSearchResult> {
    const toolInput = aiSearchToolInput(input);
    const timeoutMs = (toolInput.timeout_seconds + 50) * 1000;
    const result = await this.client.callTool({
      connector: "xiaohongshu",
      tool: "ai_search_chat",
      input: toolInput,
      config: {
        url: process.env.XIAOHONGSHU_MCP_URL,
        token: process.env.XIAOHONGSHU_MCP_TOKEN,
        timeoutMs
      }
    });

    if (result.status !== "ok") {
      throw new Error(result.error ?? `Xiaohongshu MCP ai_search_chat failed: ${result.status}`);
    }

    return {
      tool: "ai_search_chat",
      items: toAiSourceNotes(result.data),
      answer: aiSearchAnswer(result.data)
    };
  }

  private async fetchSearchResult(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    if (configuredSearchTool() === "search_feeds") {
      return this.fetchFeeds(input);
    }

    try {
      const aiResult = await this.fetchAiSearch(input);

      if (aiResult.items.length > 0) {
        return aiResult;
      }
    } catch {
      // Fall back to the older search_feeds tool when AI Search is unavailable.
    }

    return this.fetchFeeds(input);
  }

  private searchResult(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    const key = this.searchRequestKey(input);
    const existing = this.searchRequests.get(key);

    if (existing) {
      return existing;
    }

    const request = this.fetchSearchResult(input).finally(() => {
      this.searchRequests.delete(key);
    });

    this.searchRequests.set(key, request);
    return request;
  }

  private async searchItems(
    input: Parameters<CitySourceAdapter["searchEvents"]>[0],
    itemType: RawSourceItemDetail["itemType"]
  ) {
    this.resetPreFilteredCount();  // 重置统计
    const result = await this.searchResult(input);
    const tags = [
      ...new Set(
        [
          input.area,
          ...input.keywords,
          ...(result.tool === "ai_search_chat" ? ["AI搜索"] : []),
          "同城"
        ].filter(isNonEmptyString)
      )
    ];

    // 预过滤：提前过滤低质量标题，减少后续处理
    const originalCount = result.items.length;
    const preFilteredItems = result.items.filter((rawItem) => {
      // AI搜索结果通常已经过筛选，优先保留
      if (result.tool === "ai_search_chat") {
        const note = rawItem as XiaohongshuAiSourceNote;
        const title = String(note.title || "").trim();
        const content = String(note.text || result.answer || "").trim();
        // AI搜索内容放宽一些标准，只需要有基本内容
        return title.length > 0;
      }

      // 传统feed搜索，严格过滤标题党
      const feed = rawItem as XiaohongshuFeed;
      const title = String(feed.noteCard?.displayTitle || "").trim();
      const quality = checkTitleQuality(title);
      return quality.pass;
    });

    // 记录过滤数量
    this.lastPreFilteredCount = originalCount - preFilteredItems.length;

    return preFilteredItems
      .map((item) =>
        result.tool === "ai_search_chat"
          ? toAiSearchRawItem({
              note: item as XiaohongshuAiSourceNote,
              answer: result.answer,
              city: input.city,
              area: input.area,
              tags,
              itemType
            })
          : toRawItem({
              feed: item as XiaohongshuFeed,
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
