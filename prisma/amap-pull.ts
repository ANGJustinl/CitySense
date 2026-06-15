/**
 * 使用高德地图 API 扩展真实地点数据
 *
 * 用法:
 *   node prisma/amap-pull.ts
 *
 * 环境变量:
 *   AMAP_API_KEY - 高德地图 API Key (必需)
 *   DATABASE_URL - PostgreSQL 连接字符串 (必需)
 */

import { PrismaClient } from "@prisma/client";

// 高德 POI 类型定义
type AmapPoi = {
  id?: string;
  name?: string;
  address?: string;
  location?: string;
  type?: string;
  pname?: string;
  cityname?: string;
  adname?: string;
  business_area?: string;
  tel?: string;
  rating?: string;
  cost?: string;
  photos?: {
    title?: unknown;
    url?: unknown;
  }[];
};

type AmapSearchResponse = {
  status: string;
  info?: string;
  infocode?: string;
  count?: string;
  pois?: AmapPoi[];
};

const prisma = new PrismaClient();

// 上海各区域列表
const SHANGHAI_DISTRICTS = [
  "黄浦区", "徐汇区", "长宁区", "静安区", "普陀区",
  "虹口区", "杨浦区", "浦东新区", "闵行区", "宝山区",
  "嘉定区", "金山区", "松江区", "青浦区", "奉贤区", "崇明区"
];

// 简化的区域名称（不带"区"）
const SHANGHAI_AREAS = [
  "黄浦", "徐汇", "长宁", "静安", "普陀",
  "虹口", "杨浦", "浦东", "闵行", "宝山",
  "嘉定", "金山", "松江", "青浦", "奉贤", "崇明"
];

// 搜索关键词配置
const SEARCH_KEYWORDS = [
  // 咖啡相关
  { keywords: ["咖啡", "咖啡馆", "咖啡厅"], tags: ["咖啡", "安静", "solo"] },
  // 书店相关
  { keywords: ["书店", "书屋", "图书"], tags: ["书店", "安静", "阅读"] },
  // 酒馆酒吧
  { keywords: ["酒吧", "酒馆", "居酒屋"], tags: ["酒馆", "夜生活", "约会"] },
  // 艺术展览
  { keywords: ["美术馆", "艺术馆", "画廊", "展览"], tags: ["艺术", "展览", "安静"] },
  // 音乐演出
  { keywords: ["livehouse", "音乐现场", "演出"], tags: ["音乐", "livehouse", "lively"] },
  // 茶馆
  { keywords: ["茶馆", "茶楼", "茶舍"], tags: ["茶", "安静", "传统"] },
  // 甜品
  { keywords: ["甜品", "蛋糕", "烘焙", "甜品店"], tags: ["甜品", "咖啡", "quiet"] },
  // 公园
  { keywords: ["公园", "绿地", "花园"], tags: ["公园", "户外", "散步"] },
  // 健身
  { keywords: ["健身房", "瑜伽", "运动"], tags: ["运动", "健身", "活力"] },
  // 电影
  { keywords: ["电影院", "影院", "放映"], tags: ["电影", "娱乐", "solo"] },
  // 特色市集
  { keywords: ["市集", "创意园", "文创园"], tags: ["市集", "创意", "lively"] },
  // 特色餐厅
  { keywords: ["特色餐厅", "私房菜", "创意菜"], tags: ["美食", "约会", "特色"] }
];

/**
 * 调用高德地图 POI 搜索 API
 */
async function searchAmapPoi(params: {
  keywords: string;
  city: string;
  area?: string;
  page?: number;
}): Promise<AmapPoi[]> {
  const apiKey = process.env.AMAP_API_KEY;

  if (!apiKey) {
    throw new Error("AMAP_API_KEY 环境变量未设置");
  }

  const searchParams = new URLSearchParams({
    key: apiKey,
    keywords: params.area ? `${params.area} ${params.keywords}` : params.keywords,
    city: params.city,
    citylimit: "true",
    output: "json",
    extensions: "all",
    offset: "20",
    page: String(params.page || 1)
  });

  const url = `https://restapi.amap.com/v3/place/text?${searchParams.toString()}`;

  try {
    const response = await fetch(url);
    const data = (await response.json()) as AmapSearchResponse;

    if (data.status !== "1") {
      console.warn(`API 返回错误: ${data.info}, infocode: ${data.infocode}`);
      return [];
    }

    // 调试：只打印第一次请求的数据
    if (params.keywords === "咖啡" && params.area === "黄浦" && (!params.page || params.page === 1)) {
      console.log(`    [调试] API返回: status=${data.status}, count=${data.count}, pois数量=${data.pois?.length}`);
      if (data.pois && data.pois.length > 0) {
        const poi = data.pois[0];
        console.log(`    [调试] 第一个POI的所有字段:`, Object.keys(poi).join(', '));
        console.log(`    [调试] id=${poi.id}, name=${poi.name}, location=${poi.location}`);
      }
    }

    return data.pois || [];
  } catch (error) {
    console.error(`搜索失败: ${error}`);
    return [];
  }
}

