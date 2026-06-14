import assert from "node:assert/strict";
import test from "node:test";
import { toNormalizedEntityInput } from "@/server/ingest/normalize";
import { createSourceKey } from "@/server/ingest/source-key";
import {
  buildDamaiSearchQueries,
  createDamaiAdapter,
  extractEventName,
  isTicketNoiseTitle,
  mapDamaiSearchItem,
  parseDamaiShowTime
} from "@/server/sources/adapters/damai.adapter";

function damaiPayload(items: unknown[]) {
  return {
    pageData: {
      resultData: items,
      totalResults: items.length,
      totalPage: 1
    }
  };
}

test("damai query builder leads with empty keyword (order=1 city curation) then expands intents", () => {
  const queries = buildDamaiSearchQueries(
    {
      city: "上海",
      area: "静安寺",
      keywords: ["夜生活", "展览", "咖啡"]
    },
    {
      maxQueries: 8
    }
  );

  // Empty keyword + order=1 surfaces the city's curated in-season shows first.
  assert.equal(queries[0], "");
  assert.ok(queries.includes("livehouse"));
  assert.ok(queries.includes("脱口秀"));
  assert.ok(queries.includes("展览"));
  assert.ok(queries.includes("静安寺 livehouse"));
  assert.ok(!queries.includes("咖啡"));
});

test("damai query builder defaults to curated + strong event words when no keyword intent matches", () => {
  const queries = buildDamaiSearchQueries(
    { city: "上海", keywords: ["咖啡"] },
    { maxQueries: 8 }
  );

  assert.equal(queries[0], "");
  assert.ok(queries.includes("演唱会"));
  assert.ok(queries.includes("展览"));
});

test("damai show time parser extracts Shanghai start and end dates", () => {
  assert.deepEqual(parseDamaiShowTime("2026.06.14 周日 20:00"), {
    startsAt: "2026-06-14T20:00:00.000+08:00",
    endsAt: undefined
  });

  assert.deepEqual(parseDamaiShowTime("2026.06.14-06.30"), {
    startsAt: "2026-06-14T19:30:00.000+08:00",
    endsAt: "2026-06-30T22:00:00.000+08:00"
  });
});

test("damai adapter stays not configured without an anonymous cookie", async () => {
  const previous = process.env.DAMAI_COOKIE_HEADER;
  delete process.env.DAMAI_COOKIE_HEADER;

  const adapter = createDamaiAdapter({
    cookieHeader: "",
    fetchFn: async () => new Response(JSON.stringify(damaiPayload([])))
  });

  assert.equal(adapter.status, "not_configured");
  assert.deepEqual(
    await adapter.searchEvents({
      city: "上海",
      keywords: ["展览"]
    }),
    []
  );

  if (previous === undefined) {
    delete process.env.DAMAI_COOKIE_HEADER;
  } else {
    process.env.DAMAI_COOKIE_HEADER = previous;
  }
});

test("damai adapter searches expanded queries and maps only events", async () => {
  const requested: URL[] = [];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    requested.push(url);

    assert.equal(new Headers(init?.headers).get("cookie"), "anonymous_cookie=1");

    const keyword = url.searchParams.get("keyword");
    const items =
      keyword === "livehouse"
        ? [
            {
              projectid: "916569133122",
              nameNoHtml: "【上海】独立乐队夜场",
              cityname: "上海",
              venue: "MAO Livehouse 上海",
              showtime: "2026.06.14 周日 20:00",
              price_str: "120-280",
              categoryname: "演唱会",
              verticalPic: "//img.alicdn.com/damai/night.jpg",
              showstatus: "售票中",
              description: "三组新乐队轮番演出"
            }
          ]
        : [
            {
              projectid: "917000000001",
              nameNoHtml: "上海当代艺术展",
              cityname: "上海",
              venue: "上海展览中心",
              showtime: "2026.06.14-06.30",
              price_str: "68",
              categoryname: "展览休闲",
              verticalPic: "https://img.alicdn.com/damai/exhibition.jpg",
              showstatus: "在售"
            }
          ];

    return new Response(JSON.stringify(damaiPayload(items)));
  };
  const adapter = createDamaiAdapter({
    fetchFn,
    cookieHeader: "anonymous_cookie=1",
    pagesPerQuery: 1,
    requestDelayMs: 0,
    maxQueries: 3
  });
  const events = await adapter.searchEvents({
    city: "上海",
    area: "静安寺",
    keywords: ["夜生活", "展览"]
  });

  assert.equal(adapter.status, "active");
  assert.equal(events.length, 2);
  assert.ok(requested.some((url) => url.searchParams.get("keyword") === "livehouse"));
  assert.ok(requested.some((url) => url.searchParams.get("keyword") === "展览"));
  // Find the livehouse event explicitly — order between equally-ranked events
  // is not part of the contract.
  const livehouseEvent = events.find((event) => event.sourceId === "916569133122");
  assert.ok(livehouseEvent);
  assert.equal(livehouseEvent.source, "damai");
  assert.equal(livehouseEvent.itemType, "event");
  assert.equal(livehouseEvent.sourceUrl, "https://detail.damai.cn/item.htm?id=916569133122");
  assert.equal(livehouseEvent.startsAt, "2026-06-14T20:00:00.000+08:00");
  assert.equal(livehouseEvent.imageUrl, "https://img.alicdn.com/damai/night.jpg");
  assert.equal(livehouseEvent.priceLevel, 2);
  assert.match(livehouseEvent.content ?? "", /场馆线索：MAO Livehouse 上海/);
  assert.ok(livehouseEvent.tags.includes("音乐"));
  assert.deepEqual(await adapter.searchVenues({ city: "上海", keywords: ["livehouse"] }), []);

  const normalized = toNormalizedEntityInput(livehouseEvent, createSourceKey(livehouseEvent));
  assert.ok(normalized);
  assert.equal(normalized.entityType, "event");
  assert.equal(normalized.source, "damai");
});

