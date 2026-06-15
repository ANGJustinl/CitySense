#!/usr/bin/env node

/**
 * 高德地图 API 数据获取脚本
 *
 * 用途：
 * - POI 搜索：搜索指定城市的兴趣点
 * - 路径规划：获取两点间的步行、驾车、公交路线
 * - 地理编码：地址与坐标互转
 * - 行政区划查询：获取城市/区县边界
 *
 * 使用方法：
 * ```bash
 * node --env-file=.env --import tsx tools/amap-data-fetcher.ts
 * ```
 */

import { URLSearchParams } from "node:url";

// ============================================================================
// 类型定义
// ============================================================================

type Point = {
  lat: number;
  lng: number;
};

type TravelMode = "walking" | "driving" | "transit";

type POIResult = {
  id: string;
  name: string;
  address?: string;
  tel?: string;
  distance?: string;
  type?: string;
  typecode?: string;
  location: Point;
  pcode?: string; // 省份编码
  adcode?: string; // 区域编码
  pname?: string; // 省份名称
  cityname?: string; // 城市名称
  adname?: string; // 区域名称
  business?: string; // 商圈
};

type RoutePath = {
  distance: number; // 米
  duration: number; // 秒
  steps?: RouteStep[];
  polyline?: string;
};

type RouteStep = {
  instruction?: string;
  road?: string;
  distance?: number;
  duration?: number;
  action?: string;
  polyline?: string;
};

type RouteResult = {
  origin: Point;
  destination: Point;
  mode: TravelMode;
  distance: number;
  duration: number;
  congestion: "smooth" | "moderate" | "busy";
  steps: RouteStep[];
  polyline: Point[];
};

type GeocodeResult = {
  formattedAddress: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  township?: string;
  adcode?: string;
  level?: string;
  location: Point;
};

type DistrictResult = {
  adcode: string;
  name: string;
  level: string;
  center: Point;
  boundaries: string[]; // 多边形边界坐标
};

// ============================================================================
// 高德 API 客户端
// ============================================================================

