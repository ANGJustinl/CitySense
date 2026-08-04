import type { RecommendedRoute } from "@/server/recommendation/types";

export type WeatherScene =
  | "storm"
  | "rain"
  | "fog"
  | "heat"
  | "cloudy"
  | "clear"
  | "unknown";

export type WeatherTemperatureLevel = "hot" | "warm" | "mild" | "cold" | "unknown";

export type RouteWeatherRouteEffect = {
  glowColor?: string;
  glowOpacity: number;
  glowWeight: number;
  selectedStrokeWeight: number;
};

export type RouteWeatherImpact = {
  tone: "good" | "ok" | "poor" | "unknown";
  scene: WeatherScene;
  temperatureLevel: WeatherTemperatureLevel;
  atmosphereClass: string;
  routeEffect: RouteWeatherRouteEffect;
  sourceLabel: string;
  title: string;
  value: string;
  copy: string;
  intensity: number;
  effect: string;
};

type WeatherFactParts = {
  phenomenon?: string;
  temperature?: number;
};

type WeatherPlace = {
  kind?: "origin" | "stop";
  name?: string;
  tags?: string[];
};

const ROUTE_EFFECT_BY_SCENE: Record<WeatherScene, RouteWeatherRouteEffect> = {
  storm: {
    glowColor: "#4c8fdc",
    glowOpacity: 0.42,
    glowWeight: 32,
    selectedStrokeWeight: 10
  },
  rain: {
    glowColor: "#4c8fdc",
    glowOpacity: 0.36,
    glowWeight: 28,
    selectedStrokeWeight: 10
  },
  fog: {
    glowColor: "#7c8fa0",
    glowOpacity: 0.34,
    glowWeight: 30,
    selectedStrokeWeight: 9
  },
  heat: {
    glowColor: "#e67836",
    glowOpacity: 0.34,
    glowWeight: 28,
    selectedStrokeWeight: 9
  },
  cloudy: {
    glowColor: "#6b8794",
    glowOpacity: 0.28,
    glowWeight: 26,
    selectedStrokeWeight: 9
  },
  clear: {
    glowColor: "#0a9d92",
    glowOpacity: 0.3,
    glowWeight: 26,
    selectedStrokeWeight: 9
  },
  unknown: {
    glowOpacity: 0.24,
    glowWeight: 24,
    selectedStrokeWeight: 9
  }
};

const OUTDOOR_PATTERN =
  /户外|公园|市集|集市|街区|露天|滨江|江边|海边|广场|步道|骑行|citywalk|徒步|野餐|夜市|花园|露营|球场|滑板|跑步|河岸|露台/i;
const INDOOR_PATTERN =
  /室内|展览|美术馆|博物馆|书店|咖啡|餐厅|饭店|酒吧|livehouse|剧院|影院|商场|购物|画廊|艺术|手作|茶馆|剧场|馆|店/i;

function normalizeWeatherText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function parseWeatherFact(value: string): WeatherFactParts {
  const normalized = normalizeWeatherText(value);
  const bracketMatch = normalized.match(/[（(]([^（）()]+)[）)]/);
  const detail = bracketMatch?.[1] ?? normalized;
  const temperatureMatch = detail.match(/(-?\d+(?:\.\d+)?)\s*°/);
  const phenomenon = detail
    .replace(/-?\d+(?:\.\d+)?\s*°/g, "")
    .replace(/天气|适合出行|天气一般|天气扰动|友好|未接入|未缓存/g, "")
    .replace(/[：:；;，,。]/g, " ")
    .trim();

  return {
    phenomenon: phenomenon || undefined,
    temperature: temperatureMatch ? Number(temperatureMatch[1]) : undefined
  };
}

export function weatherSceneForFact(value: string, fit: RouteWeatherImpact["tone"]): WeatherScene {
  if (/未接入|未缓存|失败|暂无/.test(value)) {
    return "unknown";
  }

  const normalized = normalizeWeatherText(value);
  const { phenomenon, temperature } = parseWeatherFact(normalized);
  const text = [normalized, phenomenon].filter(Boolean).join(" ");

  if (/暴雨|大雨|雷|雪|冰雹|台风|强对流/.test(text)) return "storm";
  if (/雨|阵雨|雨夹雪/.test(text)) return "rain";
  if (/雾|霾|沙尘|浮尘|扬沙/.test(text)) return "fog";
  if (/高温|炎热|酷热/.test(text) || (typeof temperature === "number" && temperature >= 32)) {
    return "heat";
  }
  if (/阴|多云|云/.test(text)) return "cloudy";
  if (/晴/.test(text)) return "clear";

  if (fit === "good") return "clear";
  if (fit === "poor") return "fog";
  if (fit === "ok") return "cloudy";

  return "unknown";
}