test("damai adapter surfaces captcha blocks as manual verification errors", async () => {
  const adapter = createDamaiAdapter({
    cookieHeader: "anonymous_cookie=expired",
    requestDelayMs: 0,
    fetchFn: async () =>
      new Response(
        JSON.stringify({
          ret: ["FAIL_SYS_USER_VALIDATE::需要验证码"],
          data: {
            url: "https://search.damai.cn/_____tmd_____/punish"
          }
        })
      )
  });

  await assert.rejects(
    adapter.searchEvents({
      city: "上海",
      keywords: ["展览"]
    }),
    /damai_requires_manual_verification/
  );
});

test("extractEventName pulls the show name out of Damai ticket-SKU titles", () => {
  // 《》 title wins, with leading brand prefix preserved.
  assert.equal(
    extractEventName("沉浸式推理音乐剧《小说》-【缪时客出品】"),
    "沉浸式推理音乐剧《小说》"
  );
  assert.equal(
    extractEventName("《肇兴中国》秦·大一统之路文物考古特展拼团人工讲解服务不限人群10:00场-1.5小时-不限人群"),
    "《肇兴中国》秦·大一统之路文物考古特展"
  );
  // No 《》: trailing ticket / time / language noise is stripped.
  assert.equal(
    extractEventName("豫园私人定制VIP讲解服务不限人群15:00场-11-15人-普通话-不限人群"),
    "豫园私人定制VIP讲解服务"
  );
  assert.equal(
    extractEventName("武康路90分钟专业导游无线耳麦深度讲解成人票13:00场-中文讲解-90分钟-成人票"),
    "武康路90分钟专业导游无线耳麦深度讲解"
  );
  // Clean show title is returned as-is.
  assert.equal(extractEventName("2026 BY2「撇清关系2.0」十七周年巡回演唱会 ·上海站"), "2026 BY2「撇清关系2.0」十七周年巡回演唱会 ·上海站");
});

test("isTicketNoiseTitle flags scenic-spot admission and guided-tour SKUs", () => {
  assert.equal(isTicketNoiseTitle("豫园私人定制VIP讲解服务不限人群15:00场-11-15人-普通话-不限人群"), true);
  assert.equal(isTicketNoiseTitle("花开海上生态园门票双人票非当日可售双人票"), true);
  assert.equal(isTicketNoiseTitle("滴水湖游船票老人票15:30开航-老人票"), true);
  // Real shows are not flagged.
  assert.equal(isTicketNoiseTitle("2026 BY2「撇清关系2.0」十七周年巡回演唱会 ·上海站"), false);
  assert.equal(isTicketNoiseTitle("沉浸式推理音乐剧《小说》"), false);
});

test("damai ticket-noise items are kept but down-weighted and flagged", () => {
  const mapped = mapDamaiSearchItem({
    raw: {
      projectid: "1001",
      nameNoHtml: "豫园私人定制VIP讲解服务不限人群15:00场-11-15人-普通话-不限人群",
      cityname: "上海",
      venue: "豫园",
      showtime: "2026.06.14-07.18",
      price_str: "219-279",
      categoryname: "",
      showstatus: "售票中"
    },
    search: { city: "上海", keywords: [] },
    query: ""
  });

  assert.ok(mapped);
  // Cleaned title, not the raw SKU string.
  assert.equal(mapped.item.title, "豫园私人定制VIP讲解服务");
  // ticket_noise flag flows into the mapped item.
  assert.ok(mapped.item.qualityFlags?.includes("ticket_noise"));

  const cleanMapped = mapDamaiSearchItem({
    raw: {
      projectid: "1002",
      nameNoHtml: "沉浸式推理音乐剧《小说》-【缪时客出品】",
      cityname: "上海",
      venue: "十二楼音乐剧之城 -1号剧场[小说编辑部]",
      showtime: "2026.06.14-07.31",
      price_str: "199-399",
      categoryname: "话剧歌剧",
      showstatus: "售票中"
    },
    search: { city: "上海", keywords: [] },
    query: ""
  });

  assert.ok(cleanMapped);
  assert.ok(!cleanMapped.item.qualityFlags?.includes("ticket_noise"));
  // Real show outranks the ticket-noise SKU.
  assert.ok(cleanMapped.rank > mapped.rank);
});

test("damai mapDamaiSearchItem preserves venueName in content for downstream AMap matching", () => {
  const mapped = mapDamaiSearchItem({
    raw: {
      projectid: "1003",
      nameNoHtml: "2026大张伟“大好时光”演唱会-上海站",
      cityname: "上海",
      venue: "浦发银行东方体育中心",
      showtime: "2026.06.20 周六 19:00",
      price_str: "233-1831",
      categoryname: "演唱会",
      showstatus: "售票中"
    },
    search: { city: "上海", keywords: [] },
    query: ""
  });

  assert.ok(mapped);
  // venueName survives in content under "场馆线索：" for the place matcher.
  assert.match(mapped.item.content ?? "", /场馆线索：浦发银行东方体育中心/);
  // And in rawPayload for direct extraction.
  assert.equal((mapped.item.rawPayload as { venue?: string }).venue, "浦发银行东方体育中心");
});