class AmapClient {
  private apiKey: string;
  private baseUrl = "https://restapi.amap.com/v3";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(endpoint: string, params: Record<string, string | number>): Promise<T | null> {
    const urlParams = new URLSearchParams({
      key: this.apiKey,
      output: "json",
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      )
    });

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}?${urlParams.toString()}`);
      const data = await response.json() as { status: string; info: string; infocode: string; [key: string]: unknown };

      if (data.status !== "1") {
        console.error(`高德 API 错误: ${data.info} (${data.infocode})`);
        return null;
      }

      return data as T;
    } catch (error) {
      console.error(`请求失败:`, error);
      return null;
    }
  }

  /**
   * POI 搜索
   */
  async searchPOI(params: {
    keywords: string;
    city: string;
    citylimit?: boolean;
    offset?: number;
    page?: number;
    extensions?: "base" | "all";
  }): Promise<POIResult[]> {
    const response = await this.fetch<{
      pois?: Array<{
        id: string;
        name: string;
        address?: string;
        tel?: string;
        distance?: string;
        type?: string;
        typecode?: string;
        location?: string;
        pcode?: string;
        adcode?: string;
        pname?: string;
        cityname?: string;
        adname?: string;
        business?: string;
      }>;
    }>("/place/text", params);

    if (!response?.pois) {
      return [];
    }

    return response.pois
      .map((poi) => {
        const [lng, lat] = poi.location?.split(",").map(Number) || [0, 0];
        return {
          id: poi.id,
          name: poi.name,
          address: poi.address,
          tel: poi.tel,
          distance: poi.distance,
          type: poi.type,
          typecode: poi.typecode,
          location: { lat, lng },
          pcode: poi.pcode,
          adcode: poi.adcode,
          pname: poi.pname,
          cityname: poi.cityname,
          adname: poi.adname,
          business: poi.business
        };
      })
      .filter((poi): poi is POIResult => poi.id !== "");
  }

  /**
   * 周边搜索
   */
  async searchNearby(params: {
    keywords: string;
    location: Point;
    radius?: number;
    offset?: number;
    page?: number;
  }): Promise<POIResult[]> {
    return this.searchPOI({
      ...params,
      keywords: params.keywords,
      city: `${params.location.lng},${params.location.lat}`
    });
  }

  /**
   * 路径规划
   */
  async getRoute(params: {
    origin: Point;
    destination: Point;
    mode: TravelMode;
    city?: string;
  }): Promise<RouteResult | null> {
    const endpoint = `/direction/${params.mode}`;
    const response = await this.fetch<{
      route?: {
        paths?: Array<{
          distance?: string;
          duration?: string;
          steps?: Array<{
            instruction?: string;
            road?: string;
            distance?: string;
            duration?: string;
            action?: string;
            polyline?: string;
          }>;
          polyline?: string;
        }>;
        transits?: Array<{
          distance?: string;
          duration?: string;
          segments?: Array<{
            walking?: {
              distance?: string;
              duration?: string;
              steps?: RouteStep[];
            };
            bus?: {
              buslines?: Array<{
                name?: string;
                duration?: string;
                distance?: string;
                polyline?: string;
                departure_stop?: { name?: string };
                arrival_stop?: { name?: string };
              }>;
            };
          }>;
        }>;
      };
    }>(endpoint, {
      origin: `${params.origin.lng},${params.origin.lat}`,
      destination: `${params.destination.lng},${params.destination.lat}`,
      city: params.city || ""
    });

    if (!response?.route) {
      return null;
    }

    const isTransit = params.mode === "transit";
    const routeData = isTransit
      ? response.route.transits?.[0]
      : response.route.paths?.[0];

    if (!routeData) {
      return null;
    }

    const distance = Number(routeData.distance) || 0;
    const duration = Number(routeData.duration) || 0;
    const congestion = duration <= 1200 ? "smooth" : duration <= 2400 ? "moderate" : "busy";

    // 解析 polyline
    const polyline = this.parsePolyline(isTransit ? undefined : routeData.polyline);

    // 解析步骤
    const steps: RouteStep[] = [];

    if (isTransit && response.route.transits?.[0]?.segments) {
      // 公交路线解析
      for (const segment of response.route.transits[0].segments || []) {
        if (segment.walking?.steps) {
          steps.push(...segment.walking.steps.map((s) => ({
            instruction: s.instruction,
            road: s.road,
            distance: Number(s.distance),
            duration: Number(s.duration),
            action: s.action
          })));
        }
        if (segment.bus?.buslines) {
          for (const busline of segment.bus.buslines.slice(0, 1)) {
            steps.push({
              instruction: `乘坐 ${busline.name || "公交"}`,
              road: `${busline.departure_stop?.name} → ${busline.arrival_stop?.name}`,
              distance: Number(busline.distance),
              duration: Number(busline.duration)
            });
            // 添加公交线 polyline
            if (busline.polyline) {
              polyline.push(...this.parsePolyline(busline.polyline));
            }
          }
        }
      }
    } else if (routeData.steps) {
      // 步行/驾车路线解析
      steps.push(
        ...routeData.steps.map((s) => ({
          instruction: s.instruction,
          road: s.road,
          distance: Number(s.distance),
          duration: Number(s.duration),
          action: s.action,
          polyline: s.polyline
        }))
      );
    }

    return {
      origin: params.origin,
      destination: params.destination,
      mode: params.mode,
      distance,
      duration,
      congestion,
      steps: steps.slice(0, 20),
      polyline: polyline.slice(0, 240)
    };
  }

  /**
   * 地理编码（地址 → 坐标）
   */
  async geocode(params: {
    address: string;
    city?: string;
  }): Promise<GeocodeResult | null> {
    const response = await this.fetch<{
      geocodes?: Array<{
        formatted_address?: string;
        country?: string;
        province?: string;
        city?: string;
        district?: string;
        township?: string;
        adcode?: string;
        level?: string;
        location?: string;
      }>;
    }>("/geocode/geo", params);

    const geocode = response?.geocodes?.[0];
    if (!geocode) {
      return null;
    }

    const [lng, lat] = geocode.location?.split(",").map(Number) || [0, 0];

    return {
      formattedAddress: geocode.formatted_address || "",
      country: geocode.country,
      province: geocode.province,
      city: geocode.city,
      district: geocode.district,
      township: geocode.township,
      adcode: geocode.adcode,
      level: geocode.level,
      location: { lat, lng }
    };
  }

  /**
   * 逆地理编码（坐标 → 地址）
   */
  async reverseGeocode(params: {
    location: Point;
  }): Promise<GeocodeResult | null> {
    const response = await this.fetch<{
      regeocode?: {
        formatted_address?: string;
        addressComponent?: {
          country?: string;
          province?: string;
          city?: string;
          district?: string;
          township?: string;
          adcode?: string;
          level?: string;
        };
      };
    }>("/geocode/regeo", {
      location: `${params.location.lng},${params.location.lat}`,
      extensions: "all"
    });

    const regeocode = response?.regeocode;
    if (!regeocode) {
      return null;
    }

    return {
      formattedAddress: regeocode.formatted_address || "",
      country: regeocode.addressComponent?.country,
      province: regeocode.addressComponent?.province,
      city: regeocode.addressComponent?.city,
      district: regeocode.addressComponent?.district,
      township: regeocode.addressComponent?.township,
      adcode: regeocode.addressComponent?.adcode,
      level: regeocode.addressComponent?.level,
      location: params.location
    };
  }

  /**
   * 行政区划查询
   */
  async getDistrict(params: {
    keywords: string;
    subdistrict?: number;
  }): Promise<DistrictResult[]> {
    const response = await this.fetch<{
      districts?: Array<{
        adcode?: string;
        name?: string;
        level?: string;
        center?: string;
        polylines?: string[][];
      }>;
    }>("/config/district", {
      keywords: params.keywords,
      subdistrict: params.subdistrict ?? 1
    });

    if (!response?.districts) {
      return [];
    }

    return response.districts
      .flatMap((district) => {
        if (district.level === "city" && district.districts) {
          return district.districts.map((d) => this.parseDistrict(d));
        }
        return this.parseDistrict(district);
      })
      .filter((d): d is DistrictResult => d !== null);
  }

  /**
   * IP 定位
   */
  async ipLocation(ip?: string): Promise<{ province: string; city: string; location?: Point } | null> {
    const response = await this.fetch<{
      province?: string;
      city?: string;
      rectangle?: string;
    }>("/ip", ip ? { ip } : {});

    if (!response) {
      return null;
    }

    const rectangle = response.rectangle;
    let location: Point | undefined;

    if (rectangle) {
      const coords = rectangle.split(";")[0];
      const [lng, lat] = coords.split(",").map(Number);
      if (!isNaN(lng) && !isNaN(lat)) {
        location = { lat, lng };
      }
    }

    return {
      province: response.province || "",
      city: response.city || "",
      location
    };
  }

  private parsePolyline(polyline?: string): Point[] {
    if (!polyline || typeof polyline !== "string") {
      return [];
    }

    return polyline
      .split(";")
      .map((pair) => {
        const [lng, lat] = pair.split(",").map(Number);
        return Number.isFinite(lng) && Number.isFinite(lat) ? { lat, lng } : null;
      })
      .filter((point): point is Point => point !== null);
  }

  private parseDistrict(district: {
    adcode?: string;
    name?: string;
    level?: string;
    center?: string;
    polylines?: string[][];
  }): DistrictResult | null {
    if (!district.adcode || !district.name) {
      return null;
    }

    const [lng, lat] = district.center?.split(",").map(Number) || [0, 0];

    return {
      adcode: district.adcode,
      name: district.name,
      level: district.level || "",
      center: { lat, lng },
      boundaries: district.polylines?.flat() || []
    };
  }
}

// ============================================================================
// 命令行工具
// ============================================================================

async function main() {
  const apiKey = process.env.AMAP_API_KEY;

  if (!apiKey) {
    console.error("错误: 请设置 AMAP_API_KEY 环境变量");
    process.exit(1);
  }

  const client = new AmapClient(apiKey);
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case "search":
      case "poi": {
        const keywords = args[1] || "咖啡馆";
        const city = args[2] || "上海";

        console.log(`搜索 ${city} 的 "${keywords}"...\n`);

        const results = await client.searchPOI({
          keywords,
          city,
          offset: 20,
          extensions: "all"
        });

        console.log(`找到 ${results.length} 个结果:\n`);
        results.forEach((poi, index) => {
          console.log(`${index + 1}. ${poi.name}`);
          console.log(`   地址: ${poi.address || "未知"}`);
          console.log(`   类型: ${poi.type || "未知"}`);
          console.log(`   坐标: ${poi.location.lat}, ${poi.location.lng}`);
          if (poi.tel) {
            console.log(`   电话: ${poi.tel}`);
          }
          if (poi.distance) {
            console.log(`   距离: ${poi.distance}米`);
          }
          console.log();
        });
        break;
      }

      case "nearby": {
        const keywords = args[1] || "咖啡馆";
        const lat = Number(args[2]);
        const lng = Number(args[3]);
        const radius = Number(args[4]) || 1000;

        if (isNaN(lat) || isNaN(lng)) {
          console.error("错误: 请提供正确的经纬度坐标");
          process.exit(1);
        }

        console.log(`搜索 (${lat}, ${lng}) 周边 ${radius}米 内的 "${keywords}"...\n`);

        const results = await client.searchNearby({
          keywords,
          location: { lat, lng },
          radius,
          offset: 20
        });

        console.log(`找到 ${results.length} 个结果:\n`);
        results.forEach((poi, index) => {
          console.log(`${index + 1}. ${poi.name}`);
          console.log(`   地址: ${poi.address || "未知"}`);
          console.log(`   距离: ${poi.distance || "未知"}米`);
          console.log();
        });
        break;
      }

      case "route":
      case "path": {
        const mode = args[1] as TravelMode || "walking";
        const origin = parsePoint(args[2]);
        const destination = parsePoint(args[3]);
        const city = args[4] || "上海";

        if (!origin || !destination) {
          console.error("错误: 请提供正确的起点和终点坐标");
          console.error("格式: lat,lng");
          process.exit(1);
        }

        console.log(`规划 ${city} 的 ${mode} 路线...`);
        console.log(`起点: ${origin.lat}, ${origin.lng}`);
        console.log(`终点: ${destination.lat}, ${destination.lng}\n`);

        const result = await client.getRoute({ origin, destination, mode, city });

        if (!result) {
          console.error("未找到路径");
          process.exit(1);
        }

        console.log(`距离: ${(result.distance / 1000).toFixed(2)} 公里`);
        console.log(`耗时: ${(result.duration / 60).toFixed(0)} 分钟`);
        console.log(`拥堵状态: ${result.congestion}\n`);

        if (result.steps.length > 0) {
          console.log("详细步骤:");
          result.steps.forEach((step, index) => {
            console.log(`${index + 1}. ${step.instruction || step.road || ""}`);
            if (step.distance) {
              console.log(`   距离: ${step.distance}米`);
            }
            if (step.duration) {
              console.log(`   耗时: ${(step.duration / 60).toFixed(1)}分钟`);
            }
          });
        }

        console.log(`\n路径坐标点数: ${result.polyline.length}`);
        break;
      }

      case "geocode": {
        const address = args[1];
        const city = args[2];

        if (!address) {
          console.error("错误: 请提供地址");
          process.exit(1);
        }

        console.log(`将地址 "${address}" 转换为坐标...\n`);

        const result = await client.geocode({ address, city });

        if (!result) {
          console.error("未找到地址");
          process.exit(1);
        }

        console.log(`完整地址: ${result.formattedAddress}`);
        console.log(`坐标: ${result.location.lat}, ${result.location.lng}`);
        console.log(`行政区划: ${result.province} ${result.city} ${result.district}`);
        console.log(`区域代码: ${result.adcode}`);
        console.log(`级别: ${result.level}`);
        break;
      }

      case "reverse": {
        const lat = Number(args[1]);
        const lng = Number(args[2]);

        if (isNaN(lat) || isNaN(lng)) {
          console.error("错误: 请提供正确的经纬度坐标");
          process.exit(1);
        }

        console.log(`将坐标 (${lat}, ${lng}) 转换为地址...\n`);

        const result = await client.reverseGeocode({ location: { lat, lng } });

        if (!result) {
          console.error("未找到地址");
          process.exit(1);
        }

        console.log(`完整地址: ${result.formattedAddress}`);
        console.log(`行政区划: ${result.province} ${result.city} ${result.district}`);
        console.log(`街道: ${result.township}`);
        console.log(`区域代码: ${result.adcode}`);
        break;
      }

      case "district": {
        const keywords = args[1] || "上海";
        const subdistrict = args[2] ? Number(args[2]) : 1;

        console.log(`查询 "${keywords}" 的行政区划...\n`);

        const results = await client.getDistrict({ keywords, subdistrict });

        console.log(`找到 ${results.length} 个行政区划:\n`);
        results.forEach((district) => {
          console.log(`${district.name} (${district.level})`);
          console.log(`   区域代码: ${district.adcode}`);
          console.log(`   中心点: ${district.center.lat}, ${district.center.lng}`);
          if (district.boundaries.length > 0) {
            console.log(`   边界点数: ${district.boundaries.length}`);
          }
          console.log();
        });
        break;
      }

      case "ip": {
        const ip = args[1];
        console.log(`查询${ip ? ` IP ${ip}` : " 本机"} 的位置...\n`);

        const result = await client.ipLocation(ip);

        if (!result) {
          console.error("未找到位置信息");
          process.exit(1);
        }

        console.log(`省份: ${result.province}`);
        console.log(`城市: ${result.city}`);
        if (result.location) {
          console.log(`坐标: ${result.location.lat}, ${result.location.lng}`);
        }
        break;
      }

      default:
        console.error(`未知命令: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("执行出错:", error);
    process.exit(1);
  }
}

