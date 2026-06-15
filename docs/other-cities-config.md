# 其他地区配置指南

本文档说明如何将 CitySense 从默认的上海配置扩展到其他城市或地区。

## 概述

CitySense 的推荐系统支持多城市配置，当前默认配置为上海。要支持其他城市，需要在以下几个层面进行配置：

1. **地理区域配置** - 定义城市的行政区划
2. **Demo 数据配置** - 提供新城市的演示数据
3. **数据源适配器配置** - 配置城市特定的数据源
4. **推荐参数调整** - 根据城市特点调整推荐权重

## 1. 地理区域配置

### 修改区名归一化

编辑 `server/geo/area-normalizer.ts`，添加新城市的区县列表：

```typescript
const BEIJING_DISTRICTS = [
  "东城", "西城", "朝阳", "丰台", "石景山", "海淀",
  "门头沟", "房山", "通州", "顺义", "昌平", "大兴",
  "怀柔", "平谷", "密云", "延庆"
] as const;

const BEIJING_DISTRICT_SET = new Set<string>(BEIJING_DISTRICTS);

export function canonicalizeArea(value?: string | null, city: string = "上海") {
  const text = normalizeText(value);
  if (!text) return undefined;

  const cityDistricts = city === "北京" ? BEIJING_DISTRICTS : SHANGHAI_DISTRICTS;
  const cityDistrictSet = city === "北京" ? BEIJING_DISTRICT_SET : SHANGHAI_DISTRICT_SET;

  // ... 其余逻辑
}
```

### 区名归一化规则

- 去除城市前缀（如"上海市黄浦区" → "黄浦"）
- 去除"区"后缀（如"黄浦区" → "黄浦"）
- 处理特殊命名（如"浦东新区" → "浦东"）
- 生成变体用于文本匹配

## 2. Demo 数据配置

### 创建城市特定的 Demo 数据

编辑 `prisma/demo-seed-data.ts`，添加新城市的数据条目：

```typescript
// 为北京创建 Demo 数据
function event(input: Omit<DemoSeedItem, "status" | "itemType" | "city" | "publishedAt">): DemoSeedItem {
  return {
    ...input,
    city: input.city || "上海",  // 保持默认为上海
    publishedAt: "2026-06-08T10:00:00.000+08:00",
    status: "new",
    itemType: "event"
  };
}

// 北京 Demo 数据示例
export const beijingDemoSeedCatalog: DemoSeedItem[] = [
  event({
    id: "beijing-chaoyang-art-fair",
    source: "douban",
    sourceId: "douban-beijing-art-fair",
    sourceUrl: "https://www.douban.com/event/beijing-art-fair/",
    title: "798 艺术区周末展",
    content: "当代艺术展览，适合文艺青年周末参观。",
    city: "北京",
    area: "朝阳",
    address: "798 艺术区 D 区",
    lat: 39.984,
    lng: 116.496,
    startsAt: "2026-06-15T14:00:00.000+08:00",
    tags: ["艺术", "展览", "文艺"],
    trendScore: 85,
    confidence: 90,
    popularity: 75,
    quietness: 70,
    priceLevel: 2
  }),
  // ... 更多北京数据
];
```

### 更新 Seed 逻辑

编辑 `prisma/seed.ts`，将新城市数据写入数据库：

```typescript
async function seedDemoData() {
  const allSeeds = [...demoSeedCatalog, ...beijingDemoSeedCatalog];

  for (const item of allSeeds) {
    await prisma.rawSourceItem.upsert({
      where: { sourceId: item.sourceId },
      update: {},
      create: {
        ...item,
        sourceKey: `demo:${item.id}`,
        runId: "seed"
      }
    });
  }
}
```

## 3. 数据源适配器配置

### 城市政府公开活动源

为每个城市配置政府公开活动信息源：

```bash
# .env
# 北京
BEIJING_GOV_EVENTS_URL="https://www.beijing.gov.cn/zwgk/ztzl/hyxx/"
BEIJING_GOV_MAX_DETAILS="10"

# 广州
GUANGZHOU_GOV_EVENTS_URL="https://www.gz.gov.cn/zwgk/hyxx/"
GUANGZHOU_GOV_MAX_DETAILS="10"
```

