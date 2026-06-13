import assert from "node:assert/strict";
import test from "node:test";
import { createAmapPoiAdapter } from "@/server/sources/adapters/amap-poi.adapter";

test("amap poi adapter searches each keyword separately and deduplicates places", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";
  const requestedKeywords: string[] = [];
  const adapter = createAmapPoiAdapter({
    async fetchFn(input) {
      const url = new URL(String(input));
      const keyword = url.searchParams.get("keywords") ?? "";
      requestedKeywords.push(keyword);
      const pois =
        keyword === "咖啡"
          ? [
              {
                id: "poi-coffee",
                name: "安静咖啡馆",
                address: "南京西路 100 号",
                location: "121.459,31.224",
                type: "餐饮服务;咖啡厅;咖啡厅",
                adname: "静安区"
              }
            ]
          : [
              {
                id: "poi-bookstore",
                name: "夜间书店",
                address: "愚园路 200 号",
                location: "121.455,31.226",
                type: "购物服务;专卖店;书店",
                adname: "静安区"
              },
              {
                id: "poi-coffee",
                name: "安静咖啡馆",
                address: "南京西路 100 号",
                location: "121.459,31.224",
                type: "餐饮服务;咖啡厅;咖啡厅",
                adname: "静安区"
              }
            ];

      return new Response(JSON.stringify({ pois }));
    }
  });

  const venues = await adapter.searchVenues({
    city: "上海",
    keywords: ["咖啡", "书店"]
  });

  assert.deepEqual(requestedKeywords, ["咖啡", "书店"]);
  assert.equal(venues.length, 2);
  assert.deepEqual(
    venues.map((venue) => venue.title),
    ["安静咖啡馆", "夜间书店"]
  );
  assert.deepEqual(venues[0].tags.slice(0, 2), ["咖啡", "餐饮服务"]);
  assert.equal(venues[0].address, "南京西路 100 号");
  assert.equal(venues[0].lat, 31.224);
  assert.equal(venues[0].lng, 121.459);

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});

test("amap poi adapter expands independent music into livehouse search", async () => {
  const previous = process.env.AMAP_API_KEY;
  process.env.AMAP_API_KEY = "test-key";
  const requestedKeywords: string[] = [];
  const adapter = createAmapPoiAdapter({
    async fetchFn(input) {
      const url = new URL(String(input));
      requestedKeywords.push(url.searchParams.get("keywords") ?? "");

      return new Response(
        JSON.stringify({
          pois: [
            {
              id: "poi-livehouse",
              name: "MAO Livehouse上海",
              address: "重庆南路308号",
              location: "121.47,31.22",
              type: "体育休闲服务;娱乐场所;酒吧",
              adname: "黄浦区"
            }
          ]
        })
      );
    }
  });

  const [venue] = await adapter.searchVenues({
    city: "上海",
    keywords: ["独立音乐"]
  });

  assert.deepEqual(requestedKeywords, ["livehouse"]);
  assert.equal(venue.title, "MAO Livehouse上海");
  assert.equal(venue.tags[0], "独立音乐");

  if (previous === undefined) {
    delete process.env.AMAP_API_KEY;
  } else {
    process.env.AMAP_API_KEY = previous;
  }
});