function parsePoint(input?: string): Point | null {
  if (!input) {
    return null;
  }

  const [lat, lng] = input.split(",").map(Number);

  if (isNaN(lat) || isNaN(lng)) {
    return null;
  }

  return { lat, lng };
}

function printHelp() {
  console.log(`
高德地图 API 数据获取工具

使用方法:
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts <命令> [参数...]

命令:
  search <关键词> [城市]         POI 关键字搜索
  poi <关键词> [城市]            同 search

  nearby <关键词> <lat> <lng> [半径]  周边搜索（半径默认 1000 米）

  route <模式> <起点> <终点> [城市]   路径规划
  path <模式> <起点> <终点> [城市]   同 route
    模式: walking（步行）、driving（驾车）、transit（公交）
    格式: lat,lng

  geocode <地址> [城市]         地理编码（地址 → 坐标）
  reverse <lat> <lng>           逆地理编码（坐标 → 地址）

  district <关键词> [层级]      行政区划查询
    层级: 0-3，默认 1

  ip [IP地址]                   IP 定位

示例:
  # 搜索上海的咖啡馆
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts search 咖啡馆 上海

  # 周边搜索
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts nearby 餐厅 31.2304 121.4737 500

  # 路径规划（步行）
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts route walking 31.2304,121.4737 31.2200,121.4600 上海

  # 地理编码
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts geocode 上海市静安区南京西路1266号

  # 逆地理编码
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts reverse 31.2304 121.4737

  # 行政区划查询
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts district 上海 2

  # IP 定位
  node --env-file=.env --import tsx tools/amap-data-fetcher.ts ip

环境变量:
  AMAP_API_KEY                  高德地图 Web 服务 API Key（必需）

注意:
  - 确保已设置 AMAP_API_KEY 环境变量
  - 高德 API 有调用频率限制，请合理使用
  - 部分接口需要申请对应的服务权限
`);
}

// 运行主函数
main();