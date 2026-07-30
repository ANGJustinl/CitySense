export const HEAT_CATEGORIES = [
  {
    id: "coffee",
    label: "咖啡",
    color: "#087f7a",
    keywords: ["咖啡", "咖啡厅", "甜品", "面包", "烘焙", "bakery"]
  },
  {
    id: "food",
    label: "美食",
    color: "#c7583a",
    keywords: ["美食", "餐厅", "小吃", "市集", "甜品", "面包", "烘焙"]
  },
  {
    id: "culture",
    label: "文化",
    color: "#7c5cc4",
    keywords: ["展览", "美术馆", "博物馆", "艺术", "文化", "画廊"]
  },
  {
    id: "bookstore",
    label: "书店",
    color: "#b78419",
    keywords: ["书店", "阅读", "漫画", "图书"]
  },
  {
    id: "music",
    label: "演出",
    color: "#2563eb",
    keywords: ["独立音乐", "livehouse", "演出", "音乐", "夜生活", "酒吧"]
  },
  {
    id: "quiet",
    label: "安静",
    color: "#5f8f64",
    keywords: ["安静", "公园", "散步", "疗愈", "solo"]
  }
] as const;

export type HeatCategoryId = (typeof HEAT_CATEGORIES)[number]["id"];

export const DEFAULT_HEAT_CATEGORY_IDS = HEAT_CATEGORIES.map((category) => category.id);

const FALLBACK_CATEGORY: HeatCategoryId = "coffee";

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

export function heatCategoryForTags(input: {
  tags?: string[];
  source?: string | null;
  quietness?: number | null;
}): HeatCategoryId {
  const haystack = [
    ...(input.tags ?? []),
    input.source ?? "",
    input.quietness !== null && input.quietness !== undefined && input.quietness >= 72 ? "安静" : ""
  ]
    .map(normalizeToken)
    .filter(Boolean);

  for (const category of HEAT_CATEGORIES) {
    if (
      category.keywords.some((keyword) => {
        const normalizedKeyword = normalizeToken(keyword);

        return haystack.some((token) => token.includes(normalizedKeyword));
      })
    ) {
      return category.id;
    }
  }

  return FALLBACK_CATEGORY;
}

export function heatCategoryById(id: string | undefined) {
  return HEAT_CATEGORIES.find((category) => category.id === id) ?? HEAT_CATEGORIES[0];
}
