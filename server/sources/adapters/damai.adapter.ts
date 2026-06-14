import type { CitySourceAdapter, RawSourceItemDetail, SourceSearchInput } from "@/server/sources/source.types";
import { BaseCitySourceAdapter } from "@/server/sources/adapters/adapter-utils";
import { getSavedDamaiCookieHeader } from "@/server/sources/plugins/damai-session";

type FetchLike = typeof fetch;

type DamaiAdapterOptions = {
  fetchFn?: FetchLike;
  cookieHeader?: string | null;
  useStoredCookie?: boolean;
  pagesPerQuery?: number;
  pageSize?: number;
  order?: number;
  maxQueries?: number;
  maxResults?: number;
  requestDelayMs?: number;
};

type DamaiRawItem = {
  projectid?: unknown;
  projectId?: unknown;
  id?: unknown;
  nameNoHtml?: unknown;
  name?: unknown;
  projectName?: unknown;
  cityname?: unknown;
  cityName?: unknown;
  venue?: unknown;
  venueName?: unknown;
  showtime?: unknown;
  showTime?: unknown;
  price_str?: unknown;
  price?: unknown;
  categoryname?: unknown;
  categoryName?: unknown;
  verticalPic?: unknown;
  imageUrl?: unknown;
  showstatus?: unknown;
  showStatus?: unknown;
  description?: unknown;
};

type DamaiMappedItem = {
  item: RawSourceItemDetail;
  rank: number;
};

const SOURCE = "damai";
const DEFAULT_PAGES_PER_QUERY = 2;
const DEFAULT_PAGE_SIZE = 30;
// order=1 is Damai's "recommended" sort. Real-world probes show it returns the
// city's in-season real shows (concerts / musicals / livehouse) and filters out
// the scenic-spot ticket / tour-guide noise that order=0 surfaces. Pagination
// stays clean across pages 1-3 under order=1. order=0 is kept only for override.
const DEFAULT_ORDER = 1;
const DEFAULT_MAX_QUERIES = 8;
const DEFAULT_MAX_RESULTS = 40;
const DEFAULT_REQUEST_DELAY_MS = 600;
const DEFAULT_EVENT_QUERIES = ["演唱会", "音乐剧", "话剧", "脱口秀", "展览", "livehouse"];

// Damai returns scenic-spot admission / guided-tour SKUs even under order=1.
// We keep them as Event signals (some "常设展门票" still has value) but mark and
// down-weight them so real shows win in route composition.
const TICKET_NOISE_PATTERN =
  /门票|讲解|导游|包团|私享|拼团|VIP讲解|city\s*walk|讲解服务|深度讲解|观光|游船|联票|亲子票|成人票|儿童票|老人票|学生票|家庭票|优待票|团队票|标准价/i;

const KEYWORD_EXPANSIONS: [RegExp, string[]][] = [
  [/live\s*house|livehouse|独立音乐|乐队|摇滚|爵士|音乐现场|音乐/i, ["livehouse", "演唱会", "音乐现场"]],
  [/夜生活|酒吧|派对|夜场/i, ["livehouse", "脱口秀", "演出"]],
  [/戏剧|剧场|舞台|话剧/i, ["话剧", "音乐剧"]],
  [/音乐剧|歌剧/i, ["音乐剧"]],
  [/脱口秀|喜剧|单口/i, ["脱口秀"]],
  [/展览|艺术|美术|博物馆|看展/i, ["展览", "艺术展"]],
  [/亲子|儿童|家庭/i, ["亲子"]],
  [/国风|二次元|动漫/i, ["动漫", "二次元"]],
  [/市集|集市|周末/i, ["市集", "展览"]]
];

const TAG_RULES: [string, RegExp][] = [
  ["演唱会", /演唱会|演唱|巡演|音乐现场|livehouse|live\s*house/i],
  ["音乐", /音乐|乐队|摇滚|爵士|livehouse|live\s*house/i],
  ["戏剧", /话剧|舞台剧|戏剧/],
  ["音乐剧", /音乐剧|歌剧/],
  ["脱口秀", /脱口秀|喜剧|单口/],
  ["展览", /展览|艺术展|美术|博物馆|展/],
  ["亲子", /亲子|儿童|家庭/],
  ["二次元", /动漫|二次元|国风/]
];

