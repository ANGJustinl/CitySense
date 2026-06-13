const SHANGHAI_DISTRICTS = [
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

const SHANGHAI_DISTRICT_SET = new Set<string>(SHANGHAI_DISTRICTS);

function normalizeText(value?: string | null) {
  return value?.trim().replace(/^上海市?/, "") || undefined;
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

  if (SHANGHAI_DISTRICT_SET.has(withoutDistrictSuffix)) {
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
  } else if (SHANGHAI_DISTRICT_SET.has(canonical)) {
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