### 创建城市特定的 Adapter

如果城市有特殊的数据源，创建对应的适配器：

```typescript
// server/sources/adapters/beijing-gov.adapter.ts
import { BaseCitySourceAdapter } from "./adapter-utils";

export const beijingGovAdapter = new BaseCitySourceAdapter({
  source: "beijing-gov",
  kind: "crawler",
  async searchEvents(input) {
    // 实现北京政府公开活动的爬取逻辑
  }
});
```

### 注册新适配器

编辑 `server/sources/source-registry.ts`：

```typescript
import { beijingGovAdapter } from "./adapters/beijing-gov.adapter";

export const allSourceAdapters = [
  // ... 现有适配器
  beijingGovAdapter,
];
```

## 4. 推荐参数调整

### 城市画像配置

如果不同城市需要不同的推荐权重，可以创建城市特定的配置：

```typescript
// server/config/city-weights.ts
export const CITY_RECOMMENDATION_WEIGHTS = {
  上海: {
    userAffinity: 0.18,
    trendScore: 0.25,
    qualityScore: 0.20,
    // ... 其他权重
  },
  北京: {
    userAffinity: 0.20,
    trendScore: 0.20,
    qualityScore: 0.25,
    // ... 其他权重
  }
};

export function getCityWeights(city: string) {
  return CITY_RECOMMENDATION_WEIGHTS[city] || CITY_RECOMMENDATION_WEIGHTS["上海"];
}
```

### 城市脉搏配置

为不同城市配置城市脉搏的聚合参数：

```typescript
// server/recommendation/city-profile.ts
export async function getCityProfile(city: string, area?: string) {
  // 根据城市调整聚合逻辑
  const topTagLimit = city === "上海" ? 20 : 15;
  const representativeNoteLimit = city === "上海" ? 5 : 3;

  // ...
}
```

## 5. 前端配置

### 城市选择器

在前端添加城市选择功能：

```typescript
// app/page.tsx
const CITY_OPTIONS = [
  { value: "上海", label: "上海" },
  { value: "北京", label: "北京" },
  { value: "广州", label: "广州" },
];

// 使用 Select 组件让用户选择城市
<Select value={city} onChange={(v) => setCity(v)}>
  {CITY_OPTIONS.map(opt => (
    <Select.Option key={opt.value} value={opt.value}>
      {opt.label}
    </Select.Option>
  ))}
</Select>
```

### 地图配置

为不同城市配置不同的地图中心点和缩放级别：

```typescript
// components/city/RouteMapCanvas.tsx
const CITY_MAP_CENTER = {
  上海: { lat: 31.2304, lng: 121.4737, zoom: 12 },
  北京: { lat: 39.9042, lng: 116.4074, zoom: 11 },
  广州: { lat: 23.1291, lng: 113.2644, zoom: 12 },
};

function getMapCenter(city: string) {
  return CITY_MAP_CENTER[city] || CITY_MAP_CENTER["上海"];
}
```

## 6. 测试验证

### 测试新城市配置

```bash
# 1. 重新生成 Prisma Client
pnpm prisma:generate

# 2. 重新 Seed 数据库
pnpm db:seed

# 3. 启动开发服务器
pnpm dev

# 4. 在浏览器中测试新城市的推荐
```

### 验证清单

- [ ] 区名归一化正常工作
- [ ] Demo 数据正确入库
- [ ] 推荐接口返回新城市数据
- [ ] 地图正确显示新城市位置
- [ ] 城市脉搏面板显示正确的聚合数据
- [ ] 数据源适配器正常采集新城市数据

## 7. 已知限制

1. **Demo 数据**：当前 Demo 数据仅包含上海，其他城市需要手动配置
2. **区名归一化**：`area-normalizer.ts` 目前硬编码了上海区县列表
3. **数据源**：政府公开活动源目前仅配置了上海政府
4. **城市画像**：城市画像逻辑基于小红书数据，其他城市数据可能稀疏

## 8. 未来改进

- [ ] 将区名列表迁移到数据库配置
- [ ] 支持从外部文件加载城市配置
- [ ] 实现自动化的城市数据 Seed 工具
- [ ] 支持城市级别的推荐 A/B 测试