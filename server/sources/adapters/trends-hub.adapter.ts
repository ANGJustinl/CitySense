import { createHash } from "node:crypto";
import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import {
  callMcpToolRaw,
  type McpRawToolResult,
  type McpToolCall
} from "@/server/sources/mcp/mcp-client";

type TrendsHubTool = {
  name: string;
  label: string;
  input?: Record<string, unknown>;
};

type TrendsHubAdapterOptions = {
  tools?: TrendsHubTool[];
  client?: {
    callToolRaw(call: McpToolCall): Promise<McpRawToolResult>;
  };
};

type TrendRecord = Record<string, string>;

const DEFAULT_TOOLS: TrendsHubTool[] = [
  { name: "get_weibo_trending", label: "微博热搜" },
  { name: "get_zhihu_trending", label: "知乎热榜", input: { limit: 30 } },
  { name: "get_toutiao_trending", label: "头条热榜" },
  { name: "get_thepaper_trending", label: "澎湃热榜" }
];

const TOOL_LABELS = new Map(DEFAULT_TOOLS.map((tool) => [tool.name, tool.label]));

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scoreFromPopularity(value: string | undefined) {
  const popularity = parseInteger(value);

  if (popularity === undefined) {
    return 55;
  }

  return Math.min(95, Math.round(50 + Math.log10(popularity + 1) * 8));
}

function stableId(parts: string[]) {
  return createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseTrendText(text: string): TrendRecord {
  const record: TrendRecord = {};
  const pattern = /<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/g;

  for (const match of text.matchAll(pattern)) {
    record[match[1]] = decodeEntities(match[2].trim());
  }

  return record;
}

function textContent(payload: unknown) {
  const content = payload && typeof payload === "object" ? (payload as { content?: unknown }).content : undefined;

  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((part): part is { type: "text"; text: string } => {
      if (!part || typeof part !== "object") {
        return false;
      }

      return (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string";
    })
    .map((part) => part.text);
}

function configuredTools(tools?: TrendsHubTool[]) {
  if (tools?.length) {
    return tools;
  }

  const configured = process.env.TRENDS_HUB_MCP_TOOLS?.split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  if (!configured?.length) {
    return DEFAULT_TOOLS;
  }

  return configured.map((name) => ({
    name,
    label: TOOL_LABELS.get(name) ?? name
  }));
}

function queryTerms(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  return [input.area, input.city, ...input.keywords]
    .map((term) => term?.trim().toLowerCase())
    .filter((term): term is string => Boolean(term));
}

function haystackText(record: TrendRecord) {
  return [record.title, record.description, record.hashtags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isRelevant(record: TrendRecord, input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  const terms = queryTerms(input);

  if (terms.length === 0) {
    return true;
  }

  const haystack = haystackText(record);
  return terms.some((term) => haystack.includes(term));
}

function matchedContextTags(record: TrendRecord, input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
  const haystack = haystackText(record);
  return [input.area, ...input.keywords].filter((term): term is string => {
    return typeof term === "string" && Boolean(term.trim()) && haystack.includes(term.trim().toLowerCase());
  });
}

function publishedAt(record: TrendRecord) {
  return (
    stringOrUndefined(record.publishTime) ??
    stringOrUndefined(record.eventTime) ??
    stringOrUndefined(record.created) ??
    stringOrUndefined(record.publish_time)
  );
}

function recordUrl(record: TrendRecord) {
  return stringOrUndefined(record.link) ?? stringOrUndefined(record.url);
}

function toRawItem(input: {
  tool: TrendsHubTool;
  record: TrendRecord;
  search: Parameters<CitySourceAdapter["searchEvents"]>[0];
}): RawSourceItemDetail | null {
  const title = stringOrUndefined(input.record.title);

  if (!title) {
    return null;
  }

  const url = recordUrl(input.record);
  const score = scoreFromPopularity(input.record.popularity ?? input.record.view);
  const id = stableId([input.tool.name, title, url ?? ""]);
  const tags = [
    "全网热点",
    input.tool.label,
    ...matchedContextTags(input.record, input.search)
  ].filter((tag): tag is string => Boolean(tag));

  return {
    id: `trends-hub-${id}`,
    source: "trends-hub",
    sourceId: id,
    sourceUrl: url,
    title,
    content: stringOrUndefined(input.record.description),
    author: stringOrUndefined(input.record.author),
    rawPayload: {
      tool: input.tool.name,
      ...input.record
    },
    city: input.search.city,
    area: stringOrUndefined(input.search.area),
    publishedAt: publishedAt(input.record),
    status: "new",
    itemType: "event",
    tags: [...new Set(tags)],
    trendScore: score,
    confidence: 62,
    popularity: score,
    quietness: 50,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "trends-hub",
        label: `${input.tool.label} 热度`,
        score,
        evidence: title
      }
    ]
  };
}

class TrendsHubAdapter extends BaseCitySourceAdapter {
  private tools: TrendsHubTool[];
  private client: NonNullable<TrendsHubAdapterOptions["client"]>;

  constructor(options: TrendsHubAdapterOptions = {}) {
    super({
      source: "trends-hub",
      kind: "mcp",
      enabledByDefault: true,
      cooldownSeconds: 600
    });
    this.tools = configuredTools(options.tools);
    this.client = options.client ?? {
      callToolRaw: callMcpToolRaw
    };
  }

  private command() {
    return process.env.TRENDS_HUB_MCP_COMMAND || "npx";
  }

  private args() {
    const configured = process.env.TRENDS_HUB_MCP_ARGS;

    if (!configured) {
      return ["-y", "mcp-trends-hub"];
    }

    try {
      const parsed = JSON.parse(configured) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      // Fall through to whitespace parsing.
    }

    return configured.split(/\s+/).filter(Boolean);
  }

  private env() {
    return {
      TRENDS_HUB_HIDDEN_FIELDS: process.env.TRENDS_HUB_HIDDEN_FIELDS ?? "cover",
      ...(process.env.TRENDS_HUB_CUSTOM_RSS_URL
        ? { TRENDS_HUB_CUSTOM_RSS_URL: process.env.TRENDS_HUB_CUSTOM_RSS_URL }
        : {})
    };
  }

  private async collectToolItems(
    tool: TrendsHubTool,
    input: Parameters<CitySourceAdapter["searchEvents"]>[0]
  ) {
    const result = await this.client.callToolRaw({
      connector: "trends-hub",
      tool: tool.name,
      input: tool.input ?? {},
      config: {
        transport: "stdio",
        command: this.command(),
        args: this.args(),
        env: this.env(),
        timeoutMs: 60_000
      }
    });

    if (result.status !== "ok") {
      return [];
    }

    return textContent(result.data)
      .map(parseTrendText)
      .filter((record) => isRelevant(record, input))
      .map((record) => toRawItem({ tool, record, search: input }))
      .filter((item): item is RawSourceItemDetail => Boolean(item));
  }

  protected async searchEventsImpl(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    const results = await Promise.all(this.tools.map((tool) => this.collectToolItems(tool, input)));
    const maxItems = Number(process.env.TRENDS_HUB_MAX_ITEMS ?? 30);
    return results
      .flat()
      .sort((left, right) => (right.trendScore ?? 0) - (left.trendScore ?? 0))
      .slice(0, Number.isFinite(maxItems) ? maxItems : 30);
  }
}

export function createTrendsHubAdapter(options?: TrendsHubAdapterOptions): CitySourceAdapter {
  return new TrendsHubAdapter(options);
}

export const trendsHubAdapter = createTrendsHubAdapter();
