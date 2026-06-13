import assert from "node:assert/strict";
import test from "node:test";
import {
  checkTitleQuality,
  filterLowQualityTitles,
  getFilterStats,
  batchCheckTitleQuality,
  type TitleQualityResult
} from "@/server/sources/adapters/title-quality-filter";

test("title quality filter passes valid titles", () => {
  const result = checkTitleQuality("浦东美术馆新展：光与影的对话");

  assert.equal(result.pass, true);
  assert.equal(result.category, "valid");
});

test("title quality filter rejects clickbait with '天花板'", () => {
  const result = checkTitleQuality("上海生活简直是看展天花板");

  assert.equal(result.pass, false);
  assert.equal(result.category, "clickbait");
  assert.equal(result.reason, "标题包含夸张表达");
});

test("title quality filter rejects clickbait with '绝了'", () => {
  const result = checkTitleQuality("静安寺这家咖啡店绝了");

  assert.equal(result.pass, false);
  assert.equal(result.category, "clickbait");
});

test("title quality filter rejects marketing keywords", () => {
  const result = checkTitleQuality("上海咖啡店最全攻略");

  assert.equal(result.pass, false);
  assert.equal(result.category, "marketing");
  assert.equal(result.reason, "标题包含营销关键词且无具体地点名称");
});

test("title quality filter allows marketing with specific info", () => {
  const result = checkTitleQuality(
    "上海咖啡店最全攻略",
    "浦东新区共有50家特色咖啡店，包括手冲、意式等多种风格"
  );

  assert.equal(result.pass, true);
  assert.equal(result.category, "valid");
});

test("title quality filter rejects meaningless titles", () => {
  const result1 = checkTitleQuality("！！！");
  assert.equal(result1.pass, false);
  assert.equal(result1.category, "meaningless");

  const result2 = checkTitleQuality("咖啡");
  assert.equal(result2.pass, false);
  assert.equal(result2.category, "meaningless");
});

test("title quality filter allows short titles with numbers", () => {
  const result = checkTitleQuality("M50创意园");

  assert.equal(result.pass, true);
  assert.equal(result.category, "valid");
});

test("title quality filter rejects generic '上海生活' titles", () => {
  const result = checkTitleQuality("上海生活");

  assert.equal(result.pass, false);
  assert.equal(result.category, "clickbait");
});

test("title quality filter allows generic titles with substantial content", () => {
  const result = checkTitleQuality(
    "上海生活",
    "浦东美术馆新展《光与影的对话》本周开幕，展期至6月30日，欢迎参观"
  );

  assert.equal(result.pass, true);
  assert.equal(result.category, "valid");
});

test("title quality filter rejects '周末好去处' without content", () => {
  const result = checkTitleQuality("周末好去处");

  assert.equal(result.pass, false);
  assert.equal(result.category, "marketing");
});

test("filterLowQualityTitles removes low quality items", () => {
  const items = [
    { title: "浦东美术馆新展" },
    { title: "上海生活简直是看展天花板" },
    { title: "咖啡店最全攻略" },  // 改为没有具体区域的营销标题
    { title: "M50创意园展览" }
  ];

  const result = filterLowQualityTitles(items);

  assert.equal(result.filtered.length, 2);
  assert.equal(result.removed, 2);
  assert.equal(result.reasons.get("标题包含夸张表达"), 1);
  assert.equal(result.reasons.get("标题包含营销关键词且无具体地点名称"), 1);

  assert.equal(result.filtered[0].title, "浦东美术馆新展");
  assert.equal(result.filtered[1].title, "M50创意园展览");
});

test("filterLowQualityTitles returns empty array when all filtered", () => {
  const items = [
    { title: "上海生活简直是看展天花板" },
    { title: "静安寺这家店绝了" }
  ];

  const result = filterLowQualityTitles(items);

  assert.equal(result.filtered.length, 0);
  assert.equal(result.removed, 2);
});

test("batchCheckTitleQuality processes multiple items", () => {
  const items = [
    { title: "浦东美术馆新展" },
    { title: "上海生活简直是看展天花板" },
    { title: "静安寺咖啡店" }
  ];

  const results = batchCheckTitleQuality(items);

  assert.equal(results.length, 3);
  assert.equal(results[0].pass, true);
  assert.equal(results[1].pass, false);
  assert.equal(results[2].pass, true);
});

test("getFilterStats returns correct statistics", () => {
  const results: Array<TitleQualityResult & { index: number }> = [
    { index: 0, pass: true, category: "valid" },
    { index: 1, pass: false, category: "clickbait", reason: "标题夸张" },
    { index: 2, pass: false, category: "marketing", reason: "营销关键词" },
    { index: 3, pass: true, category: "valid" }
  ];

  const stats = getFilterStats(results);

  assert.equal(stats.total, 4);
  assert.equal(stats.passed, 2);
  assert.equal(stats.removed, 2);
  assert.equal(stats.byCategory.clickbait, 1);
  assert.equal(stats.byCategory.marketing, 1);
  assert.equal(stats.byCategory.valid, undefined);  // valid items are counted in "passed", not "byCategory"
});

test("title quality filter handles empty titles", () => {
  const result = checkTitleQuality("");

  assert.equal(result.pass, false);
  assert.equal(result.category, "meaningless");
  assert.equal(result.reason, "标题为空");
});

test("title quality filter handles whitespace-only titles", () => {
  const result = checkTitleQuality("   ");

  assert.equal(result.pass, false);
  assert.equal(result.category, "meaningless");
});

test("title quality filter rejects '绝绝子'", () => {
  const result = checkTitleQuality("这个地方绝绝子");

  assert.equal(result.pass, false);
  assert.equal(result.category, "clickbait");
});

test("title quality filter rejects 'YYDS'", () => {
  const result = checkTitleQuality("这家咖啡店YYDS");

  assert.equal(result.pass, false);
  assert.equal(result.category, "clickbait");
});

test("title quality filter allows titles with venue names", () => {
  const validTitles = [
    "星巴克臻选上海烘焙工坊",
    "M50创意园",
    "浦东美术馆",
    "静安寺周边咖啡店",
    "外滩源美术馆"
  ];

  for (const title of validTitles) {
    const result = checkTitleQuality(title);
    assert.equal(result.pass, true, `Should pass: ${title}`);
    assert.equal(result.category, "valid");
  }
});