/**
 * 从高德 POI 提取图片 URL
 */
function extractPhotoUrl(poi: AmapPoi): string | undefined {
  if (!Array.isArray(poi.photos)) {
    return undefined;
  }

  for (const photo of poi.photos) {
    if (typeof photo?.url === "string" && /^https?:\/\//.test(photo.url)) {
      return photo.url;
    }
  }

  return undefined;
}

/**
 * 解析高德 POI 类型，生成标签
 */
function parsePoiTags(poiType: string | undefined, baseTags: string[]): string[] {
  const tags = new Set(baseTags);

  if (!poiType) {
    return Array.from(tags).slice(0, 5);
  }

  // 根据高德 POI 类型添加额外标签
  const typeMap: Record<string, string> = {
    "餐饮服务": "美食",
    "购物服务": "购物",
    "生活服务": "生活",
    "体育休闲服务": "运动",
    "医疗保健服务": "医疗",
    "住宿服务": "酒店",
    "风景名胜": "景点",
    "商务住宅": "办公",
    "政府机构及社会团体": "公共",
    "科教文化服务": "文化",
    "交通设施服务": "交通",
    "金融保险服务": "金融",
    "公司企业": "公司",
    "道路附属设施": "道路",
    "地名地址信息": "地址",
    "公共设施": "公共"
  };

  for (const [key, value] of Object.entries(typeMap)) {
    if (poiType.includes(key)) {
      tags.add(value);
    }
  }

  return Array.from(tags).slice(0, 5);
}

/**
 * 解析价格等级
 */
function parsePriceLevel(cost: string | undefined): number {
  if (!cost) {
    return 2;
  }

  const costNum = parseInt(cost.replace(/\D/g, ""));
  if (isNaN(costNum)) {
    return 2;
  }

  if (costNum < 50) return 1;
  if (costNum < 150) return 2;
  if (costNum < 300) return 3;
  return 4;
}

/**
 * 解析评分
 */
function parseRating(rating: string | undefined): number {
  if (!rating) {
    return 50;
  }

  const ratingNum = parseFloat(rating);
  if (isNaN(ratingNum)) {
    return 50;
  }

  // 将 0-5 的评分转换为 0-100 的质量分
  return Math.round(ratingNum * 20);
}

/**
 * 将高德 POI 转换为数据库 Venue 格式
 */
function poiToVenue(poi: AmapPoi, baseTags: string[], city: string) {
  const [lngRaw, latRaw] = (poi.location ?? "").split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  // 处理区域名称：去掉"区"后缀
  let area = poi.adname || poi.business_area;
  if (area && area.endsWith("区")) {
    area = area.slice(0, -1);
  }

  const tags = parsePoiTags(poi.type, baseTags);
  const qualityScore = parseRating(poi.rating);

  // 处理 address - 可能是数组、字符串或 undefined
  let address: string | null = null;
  if (typeof poi.address === "string" && poi.address.trim()) {
    address = poi.address.trim();
  } else if (Array.isArray(poi.address) && poi.address.length > 0) {
    // 如果是数组，取第一个元素或合并
    address = poi.address[0]?.toString() || null;
  }

  return {
    sourceKey: `amap-${poi.id}`,
    name: poi.name || "未知地点",
    description: poi.type || `${tags.join("、")}地点`,
    city,
    area: area || undefined,
    address,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    tags,
    priceLevel: parsePriceLevel(poi.cost),
    quietness: tags.includes("安静") || tags.includes("书店") ? 70 + Math.floor(Math.random() * 20) : 40 + Math.floor(Math.random() * 30),
    popularity: 50 + Math.floor(Math.random() * 40),
    source: "amap-poi",
    sourceUrl: `https://ditu.amap.com/place/${poi.id}`,
    imageUrl: extractPhotoUrl(poi),
    trendScore: 50 + Math.floor(Math.random() * 30),
    confidence: 75,
    qualityScore,
    qualityFlags: []
  };
}

/**
 * 批量导入地点到数据库
 */
async function importVenues(venues: Array<{ sourceKey: string } & Record<string, unknown>>): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const venue of venues) {
    try {
      // 检查是否已存在
      const existing = await prisma.venue.findUnique({
        where: { sourceKey: venue.sourceKey as string }
      });

      if (existing) {
        skipped++;
        continue;
      }

      // 创建新记录
      await prisma.venue.create({
        data: venue as any
      });

      imported++;
    } catch (error) {
      console.error(`导入地点失败 (${venue.sourceKey}):`, error);
    }
  }

  return { imported, skipped };
}

