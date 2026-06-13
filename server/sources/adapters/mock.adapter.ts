import type { CitySourceAdapter, RawSourceItemDetail } from "@/server/sources/source.types";
import { matchCityItem } from "@/server/sources/adapters/adapter-utils";

export const mockCatalog: RawSourceItemDetail[] = [
  {
    id: "mock-event-001",
    source: "douban-mock",
    sourceId: "db-quiet-film-week",
    sourceUrl: "https://example.com/douban/quiet-film-week",
    title: "衡山路独立影像夜",
    content: "小型放映、映后聊天和附近咖啡馆联动，适合一个人安静看完再散步。",
    author: "城市影像小组",
    city: "上海",
    area: "徐汇",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "event",
    address: "衡山路 880 号",
    lat: 31.204,
    lng: 121.446,
    startsAt: new Date().toISOString(),
    tags: ["电影", "咖啡", "安静", "solo"],
    trendScore: 76,
    confidence: 88,
    popularity: 62,
    quietness: 88,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "douban-mock",
        label: "同城想看上升",
        score: 76,
        evidence: "近 24 小时想看人数增长 18%"
      }
    ]
  },
  {
    id: "mock-event-002",
    source: "xiaohongshu-mock",
    sourceId: "xhs-westbund-comic",
    sourceUrl: "https://example.com/xhs/westbund-comic",
    title: "西岸漫画与独立出版市集",
    content: "漫画摊位、独立出版、咖啡快闪和创作者签售，下午到傍晚热度最高。",
    author: "西岸活动观察",
    city: "上海",
    area: "徐汇",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "event",
    address: "龙腾大道 2555 号",
    lat: 31.184,
    lng: 121.466,
    startsAt: new Date().toISOString(),
    tags: ["漫画", "市集", "咖啡", "lively"],
    trendScore: 91,
    confidence: 84,
    popularity: 86,
    quietness: 42,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "xiaohongshu-mock",
        label: "附近讨论升温",
        score: 91,
        evidence: "相关笔记收藏率高于同城均值"
      }
    ]
  },
  {
    id: "mock-venue-001",
    source: "bilibili-mock",
    sourceId: "bili-livehouse-neo",
    sourceUrl: "https://example.com/bilibili/livehouse-neo",
    title: "育音堂今晚独立乐队拼盘",
    content: "三组新乐队轮番演出，适合想要热闹但不想去大场馆的人。",
    author: "演出切片 Bot",
    city: "上海",
    area: "长宁",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "event",
    address: "凯旋路 851 号",
    lat: 31.216,
    lng: 121.424,
    startsAt: new Date().toISOString(),
    tags: ["独立音乐", "livehouse", "夜生活", "lively"],
    trendScore: 83,
    confidence: 79,
    popularity: 81,
    quietness: 28,
    priceLevel: 3,
    sourceSignals: [
      {
        source: "bilibili-mock",
        label: "演出切片播放走高",
        score: 83,
        evidence: "乐队关键词播放增长明显"
      }
    ]
  },
  {
    id: "mock-venue-002",
    source: "xiaohongshu-mock",
    sourceId: "xhs-bookstore-coffee",
    sourceUrl: "https://example.com/xhs/bookstore-coffee",
    title: "上生新所屋顶书店咖啡",
    content: "适合傍晚阅读、轻食和短距离约会，周五人流中等。",
    author: "附近咖啡雷达",
    city: "上海",
    area: "长宁",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "venue",
    address: "延安西路 1262 号",
    lat: 31.211,
    lng: 121.431,
    tags: ["书店", "咖啡", "约会", "安静"],
    trendScore: 72,
    confidence: 86,
    popularity: 66,
    quietness: 74,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "xiaohongshu-mock",
        label: "周边收藏稳定",
        score: 72,
        evidence: "咖啡和书店标签共同出现频率高"
      }
    ]
  },
  {
    id: "mock-venue-003",
    source: "mock-city-signal",
    sourceId: "signal-jingan-gallery",
    title: "胶囊画廊夜间展",
    content: "小型当代艺术展，离地铁近，适合工作日下班后短路线。",
    city: "上海",
    area: "静安",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "event",
    address: "愚园路 300 号",
    lat: 31.226,
    lng: 121.447,
    startsAt: new Date().toISOString(),
    tags: ["展览", "艺术", "安静", "solo"],
    trendScore: 68,
    confidence: 82,
    popularity: 54,
    quietness: 81,
    priceLevel: 2,
    sourceSignals: [
      {
        source: "mock-city-signal",
        label: "区域艺术热度",
        score: 68,
        evidence: "静安展览标签近期持续出现"
      }
    ]
  },
  {
    id: "mock-venue-004",
    source: "mock-city-signal",
    sourceId: "signal-jingan-bakery",
    title: "巨鹿路深夜面包房",
    content: "低预算、短停留、适合随机探索的深夜补给点。",
    city: "上海",
    area: "静安",
    publishedAt: new Date().toISOString(),
    status: "parsed",
    itemType: "venue",
    address: "巨鹿路 758 号",
    lat: 31.222,
    lng: 121.458,
    tags: ["面包", "夜生活", "低预算", "random"],
    trendScore: 64,
    confidence: 80,
    popularity: 58,
    quietness: 63,
    priceLevel: 1,
    sourceSignals: [
      {
        source: "mock-city-signal",
        label: "夜间补给点",
        score: 64,
        evidence: "夜间路线中停留效率高"
      }
    ]
  }
];

export const mockAdapter: CitySourceAdapter = {
  source: "mock-city-signal",
  kind: "mock",
  status: "active",
  async searchEvents(input) {
    return mockCatalog.filter((item) => item.itemType === "event" && matchCityItem(item, input));
  },
  async searchVenues(input) {
    return mockCatalog.filter((item) => item.itemType === "venue" && matchCityItem(item, input));
  },
  async getItemDetail(sourceItemId) {
    return mockCatalog.find((item) => item.id === sourceItemId || item.sourceId === sourceItemId) ?? null;
  }
};
