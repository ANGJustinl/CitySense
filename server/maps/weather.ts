/**
 * 高德天气 adapter（TASK-P2-004 AI 助手增强）。
 *
 * 复用 AMAP_API_KEY 调用高德天气查询 API（v3/weather/weatherInfo）。
 * extensions=all 返回预报数据；extensions=base 返回实况。
 * 10 分钟内存缓存，同 traffic-cache 模式，避免频繁调用。
 *
 * 文档：https://lbs.amap.com/api/webservice/guide/services/weather
 */

export type WeatherInfo = {
  city: string;
  district?: string;
  phenomenon: string;
  temperature: string;
  windDirection: string;
  windPower: string;
  humidity: string;
  reportTime: string;
};

export type WeatherForecast = {
  date: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: string;
  nightTemp: string;
  dayWind: string;
};

export type WeatherResult = {
  city: string;
  live: WeatherInfo;
  forecast: WeatherForecast[];
  cachedAt: number;
};

const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: WeatherResult; expiresAt: number }>();

function amapKey() {
  return process.env.AMAP_API_KEY ?? "";
}

export function hasAmapKey() {
  return amapKey().length > 0;
}

/**
 * 查询城市/区域天气。city 支持城市名（上海）或 adcode（310000）。
 * area 可选，用于细化到区级。返回实况 + 预报。
 */
export async function getWeather(input: {
  city: string;
  area?: string;
}): Promise<WeatherResult | null> {
  const { city, area } = input;
  if (!hasAmapKey()) {
    return null;
  }

  const cacheKey = `${city}:${area ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  try {
    // 先 geocode 城市名拿到 adcode，高德天气需要 adcode。
    // 常见城市直接用城市名也能查，但 adcode 更可靠。
    const adcode = await resolveAdcode(city, area);

    const params = new URLSearchParams({
      key: amapKey(),
      city: adcode,
      extensions: "all"
    });

    const response = await fetch(
      `https://restapi.amap.com/v3/weather/weatherInfo?${params}`,
      { next: { revalidate: 600 } }
    );

    const data = (await response.json()) as {
      status?: string;
      lives?: Array<Record<string, string>>;
      forecasts?: Array<{
        casts?: Array<Record<string, string>>;
      }>;
    };

    if (data.status !== "1" || !data.forecasts?.[0]?.casts) {
      return null;
    }

    const casts = data.forecasts[0].casts;
    const liveRaw = data.lives?.[0];

    const live: WeatherInfo = {
      city,
      district: area,
      phenomenon: liveRaw?.weather ?? casts[0]?.dayweather ?? "未知",
      temperature: liveRaw?.temperature ?? casts[0]?.daytemp ?? "—",
      windDirection: liveRaw?.winddirection ?? "—",
      windPower: liveRaw?.windpower ?? casts[0]?.daypower ?? "—",
      humidity: liveRaw?.humidity ?? "—",
      reportTime: liveRaw?.reporttime ?? new Date().toISOString()
    };

    const forecast: WeatherForecast[] = casts.map((cast) => ({
      date: cast.date ?? "",
      dayWeather: cast.dayweather ?? "",
      nightWeather: cast.nightweather ?? "",
      dayTemp: cast.daytemp ?? "",
      nightTemp: cast.nighttemp ?? "",
      dayWind: cast.daywind ?? ""
    }));

    const result: WeatherResult = {
      city,
      live,
      forecast,
      cachedAt: Date.now()
    };

    cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + WEATHER_CACHE_TTL_MS
    });

    return result;
  } catch {
    return null;
  }
}

/**
 * 通过高德地理编码 API 把城市/区域名解析为 adcode。
 * 常见城市名（上海/静安）高德天气 API 也能直接接受，adcode 更精确。
 */
async function resolveAdcode(city: string, area?: string): Promise<string> {
  // 高德天气 API 的 city 参数接受城市名或 adcode。
  // 区级查询需要 adcode，但城市名本身就能返回市级天气，足够助手使用。
  // 优先用 area（更细粒度），回退到 city。
  const query = area ?? city;

  try {
    const params = new URLSearchParams({
      key: amapKey(),
      address: query
    });

    const response = await fetch(
      `https://restapi.amap.com/v3/geocode/geo?${params}`,
      { next: { revalidate: 86400 } }
    );

    const data = (await response.json()) as {
      status?: string;
      geocodes?: Array<{ adcode?: string }>;
    };

    const adcode = data.geocodes?.[0]?.adcode;
    return adcode ?? city;
  } catch {
    return city;
  }
}