/**
 * 主函数：从高德地图拉取并导入地点数据
 */
async function main() {
  console.log("开始从高德地图 API 拉取地点数据...\n");

  const apiKey = process.env.AMAP_API_KEY;
  if (!apiKey) {
    console.error("错误: 请设置 AMAP_API_KEY 环境变量");
    process.exit(1);
  }

  // 配置
  const config = {
    city: "上海",
    // 是否搜索所有区域（true）或只搜索热门区域（false）
    // 改为 false 只搜索热门区域，减少请求数避免 QPS 限制
    searchAllAreas: false,
    // 每个关键词每页搜索数量
    pageSize: 20,
    // 每个关键词搜索多少页
    pagesPerKeyword: 1
  };

  // 选择要搜索的区域
  const areasToSearch = config.searchAllAreas
    ? SHANGHAI_AREAS
    : ["徐汇", "静安", "黄浦", "长宁", "浦东", "虹口"];

  console.log(`搜索区域: ${areasToSearch.join(", ")}`);
  console.log(`搜索关键词组: ${SEARCH_KEYWORDS.length} 个\n`);

  let totalProcessed = 0;
  let totalImported = 0;
  let totalSkipped = 0;

  // 遍历每个关键词组
  for (const keywordGroup of SEARCH_KEYWORDS) {
    console.log(`\n--- 搜索关键词: ${keywordGroup.keywords[0]} ---`);

    for (const keyword of keywordGroup.keywords) {
      const allPois: AmapPoi[] = [];

      // 遍历每个区域
      for (const area of areasToSearch) {
        console.log(`  搜索区域: ${area} - 关键词: ${keyword}`);

        // 搜索多页
        for (let page = 1; page <= config.pagesPerKeyword; page++) {
          const pois = await searchAmapPoi({
            keywords: keyword,
            city: config.city,
            area,
            page
          });

          if (pois.length === 0) {
            break;
          }

          allPois.push(...pois);
          console.log(`    第 ${page} 页: 找到 ${pois.length} 个地点`);

          // 避免请求过快 - 增加延迟以避免 QPS 限制
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 区域间延迟
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 去重 - 使用更安全的方法
      // 调试：检查 allPois 的第一个元素
      if (allPois.length > 0 && keyword === "咖啡") {
        console.log(`  调试 - allPois[0]: id=${allPois[0].id}, name=${allPois[0].name}, location=${allPois[0].location}`);
      }

      // 使用 id 和 name 组合作为去重 key，避免 undefined id 的问题
      const poiMap = new Map<string, AmapPoi>();
      for (const poi of allPois) {
        const key = poi.id || `${poi.name}_${poi.address}`;
        if (key && !poiMap.has(key)) {
          poiMap.set(key, poi);
        }
      }
      const uniquePois = Array.from(poiMap.values());

      console.log(`  去重后: ${uniquePois.length} 个地点`);

      // 转换为 Venue 格式
      // 先调试：查看第一个 POI 的数据
      if (uniquePois.length > 0) {
        const firstPoi = uniquePois[0];
        console.log(`  调试 - 第一个POI: id=${firstPoi.id}, name=${firstPoi.name}, location=${firstPoi.location}`);
        const testVenue = poiToVenue(firstPoi, keywordGroup.tags, config.city);
        console.log(`  调试 - 转换后: lat=${testVenue.lat}, lng=${testVenue.lng}, name=${testVenue.name}`);
      }

      const venues = uniquePois
        .map(poi => poiToVenue(poi, keywordGroup.tags, config.city))
        .filter(venue => venue.name && venue.lat !== null && venue.lng !== null && Number.isFinite(venue.lat) && Number.isFinite(venue.lng));

      console.log(`  有效地点: ${venues.length} 个`);

      // 批量导入
      const result = await importVenues(venues);

      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalProcessed += venues.length;

      console.log(`  导入: ${result.imported} 个, 跳过: ${result.skipped} 个`);

      // 关键词间延迟
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log("\n========================================");
  console.log("数据导入完成！");
  console.log("========================================");
  console.log(`总处理: ${totalProcessed} 个地点`);
  console.log(`已导入: ${totalImported} 个地点`);
  console.log(`已跳过: ${totalSkipped} 个地点 (已存在)`);

  // 统计数据库中的地点数量
  const totalVenues = await prisma.venue.count();
  console.log(`\n数据库中总地点数: ${totalVenues}`);
}

// 执行
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("\n执行失败:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
