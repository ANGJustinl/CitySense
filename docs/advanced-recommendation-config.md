# 高级推荐控制 - 配置文档

## 目录

- [概述](#概述)
- [组件 API](#组件-api)
- [数据类型](#数据类型)
- [配置选项](#配置选项)
- [预设系统](#预设系统)
- [样式定制](#样式定制)
- [API 集成](#api-集成)
- [事件处理](#事件处理)
- [最佳实践](#最佳实践)

---

## 概述

`AdvancedRecommendationControls` 是一个高度可自定义的推荐输入组件，提供了丰富的配置选项让用户精确控制推荐结果。

### 特性概览

| 特性 | 说明 | 状态 |
|------|------|------|
| 预设管理 | 保存/加载/导出/导入配置 | ✅ 完成 |
| 兴趣分类 | 5大类 + 自定义标签 | ✅ 完成 |
| 心情选择 | 5种可视化卡片 | ✅ 完成 |
| 时间安排 | 快速选项 + 自定义时间 | ✅ 完成 |
| 预算范围 | 3档价格区间 | ✅ 完成 |
| 途径点数量 | 2-8点可选 | ✅ 完成 |
| 推荐权重 | 4维权重滑块 | ✅ 完成 |
| 排除条件 | 5种排除选项 | ✅ 完成 |
| 响应式设计 | 移动端适配 | ✅ 完成 |

---

## 组件 API

### AdvancedRecommendationControls

主要的高级推荐控制组件。

```tsx
import { AdvancedRecommendationControls } from "@/components/AdvancedRecommendationControls";
```

#### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `values` | `EnhancedRecommendationInput` | ✅ | - | 当前配置值 |
| `onChange` | `(values: EnhancedRecommendationInput) => void` | ✅ | - | 配置变化回调 |
| `onSubmit` | `() => void` | ✅ | - | 提交回调 |
| `isLoading` | `boolean` | ❌ | `false` | 是否正在加载 |
| `presets` | `{ name: string; config: EnhancedRecommendationInput }[]` | ❌ | `[]` | 预设列表 |
| `onSavePreset` | `(name: string) => void` | ❌ | - | 保存预设回调 |

#### 基础用法

```tsx
function MyPage() {
  const [input, setInput] = useState<EnhancedRecommendationInput>({
    city: "上海",
    area: "",
    interests: ["咖啡", "展览"],
    mood: "solo",
    timeWindow: "tonight",
    budget: "medium",
    waypointCount: 3,
    useRealtimeTraffic: false,
    weights: {},
    excludes: [],
    useWeights: false,
    useExcludes: false
  });

  const handleSubmit = () => {
    // 处理提交逻辑
  };

  return (
    <AdvancedRecommendationControls
      values={input}
      onChange={setInput}
      onSubmit={handleSubmit}
    />
  );
}
```

#### 集成预设管理

```tsx
import { useRecommendationPresets } from "@/hooks/useRecommendationPresets";

function MyPage() {
  const { presets, savePreset, exportPresets, importPresets } = useRecommendationPresets();

  return (
    <AdvancedRecommendationControls
      values={input}
      onChange={setInput}
      onSubmit={handleSubmit}
      presets={presets.map(p => ({ name: p.name, config: p.config }))}
      onSavePreset={savePreset}
    />
  );
}
```

---

### EnhancedWorkspaceControls

可集成到现有工作区的控制组件，支持基础/高级模式切换。

```tsx
import { EnhancedWorkspaceControls } from "@/components/EnhancedWorkspaceControls";
```

#### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|------|------|
| `city` | `string` | ✅ | - | 当前城市 |
| `area` | `string` | ✅ | - | 当前区域 |
| `interests` | `string[]` | ✅ | - | 兴趣标签列表 |
| `mood` | `Mood` | ✅ | - | 当前心情 |
| `timeWindow` | `TimeWindow` | ✅ | - | 时间窗口 |
| `budget` | `Budget` | ✅ | - | 预算等级 |
| `waypointCount` | `number` | ✅ | - | 途径点数量 |
| `useRealtimeTraffic` | `boolean` | ✅ | - | 是否使用实时交通 |
| `data` | `RecommendResponse` | ✅ | - | 推荐结果数据 |
| `onDataChange` | `(data: RecommendResponse) => void` | ✅ | - | 数据变化回调 |
| `onCityChange` | `(city: string) => void` | ✅ | - | 城市变化回调 |
| `onAreaChange` | `(area: string) => void` | ✅ | - | 区域变化回调 |
| `onInterestsChange` | `(interests: string[]) => void` | ✅ | - | 兴趣变化回调 |
| `onMoodChange` | `(mood: Mood) => void` | ✅ | - | 心情变化回调 |
| `onTimeWindowChange` | `(timeWindow: TimeWindow) => void` | ✅ | - | 时间变化回调 |
| `onBudgetChange` | `(budget: Budget) => void` | ✅ | - | 预算变化回调 |
| `onWaypointCountChange` | `(count: number) => void` | ✅ | - | 途径点数量变化回调 |
| `onUseRealtimeTrafficChange` | `(enabled: boolean) => void` | ✅ | - | 实时交通开关回调 |
| `onSubmitRecommendation` | `() => void` | ✅ | - | 提交推荐回调 |
| `isLoading` | `boolean` | ✅ | - | 是否正在加载 |
| `userId` | `string` | ❌ | - | 用户 ID |

---

### useRecommendationPresets

预设管理 Hook。

```tsx
import { useRecommendationPresets } from "@/hooks/useRecommendationPresets";
```

#### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `presets` | `Preset[]` | 预设列表 |
| `isLoading` | `boolean` | 是否正在加载 |
| `savePreset` | `(name: string, config: EnhancedRecommendationInput) => Preset` | 保存新预设 |
| `updatePreset` | `(id: string, config: EnhancedRecommendationInput) => void` | 更新已有预设 |
| `deletePreset` | `(id: string) => void` | 删除预设 |
| `renamePreset` | `(id: string, name: string) => void` | 重命名预设 |
| `exportPresets` | `() => void` | 导出所有预设为 JSON 文件 |
| `importPresets` | `(file: File) => Promise<Preset[]>` | 从 JSON 文件导入预设 |

#### 使用示例

```tsx
function MyComponent() {
  const { presets, savePreset, deletePreset, exportPresets } = useRecommendationPresets();

  const handleSave = () => {
    const config = getCurrentConfig();
    savePreset("我的周末路线", config);
  };

  const handleDelete = (id: string) => {
    deletePreset(id);
  };

  const handleExport = () => {
    exportPresets();
  };

  return (
    <div>
      <button onClick={handleSave}>保存为预设</button>
      <button onClick={handleExport}>导出预设</button>
      {presets.map(preset => (
        <div key={preset.id}>
          <span>{preset.name}</span>
          <button onClick={() => handleDelete(preset.id)}>删除</button>
        </div>
      ))}
    </div>
  );
}
```

---

## 数据类型

### EnhancedRecommendationInput

增强的推荐输入接口。

```typescript
interface EnhancedRecommendationInput {
  // 基础配置
  city: string;                           // 城市名称，如 "上海"
  area: string;                           // 区域名称，如 "徐汇"，可选
  interests: string[];                    // 兴趣标签列表
  mood: Mood;                             // 心情模式
  timeWindow: TimeWindow;                 // 时间窗口
  customTimeWindow?: CustomTimeWindow;    // 自定义时间（timeWindow="custom"时使用）
  budget: Budget;                         // 预算等级
  waypointCount: number;                  // 途径点数量 (2-8)
  useRealtimeTraffic: boolean;            // 是否使用实时交通

  // 高级配置
  weights: Record<string, number>;        // 权重配置
  excludes: string[];                     // 排除条件列表
  useWeights: boolean;                    // 是否启用权重
  useExcludes: boolean;                   // 是否启用排除
}
```

### CustomTimeWindow

自定义时间窗口配置。

```typescript
interface CustomTimeWindow {
  date: string;        // 日期，格式：YYYY-MM-DD
  startHour: string;   // 开始时间，格式：HH:mm
  endHour: string;     // 结束时间，格式：HH:mm
}
```

### Preset

预设数据结构。

```typescript
interface Preset {
  id: string;                              // 唯一标识符
  name: string;                            // 预设名称
  config: EnhancedRecommendationInput;     // 预设配置
  createdAt: number;                       // 创建时间戳
  updatedAt: number;                       // 更新时间戳
}
```

### Mood

心情模式枚举。

```typescript
type Mood = "quiet" | "lively" | "date" | "solo" | "random";
```

| 值 | 中文 | 描述 | 主题色 |
|----|------|------|--------|
| `solo` | Solo 探索 | 独自探索城市 | #087f7a |
| `quiet` | 安静时光 | 寻找安静场所 | #5a8a7a |
| `lively` | 热闹非凡 | 体验热闹氛围 | #c7583a |
| `date` | 浪漫约会 | 约会场景 | #b78419 |
| `random` | 随机冒险 | 随机探索 | #6a5a8a |

### Budget

预算等级枚举。

```typescript
type Budget = "low" | "medium" | "high";
```

| 值 | 中文 | 价格范围 | 图标 |
|----|------|----------|------|
| `low` | 经济实惠 | 0-100元/人 | 💰 |
| `medium` | 舒适适中 | 100-300元/人 | 💎 |
| `high` | 品质享受 | 300元+/人 | 👑 |

### TimeWindow

时间窗口枚举。

```typescript
type TimeWindow = "now" | "tonight" | "weekend" | "custom";
```

| 值 | 中文 | 图标 |
|----|------|------|
| `now` | 现在 | ⚡ |
| `tonight` | 今晚 | 🌙 |
| `weekend` | 周末 | 📅 |
| `custom` | 自定义 | 🎯 |

---

## 配置选项

### 兴趣分类配置

组件内置了5个兴趣分类，每个分类包含多个预设标签：

```typescript
const INTEREST_CATEGORIES = {
  food: {
    label: "美食",
    icon: "🍜",
    options: ["咖啡", "甜品", "火锅", "日料", "西餐", "小吃", "茶点", "精酿"]
  },
  culture: {
    label: "文化",
    icon: "🎨",
    options: ["展览", "书店", "博物馆", "美术馆", "画廊", "文创店", "剧院"]
  },
  entertainment: {
    label: "娱乐",
    icon: "🎮",
    options: ["独立音乐", "夜生活", "LiveHouse", "电影院", "桌游", "密室", "KTV"]
  },
  lifestyle: {
    label: "生活",
    icon: "🌿",
    options: ["公园", "瑜伽", "运动", "购物", "宠物", "花店", "市集"]
  },
  explore: {
    label: "探索",
    icon: "🔍",
    options: ["古建筑", "网红打卡", "老弄堂", "江景", "山景", "古镇", "创意园"]
  }
};
```

#### 自定义兴趣分类

如需修改兴趣分类，可以在 `AdvancedRecommendationControls.tsx` 中修改 `INTEREST_CATEGORIES` 常量：

```typescript
const INTEREST_CATEGORIES = {
  // 添加新分类
  shopping: {
    label: "购物",
    icon: "🛍️",
    options: ["商场", "设计师品牌", "古着店", "菜市场", "文具店"]
  }
};
```

### 权重配置

```typescript
const WEIGHT_OPTIONS = [
  { id: "distance", label: "距离优先", icon: "📍", defaultWeight: 30 },
  { id: "rating", label: "评分优先", icon: "⭐", defaultWeight: 40 },
  { id: "popularity", label: "热度优先", icon: "🔥", defaultWeight: 20 },
  { id: "diversity", label: "多样性", icon: "🎭", defaultWeight: 10 }
];
```

#### 权重说明

| 权重 ID | 标签 | 默认值 | 说明 |
|---------|------|--------|------|
| `distance` | 距离优先 | 30% | 优先推荐距离较近的地点 |
| `rating` | 评分优先 | 40% | 优先推荐评分较高的地点 |
| `popularity` | 热度优先 | 20% | 优先推荐热门地点 |
| `diversity` | 多样性 | 10% | 增加推荐结果的多样性 |

#### 自定义权重

```typescript
const weights: Record<string, number> = {
  distance: 50,      // 50% 优先距离
  rating: 30,        // 30% 优先评分
  popularity: 10,    // 10% 优先热度
  diversity: 10      // 10% 多样性
};
```

### 排除条件配置

```typescript
const EXCLUDE_OPTIONS = [
  { id: "crowded", label: "拥挤场所", icon: "👥" },
  { id: "noisy", label: "嘈杂环境", icon: "🔊" },
  { id: "expensive", label: "高价项目", icon: "💸" },
  { id: "remote", label: "偏远地区", icon: "🚗" },
  { id: "outdoor", label: "户外活动", icon: "🌤️" }
];
```

#### 排除条件说明

| ID | 标签 | 排除的地点类型 |
|----|------|----------------|
| `crowded` | 拥挤场所 | 热门景点、大型商场等人流密集处 |
| `noisy` | 嘈杂环境 | 夜店、KTV、繁华商业街等 |
| `expensive` | 高价项目 | 价格偏高的餐厅、演出等 |
| `remote` | 偏远地区 | 距离市中心较远的地点 |
| `outdoor` | 户外活动 | 公园、徒步路线等户外场所 |

---

## 预设系统

### 预设存储

预设数据存储在浏览器的 `localStorage` 中：

```typescript
const PRESETS_STORAGE_KEY = "citysense-recommendation-presets";
```

### 预设结构

```json
{
  "id": "preset-1719200000000-a1b2c3d",
  "name": "我的周末路线",
  "config": {
    "city": "上海",
    "area": "",
    "interests": ["咖啡", "展览", "书店"],
    "mood": "solo",
    "timeWindow": "weekend",
    "budget": "medium",
    "waypointCount": 3,
    "useRealtimeTraffic": false,
    "weights": {},
    "excludes": [],
    "useWeights": false,
    "useExcludes": false
  },
  "createdAt": 1719200000000,
  "updatedAt": 1719200000000
}
```

### 导出预设

导出的 JSON 文件格式：

```json
[
  {
    "id": "preset-1",
    "name": "预设名称",
    "config": { /* ... */ },
    "createdAt": 1719200000000,
    "updatedAt": 1719200000000
  }
]
```

### 导入预设

```tsx
import { useRecommendationPresets } from "@/hooks/useRecommendationPresets";

function MyComponent() {
  const { importPresets } = useRecommendationPresets();

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const importedPresets = await importPresets(file);
        console.log(`导入 ${importedPresets.length} 个预设`);
      } catch (error) {
        console.error("导入失败:", error);
      }
    }
  };

  return (
    <input type="file" accept=".json" onChange={handleImport} />
  );
}
```

---

## 样式定制

### CSS Modules

组件使用 CSS Modules 进行样式隔离，所有样式定义在 `AdvancedRecommendationControls.module.css` 中。

### 主要样式类

| 类名 | 说明 |
|------|------|
| `.advancedControlsWrapper` | 组件容器 |
| `.presetsBar` | 预设栏 |
| `.presetToggle` | 预设切换按钮 |
| `.field` | 字段容器 |
| `.fieldLabel` | 字段标签 |
| `.interestCategories` | 兴趣分类标签 |
| `.interestChip` | 兴趣标签 |
| `.moodCards` | 心情卡片容器 |
| `.moodCard` | 心情卡片 |
| `.timeOptions` | 时间选项容器 |
| `.budgetTiers` | 预算层级容器 |
| `.advancedSection` | 高级设置区域 |
| `.weightsSection` | 权重设置区域 |
| `.excludesSection` | 排除条件区域 |
| `.controlActions` | 操作按钮区域 |

### CSS 变量

组件使用 CSS 变量实现动态样式：

```css
/* 心情卡片颜色 */
--mood-color: #087f7a;
```

### 覆盖样式

可以通过以下方式覆盖样式：

#### 1. 全局 CSS

```css
/* globals.css */
.advancedControlsWrapper {
  --primary-color: #8b5cf6;
  --border-radius: 12px;
}
```

#### 2. 内联样式

```tsx
<AdvancedRecommendationControls
  values={input}
  onChange={setInput}
  onSubmit={handleSubmit}
  style={{ "--primary-color": "#6366f1" } as React.CSSProperties}
/>
```

#### 3. CSS Modules 覆盖

```css
/* MyComponent.module.css */
.wrapper :global(.advancedControlsWrapper) {
  background: #f8fafc;
}
```

### 响应式断点

```css
@media (max-width: 768px) {
  .moodCards {
    grid-template-columns: repeat(3, 1fr);
  }

  .timeOptions {
    grid-template-columns: repeat(2, 1fr);
  }

  .budgetTiers {
    grid-template-columns: 1fr;
  }
}
```

---

## API 集成

### 请求格式

将 `EnhancedRecommendationInput` 转换为 API 请求格式：

```typescript
const requestBody = {
  // 用户信息
  userId?: string;
  sessionId?: string;

  // 基础配置
  city: input.city,
  area: input.area || undefined,
  interests: input.interests,
  mood: input.mood,
  budget: input.budget,
  timeWindow: input.timeWindow,

  // 自定义时间
  customTimeWindow: input.timeWindow === "custom"
    ? input.customTimeWindow
    : undefined,

  // 路线配置
  waypointCount: input.waypointCount,
  useRealtimeTraffic: input.useRealtimeTraffic,
  useSocialSignals: true,

  // 高级配置
  weights: input.useWeights ? input.weights : undefined,
  excludes: input.useExcludes ? input.excludes : undefined,

  // 曝光记录（用于匿名用户多样性）
  recentExposure?: {
    itemIds?: string[];
    routeTitles?: string[];
  };
};
```

### API 调用示例

```typescript
async function submitRecommendation(input: EnhancedRecommendationInput) {
  const response = await fetch("/api/recommend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      city: input.city,
      area: input.area || undefined,
      interests: input.interests,
      mood: input.mood,
      budget: input.budget,
      timeWindow: input.timeWindow,
      customTimeWindow: input.timeWindow === "custom" ? input.customTimeWindow : undefined,
      waypointCount: input.waypointCount,
      useRealtimeTraffic: input.useRealtimeTraffic,
      useSocialSignals: true,
      weights: input.useWeights ? input.weights : undefined,
      excludes: input.useExcludes ? input.excludes : undefined
    })
  });

  if (!response.ok) {
    throw new Error("推荐失败");
  }

  return await response.json() as RecommendResponse;
}
```

### 响应格式

```typescript
interface RecommendResponse {
  routes: RecommendedRoute[];
  meta: {
    recommendationId?: string;
    candidateCount: number;
    trafficProvider: "amap" | "estimated";
    origin?: {
      lat?: number;
      lng?: number;
      label?: string;
      address?: string;
      source?: OriginSource;
      provider?: "amap" | "browser" | "default";
      status: "resolved" | "unresolved";
    };
    ranker?: string;
    rankerVersion?: string;
    recallChannels?: RecallChannel[];
    profileApplied?: {
      version: number;
      topFactors: string[];
      sampleSize: number;
      confidence: "low" | "medium" | "high";
      degraded: boolean;
    };
    generatedAt: string;
  };
}
```

---

## 事件处理

### 值变化事件

```tsx
const handleChange = (newValues: EnhancedRecommendationInput) => {
  // 可以在这里进行本地验证
  if (newValues.interests.length === 0) {
    // 处理空兴趣的情况
  }

  setInput(newValues);

  // 可选：防抖提交
  debouncedSubmit(newValues);
};
```

### 提交事件

```tsx
const handleSubmit = async () => {
  try {
    setLoading(true);

    // 构建请求体
    const requestBody = buildRequestBody(input);

    // 调用 API
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error("推荐失败");
    }

    const result = await response.json();

    // 处理结果
    setData(result);
  } catch (error) {
    console.error(error);
    // 显示错误提示
    alert("获取推荐失败，请稍后重试");
  } finally {
    setLoading(false);
  }
};
```

### 预设保存事件

```tsx
const handleSavePreset = (name: string) => {
  if (!name.trim()) {
    alert("请输入预设名称");
    return;
  }

  try {
    savePreset(name, input);
    alert("预设保存成功");
  } catch (error) {
    console.error(error);
    alert("预设保存失败");
  }
};
```

---

## 最佳实践

### 1. 初始化配置

```tsx
const defaultInput: EnhancedRecommendationInput = {
  city: "上海",
  area: "",
  interests: ["咖啡", "展览", "书店"],
  mood: "solo",
  timeWindow: "tonight",
  budget: "medium",
  waypointCount: 3,
  useRealtimeTraffic: false,
  weights: {
    distance: 30,
    rating: 40,
    popularity: 20,
    diversity: 10
  },
  excludes: [],
  useWeights: false,
  useExcludes: false
};

const [input, setInput] = useState(defaultInput);
```

### 2. 表单验证

```tsx
const validateInput = (input: EnhancedRecommendationInput): string[] => {
  const errors: string[] = [];

  if (!input.city.trim()) {
    errors.push("请输入城市名称");
  }

  if (input.interests.length === 0) {
    errors.push("请至少选择一个兴趣");
  }

  if (input.interests.length > 10) {
    errors.push("最多选择10个兴趣");
  }

  if (input.waypointCount < 2 || input.waypointCount > 8) {
    errors.push("途径点数量应在2-8之间");
  }

  if (input.timeWindow === "custom") {
    if (!input.customTimeWindow?.date) {
      errors.push("请选择日期");
    }
    if (!input.customTimeWindow?.startHour || !input.customTimeWindow?.endHour) {
      errors.push("请选择开始和结束时间");
    }
  }

  return errors;
};
```

### 3. 防抖提交

```tsx
import { useCallback } from "react";

const debouncedSubmit = useCallback(
  debounce(async (input: EnhancedRecommendationInput) => {
    // 提交逻辑
  }, 500),
  []
);
```

### 4. 错误处理

```tsx
const handleSubmit = async () => {
  try {
    // 验证输入
    const errors = validateInput(input);
    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }

    // 提交请求
    const result = await submitRecommendation(input);

    // 处理成功
    setData(result);
  } catch (error) {
    // 处理错误
    if (error instanceof Error) {
      console.error(error.message);
      // 显示用户友好的错误信息
    }
  }
};
```

### 5. 性能优化

```tsx
// 使用 useMemo 缓存计算结果
const validPresets = useMemo(
  () => presets.filter(p => p.name.includes(searchTerm)),
  [presets, searchTerm]
);

// 使用 useCallback 避免不必要的重渲染
const handleChange = useCallback(
  (newValues: EnhancedRecommendationInput) => {
    setInput(newValues);
  },
  []
);
```

### 6. 无障碍支持

组件已经内置了无障碍支持，包括：

- `aria-label` 属性
- 键盘导航支持
- 焦点管理
- 屏幕阅读器友好

### 7. 测试

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { AdvancedRecommendationControls } from "@/components/AdvancedRecommendationControls";

describe("AdvancedRecommendationControls", () => {
  it("应该渲染兴趣标签", () => {
    render(
      <AdvancedRecommendationControls
        values={mockInput}
        onChange={jest.fn()}
        onSubmit={jest.fn()}
      />
    );

    expect(screen.getByText("咖啡")).toBeInTheDocument();
    expect(screen.getByText("展览")).toBeInTheDocument();
  });

  it("应该能够切换兴趣标签", () => {
    const handleChange = jest.fn();
    render(
      <AdvancedRecommendationControls
        values={mockInput}
        onChange={handleChange}
        onSubmit={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText("咖啡"));
    expect(handleChange).toHaveBeenCalled();
  });
});
```

---

## 配置示例

### 示例 1：安静独处

```typescript
const quietSolo: EnhancedRecommendationInput = {
  city: "上海",
  area: "徐汇",
  interests: ["咖啡", "书店", "公园"],
  mood: "quiet",
  timeWindow: "weekend",
  budget: "medium",
  waypointCount: 3,
  useRealtimeTraffic: false,
  weights: {
    distance: 50,
    rating: 30,
    popularity: 10,
    diversity: 10
  },
  excludes: ["crowded", "noisy"],
  useWeights: true,
  useExcludes: true
};
```

### 示例 2：热闹聚会

```typescript
const livelyGathering: EnhancedRecommendationInput = {
  city: "上海",
  area: "黄浦",
  interests: ["火锅", "夜生活", "LiveHouse"],
  mood: "lively",
  timeWindow: "tonight",
  budget: "high",
  waypointCount: 4,
  useRealtimeTraffic: true,
  weights: {
    distance: 20,
    rating: 40,
    popularity: 35,
    diversity: 5
  },
  excludes: [],
  useWeights: true,
  useExcludes: false
};
```

### 示例 3：文艺约会

```typescript
const romanticDate: EnhancedRecommendationInput = {
  city: "上海",
  area: "静安",
  interests: ["展览", "美术馆", "文创店"],
  mood: "date",
  timeWindow: "weekend",
  budget: "high",
  waypointCount: 3,
  useRealtimeTraffic: true,
  weights: {
    distance: 30,
    rating: 50,
    popularity: 15,
    diversity: 5
  },
  excludes: ["crowded"],
  useWeights: true,
  useExcludes: true
};
```

### 示例 4：自定义时间

```typescript
const customTime: EnhancedRecommendationInput = {
  city: "上海",
  area: "",
  interests: ["咖啡", "书店"],
  mood: "solo",
  timeWindow: "custom",
  customTimeWindow: {
    date: "2024-07-20",
    startHour: "14:00",
    endHour: "18:00"
  },
  budget: "medium",
  waypointCount: 3,
  useRealtimeTraffic: false,
  weights: {},
  excludes: [],
  useWeights: false,
  useExcludes: false
};
```

---

## 注意事项

1. **后端兼容性**
   - 确保后端 API 支持 `custom` 时间窗口
   - 确保后端 API 支持 `weights` 和 `excludes` 参数

2. **本地存储限制**
   - 预设存储在 localStorage 中，容量有限（通常 5-10MB）
   - 清除浏览器缓存会丢失预设数据
   - 建议提供导出备份功能

3. **权重总和**
   - 权重总和建议为 100%，但不是强制要求
   - 组件会显示权重总和警告提示

4. **响应式设计**
   - 移动端布局会自动调整
   - 某些功能在小屏幕上可能需要折叠

5. **浏览器兼容性**
   - 需要 ES6+ 支持
   - 需要 CSS Grid 和 Flexbox 支持
   - 推荐使用现代浏览器

---

## 常见问题

### Q: 如何添加新的兴趣标签？

A: 组件支持通过输入框添加自定义兴趣标签，用户可以直接在界面中添加。

### Q: 预设数据可以同步到服务器吗？

A: 当前版本预设存储在本地 localStorage，如需服务器同步，需要修改 `useRecommendationPresets` Hook。

### Q: 如何禁用某些功能？

A: 可以通过 props 控制功能显示，或在组件内部修改条件渲染逻辑。

### Q: 支持多城市切换吗？

A: 支持，通过 `city` 字段控制，可以结合城市选择器使用。

### Q: 如何集成到现有项目？

A: 参考 `EnhancedWorkspaceControls` 组件，它提供了与现有 `RecommendationWorkspace` 集成的方案。

---

## 相关文档

- [高级推荐控制功能文档](./advanced-recommendation-controls.md)
- [快速开始指南](./advanced-controls-quickstart.md)
- [优化总结](./recommendation-ui-optimization-summary.md)