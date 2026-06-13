import type {
  CitySourceAdapter,
  ConnectorStatus,
  RawSourceItemDetail,
  SourceKind
} from "@/server/sources/source.types";

type BaseAdapterOptions = {
  source: string;
  kind: SourceKind;
  enabledByDefault?: boolean;
  cooldownSeconds?: number;
  requiredEnvVars?: string[];
  implemented?: boolean;
};

export class BaseCitySourceAdapter implements CitySourceAdapter {
  source: string;
  kind: SourceKind;
  enabledByDefault: boolean;
  cooldownSeconds: number;
  private requiredEnvVars: string[];
  private implemented: boolean;

  constructor(options: BaseAdapterOptions) {
    this.source = options.source;
    this.kind = options.kind;
    this.enabledByDefault = options.enabledByDefault ?? false;
    this.cooldownSeconds = options.cooldownSeconds ?? 60;
    this.requiredEnvVars = options.requiredEnvVars ?? [];
    this.implemented = options.implemented ?? true;
  }

  get status(): ConnectorStatus {
    if (!this.isConfigured()) {
      return "not_configured";
    }

    return this.enabledByDefault ? "active" : "paused";
  }

  isConfigured() {
    return this.implemented && this.requiredEnvVars.every((name) => Boolean(process.env[name]));
  }

  async searchEvents(input: Parameters<CitySourceAdapter["searchEvents"]>[0]) {
    if (!this.isConfigured()) {
      return [];
    }

    return this.searchEventsImpl(input);
  }

  async searchVenues(input: Parameters<CitySourceAdapter["searchVenues"]>[0]) {
    if (!this.isConfigured()) {
      return [];
    }

    return this.searchVenuesImpl(input);
  }

  async getItemDetail(sourceItemId: string) {
    if (!this.isConfigured()) {
      return null;
    }

    return this.getItemDetailImpl(sourceItemId);
  }

  protected async searchEventsImpl(
    input: Parameters<CitySourceAdapter["searchEvents"]>[0]
  ): Promise<RawSourceItemDetail[]> {
    void input;
    return [];
  }

  protected async searchVenuesImpl(
    input: Parameters<CitySourceAdapter["searchVenues"]>[0]
  ): Promise<RawSourceItemDetail[]> {
    void input;
    return [];
  }

  protected async getItemDetailImpl(sourceItemId: string): Promise<RawSourceItemDetail | null> {
    void sourceItemId;
    return null;
  }
}

export function createPassiveAdapter(source: string, kind: SourceKind): CitySourceAdapter {
  return new BaseCitySourceAdapter({
    source,
    kind,
    enabledByDefault: false,
    implemented: false
  });
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
