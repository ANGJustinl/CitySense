import { createHash } from "node:crypto";
import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import {
  areasMatch,
  canonicalizeArea,
  textMentionsArea
} from "@/server/geo/area-normalizer";

type ShanghaiGovListEntry = {
  title: string;
  url: string;
  publishedAt?: string;
};

type ShanghaiGovArticle = {
  title?: string;
  sourceName?: string;
  publishedAt?: string;
  content: string;
};

type ShanghaiGovAdapterOptions = {
  fetchHtml?: (url: string) => Promise<string>;
  listUrl?: string;
  maxDetails?: number;
};

const SOURCE = "shanghai-gov";
const DEFAULT_LIST_URL = "https://www.shanghai.gov.cn/nw31406/index.html";
const DEFAULT_MAX_DETAILS = 8;
const ACTIVITY_TERMS = [
  "启幕",
  "开幕",
  "市集",
  "风味季",
  "美食汇",
  "展",
  "节",
  "嘉年华",
  "演出",
  "赛事",
  "挑战赛",
  "工作坊",
  "游园会",
  "音乐",
  "艺术",
  "体验",
  "夜上海"
];
const EXCLUDED_NEWS_TERMS = [
  "会议",
  "培训",
  "座谈",
  "研讨会",
  "宣讲会",
  "工作成效",
  "监管",
  "执法",
  "成立大会",
  "签订",
  "对接交流",
  "落成启用"
];

const DISTRICT_HINTS: [string, string][] = [
  ["徐汇", "徐汇"],
  ["西岸", "徐汇"],
  ["静安", "静安"],
  ["长宁", "长宁"],
  ["黄浦", "黄浦"],
  ["浦东", "浦东"],
  ["陆家嘴", "浦东"],
  ["前滩", "浦东"],
  ["闵行", "闵行"],
  ["虹桥新天地", "闵行"],
  ["虹桥", "闵行"],
  ["新天地", "黄浦"],
  ["普陀", "普陀"],
  ["上海西站", "普陀"],
  ["虹口", "虹口"],
  ["杨浦", "杨浦"],
  ["宝山", "宝山"],
  ["嘉定", "嘉定"],
  ["青浦", "青浦"],
  ["奉贤", "奉贤"],
  ["松江", "松江"],
  ["金山", "金山"],
  ["崇明", "崇明"]
];
const PLACE_HINTS = [
  "上海体育场",
  "虹桥新天地南区灵感花园",
  "虹桥新天地",
  "上海西站",
  "黄浦江龙华码头",
  "龙华码头",
  "吴淞口国际邮轮港",
  "上海世博会博物馆",
  "刘海粟美术馆",
  "中华艺术宫",
  "上海市海派艺术馆"
];

const TAG_RULES: [string, RegExp][] = [
  ["美食", /美食|餐饮|咖啡|风味|小食|品鉴/],
  ["市集", /市集|集市|风物/],
  ["演出", /演出|演艺|舞蹈|音乐|戏剧|桑巴|派对/],
  ["展览", /展览|美术|博物馆|艺术|文物|特展/],
  ["体育", /体育|赛事|足球|排球|乒乓|挑战赛|世界杯/],
  ["夜生活", /夜上海|夜生活|夜晚|24小时/],
  ["工作坊", /工作坊|体验|互动/],
  ["文旅", /文旅|旅游|文化/]
];

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value: string) {
  return decodeEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<img[\s\S]*?>/gi, " ")
      .replace(/<\/p>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function metaContent(html: string, name: string) {
  const pattern = new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i");
  return decodeEntities(pattern.exec(html)?.[1]?.trim() ?? "");
}

function stableId(parts: string[]) {
  return createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 18);
}

function absoluteUrl(value: string) {
  return new URL(value, "https://www.shanghai.gov.cn").toString();
}

function normalizedDateTime(value?: string) {
  return value?.replace(/∶/g, ":").trim();
}

