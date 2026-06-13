import assert from "node:assert/strict";
import test from "node:test";
import { toNormalizedEntityInput } from "@/server/ingest/normalize";
import { createSourceKey } from "@/server/ingest/source-key";
import {
  createShanghaiGovAdapter,
  parseShanghaiGovArticle,
  parseShanghaiGovList
} from "@/server/sources/adapters/shanghai-gov.adapter";

const listHtml = `
  <ul class="tadaty-list uli14 nowrapli list-date">
    <li><a href="/nw31406/20260608/c10123afba1c46538ccd40026745048b.html" title="第二届“拉丁热浪节”在虹桥新天地举办">第二届“拉丁热浪节”在虹桥新天地举办</a> <span class="time">2026-06-13</span></li>
    <li><a href="/nw31406/20260608/a39a583de5fa410ba91b6f13164b8afe.html" title="上海启动林长制日常工作成效监测">上海启动林长制日常工作成效监测</a> <span class="time">2026-06-13</span></li>
  </ul>
`;

const detailHtml = `
  <title>第二届“拉丁热浪节”在虹桥新天地举办</title>
  <meta name="ArticleTitle" content="第二届“拉丁热浪节”在虹桥新天地举办">
  <meta name="PubDate" content="2026-06-13 14∶06">
  <meta name="ContentSource" content="虹桥管委会">
  <div id="ivs_content" class="trout-region-content">
    <p>2026年“上海环球美食汇·美洲风味季活动”和“精彩夜上海”主题活动期间，虹桥新天地于6月5日至7日、6月12日至14日举办第二届“拉丁热浪节”。</p>
    <p>本届活动汇聚拉美风物市集、丰富文化演出、趣味互动挑战、拉美特色工作坊等内容。</p>
  </div>
`;

const citywideMarketDetailHtml = `
  <title>上海体彩好事发生市集亮相2026上海城市定向户外挑战赛</title>
  <meta name="ArticleTitle" content="上海体彩好事发生市集亮相2026上海城市定向户外挑战赛">
  <meta name="PubDate" content="2026-06-13 16∶30">
  <meta name="ContentSource" content="上海体育">
  <div id="ivs_content" class="trout-region-content">
    <p>活动在上海体育场举行，现场有体彩主题市集和运动互动。</p>
  </div>
`;

test("shanghai gov list parser extracts dated public article links", () => {
  const entries = parseShanghaiGovList(listHtml);

  assert.equal(entries.length, 2);
  assert.equal(entries[0].title, "第二届“拉丁热浪节”在虹桥新天地举办");
  assert.equal(
    entries[0].url,
    "https://www.shanghai.gov.cn/nw31406/20260608/c10123afba1c46538ccd40026745048b.html"
  );
  assert.equal(entries[0].publishedAt, "2026-06-13");
});

test("shanghai gov article parser extracts source and readable body text", () => {
  const article = parseShanghaiGovArticle(detailHtml);

  assert.equal(article.title, "第二届“拉丁热浪节”在虹桥新天地举办");
  assert.equal(article.sourceName, "虹桥管委会");
  assert.equal(article.publishedAt, "2026-06-13 14:06");
  assert.match(article.content, /拉美风物市集/);
});

test("shanghai gov adapter maps public activity articles into normalized events", async () => {
  const adapter = createShanghaiGovAdapter({
    fetchHtml: async (url) => (url.includes("c10123") ? detailHtml : listHtml),
    maxDetails: 4
  });

  const events = await adapter.searchEvents({
    city: "上海",
    area: "闵行",
    keywords: ["美食", "市集"]
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].source, "shanghai-gov");
  assert.equal(events[0].itemType, "event");
  assert.equal(events[0].sourceUrl, "https://www.shanghai.gov.cn/nw31406/20260608/c10123afba1c46538ccd40026745048b.html");
  assert.equal(events[0].area, "闵行");
  assert.equal(events[0].address, "虹桥新天地");
  assert.ok(events[0].tags.includes("市集"));
  assert.ok(events[0].tags.includes("美食"));
  assert.equal(events[0].startsAt, "2026-06-13T10:00:00.000+08:00");
  assert.ok(events[0].sourceSignals?.length);

  const normalized = toNormalizedEntityInput(events[0], createSourceKey(events[0]));
  assert.ok(normalized);
  assert.equal(normalized.source, "shanghai-gov");
  assert.equal(normalized.entityType, "event");
});

test("shanghai gov adapter does not copy requested area without article evidence", async () => {
  const adapter = createShanghaiGovAdapter({
    fetchHtml: async (url) => (url.includes("c10123") ? citywideMarketDetailHtml : listHtml),
    maxDetails: 4
  });

  const events = await adapter.searchEvents({
    city: "上海",
    area: "静安",
    keywords: ["市集"]
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].area, undefined);
  assert.equal(events[0].address, "上海体育场");

  const normalized = toNormalizedEntityInput(events[0], createSourceKey(events[0]));
  assert.ok(normalized);
  assert.equal(normalized.area, undefined);
});

test("shanghai gov adapter degrades to empty results when page structure changes", async () => {
  const adapter = createShanghaiGovAdapter({
    fetchHtml: async () => "<html><body>empty</body></html>"
  });

  assert.deepEqual(
    await adapter.searchEvents({
      city: "上海",
      keywords: ["活动"]
    }),
    []
  );
});
