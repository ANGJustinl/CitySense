import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import { callMcpTool, type McpToolCall, type McpToolResult } from "@/server/sources/mcp/mcp-client";

type McpSourceAdapterOptions = {
  source: string;
  urlEnvVar: string;
  tokenEnvVar: string;
  toolName?: string;
  cooldownSeconds?: number;
  client?: {
    callTool(call: McpToolCall): Promise<McpToolResult>;
  };
};

type McpSourceItem = {
  id?: unknown;
  sourceId?: unknown;
  sourceUrl?: unknown;
  title?: unknown;
  content?: unknown;
  author?: unknown;
  rawPayload?: unknown;
  city?: unknown;
  area?: unknown;
  publishedAt?: unknown;
  itemType?: unknown;
  address?: unknown;
  lat?: unknown;
  lng?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  tags?: unknown;
  trendScore?: unknown;
  confidence?: unknown;
  popularity?: unknown;
  quietness?: unknown;
  priceLevel?: unknown;
  sourceSignals?: unknown;
};

function numberOrUndefined(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function sourceSignals(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const signals = value
    .map((signal) => {
      if (!signal || typeof signal !== "object") {
        return null;
      }

      const source = stringOrUndefined((signal as { source?: unknown }).source);
      const label = stringOrUndefined((signal as { label?: unknown }).label);
      const score = numberOrUndefined((signal as { score?: unknown }).score);

      if (!source || !label || score === undefined) {
        return null;
      }

      return {
        source,
        label,
        score,
        evidence: stringOrUndefined((signal as { evidence?: unknown }).evidence)
      };
    })
    .filter((signal): signal is NonNullable<typeof signal> => Boolean(signal));

  return signals.length > 0 ? signals : undefined;
}

function extractItems(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    const items = (payload as { items?: unknown }).items;
    return Array.isArray(items) ? items : [];
  }

  return [];
}

function toRawSourceItem(source: string, item: McpSourceItem): RawSourceItemDetail | null {
  const id = stringOrUndefined(item.id);
  const title = stringOrUndefined(item.title);
  const city = stringOrUndefined(item.city);
  const tags = stringArray(item.tags);
  const itemType = item.itemType;

  if (!id || !title || !city || tags.length === 0) {
    return null;
  }

  if (itemType !== "event" && itemType !== "venue") {
    return null;
  }

  return {
    id: `${source}-${id}`,
    source,
    sourceId: stringOrUndefined(item.sourceId) ?? id,
    sourceUrl: stringOrUndefined(item.sourceUrl),
    title,
    content: stringOrUndefined(item.content),
    author: stringOrUndefined(item.author),
    rawPayload: item.rawPayload ?? item,
    city,
    area: stringOrUndefined(item.area),
    publishedAt: stringOrUndefined(item.publishedAt),
    status: "new",
    itemType,
    address: stringOrUndefined(item.address),
    lat: numberOrUndefined(item.lat),
    lng: numberOrUndefined(item.lng),
    startsAt: stringOrUndefined(item.startsAt),
    endsAt: stringOrUndefined(item.endsAt),
    tags,
    trendScore: numberOrUndefined(item.trendScore),
    confidence: numberOrUndefined(item.confidence),
    popularity: numberOrUndefined(item.popularity),
    quietness: numberOrUndefined(item.quietness),
    priceLevel: numberOrUndefined(item.priceLevel),
    sourceSignals: sourceSignals(item.sourceSignals)
  };
}

class McpSourceAdapter extends BaseCitySourceAdapter {
  private toolName: string;
  private urlEnvVar: string;
  private tokenEnvVar: string;
  private client: NonNullable<McpSourceAdapterOptions["client"]>;

  constructor(options: McpSourceAdapterOptions) {
    super({
      source: options.source,
      kind: "mcp",
      enabledByDefault: true,
      cooldownSeconds: options.cooldownSeconds ?? 300,
      requiredEnvVars: [options.urlEnvVar]
    });
    this.toolName = options.toolName ?? "search_city_signals";
    this.urlEnvVar = options.urlEnvVar;
    this.tokenEnvVar = options.tokenEnvVar;
    this.client = options.client ?? {
      callTool: callMcpTool
    };
  }

  private async searchItems(
    input: Parameters<CitySourceAdapter["searchEvents"]>[0],
    itemType: RawSourceItemDetail["itemType"]
  ) {
    const result = await this.client.callTool({
      connector: this.source,
      tool: this.toolName,
      input: {
        connector: this.source,
        city: input.city,
        area: input.area,
        keywords: input.keywords,
        timeWindow: input.timeWindow,
        itemType
      },
      config: {
        url: process.env[this.urlEnvVar],
        token: process.env[this.tokenEnvVar]
      }
    });

    if (result.status !== "ok") {
      return [];
    }

    return extractItems(result.data)
      .map((item) => toRawSourceItem(this.source, item as McpSourceItem))
      .filter((item): item is RawSourceItemDetail => Boolean(item))
      .filter((item) => item.itemType === itemType);
  }

  protected async searchEventsImpl(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    return this.searchItems(input, "event");
  }

  protected async searchVenuesImpl(input: Parameters<CitySourceAdapter["searchVenues"]>[0]) {
    return this.searchItems(input, "venue");
  }
}

export function createMcpSourceAdapter(options: McpSourceAdapterOptions): CitySourceAdapter {
  return new McpSourceAdapter(options);
}