function temperatureLevel(temperature?: number): WeatherTemperatureLevel {
  if (typeof temperature !== "number" || !Number.isFinite(temperature)) return "unknown";
  if (temperature >= 34) return "hot";
  if (temperature >= 30) return "warm";
  if (temperature <= 8) return "cold";
  return "mild";
}

function weatherCopy(scene: WeatherScene, fit: RouteWeatherImpact["tone"]) {
  if (scene === "storm") return "强天气已计入排序，户外和长步行明显降权。";
  if (scene === "rain") return "降雨已计入排序，路线优先保留可避雨站点。";
  if (scene === "fog") return "能见度和体感扰动已计入，步行风险降低权重。";
  if (scene === "heat") return "高温已计入排序，暴晒和长步行被压低。";
  if (scene === "cloudy") return "阴云天气进入路线判断，户外权重保持克制。";
  if (scene === "clear") return "天气友好，户外和街区站点保持正常权重。";
  if (fit === "unknown") return "暂无可用天气快照，本次推荐未使用天气调整。";
  return "天气已进入路线排序。";
}

function weatherTitle(scene: WeatherScene, fit: RouteWeatherImpact["tone"]) {
  if (scene === "storm") return "强天气扰动";
  if (scene === "rain") return "降雨中";
  if (scene === "fog") return "雾霾扰动";
  if (scene === "heat") return "高温提醒";
  if (scene === "cloudy") return "阴云天气";
  if (scene === "clear") return "天气友好";
  if (fit === "unknown") return "天气未参与";
  return "天气状态";
}

function weatherEffect(scene: WeatherScene, fit: RouteWeatherImpact["tone"]) {
  if (scene === "storm") return "强避户外";
  if (scene === "rain") return "避雨优先";
  if (scene === "fog") return "降低步行";
  if (scene === "heat") return "避开暴晒";
  if (scene === "cloudy") return fit === "good" ? "稳定出行" : "轻避户外";
  if (scene === "clear") return "户外加成";
  return "未计入";
}

function sourceLabel(source?: string) {
  if (!source) return "天气快照";
  if (source.includes("amap")) return "高德天气";
  if (source.includes("weather")) return "实时天气";
  return "天气快照";
}

function weatherIntensity(scene: WeatherScene, fit: RouteWeatherImpact["tone"]) {
  if (scene === "storm") return 86;
  if (scene === "rain") return 72;
  if (scene === "fog") return 64;
  if (scene === "heat") return 70;
  if (scene === "cloudy") return fit === "good" ? 58 : 52;
  if (scene === "clear") return 88;
  return 8;
}

export function getRouteWeatherImpact(route?: RecommendedRoute): RouteWeatherImpact {
  const fit = route?.momentFit?.weatherFit ?? "unknown";
  const fact = route?.momentFit?.facts.find((item) => item.label === "天气");
  const value = fact?.value ?? "未缓存";
  const scene = weatherSceneForFact(value, fit);
  const { temperature } = parseWeatherFact(value);
  const base = {
    tone: fit,
    scene,
    temperatureLevel: temperatureLevel(temperature),
    atmosphereClass: scene === "unknown" ? "" : `weather-scene-${scene}`,
    routeEffect: ROUTE_EFFECT_BY_SCENE[scene],
    sourceLabel: sourceLabel(fact?.source),
    title: weatherTitle(scene, fit),
    value,
    copy: weatherCopy(scene, fit),
    intensity: weatherIntensity(scene, fit),
    effect: weatherEffect(scene, fit)
  };

  if (fit === "good") {
    return {
      ...base,
      tone: "good"
    };
  }

  if (fit === "ok") {
    return {
      ...base,
      tone: "ok"
    };
  }

  if (fit === "poor") {
    return {
      ...base,
      tone: "poor"
    };
  }

  return {
    ...base,
    tone: "unknown"
  };
}

export function getWeatherMarkerClass(weather: RouteWeatherImpact, place?: WeatherPlace) {
  if (!place || place.kind === "origin" || weather.scene === "unknown") {
    return "weather-neutral";
  }

  const text = [place.name, ...(place.tags ?? [])].filter(Boolean).join(" ");
  const isIndoor = INDOOR_PATTERN.test(text);
  const isOutdoor = OUTDOOR_PATTERN.test(text);

  if (weather.scene === "clear") {
    return isOutdoor ? "weather-clear" : "weather-neutral";
  }

  if (weather.scene === "rain" || weather.scene === "storm" || weather.scene === "fog" || weather.scene === "heat") {
    if (isIndoor) return "weather-shelter";
    if (isOutdoor) return "weather-risk";
  }

  if (weather.scene === "cloudy" && isOutdoor && weather.tone !== "good") {
    return "weather-soft-risk";
  }

  return "weather-neutral";
}

export const __testing = {
  getWeatherMarkerClass,
  parseWeatherFact,
  weatherSceneForFact
};
