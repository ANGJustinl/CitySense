/**
 * 各城市的行政区规范列表（client/server 共享）。
 *
 * 值采用 bare canonical 形式（"静安" 而非 "静安区"），与数据库存储的
 * 规范 area 值以及 server/geo/area-normalizer.ts 的 canonicalizeArea 输出对齐。
 * 后端 areaVariants() 会自动展开成 ["静安", "静安区"] 做模糊匹配。
 */

export const SHANGHAI_DISTRICTS = [
  "黄浦",
  "徐汇",
  "长宁",
  "静安",
  "普陀",
  "虹口",
  "杨浦",
  "浦东",
  "闵行",
  "宝山",
  "嘉定",
  "金山",
  "松江",
  "青浦",
  "奉贤",
  "崇明"
] as const;

export const BEIJING_DISTRICTS = [
  "东城",
  "西城",
  "朝阳",
  "海淀",
  "丰台",
  "石景山",
  "通州",
  "昌平",
  "大兴",
  "顺义",
  "房山",
  "门头沟",
  "平谷",
  "密云",
  "怀柔",
  "延庆"
] as const;

const CITY_DISTRICT_MAP: Record<string, readonly string[]> = {
  上海: SHANGHAI_DISTRICTS,
  北京: BEIJING_DISTRICTS
};

/** 所有已知城市的区名合并集合，用于 area 规范化匹配。 */
export const ALL_DISTRICT_SET = new Set<string>([
  ...SHANGHAI_DISTRICTS,
  ...BEIJING_DISTRICTS
]);

/**
 * 按城市名获取可预选的行政区列表。
 * 支持模糊匹配（"上海市" / "北京市辖区" 都归一到 "上海"/"北京"）。
 * 未知城市返回空数组 —— 调用方可回退到自由文本输入。
 */
export function getDistrictsForCity(city?: string | null): readonly string[] {
  if (!city) {
    return [];
  }

  const normalized = city.trim().replace(/市$/, "");
  return CITY_DISTRICT_MAP[normalized] ?? [];
}