function toPublishedIso(value?: string) {
  const normalized = normalizedDateTime(value);

  if (!normalized) {
    return undefined;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{1,2}))?/.exec(normalized);

  if (!match) {
    return normalized;
  }

  const [, year, month, day, hour = "10", minute = "00"] = match;
  return `${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00.000+08:00`;
}

function inferStartAt(text: string, publishedAt?: string) {
  const year = /^(\d{4})/.exec(publishedAt ?? "")?.[1];
  const date = /(?<!年)(\d{1,2})月(\d{1,2})日/.exec(text);

  if (!year || !date) {
    return undefined;
  }

  return `${year}-${date[1].padStart(2, "0")}-${date[2].padStart(2, "0")}T10:00:00.000+08:00`;
}

function inferArea(text: string, fallback?: string) {
  for (const [hint, area] of DISTRICT_HINTS) {
    if (text.includes(hint)) {
      return canonicalizeArea(area);
    }
  }

  return textMentionsArea(text, fallback) ? canonicalizeArea(fallback) : undefined;
}

function inferAddress(text: string) {
  for (const place of PLACE_HINTS) {
    if (text.includes(place)) {
      return place;
    }
  }

  const match = /(?:在|于)([^，。；\n]{2,28}(?:中心|公园|广场|美术馆|博物馆|新天地|码头|会场|花园|体育馆|艺术馆|街区))(?:举办|举行|启幕|开幕|亮相|正式)/.exec(
    text
  );

  return match?.[1]?.trim();
}

function eventLike(text: string) {
  return ACTIVITY_TERMS.some((term) => text.includes(term)) && !EXCLUDED_NEWS_TERMS.some((term) => text.includes(term));
}

function matchedTags(text: string, keywords: string[]) {
  const tags = ["公开活动", "上海政府"];

  for (const [tag, pattern] of TAG_RULES) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }

  for (const keyword of keywords) {
    if (keyword && text.toLowerCase().includes(keyword.toLowerCase())) {
      tags.push(keyword);
    }
  }

  return [...new Set(tags)].slice(0, 8);
}

function matchesInput(input: Parameters<CitySourceAdapter["searchEvents"]>[0], item: RawSourceItemDetail) {
  const text = [item.title, item.content, item.area, ...item.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const areaOk =
    !input.area ||
    !item.area ||
    areasMatch(item.area, input.area) ||
    text.includes(input.area.toLowerCase()) ||
    input.area.includes(item.area);

  if (!areaOk) {
    return false;
  }

  if (input.keywords.length === 0) {
    return true;
  }

  return input.keywords.some((keyword) => text.includes(keyword.toLowerCase())) || eventLike(text);
}

async function defaultFetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "CitySense/0.1 (+https://www.shanghai.gov.cn source adapter)"
    },
    next: {
      revalidate: 60 * 30
    }
  });

  if (!response.ok) {
    throw new Error(`Shanghai gov source responded ${response.status}`);
  }

  return response.text();
}

