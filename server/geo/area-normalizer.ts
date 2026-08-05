import { ALL_DISTRICT_SET, getDistrictsForCity } from "@/lib/city-districts";

/**
 * 规范化输入文本：去掉城市前缀（"上海市"/"北京市"/"上海市闵行" 等），保留区域名。
 * 只在带"市"字时剥离前缀，避免把"闵行""朝阳"这种 2 字区名误当城市前缀吃掉。
 */
function normalizeText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const text = value.trim();

  // 形如 "上海市静安区" / "北京市朝阳区" —— 带"市"分隔的城市前缀才剥离。
  const cityPrefixed = text.match(/^[\u4e00-\u9fa5]{2,3}市(.+)$/);

  if (cityPrefixed) {
    return cityPrefixed[1] || undefined;
  }

  return text || undefined;
}

export function canonicalizeArea(value?: string | null) {
  const text = normalizeText(value);

  if (!text) {
    return undefined;
  }

  if (text === "浦东新区") {
    return "浦东";
  }

  const withoutDistrictSuffix = text.endsWith("区") ? text.slice(0, -1) : text;

  if (ALL_DISTRICT_SET.has(withoutDistrictSuffix)) {
    return withoutDistrictSuffix;
  }

  return text;
}

export function areaVariants(value?: string | null) {
  const canonical = canonicalizeArea(value);

  if (!canonical) {
    return [];
  }

  const variants = new Set([canonical]);

  if (canonical === "浦东") {
    variants.add("浦东新区");
  } else if (ALL_DISTRICT_SET.has(canonical)) {
    variants.add(`${canonical}区`);
  }

  return [...variants];
}

export function areasMatch(candidateArea?: string | null, requestedArea?: string | null) {
  const requested = canonicalizeArea(requestedArea);

  if (!requested) {
    return true;
  }

  return canonicalizeArea(candidateArea) === requested;
}

export function textMentionsArea(text: string, area?: string | null) {
  const variants = areaVariants(area);

  return variants.some((variant) => text.includes(variant));
}
