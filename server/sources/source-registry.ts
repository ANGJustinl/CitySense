import { amapPoiAdapter } from "@/server/sources/adapters/amap-poi.adapter";
import { bilibiliAdapter } from "@/server/sources/adapters/bilibili.adapter";
import { doubanAdapter } from "@/server/sources/adapters/douban.adapter";
import { mockAdapter } from "@/server/sources/adapters/mock.adapter";
import { trendsHubAdapter } from "@/server/sources/adapters/trends-hub.adapter";
import { xiaohongshuAdapter } from "@/server/sources/adapters/xiaohongshu.adapter";
import type { RawSourceItemDetail, SourceSearchInput } from "@/server/sources/source.types";

export const sourceAdapters = [
  mockAdapter,
  amapPoiAdapter,
  xiaohongshuAdapter,
  trendsHubAdapter,
  doubanAdapter,
  bilibiliAdapter
];

export async function collectSourceItems(input: SourceSearchInput): Promise<RawSourceItemDetail[]> {
  const activeAdapters = sourceAdapters.filter((adapter) => adapter.status === "active");
  const results = await Promise.all(
    activeAdapters.map(async (adapter) => {
      const [events, venues] = await Promise.all([
        adapter.searchEvents(input),
        adapter.searchVenues(input)
      ]);

      return [...events, ...venues];
    })
  );

  const seen = new Set<string>();
  return results.flat().filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

export function getConnectorStatuses() {
  return sourceAdapters.map((adapter) => ({
    source: adapter.source,
    kind: adapter.kind,
    status: adapter.status
  }));
}