export function parseShanghaiGovList(html: string): ShanghaiGovListEntry[] {
  const entries: ShanghaiGovListEntry[] = [];
  const pattern =
    /<li>\s*<a\s+[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>\s*<span\s+class=["']time["']>([^<]+)<\/span>\s*<\/li>/gi;

  for (const match of html.matchAll(pattern)) {
    const title = stripTags(match[2] || match[3]);
    const url = absoluteUrl(match[1]);
    const publishedAt = stripTags(match[4]);

    if (title && url) {
      entries.push({
        title,
        url,
        publishedAt
      });
    }
  }

  return entries;
}

export function parseShanghaiGovArticle(html: string): ShanghaiGovArticle {
  const content = /<div\s+id=["']ivs_content["'][^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "";

  return {
    title: metaContent(html, "ArticleTitle") || stripTags(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ""),
    sourceName: metaContent(html, "ContentSource"),
    publishedAt: normalizedDateTime(metaContent(html, "PubDate")),
    content: stripTags(content)
  };
}

function toRawItem(input: {
  entry: ShanghaiGovListEntry;
  article: ShanghaiGovArticle;
  search: Parameters<CitySourceAdapter["searchEvents"]>[0];
}): RawSourceItemDetail | null {
  const title = input.article.title || input.entry.title;
  const publishedAt = input.article.publishedAt || input.entry.publishedAt;
  const content = input.article.content;
  const text = [title, content].join(" ");

  if (!title || !eventLike(text)) {
    return null;
  }

  const area = inferArea(text, input.search.area);
  const tags = matchedTags(text, input.search.keywords);
  const score = Math.min(88, 58 + tags.length * 4 + (input.article.sourceName?.includes("文化") ? 5 : 0));
  const sourceId = stableId([input.entry.url, title]);
  const item: RawSourceItemDetail = {
    id: `${SOURCE}-${sourceId}`,
    source: SOURCE,
    sourceId,
    sourceUrl: input.entry.url,
    title,
    content: content || undefined,
    author: input.article.sourceName,
    rawPayload: {
      entry: input.entry,
      article: input.article
    },
    city: input.search.city,
    area,
    address: inferAddress(text),
    publishedAt: toPublishedIso(publishedAt),
    status: "new",
    itemType: "event",
    startsAt: inferStartAt(text, publishedAt),
    tags,
    trendScore: score,
    confidence: 76,
    popularity: score,
    quietness: tags.includes("夜生活") || tags.includes("体育") ? 42 : 56,
    priceLevel: 1,
    sourceSignals: [
      {
        source: SOURCE,
        label: "上海市政府公开资讯",
        score,
        evidence: [input.article.sourceName, publishedAt].filter(Boolean).join(" · ")
      }
    ]
  };

  return matchesInput(input.search, item) ? item : null;
}

class ShanghaiGovAdapter extends BaseCitySourceAdapter {
  private fetchHtml: NonNullable<ShanghaiGovAdapterOptions["fetchHtml"]>;
  private listUrl: string;
  private maxDetails: number;

  constructor(options: ShanghaiGovAdapterOptions = {}) {
    super({
      source: SOURCE,
      kind: "crawler",
      enabledByDefault: true,
      cooldownSeconds: 1_800
    });
    this.fetchHtml = options.fetchHtml ?? defaultFetchHtml;
    this.listUrl = options.listUrl ?? process.env.SHANGHAI_GOV_EVENTS_URL ?? DEFAULT_LIST_URL;
    this.maxDetails = options.maxDetails ?? Number(process.env.SHANGHAI_GOV_MAX_DETAILS ?? DEFAULT_MAX_DETAILS);
  }

  protected async searchEventsImpl(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    try {
      const listHtml = await this.fetchHtml(this.listUrl);
      const entries = parseShanghaiGovList(listHtml)
        .filter((entry) => eventLike(entry.title) || input.keywords.some((keyword) => entry.title.includes(keyword)))
        .slice(0, Number.isFinite(this.maxDetails) ? this.maxDetails : DEFAULT_MAX_DETAILS);

      const results = await Promise.allSettled(
        entries.map(async (entry) => {
          const article = parseShanghaiGovArticle(await this.fetchHtml(entry.url));
          return toRawItem({
            entry,
            article,
            search: input
          });
        })
      );

      return results
        .filter((result): result is PromiseFulfilledResult<RawSourceItemDetail | null> => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((item): item is RawSourceItemDetail => Boolean(item));
    } catch {
      return [];
    }
  }

  protected async searchVenuesImpl() {
    return [];
  }

  protected async getItemDetailImpl(sourceItemId: string) {
    const events = await this.searchEvents({
      city: "上海",
      keywords: []
    });

    return events.find((item) => item.id === sourceItemId || item.sourceId === sourceItemId) ?? null;
  }
}

export function createShanghaiGovAdapter(options?: ShanghaiGovAdapterOptions): CitySourceAdapter {
  return new ShanghaiGovAdapter(options);
}

export const shanghaiGovAdapter: CitySourceAdapter = createShanghaiGovAdapter();
