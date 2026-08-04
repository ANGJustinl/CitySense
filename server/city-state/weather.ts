import { getWeather, type WeatherResult } from "@/server/maps/weather";
import type { CityConditionDraft } from "@/server/city-state/types";

const WEATHER_TTL_MS = 45 * 60 * 1000;

function clamp(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function expiresAt(now: Date) {
  return new Date(now.getTime() + WEATHER_TTL_MS);
}

function phenomenonScore(phenomenon: string) {
  if (/暴雨|大雨|雷|雪|冰雹|台风|沙尘/.test(phenomenon)) {
    return {
      score: 30,
      label: "天气扰动"
    };
  }

  if (/雨|阵雨|雾|霾/.test(phenomenon)) {
    return {
      score: 52,
      label: "天气一般"
    };
  }

  if (/晴|多云|阴/.test(phenomenon)) {
    return {
      score: 82,
      label: "适合出行"
    };
  }

  return {
    score: 62,
    label: "天气待观察"
  };
}

export function buildWeatherCondition(input: {
  city: string;
  area?: string;
  weather: WeatherResult | null;
  now?: Date;
}): CityConditionDraft {
  const now = input.now ?? new Date();

  if (!input.weather) {
    return {
      city: input.city,
      area: input.area,
      condition: "weather",
      score: 50,
      label: "天气未接入",
      source: "amap-weather",
      confidence: 0.2,
      metadata: {
        degraded: true,
        reason: "AMAP_API_KEY missing or weather request failed"
      },
      capturedAt: now,
      expiresAt: expiresAt(now)
    };
  }

  const live = input.weather.live;
  const scored = phenomenonScore(live.phenomenon);
  const temp = Number(live.temperature);
  const tempPenalty = Number.isFinite(temp) && (temp >= 35 || temp <= 2) ? 12 : 0;

  return {
    city: input.city,
    area: input.area,
    condition: "weather",
    score: clamp(scored.score - tempPenalty),
    label: scored.label,
    source: "amap-weather",
    confidence: 0.86,
    metadata: {
      phenomenon: live.phenomenon,
      temperature: live.temperature,
      humidity: live.humidity,
      windDirection: live.windDirection,
      windPower: live.windPower,
      reportTime: live.reportTime,
      forecast: input.weather.forecast.slice(0, 3)
    },
    capturedAt: now,
    expiresAt: expiresAt(now)
  };
}

export async function refreshWeatherCondition(input: {
  city: string;
  area?: string;
  now?: Date;
}) {
  const weather = await getWeather({
    city: input.city,
    area: input.area
  });

  return buildWeatherCondition({
    ...input,
    weather
  });
}

export const __testing = {
  buildWeatherCondition
};
