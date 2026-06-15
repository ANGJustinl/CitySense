/**
 * 活动关键词搜索（TASK-P2-004 AI 助手增强）。
 *
 * 直接查询 Event 表，按标题/标签/描述关键词匹配，按 trendScore 排序。
 * 填补当前只有"路线级推荐"缺少"单品搜索"的空白。
 * 复用 demo mode 过滤逻辑，排除 mock 数据。
 */

import { prisma } from "@/server/db/prisma";
import { isDemoModeEnabled } from "@/server/config/demo-mode";

export type ActivitySearchResult = {
  id: string;
  title: string;
  description?: string;
  city: string;
  area?: string;
  address?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
  tags: string[];
  source?: string;
  sourceUrl?: string;
  imageUrl?: string;
  trendScore: number;
  qualityScore: number;
};

export type ActivitySearchInput = {
  city: string;
  keyword: string;
  area?: string;
  limit?: number;
};

/**
 * 按关键词搜索活动。匹配 title / tags / description。
 * 排除 demo/mock 数据（除非 demo mode 开启），按 trendScore 降序。
 */
export async function searchActivities(
  input: ActivitySearchInput
): Promise<ActivitySearchResult[]> {
  const { city, keyword, area, limit = 10 } = input;

  if (!keyword.trim()) {
    return [];
  }

  const demoMode = isDemoModeEnabled();
  const mockSources = ["mock-city-signal", "mock-trends", "mock-xhs"];

  try {
    const events = await prisma.event.findMany({
      where: {
        city,
        ...(area ? { area: { contains: area } } : {}),
        ...(demoMode ? {} : { NOT: { source: { in: mockSources } } }),
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { tags: { has: keyword } },
          { description: { contains: keyword, mode: "insensitive" } }
        ]
      },
      orderBy: { trendScore: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        area: true,
        address: true,
        lat: true,
        lng: true,
        startTime: true,
        endTime: true,
        tags: true,
        source: true,
        sourceUrl: true,
        imageUrl: true,
        trendScore: true,
        qualityScore: true
      }
    });

    return events.map((event): ActivitySearchResult => ({
      id: event.id,
      title: event.title,
      description: event.description ?? undefined,
      city: event.city,
      area: event.area ?? undefined,
      address: event.address ?? undefined,
      lat: event.lat ?? undefined,
      lng: event.lng ?? undefined,
      startTime: event.startTime?.toISOString(),
      endTime: event.endTime?.toISOString(),
      tags: event.tags,
      source: event.source ?? undefined,
      sourceUrl: event.sourceUrl ?? undefined,
      imageUrl: event.imageUrl ?? undefined,
      trendScore: event.trendScore,
      qualityScore: event.qualityScore
    }));
  } catch {
    return [];
  }
}
