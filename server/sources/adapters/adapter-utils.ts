import type {
  CitySourceAdapter,
  ConnectorStatus,
  RawSourceItemDetail,
  SourceKind
} from "@/server/sources/source.types";

export function createPassiveAdapter(
  source: string,
  kind: SourceKind,
  status: ConnectorStatus = "not_configured"
): CitySourceAdapter {
  return {
    source,
    kind,
    status,
    async searchEvents() {
      return [];
    },
    async searchVenues() {
      return [];
    },
    async getItemDetail() {
      return null;
    }
  };
}

export function matchCityItem(
  item: RawSourceItemDetail,
  input: { city: string; area?: string; keywords: string[]; timeWindow?: string }
) {
  const cityOk = !item.city || item.city === input.city;
  const areaOk = !input.area || !item.area || item.area === input.area;
  const keywordOk =
    input.keywords.length === 0 ||
    input.keywords.some((keyword) =>
      [item.title, item.content, ...item.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword.toLowerCase())
    );

  return cityOk && areaOk && keywordOk;
}