function envNumber(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function uniq(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalized.toLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function stripHtml(value: unknown) {
  return stringValue(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value: unknown) {
  const url = stripHtml(value);

  if (!url) {
    return undefined;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  return /^https?:\/\//i.test(url) ? url : undefined;
}

function cityMatches(itemCity: string, requestedCity: string) {
  if (!itemCity) {
    return true;
  }

  return itemCity === requestedCity || itemCity.includes(requestedCity) || requestedCity.includes(itemCity);
}

function eventTermsForKeyword(keyword: string) {
  const terms: string[] = [];

  for (const [pattern, expansions] of KEYWORD_EXPANSIONS) {
    if (pattern.test(keyword)) {
      terms.push(...expansions);
    }
  }

  if (/演出|演唱会|音乐剧|话剧|脱口秀|展览|livehouse|亲子|动漫|音乐/i.test(keyword)) {
    terms.push(keyword);
  }

  return terms;
}

export function buildDamaiSearchQueries(
  input: SourceSearchInput,
  options?: {
    maxQueries?: number;
    defaultQueries?: string[];
  }
) {
  const maxQueries = options?.maxQueries ?? DEFAULT_MAX_QUERIES;
  const expandedByKeyword = input.keywords
    .map(eventTermsForKeyword)
    .filter((terms) => terms.length > 0);
  const terms: string[] = [];

  for (let index = 0; index < Math.max(0, ...expandedByKeyword.map((items) => items.length)); index += 1) {
    for (const expanded of expandedByKeyword) {
      if (expanded[index]) {
        terms.push(expanded[index]);
      }
    }
  }

  // Empty keyword + order=1 surfaces the city's curated in-season shows
  // (concerts / musicals / livehouse) with near-zero ticket noise, so we lead
  // with it and let strong event words round out the query set. The leading ""
  // is preserved explicitly (uniq would otherwise drop it).
  const dedupedTerms = uniq(terms);
  const baseQueries =
    dedupedTerms.length > 0 ? dedupedTerms : uniq(options?.defaultQueries ?? DEFAULT_EVENT_QUERIES);
  const areaQueries = input.area
    ? ["", ...baseQueries].slice(0, 3).map((query) => `${input.area} ${query}`.trim())
    : [];

  return ["", ...uniq([...baseQueries, ...areaQueries])].slice(0, maxQueries);
}

function searchPageUrl(city: string, keyword: string) {
  const params = new URLSearchParams({
    keyword,
    cty: city,
    spm: "citysense.damai.adapter"
  });

  return `https://search.damai.cn/search.html?${params.toString()}`;
}

function searchAjaxUrl(input: {
  city: string;
  keyword: string;
  page: number;
  pageSize: number;
  order: number;
}) {
  const params = new URLSearchParams({
    keyword: input.keyword,
    cty: input.city,
    ctl: "",
    sctl: "",
    tsg: "0",
    st: "",
    et: "",
    order: String(input.order),
    pageSize: String(input.pageSize),
    currPage: String(input.page),
    tn: ""
  });

  return `https://search.damai.cn/searchajax.html?${params.toString()}`;
}

function jsonText(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function isDamaiBlockedPayload(payload: unknown, text = "") {
  const haystack = `${jsonText(payload)}\n${text}`.slice(0, 4000).toLowerCase();

  return (
    haystack.includes("fail_sys_user_validate") ||
    haystack.includes("rgv587") ||
    haystack.includes("_____tmd_____") ||
    haystack.includes("/punish") ||
    haystack.includes("captcha") ||
    haystack.includes("验证码")
  );
}

function damaiItemsFromPayload(payload: unknown): DamaiRawItem[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const pageData = record.pageData && typeof record.pageData === "object" ? (record.pageData as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const candidates = [pageData.resultData, data.resultData, record.resultData];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is DamaiRawItem => Boolean(item && typeof item === "object"));
    }
  }

  return [];
}

function isoAtShanghai(input: { year: string; month: string; day: string; time?: string }, fallbackTime = "19:30") {
  const month = input.month.padStart(2, "0");
  const day = input.day.padStart(2, "0");
  const time = input.time?.trim() || fallbackTime;
  const [hour = "19", minute = "30"] = time.split(":");
  const iso = `${input.year}-${month}-${day}T${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:00.000+08:00`;
  const date = new Date(iso);

  return Number.isNaN(date.getTime()) ? undefined : iso;
}

export function parseDamaiShowTime(value: unknown) {
  const text = stripHtml(value)
    .replace(/[年/]/g, ".")
    .replace(/月/g, ".")
    .replace(/日/g, " ");
  const start = /(\d{4})[.-](\d{1,2})[.-](\d{1,2})(?:[^\d]*(\d{1,2}:\d{2}))?/.exec(text);

  if (!start) {
    return {};
  }

  const startsAt = isoAtShanghai({
    year: start[1],
    month: start[2],
    day: start[3],
    time: start[4]
  });
  const end = /[-~至]\s*(?:(\d{4})[.-])?(\d{1,2})[.-](\d{1,2})(?:[^\d]*(\d{1,2}:\d{2}))?/.exec(
    text.slice(start.index + start[0].length)
  );
  const endsAt = end
    ? isoAtShanghai(
        {
          year: end[1] ?? start[1],
          month: end[2],
          day: end[3],
          time: end[4]
        },
        "22:00"
      )
    : undefined;

  return {
    startsAt,
    endsAt
  };
}

function priceLevel(priceText: string) {
  const firstPrice = Number(priceText.match(/\d+(?:\.\d+)?/)?.[0]);

  if (!Number.isFinite(firstPrice)) {
    return undefined;
  }

  if (firstPrice <= 80) {
    return 1;
  }

  if (firstPrice <= 220) {
    return 2;
  }

  if (firstPrice <= 520) {
    return 3;
  }

  return 4;
}

function tagsFor(input: {
  title: string;
  category: string;
  venueName: string;
  query: string;
  keywords: string[];
}) {
  const text = [input.title, input.category, input.venueName, input.query].join(" ");
  const tags = ["大麦", "演出"];

  if (input.category) {
    tags.push(input.category);
  }

  for (const [tag, pattern] of TAG_RULES) {
    if (pattern.test(text)) {
      tags.push(tag);
    }
  }

  for (const keyword of input.keywords) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) {
      tags.push(keyword);
    }
  }

  return uniq(tags).slice(0, 8);
}

function contentFor(input: {
  venueName: string;
  showTime: string;
  priceText: string;
  category: string;
  showStatus: string;
  description: string;
}) {
  return [
    input.category ? `类别：${input.category}` : "",
    input.venueName ? `场馆线索：${input.venueName}` : "",
    input.showTime ? `演出时间：${input.showTime}` : "",
    input.priceText ? `票价：${input.priceText}` : "",
    input.showStatus ? `状态：${input.showStatus}` : "",
    input.description ? `简介：${input.description}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function rankDamaiItem(input: {
  item: RawSourceItemDetail;
  query: string;
  showStatus: string;
  venueName: string;
  ticketNoise: boolean;
}) {
  const text = [input.item.title, input.item.content, input.venueName, input.query].join(" ").toLowerCase();
  let score = 56;

  if (input.query && text.includes(input.query.toLowerCase())) {
    score += 10;
  }

  if (/售票|预售|在售|销售中/.test(input.showStatus)) {
    score += 10;
  }

  if (input.item.startsAt) {
    score += new Date(input.item.startsAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000 ? 8 : -6;
  }

  if (input.item.imageUrl) {
    score += 4;
  }

  if (input.venueName) {
    score += 4;
  }

  // Scenic-spot admission / guided-tour SKUs are weak activity signals: keep
  // them so the city still shows e.g. a 常设展, but let real shows win.
  if (input.ticketNoise) {
    score -= 12;
  }

  return clamp(score, 45, 92);
}

// Ticket-SKU noise tokens that appear AFTER the real show name. We cut the
// title at the first occurrence of any of these. Only tokens that are
// unambiguously ticket-SKU qualifiers are included (ticket types, group /
// session / language qualifiers, pricing flags) — generic words like "讲解"
// that can be part of an event name are intentionally excluded.
// 《》 titles are handled separately.
const TITLE_NOISE_BOUNDARY =
  /[\s\-—·|]*(成人票|儿童票|老人票|学生票|家庭票|优待票|亲子票|双人票|三人票|团队票|二人票|普通票|一等票|二等票|内场票|看台票|门票|联票|游船票|拼团|包团|私享|私家团|标准价|不限人群|非当日可售|上午场|下午场|晚场|夜场|\d{1,2}[:：]\d{2}场|\d{1,2}[:：]\d{2}开航|\d+-\d+人|\d+人使用|\d+场|中文讲解|英文讲解|普通话|沪语|中英双语|中英文)[^《】]*$/i;

// Damai titles are often ticket SKUs like
// "豫园私人定制VIP讲解服务不限人群15:00场-11-15人-普通话-不限人群".
// extractEventName pulls the underlying show / exhibition name so downstream
// LLM normalization and AMap venue matching see a clean signal. Falls back to
// the trimmed full title when no cleaner form is found.
export function extractEventName(rawTitle: string) {
  const full = rawTitle.replace(/\s+/g, " ").trim();
  if (!full) {
    return full;
  }

  // 1. Prefer an explicit 《...》 title (most musicals / plays / exhibitions).
  // Keep a leading type/brand prefix (e.g. "沉浸式推理音乐剧") + the book title,
  // plus any meaningful name suffix up to the ticket-noise boundary. Pure
  // marketing credits after the title (【...出品】, tour-city suffixes) are dropped.
  const bookMatch = /《[^》]+》/.exec(full);
  if (bookMatch) {
    const bookEnd = bookMatch.index! + bookMatch[0].length;
    const prefix = full.slice(0, bookMatch.index).replace(/[\s·\-—|]+$/, "").trim();
    const head = prefix ? `${prefix}${bookMatch[0]}` : bookMatch[0];
    const rawSuffix = full.slice(bookEnd);
    // Drop the suffix if it starts with marketing credits / tour tags rather
    // than a name continuation.
    const isMarketingSuffix = /^[\s\-—·|]*[【(]|(巡演|巡回|演唱会|音乐会)$/.test(rawSuffix);
    if (isMarketingSuffix) {
      return head;
    }
    const suffix = rawSuffix.replace(TITLE_NOISE_BOUNDARY, "").replace(/[\s\-—·|]+$/, "").trim();
    return suffix ? `${head}${suffix}` : head;
  }

  // 2. No 《》: cut at the first ticket-noise boundary from the end.
  const cleaned = full.replace(TITLE_NOISE_BOUNDARY, "").replace(/[\s\-—·|]+$/, "").trim();

  return cleaned || full;
}

export function isTicketNoiseTitle(title: string) {
  return TICKET_NOISE_PATTERN.test(title);
}

export function mapDamaiSearchItem(input: {
  raw: DamaiRawItem;
  search: SourceSearchInput;
  query: string;
}): DamaiMappedItem | null {
  const sourceId = stripHtml(input.raw.projectid ?? input.raw.projectId ?? input.raw.id);
  const rawTitle = stripHtml(input.raw.nameNoHtml ?? input.raw.name ?? input.raw.projectName);
  const city = stripHtml(input.raw.cityname ?? input.raw.cityName) || input.search.city;

  if (!sourceId || !rawTitle || !cityMatches(city, input.search.city)) {
    return null;
  }

  const venueName = stripHtml(input.raw.venue ?? input.raw.venueName);
  const showTime = stripHtml(input.raw.showtime ?? input.raw.showTime);
  const priceText = stripHtml(input.raw.price_str ?? input.raw.price);
  const category = stripHtml(input.raw.categoryname ?? input.raw.categoryName);
  const showStatus = stripHtml(input.raw.showstatus ?? input.raw.showStatus);
  const description = stripHtml(input.raw.description);
  const title = extractEventName(rawTitle);
  const ticketNoise = isTicketNoiseTitle(rawTitle);
  const { startsAt, endsAt } = parseDamaiShowTime(showTime);
  const tags = tagsFor({
    title,
    category,
    venueName,
    query: input.query,
    keywords: input.search.keywords
  });
  const item: RawSourceItemDetail = {
    id: `${SOURCE}-${sourceId}`,
    source: SOURCE,
    sourceId,
    sourceUrl: `https://detail.damai.cn/item.htm?id=${sourceId}`,
    title,
    content: contentFor({
      venueName,
      showTime,
      priceText,
      category,
      showStatus,
      description
    }),
    rawPayload: input.raw,
    city: input.search.city,
    status: "new",
    itemType: "event",
    startsAt,
    endsAt,
    imageUrl: absoluteUrl(input.raw.verticalPic ?? input.raw.imageUrl),
    tags,
    trendScore: 64,
    confidence: 72,
    popularity: 68,
    priceLevel: priceLevel(priceText),
    sourceSignals: [
      {
        source: SOURCE,
        label: "大麦演出热度",
        score: 68,
        evidence: [category, showStatus, venueName].filter(Boolean).join(" · ")
      }
    ]
  };
  const rank = rankDamaiItem({
    item,
    query: input.query,
    showStatus,
    venueName,
    ticketNoise
  });

  item.trendScore = rank;
  item.popularity = rank;
  item.sourceSignals = item.sourceSignals?.map((signal) => ({
    ...signal,
    score: rank
  }));
  if (ticketNoise) {
    item.qualityFlags = ["ticket_noise"];
  }

  return {
    item,
    rank
  };
}

async function sleep(ms: number) {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class DamaiAdapter extends BaseCitySourceAdapter {
  private fetchFn: FetchLike;
  private cookieHeader?: string | null;
  private useStoredCookie: boolean;
  private pagesPerQuery: number;
  private pageSize: number;
  private order: number;
  private maxQueries: number;
  private maxResults: number;
  private requestDelayMs: number;

  constructor(options: DamaiAdapterOptions = {}) {
    super({
      source: SOURCE,
      kind: "crawler",
      enabledByDefault: true,
      cooldownSeconds: 1_800
    });
    this.fetchFn = options.fetchFn ?? fetch;
    this.cookieHeader = options.cookieHeader;
    this.useStoredCookie = options.useStoredCookie ?? true;
    this.pagesPerQuery =
      options.pagesPerQuery ?? envNumber("DAMAI_SEARCH_PAGES_PER_QUERY", DEFAULT_PAGES_PER_QUERY, 1, 5);
    this.pageSize = options.pageSize ?? envNumber("DAMAI_SEARCH_PAGE_SIZE", DEFAULT_PAGE_SIZE, 1, 30);
    this.order = options.order ?? envNumber("DAMAI_SEARCH_ORDER", DEFAULT_ORDER, 0, 10);
    this.maxQueries = options.maxQueries ?? envNumber("DAMAI_SEARCH_MAX_QUERIES", DEFAULT_MAX_QUERIES, 1, 12);
    this.maxResults = options.maxResults ?? envNumber("DAMAI_SEARCH_MAX_RESULTS", DEFAULT_MAX_RESULTS, 1, 120);
    this.requestDelayMs =
      options.requestDelayMs ?? envNumber("DAMAI_SEARCH_REQUEST_DELAY_MS", DEFAULT_REQUEST_DELAY_MS, 0, 10_000);
  }

  private resolvedCookieHeader() {
    if (this.cookieHeader !== undefined) {
      return this.cookieHeader || undefined;
    }

    return process.env.DAMAI_COOKIE_HEADER ?? (this.useStoredCookie ? getSavedDamaiCookieHeader() : undefined);
  }

  override isConfigured() {
    return Boolean(this.resolvedCookieHeader());
  }

  private async fetchSearchPayload(input: SourceSearchInput, query: string, page: number) {
    const url = searchAjaxUrl({
      city: input.city,
      keyword: query,
      page,
      pageSize: this.pageSize,
      order: this.order
    });
    const headers = new Headers({
      accept: "application/json, text/plain, */*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      referer: searchPageUrl(input.city, query),
      // Damai's anti-bot rejects the synthetic "CitySense/..." UA. A real
      // browser fingerprint (matched to the Edge profile that completed the
      // verification captcha) is required for the anonymous search cookie to
      // pass the bxpunish / x5sec gate.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0"
    });
    const cookie = this.resolvedCookieHeader();

    if (cookie) {
      headers.set("cookie", cookie);
    }

    const init: RequestInit & { next?: { revalidate: number } } = {
      headers,
      next: {
        revalidate: 60 * 15
      }
    };
    const response = await this.fetchFn(url, init);
    const text = await response.text();
    let payload: unknown = null;

    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }

    if (!response.ok || isDamaiBlockedPayload(payload, text)) {
      throw new Error("damai_requires_manual_verification");
    }

    return payload;
  }

  protected async searchEventsImpl(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    const queries = buildDamaiSearchQueries(input, {
      maxQueries: this.maxQueries
    });
    const collected: DamaiMappedItem[] = [];

    for (const query of queries) {
      for (let page = 1; page <= this.pagesPerQuery; page += 1) {
        const payload = await this.fetchSearchPayload(input, query, page);
        const pageItems = damaiItemsFromPayload(payload)
          .map((raw) =>
            mapDamaiSearchItem({
              raw,
              search: input,
              query
            })
          )
          .filter((item): item is DamaiMappedItem => Boolean(item));

        collected.push(...pageItems);

        if (pageItems.length === 0) {
          break;
        }

        await sleep(this.requestDelayMs);
      }
    }

    const byId = new Map<string, DamaiMappedItem>();

    for (const mapped of collected) {
      const key = mapped.item.sourceId ?? mapped.item.id;
      const existing = byId.get(key);

      if (!existing || mapped.rank > existing.rank) {
        byId.set(key, mapped);
      }
    }

    return [...byId.values()]
      .sort((left, right) => right.rank - left.rank)
      .slice(0, this.maxResults)
      .map((mapped) => mapped.item);
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

export function createDamaiAdapter(options?: DamaiAdapterOptions): CitySourceAdapter {
  return new DamaiAdapter(options);
}

export const damaiAdapter: CitySourceAdapter = createDamaiAdapter();
