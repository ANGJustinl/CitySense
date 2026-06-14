import { isDemoModeEnabled } from "@/server/config/demo-mode";
import { amapPoiAdapter } from "@/server/sources/adapters/amap-poi.adapter";
import { bilibiliAdapter } from "@/server/sources/adapters/bilibili.adapter";
import { damaiAdapter } from "@/server/sources/adapters/damai.adapter";
import { doubanAdapter } from "@/server/sources/adapters/douban.adapter";
import { mockAdapter } from "@/server/sources/adapters/mock.adapter";
import { shanghaiGovAdapter } from "@/server/sources/adapters/shanghai-gov.adapter";
import { trendsHubAdapter } from "@/server/sources/adapters/trends-hub.adapter";
import { xiaohongshuAdapter } from "@/server/sources/adapters/xiaohongshu.adapter";
import type { RawSourceItemDetail, SourceSearchInput } from "@/server/sources/source.types";

export const allSourceAdapters = [
  mockAdapter,
  amapPoiAdapter,
  damaiAdapter,
  xiaohongshuAdapter,
  shanghaiGovAdapter,
  trendsHubAdapter,
  doubanAdapter,
  bilibiliAdapter
];

export function getSourceAdapters() {
  return allSourceAdapters.filter((adapter) => isDemoModeEnabled() || adapter.kind !== "mock");
}

export const sourceAdapters = getSourceAdapters();

export async function collectSourceItems(input: SourceSearchInput): Promise<RawSourceItemDetail[]> {
  const activeAdapters = getSourceAdapters().filter((adapter) => adapter.status === "active");
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
  return getSourceAdapters().map((adapter) => ({
    source: adapter.source,
    kind: adapter.kind,
    status: adapter.status
  }));
}
